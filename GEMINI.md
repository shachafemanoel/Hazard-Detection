# GEMINI.md

## Context
This repository (`hazard-detection`) is a standalone web application for object detection, reporting, and dashboard management.  
The detection engine is a local **ONNX model** (`public/web/best.onnx`) running fully in the browser via **onnx-runtime-web**.  
The goal is to have a fully functional **live detection interface** in `camera.html` without relying on any remote API.

Current issues to fix:

1. **User authentication** in `login` page does not work (standard login + Google auth + Redis session validation).
2. **ONNX model not loading** in `camera_detection.js` — ensure correct path, backend fallback (WebGPU → WebGL → WASM), and warmup.
3. **Canvas rendering issues** — detection boxes and labels are misaligned or not displayed; duplicate DOM elements possible.
4. **Automatic report creation** not working:
   - Not triggered in live detection.
   - Not triggered when uploading images with EXIF metadata (location/date).
5. **Report saving and syncing** — ensure IndexedDB schema is correct and sync with server (if online) is optional and does not break offline mode.

---

## Mission
Fix the entire detection interface in `camera.html` and related scripts so that:

- ONNX model loads reliably from `public/web/best.onnx`.
- Live detection works at 30+ FPS on mid-range hardware.
- Canvas overlays (boxes, labels, FPS) are correct and synced to detections.
- Automatic report creation works both in live mode and on image upload (including EXIF location/date extraction).
- All report data is stored locally in IndexedDB, with optional sync when online.
- No duplicate DOM elements or redundant event listeners.

---

## Step-by-step Actions for Gemini

### 1) **fe-platform-lead** subagent
> Use the fe-platform-lead subagent to audit and fix all UI elements in `camera.html` and related JS:
> - Remove duplicate/unnecessary DOM nodes.
> - Ensure all controls (start/stop, upload, engine toggle, thresholds) render correctly and function.
> - Add `data-testid` attributes to important UI components for testing.
> - Make layout responsive for desktop and mobile.

### 2) **detection-engine-lead** subagent
> Use the detection-engine-lead subagent to fix `camera_detection.js` so it loads the ONNX model from `public/web/best.onnx` using `onnxruntime-web` with WebGPU → WebGL → WASM fallback.
> - Ensure preprocessing, inference, and postprocessing output correct coordinates/scores.
> - Emit proper FPS and inference time telemetry to the UI.

### 3) **orchestration-lead** subagent
> Use the orchestration-lead subagent to make sure the local ONNX engine is always used and remove any unnecessary API fallback calls.
> - If engine switching UI exists, it should be functional but default to local mode.

### 4) **reports-data-lead** subagent
> Use the reports-data-lead subagent to:
> - Ensure live detections trigger `createReport()` automatically.
> - On image upload with EXIF metadata, extract GPS/date and store in the report.
> - Store all reports in IndexedDB with correct schema.
> - Keep offline functionality; sync to server is optional.

---

## Definition of Done
- Visiting `camera.html` starts local ONNX detection without errors.
- UI controls are fully functional and responsive.
- Canvas overlays are aligned and updated per frame.
- Reports are automatically created in both live and upload modes.
- IndexedDB contains reports with correct metadata.
- No duplicate DOM or redundant listeners.