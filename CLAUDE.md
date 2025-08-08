# CLAUDE.md — Client Repo (Hazard-Detection)

> Root: `/Users/shachafemanoel/Documents/Hazard-Detection`

This file defines specialized Claude Code agents for the **client** web app. Each agent has a narrow scope, exact files, acceptance checks, and deliverables. A **Work Manager** agent coordinates the others and pushes commits when milestones pass.

## Shared Context

* **API base (prod):** `https://hazard-api-production-production.up.railway.app`
* **Model:** `public/object_detection_model/best0608.onnx`
* **ONNX runtime:** prefer WebGPU bundle, fallback to WASM.
* **Decisions:** Use section D (Decisions) from the project canvas: D1 mapping, D2 hybrid session cache, D3 bundles, D4 batching, D6 mobile adaptivity, D7 precision.
* **Guardrails:** Small commits, no secrets, keep backward-compatible URLs/HTML, add tests for changes, ask unclear items in `QUESTIONS.md`.

## Environment Keys

```
VITE_API_BASE=https://hazard-api-production-production.up.railway.app
```

---

## Agent 0 — Work Manager (Client Lead)

**Goal:** Plan → Assign → Verify → Commit & Push.

**Scope:** Whole repo. Creates task checklist, delegates to Agents 1–6, validates acceptance, and pushes commits.

**Process (High-level):**

1. Read this CLAUDE.md and PLAN.md.
2. Create `TASKS.md` with ordered checklist and owners (Agents 1–6).
3. For each task: open a short sub‑prompt to the relevant agent, collect result, run acceptance checks, request fixes.
4. When green, commit with message template and open a PR.

**Must produce:** `TASKS.md`, PR links, and `REPORT.md` with metrics (FPS/TTFD, overlay px error).

**Commit template:**

```
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
* `public/js/utils/coordsMap.js` **(new)**

**Tasks:**

1. Implement mapping utils: `computeContainMapping`, `computeCoverMapping`, `modelToCanvasBox`.
2. Call `syncCanvasSize()` on `loadeddata` + resize; draw boxes using mapping; support contain/cover.
3. Backpressure loop (single in‑flight), FPS/TTFD logs, mobile adapt (D6).

**Acceptance:** boxes align ±2px (±1px for `crack` on DPR≥2); FPS ≥15 desktop; TTFD ≤2s after load.

**Deliverables:** code + `tests/test_camera_functions.js` minimal unit tests; screenshots before/after.

---

## Agent 2 — API Client & Cross‑Repo Integration (Client‑side)

**Files:**

* `public/js/apiClient.js`
* `public/js/report-upload-service.js`
* `public/js/utils/network.js`
* `public/js/hazardClasses.js` (if present)

**Tasks:**

1. Ensure **named exports** exist and are used: `detectSingleWithRetry`, `uploadDetection`, `createReport`, `getSessionSummary`, `uploadToCloudinaryViaServer`.
2. Centralize `resolveBaseUrl()` in `utils/network.js`; remove hardcoded URLs.
3. Validate contracts against server:

   * `POST /report` expects multipart with image + JSON meta.
   * `GET /session/{id}/reports|summary` returns objects with `image.url`.
4. Update client parsers accordingly; add `schemas/client-api.md` documenting fields.

**Acceptance:** live calls succeed against Railway API; Summary modal shows Cloudinary URLs; no 4xx/5xx in console.

**Deliverables:** code + `schemas/client-api.md` + short `README` note.

---

## Agent 3 — Model Integration (best0608)

**Files:**

* `public/object_detection_model/best0608.onnx`
* `public/js/camera_detection.js` (model path const)
* `scripts/verify_onnx_web.mjs` **(new, optional)**

**Tasks:**

1. Ensure the app loads `best0608.onnx` and logs input=`images`, output=`output0`.
2. If not, re‑export instructions: imgsz=480, nms=True, opset=12; update path.
3. Add simple web smoke script to create an ORT session and print dims.

**Acceptance:** session created in browser; output dims = `(1,300,6)`.

**Deliverables:** code + log snippet in `REPORT.md`.

---

## Agent 4 — Performance & Bundles

**Files:**

* `public/vendor/onnx/*` includes
* `public/js/camera_detection.js`

**Tasks:**

1. Dynamic import: try `ort.webgpu.bundle.min.mjs` + `await ort.env.webgpu.init()`, fallback to `ort.wasm.bundle.min.mjs`.
2. Lazy‑load model on first camera start; avoid recreating session on camera switch.
3. Metric logs (FPS/TTFD) + console summary per session.

**Acceptance:** TTFD ≤2s and FPS ≥15 on mid‑range laptop; single ORT bundle shipped.

**Deliverables:** code + metrics in `REPORT.md`.

---

## Agent 5 — Code Cleanup

**Files:**

* Remove if present: `public/js/upload_tf.js`, `public/js/firebaseConfig*.js`, camelCase `public/js/reportUploadService.js`.
* Remove extra ONNX/models except `best0608.onnx`.
* Remove duplicate ORT bundles; keep one WebGPU bundle and one WASM fallback.

**Tasks:**

1. `rg`/`grep` to confirm no references; delete files; update `.gitignore` for `*.map`, caches.

**Acceptance:** build/preview pass; no 404s; no dead imports per ESLint/depcheck.

**Deliverables:** PR titled `chore(client): remove obsolete files`.

---

## Agent 6 — E2E QA & Visual Tests

**Files:**

* `tests/e2e/overlay.spec.ts` **(new)** (Playwright)
* `tests/test_camera_functions.js`

**Tasks:**

1. Mock camera feed; run start→detections→stop→Summary; verify thumbnails and URLs exist.
2. Resize viewport; validate overlay alignment remains within ±2px.

**Acceptance:** tests pass locally and in CI.

**Deliverables:** code + CI config snippet + screenshots.

---

## Integration Specialist (Client‑oriented)

**Goal:** Own **integration with the Server repo** from the client side.

**Files:**

* `public/js/apiClient.js`, `public/js/utils/network.js`
* `schemas/client-api.md`

**Tasks:**

1. Diff client expectations vs server responses; open issues/PRs on server as needed.
2. Validate CORS/ALLOWED\_ORIGINS; ensure `VITE_API_BASE` used everywhere.
3. Keep a checklist of endpoints and fields used by the client.

**Acceptance:** No schema mismatches; all client→server flows succeed in Railway preview.

**Deliverables:** `schemas/client-api.md` + checklist in `TASKS.md`.
