# Hazard Detection System - Agent Task Coordination

**Project Root:** `/Users/shachafemanoel/Documents/Hazard-Detection`  
**Created:** 2025-08-08  
**Work Manager:** Agent 0  
**Target:** Post-refactor stabilization with ±2px overlay accuracy, ≤2s TTFD, ≥15 FPS

## Current Status Analysis

### ✅ Already Complete
- **Module contracts**: All required exports exist in `apiClient.js` (`detectSingleWithRetry`, `uploadDetection`, `getSessionSummary`, `createReport`)
- **Coordinate mapping utilities**: Complete `utils/coordsMap.js` module with all required functions
- **Model files**: Both `best0408.onnx` (37MB) and `best0608.onnx` (10MB) available
- **Session management**: Complete session lifecycle management in place
- **API integration**: Railway production API fully functional

### 🔥 Critical Issues Identified
1. **Model inconsistency**: Code references `best0408.onnx` but newer `best0608.onnx` available
2. **ONNX bundle bloat**: 40+ ONNX runtime files consuming excessive bandwidth
3. **Performance gaps**: No lazy loading, memory management needs optimization
4. **E2E validation**: Missing comprehensive overlay accuracy tests

---

## Task Assignments

### 🎯 Agent 3 — Model Integration (Priority 1)
**Owner:** Model Integration Specialist  
**Files:** `public/object_detection_model/`, `public/js/camera_detection.js`

#### Tasks:
1. **Model migration to best0608.onnx** ⚡⚡⚡
   - Update model path constant in `camera_detection.js` from `best0408.onnx` to `best0608.onnx`
   - Verify model dimensions and class outputs match expected format
   - Remove obsolete `best0408.onnx` (37MB) to save bandwidth
   - Update model input size constant (480 → 320 if needed)

2. **Model validation script** ⚡
   - Create `scripts/verify_onnx_web.mjs` for browser ONNX session testing
   - Log model input/output dimensions for verification
   - Test session creation without errors

#### Acceptance Criteria:
- [ ] App successfully loads `best0608.onnx` model
- [ ] Session creation logs show input=`images`, output=`output0`
- [ ] Output dimensions = `(1, 300, 6)` confirmed
- [ ] No 404 errors or model loading failures in console
- [ ] `best0408.onnx` removed from repository

#### Deliverables:
- Updated model path in camera_detection.js
- Working `scripts/verify_onnx_web.mjs`
- Model verification log snippet in `REPORT.md`

---

### 🎯 Agent 4 — Performance & Bundles (Priority 1)
**Owner:** Performance Optimization Specialist  
**Files:** `public/ort/`, `public/js/onnx-runtime-loader.js`

#### Tasks:
1. **ONNX bundle consolidation** ⚡⚡⚡
   - Remove 38+ redundant ONNX files from `public/ort/`
   - Keep only: `ort.webgpu.bundle.min.mjs` and `ort.wasm.bundle.min.mjs`
   - Implement dynamic import with WebGPU preference, WASM fallback
   - Add bundle size logging for monitoring

2. **Lazy loading implementation** ⚡⚡
   - Load model only on first camera start (not page load)
   - Cache inference session across camera switches
   - Implement session disposal on page unload

3. **Memory management** ⚡
   - Add tensor memory cleanup after each inference
   - Monitor GPU memory usage and log warnings
   - Implement backpressure to prevent memory leaks during high FPS

#### Acceptance Criteria:
- [ ] Bundle size reduced by >90% (from ~40 files to 2 files)
- [ ] TTFD ≤2 seconds on mid-range laptop
- [ ] FPS ≥15 sustained during detection sessions  
- [ ] No memory leaks during 5+ minute detection sessions
- [ ] WebGPU acceleration enabled when available

#### Deliverables:
- Consolidated ONNX runtime bundle
- Updated `onnx-runtime-loader.js` with lazy loading
- Performance metrics in `REPORT.md`

---

### 🎯 Agent 1 — Frontend Overlay & Camera (Priority 2)
**Owner:** Frontend Camera Specialist  
**Files:** `public/camera.html`, `public/css/camera.css`, `public/js/camera_detection.js`

#### Tasks:
1. **Canvas synchronization** ⚡⚡
   - Implement `syncCanvasSize()` calls on `loadeddata` and `resize` events
   - Ensure canvas resolution matches video display for pixel-perfect overlay
   - Handle device pixel ratio (DPR) scaling correctly

2. **Overlay accuracy validation** ⚡⚡
   - Use existing `coordsMap.js` utilities for box mapping
   - Test across mobile/desktop viewports and aspect ratios
   - Validate ±2px accuracy (±1px for `crack` on DPR≥2)

3. **Mobile adaptivity** ⚡
   - Responsive canvas sizing for mobile portrait/landscape
   - Touch-friendly UI controls
   - Performance optimization for mobile CPUs

#### Acceptance Criteria:
- [ ] Bounding boxes align within ±2px accuracy across all viewports
- [ ] ±1px accuracy for `crack` detections on high-DPI displays
- [ ] Canvas resolution synced with video dimensions
- [ ] Mobile responsive layout working correctly
- [ ] FPS ≥10 on mobile devices, ≥15 on desktop

#### Deliverables:
- Updated camera_detection.js with precise overlay mapping
- Responsive CSS improvements in camera.css
- Unit tests in `tests/test_camera_functions.js`
- Before/after alignment screenshots

---

### 🎯 Agent 5 — Code Cleanup (Priority 2)
**Owner:** Code Organization Specialist  
**Files:** Repository-wide duplicate removal

#### Tasks:
1. **Duplicate module cleanup** ⚡⚡
   - Remove duplicate files in `/src/` folder (keep `/public/js/` versions)
   - Remove obsolete upload scripts: `upload_tf.js`, Firebase configs
   - Remove test debris: scattered `test-*.js` files
   - Consolidate Docker configurations (keep production-ready ones)

2. **Dead import removal** ⚡
   - Use `rg`/`grep` to find unused import references
   - Remove imports from deleted modules
   - Update `.gitignore` for build artifacts (`*.map`, `.cache/`)

3. **ESM standardization** ⚡
   - Ensure all modules use consistent ESM `export`/`import` syntax
   - Fix any remaining CommonJS modules
   - Validate no circular dependencies

#### Acceptance Criteria:
- [ ] No duplicate modules between `/src/` and `/public/js/`
- [ ] No 404 import errors in browser console
- [ ] ESLint passes with no dead code warnings
- [ ] Build/preview commands succeed without errors
- [ ] Repository size reduced by cleaning up obsolete files

#### Deliverables:
- PR titled `chore(client): remove obsolete files and consolidate modules`
- Updated `.gitignore` with proper build artifact exclusions
- ESM import/export consistency report

---

### 🎯 Agent 6 — E2E QA & Visual Tests (Priority 3)
**Owner:** Quality Assurance Specialist  
**Files:** `tests/e2e/`, `tests/test_camera_functions.js`

#### Tasks:
1. **Overlay accuracy test suite** ⚡⚡
   - Create `tests/e2e/overlay.spec.ts` with Playwright
   - Mock camera feed with known test frames
   - Test detection→overlay→summary flow end-to-end
   - Validate bounding box pixel-perfect alignment

2. **Cross-viewport testing** ⚡
   - Test mobile portrait (375x667), landscape (667x375)
   - Test desktop viewports (1920x1080, 1366x768)
   - Verify ±2px overlay accuracy across all tested viewports

3. **Performance benchmarking** ⚡
   - Automated FPS measurement during detection sessions
   - TTFD timing from page load to first detection
   - Memory leak detection over 10-minute sessions

#### Acceptance Criteria:
- [ ] All E2E tests pass locally and in CI
- [ ] Overlay alignment verified within ±2px tolerance
- [ ] Performance benchmarks meet targets (≥15 FPS, ≤2s TTFD)
- [ ] No memory leaks detected in automated testing
- [ ] Cross-browser compatibility (Chrome, Safari, Firefox)

#### Deliverables:
- Complete E2E test suite in `tests/e2e/overlay.spec.ts`
- Updated unit tests in `tests/test_camera_functions.js`
- CI configuration for automated testing
- Test execution screenshots and performance reports

---

### 🎯 Agent 2 — API Client & Cross-Repo Integration (Priority 3)
**Owner:** API Integration Specialist  
**Files:** `public/js/apiClient.js`, `public/js/utils/network.js`, `schemas/`

#### Tasks:
1. **API contract validation** ⚡
   - Validate all existing API endpoints against Railway production server
   - Document actual response formats in `schemas/client-api.md`
   - Test session lifecycle: start→detect→summary→end flows

2. **URL centralization** ⚡
   - Move `resolveBaseUrl()` to `utils/network.js` if not already centralized
   - Remove any hardcoded Railway URLs from individual modules
   - Ensure `VITE_API_BASE` environment variable used consistently

3. **Error handling improvement** ⚡
   - Add retry logic for transient API failures
   - Improve error messages for network/API issues
   - Add connection health monitoring

#### Acceptance Criteria:
- [ ] All API calls succeed against Railway production server
- [ ] Session summary modal displays Cloudinary URLs correctly
- [ ] No 4xx/5xx API errors in browser console during normal operation
- [ ] Retry logic handles transient network failures gracefully
- [ ] API documentation matches actual implementation

#### Deliverables:
- Updated `schemas/client-api.md` with current API contracts
- Enhanced error handling in apiClient.js
- Network utility improvements in `utils/network.js`
- API integration test report

---

## Integration & Verification Plan

### Phase 1: Core Functionality (Week 1)
1. **Agent 3** completes model migration to `best0608.onnx`
2. **Agent 4** consolidates ONNX bundles and implements lazy loading  
3. **Agent 1** validates overlay accuracy with new model

### Phase 2: Optimization & Cleanup (Week 2)  
1. **Agent 5** removes duplicate modules and dead code
2. **Agent 2** validates API contracts and error handling
3. **Agent 4** completes performance optimization

### Phase 3: QA & Documentation (Week 3)
1. **Agent 6** implements comprehensive E2E test suite
2. **Agent 1** finalizes mobile responsiveness
3. **All agents** contribute to final integration testing

### Work Manager Responsibilities (Agent 0)
- [ ] Monitor task progress and unblock dependencies
- [ ] Validate acceptance criteria for each completed task
- [ ] Coordinate integration between agents when tasks overlap
- [ ] Create consolidated commits with proper change documentation
- [ ] Generate final `REPORT.md` with performance metrics
- [ ] Open PR against `4uryeb-codex/fix-loading-backend-model` branch

## Success Metrics

### Performance Targets
- **TTFD**: ≤2 seconds (Time To First Detection)
- **FPS**: ≥15 steady-state, ≥10 on mobile
- **Overlay Accuracy**: ±2px (±1px for cracks on high-DPI)
- **Bundle Size**: <5MB total ONNX runtime
- **API Latency**: P95 ≤150ms

### Quality Gates
- Zero import/export errors in browser console
- All existing tests pass + new tests for coordinate mapping
- Mobile/desktop compatibility verified
- No memory leaks during extended sessions
- E2E test suite covers critical user journeys

## Risk Mitigation

### High Risk Items
- **Model performance regression**: Test FPS before/after model change
- **Coordinate mapping accuracy**: Validate on multiple aspect ratios
- **ONNX bundle loading**: Test WebGPU/WASM fallback scenarios

### Contingency Plans  
- Keep `best0408.onnx` as backup until `best0608.onnx` validated
- Rollback ONNX bundle changes if performance degrades
- Incremental coordinate mapping fixes with small test cases

---

**Next Action:** Agent 3 begins model migration to `best0608.onnx`
**Review Cadence:** Daily standup for dependency coordination  
**Target Completion:** 2025-08-15