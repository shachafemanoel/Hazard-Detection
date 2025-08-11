# Unified Client Agents & Detection Engine Lead (Anthropic Subagent Format)

---

name: detection-engine-lead
description: Senior engineer for in-browser ONNX runtime, pre/post-processing, engine selection, and runtime telemetry for the Hazard-Detection web app.
--------------------------------------------------------------------------------------------------------------------------------------------------------

## Repo Context (current layout)

* **Frontend (static HTML/JS/CSS):** `public/`
* **ORT Web bundles:** `public/ort/`
* **App entry (after auth):** `public/login.html` → `public/upload.html` (gated by `public/js/route-guard.js` + `public/js/session-manager.js`)
* **Detection engine surfaces in:**

  * `public/js/onnx-runtime-loader.js` (session init + backend selection)
  * `public/js/inference.worker.js`, `public/js/preprocess.worker.js` (off-thread work)
  * `public/js/camera_detection.js` (camera flow integration)
  * Validation & plumbing: `public/js/inference-contract-validator.js`, `public/js/config.js`
* **Model file (browser):** `public/onnx_models/best.onnx` (canonical) — **fallback:** `public/onxx_models/best.onnx` (current typo folder)
* **Shared logic (source):** `src/utils/yolo-runtime.js`, `src/utils/hazard-classes.js`

  * If these aren’t bundled, copy or inline logic into `public/js/*`.
* **Tests & benches:** `public/test-onnx-model-loading.html`, `tests/*`, `__tests__/*`
* **Server (Node.js):** `server/routes/server.js` & `server/routes/simple-server.js` (static hosting, headers)
* **Other models:** `pt_models/best0608.pt` (training artifact; not used in-browser)

## Mission

Own model loading and inference in the browser with robust fallbacks, fix path and header issues, keep FPS stable, and expose clean telemetry. If the browser cannot run ONNX locally (no WebGPU/blocked WASM), orchestrate a remote inference fallback via the separate API service.

## Immediate Model-Fix Plan (do these first)

1. **Model path resolver (typo-safe)**

   * Primary: `/onnx_models/best.onnx` (correct)
   * Fallback: `/onxx_models/best.onnx` (current tree)
   * Implement resolution order and cache whichever succeeds.

2. **ORT Web WASM/WebGPU mapping**

   * Ensure ORT loads from `/ort/` and supports threads when headers allow.

```js
// public/js/onnx-runtime-loader.js
import * as ort from '/ort/ort.wasm.bundle.min.mjs';

export async function initOrtEnv() {
  // ORT WASM paths
  ort.env.wasm.wasmPaths = '/ort/';
  // Threads if available (auto-fallback without COOP/COEP)
  ort.env.wasm.numThreads = navigator.hardwareConcurrency ? Math.min(4, navigator.hardwareConcurrency) : 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.proxy = true; // allow worker-threaded runtime when possible
}
```

3. **Static headers (Node)**

   * Serve correct MIME and (optionally) COOP/COEP; do **not** hard-fail if missing.

```js
// server/routes/server.js (or simple-server.js) — when configuring static:
// res.setHeader('Cross-Origin-Opener-Policy','same-origin');       // optional for WASM threads
// res.setHeader('Cross-Origin-Embedder-Policy','require-corp');    // optional for WASM threads
// MIME types:
// .wasm -> application/wasm
// .onnx -> application/octet-stream
```

4. **Pre/Post alignment**

   * Assume YOLO-style letterboxed square input. Start at 640, with downshift path: 640 → 480 → 384 → 320.
   * Normalize to \[0,1] (or model-specific mean/std); ensure correct layout (NCHW vs NHWC).

5. **Remote inference fallback (API)**

   * If WebGPU not available and WASM init fails or model 404s, call the external API (base from `public/js/config.js`).
   * Use/extend `public/js/apiClient.js` and normalize the response to the local `Detection[]` contract.
   * Only use remote when local fails or when FPS < SLA for N frames.

## Public Browser API (JS)

```ts
/**
 * @typedef {{x:number,y:number,w:number,h:number,classId:number,label:string,score:number}} Detection
 * @typedef {{conf?:number,iou?:number,topk?:number,maxDet?:number}} NmsOpts
 * @typedef {{backendOrder?:('webgpu'|'wasm-simd'|'wasm'|'remote')[],
 *            inputSize?:640|480|384|320,
 *            modelUrlPrimary?:string, modelUrlFallback?:string,
 *            enableTelemetry?:boolean}} EngineConfig
 */

export async function createEngine(config /** @type {EngineConfig} */ ) { /* …see Chain… */ }
```

## Chain of Actions

1. **Probe & initialize**

   * Detect: WebGPU → WASM-SIMD(+threads if COOP/COEP) → WASM baseline → remote.
   * Resolve model URL: try `/onnx_models/best.onnx` then `/onxx_models/best.onnx`.
   * `initOrtEnv()`; create single shared `InferenceSession`.
   * Warmup with `1×3×S×S` tensor; cache IO metadata.

2. **Preprocess → Inference → Postprocess**

   * Preprocess (worker): letterbox to `S×S`, normalize, convert to the model’s layout.
   * Inference: run ORT; reuse preallocated tensors/buffers to reduce GC.
   * Postprocess (worker or main): YOLO decode + deterministic NMS.
   * Map `classId → label` using `src/utils/hazard-classes.js` (copy/export to browser at build/publish time).

3. **Adaptive performance**

   * Keep rolling avg over last `N=30` frames. If avg `t_infer > 33ms`:

     * Downshift input size: `640 → 480 → 384 → 320`.
     * If still over budget, downshift backend (`WebGPU→WASM-SIMD→WASM→remote`).
   * Emit a `switch` event with reason and new mode.

4. **Caching**

   * Cache ONNX via Cache Storage/IndexedDB keyed by `model-config.json` version.
   * Bust cache when `model-config.json` changes.

5. **Telemetry**

   * Every 30 frames emit `telemetry`:

```json
{ "backend": "webgpu|wasm|remote", "inputSize": S, "tInferMsAvg": n, "fps": n, "frames": n, "dropped": n, "memMB": n? }
```

* Emit `warn` on any fallback or IO mismatch; include `{code,message,detail}`.

6. **Resource hygiene**

   * Reuse typed arrays/tensors; call `session.release()` on dispose.
   * Use `ImageBitmap` transfers to workers.
   * Terminate workers on unload; remove RAF loops.

## Files You Own (in this repo)

* `public/js/onnx-runtime-loader.js` — detection, env init, model URL resolver, warmup, switching, telemetry emitter.
* `public/js/inference.worker.js` — pre/post wiring, structured-clone-friendly payloads, buffer reuse.
* `public/js/preprocess.worker.js` — letterbox, normalize, layout transform; avoid per-frame allocations.
* `public/js/camera_detection.js` — integrate `createEngine()` with camera loop and UI.
* `public/js/inference-contract-validator.js` — enforce the contract from `docs/inference-contract.md`.
* `server/routes/server.js` (or `simple-server.js`) — static serving for .onnx/.wasm and optional COOP/COEP.
* `src/utils/yolo-runtime.js` & `src/utils/hazard-classes.js` — single source of truth; export functions used by the browser runtime.

## Remote Fallback (API service)

* When backend = `remote`, use `public/js/apiClient.js` against the production API base (from `public/js/config.js`).
* Response must normalize to local `Detection[]` (x,y,w,h in **pixel** coords, not normalized).
* Apply the same NMS thresholds locally if the API returns raw boxes.

## Acceptance Criteria (DoD)

* Model loads without 404 on both `/onnx_models/best.onnx` and `/onxx_models/best.onnx` (resolver picks what exists).
* ORT Web initializes on at least one backend; app stays functional without COOP/COEP (threads optional).
* Stable **20–30 FPS** at 640 (WebGPU) on mid-range hardware; **≥15 FPS** at 384 on WASM fallback.
* Deterministic NMS (repeatable ordering); no memory growth over a 5-minute run.
* Telemetry visible via event emitter and optional `window.__ENGINE_STATS__` (dev only).
* Remote inference engages automatically only when local backends fail or drop below SLA for N frames.

## Concrete TODOs (short list)

1. **Fix loader**

   * Implement `resolveModelUrl()` and `initOrtEnv()` in `public/js/onnx-runtime-loader.js`.
   * Add backend probing and warmup; export `createEngine()`.
2. **Wire workers**

   * Ensure `preprocess.worker.js` produces `S×S` `Float32` tensor (model layout).
   * Ensure `inference.worker.js` decodes outputs and runs NMS deterministically.
3. **Headers**

   * Verify `.onnx/.wasm` MIME; add COOP/COEP when possible (don’t block if absent).
4. **Fallback**

   * Extend `apiClient.js` with `detectRemote(frame)`; integrate into engine backend order.
5. **Tests**

   * Update `public/test-onnx-model-loading.html` to try both model paths and log chosen backend/size.
   * Add FPS & memory smoke in `__tests__/post-refactor-qa.test.js` (keep JSON snapshots in `artifacts/`).

## Reference NMS (deterministic, tie-broken by score then index)

```js
export function nms(boxes, scores, iou=0.45, maxDet=100, topk=300) {
  // boxes: Float32Array rows of [x1,y1,x2,y2]; scores: Float32Array
  const idxs = scores.map((s,i)=>[s,i]).sort((a,b)=> b[0]-a[0] || a[1]-b[1]).slice(0, topk).map(p=>p[1]);
  const selected = [];
  for (const i of idxs) {
    let keep = true;
    for (const j of selected) {
      if (iou2d(boxes, i, j) > iou) { keep = false; break; }
    }
    if (keep) { selected.push(i); if (selected.length >= maxDet) break; }
  }
  return selected;
}
```

**Notes & Pitfalls**

* If `hazard-classes.js` stays under `src/utils/`, copy or inline its export into `public/js/` for the browser (no bundler visible).
* Threads (WASM) require COOP/COEP + compatible third-party assets. Keep auto-fallback to single-threaded WASM.
* Feature flag in `model-config.json` can force `remote` backend for low-end devices.

---

# CLAUDE.md — Client Repo (Hazard-Detection) — Updated to Current Tree

> Root: `/Users/shachafemanoel/Documents/Hazard-Detection`

This file defines specialized Claude Code agents for the **client** web app. Each agent has a narrow scope, exact files, acceptance checks, and deliverables. A **Work Manager** agent coordinates the others and pushes commits when milestones pass.

## Shared Context

* **API base (prod):** `https://hazard-api-production-production.up.railway.app`
* **App entry after auth:** `public/login.html` → `public/upload.html` (guarded by `public/js/route-guard.js` + `public/js/session-manager.js`)
* **Model (browser):** canonical `public/onnx_models/best.onnx` (with fallback to `public/onxx_models/best.onnx` until repo rename)
* **ONNX Runtime (ORT Web):** bundles under `public/ort/`; prefer WebGPU, fallback to WASM (SIMD/threads if headers allow)
* **Decisions:** Use canvas Decisions D1 mapping, D2 hybrid session cache, D3 bundles, D4 batching, D6 mobile adaptivity, D7 precision
* **Guardrails:** Small commits, no secrets, keep backward-compatible URLs/HTML, add tests for changes, ask unclear items in `QUESTIONS.md`

## Environment Keys

The client reads base URL primarily from `public/js/config.js`/`public/js/network.js`.
Optionally support Vite-style envs when present.

```bash
# optional (if using a bundler)
VITE_API_BASE=https://hazard-api-production-production.up.railway.app
```

---

## Agent 0 — Work Manager (Client Lead)

**Goal:** Plan → Assign → Verify → Commit & Push.

**Scope:** Whole repo. Creates task checklist, delegates to Agents 1–6, validates acceptance, and pushes commits.

**Process (High-level):**

1. Read this CLAUDE.md and PLAN.md.
2. Create `TASKS.md` with ordered checklist and owners (Agents 1–6).
3. For each task: open a short sub-prompt to the relevant agent, collect result, run acceptance checks, request fixes.
4. When green, commit with message template and open a PR.

**Must produce:** `TASKS.md`, PR links, and `REPORT.md` with metrics (FPS/TTFD, overlay px error).

**Commit template:**

```md
feat(client): <short title>

Why
- ...
What
- ...
Tests
- ...
Metrics
- FPS: …, TTFD: …, Overlay error: …
```

---

## Agent 1 — Frontend Overlay & Camera

**Files:**

* `public/camera.html`
* `public/css/camera.css`
* `public/js/camera_detection.js`
* `public/js/ui-controls.js`
* `public/js/utils/coordsMap.js` **(new)**
* `public/js/test_camera_functions.js` (smoke tests exist today)

**Tasks:**

1. Implement mapping utils: `computeContainMapping`, `computeCoverMapping`, `modelToCanvasBox`.
2. Call `syncCanvasSize()` on `loadeddata` + window resize; draw boxes with contain/cover modes.
3. Backpressure (single in-flight), FPS/TTFD logs, mobile tweaks (D6: input downshift, DPR handling).

**Acceptance:** boxes align ±2px (±1px ל־`crack` על DPR≥2); FPS ≥15 desktop; TTFD ≤2s לאחר טעינה.

**Deliverables:** code + updated `public/js/test_camera_functions.js` (או `tests/test_camera_functions.js` אם מעבירים), screenshots before/after.

---

## Agent 2 — API Client & Cross-Repo Integration (Client-side)

**Files:**

* `public/js/apiClient.js`
* `public/js/report-upload-service.js`
* `public/js/network.js`
* `public/js/config.js`
* `src/utils/hazard-classes.js` → **mirror/inline** to `public/js/hazardClasses.js` if referenced in browser

**Tasks:**

1. Ensure **named exports** exist and are used: `detectSingleWithRetry`, `uploadDetection`, `createReport`, `getSessionSummary`, `uploadToCloudinaryViaServer`.
2. Centralize `resolveBaseUrl()` in `public/js/network.js`; read default from `public/js/config.js`; support `VITE_API_BASE` when available.
3. Validate contracts vs server:

   * `POST /report` expects multipart (image + JSON meta).
   * `GET /session/{id}/reports|summary` returns objects with `image.url`.
4. Update parsers accordingly; add `schemas/client-api.md` documenting fields and examples.

**Acceptance:** live calls succeed against Railway API; Summary modal shows Cloudinary URLs; no 4xx/5xx in console.

**Deliverables:** code + `schemas/client-api.md` + short `README` note.

---

## Agent 3 — Model Integration (browser ONNX)

**Files:**

* `public/onnx_models/best.onnx` (fallback: `public/onxx_models/best.onnx` until rename)
* `public/js/onnx-runtime-loader.js` **(new)** — env init, backend probe, model URL resolver
* `public/js/camera_detection.js` (uses loader API)
* `scripts/verify_onnx_web.mjs` **(new, optional)** — local smoke

**Tasks:**

1. Load model via resolver (try `/onnx_models/best.onnx` then `/onxx_models/best.onnx`); log chosen path.
2. Create ORT session; log IO names and dims; warmup with `1×3×S×S`.
3. If IO names differ from expected (e.g. `images` / `output0`), adapt pre/post accordingly and document.

**Acceptance:** session created in browser; warmup completes; logs show input/output names and shapes.

**Deliverables:** code + log snippet in `REPORT.md`.

---

## Agent 4 — Performance & Bundles

**Files:**

* `public/ort/*` (WebGPU & WASM bundles)
* `public/js/onnx-runtime-loader.js`
* `public/js/camera_detection.js`

**Tasks:**

1. Dynamic import: try `ort.webgpu.bundle.min.mjs` + `await ort.env.webgpu.init()`, fallback to `ort.wasm.bundle.min.mjs`; set `ort.env.wasm.wasmPaths='/ort/'`.
2. Lazy-load model on first camera start; reuse a single session across camera restarts.
3. Metric logs (FPS/TTFD) + periodic console summary.

**Acceptance:** TTFD ≤2s ו־FPS ≥15 על לפטופ בינוני; bundle אחד ל־WebGPU + אחד ל־WASM בלבד נטענים.

**Deliverables:** code + metrics in `REPORT.md`.

---

## Agent 5 — Code Cleanup

**Files / Actions:**

* **Rename folder** `public/onxx_models` → `public/onnx_models` (fix typo) ולתקן ייחוסים.
* להסיר מודלים/קבצי ONNX מיותרים — להשאיר רק `best.onnx`.
* להסיר כפילויות ORT; להשאיר WebGPU אחד ו־WASM אחד.
* להסיר קבצים ישנים: `public/js/upload_tf.js`, `public/js/firebaseConfig*.js` אם קיימים.
* לעדכן `.gitignore` ל־`*.map` ו־caches בהתאם.

**Acceptance:** preview/build pass; אין 404; אין imports מתים (ESLint/depcheck ירוקים).

**Deliverables:** PR `chore(client): remove obsolete files and fix model folder`.

---

## Agent 6 — E2E QA & Visual Tests

**Files:**

* `tests/e2e/overlay.spec.ts` **(new, Playwright)**
* `public/js/test_camera_functions.js` (או להעביר ל־`tests/`)
* `public/test-onnx-model-loading.html` (smoke קיימת — לעדכן שתבדוק שני נתיבי מודל ותציג backend)

**Tasks:**

1. Mock camera; run start→detections→stop→Summary; לאמת thumbnails ו־URLs.
2. שינוי גודל viewport; לאמת שה־overlay נשאר בתוך ±2px.

**Acceptance:** tests pass locally and in CI.

**Deliverables:** code + CI snippet + screenshots.

---

## Integration Specialist (Client-oriented)

**Goal:** Own **integration with the Server repo** from the client side.

**Files:**

* `public/js/apiClient.js`, `public/js/network.js`, `public/js/config.js`
* `schemas/client-api.md`

**Tasks:**

1. Diff client expectations vs server responses; open issues/PRs on server as needed.
2. Validate CORS/ALLOWED\_ORIGINS; ensure single source of truth for API base (config/env).
3. Keep a checklist of endpoints and fields used by the client.

**Acceptance:** No schema mismatches; all client→server flows succeed in Railway preview.

**Deliverables:** `schemas/client-api.md` + checklist in `TASKS.md`.
