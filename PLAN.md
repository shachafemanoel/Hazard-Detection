# Hazard Detection System Stabilization Plan

## Executive Summary
This plan addresses critical issues in the client-side hazard detection system to achieve:
- **±2px overlay accuracy** across all aspect ratios
- **≤2s TTFD** (Time To First Detection)
- **≥15 FPS** steady-state performance  
- **Reliable session persistence** with Cloudinary uploads
- **Clean module architecture** with consistent ESM exports

## Current State Analysis

### ✅ Strengths
- **ESM Module Structure**: Package.json correctly configured with `"type": "module"`
- **Proper FastAPI Integration**: Existing API client with session management
- **ONNX Runtime Setup**: Multiple optimized ONNX builds available in `/public/ort/`
- **Firebase/Cloudinary Integration**: Authentication and storage configured
- **Test Infrastructure**: Jest configured with existing test files

### 🔥 Critical Issues Found

#### 1. Missing Module Contracts (**Priority 1**)
- `detectSingleWithRetry` function not exported from apiClient.js  
- `uploadDetection` function missing
- `getSessionSummary` function missing
- `createReport` function missing
- No `utils/coordsMap.js` module for video-canvas coordinate mapping

#### 2. Video-Canvas Alignment Issues (**Priority 1**)  
- No coordinate transformation system between:
  - Model input (320x320) → Video display
  - Video source → Canvas overlay
- Missing object-fit cover/contain mapping logic
- Overlay accuracy depends on viewport/aspect ratio (fails ±2px requirement)

#### 3. ONNX Runtime Inefficiencies (**Priority 2**)
- Multiple redundant ONNX bundles loaded (24+ files in `/public/ort/`)
- No lazy loading implementation
- Missing memory management for inference sessions
- Workers not utilized for heavy preprocessing

#### 4. Session Persistence Gaps (**Priority 2**)
- Session summary modal implementation incomplete
- Redis session state not properly synced client-side  
- Cloudinary upload flow exists but not integrated with session lifecycle
- End-of-session reporting workflow missing

#### 5. Dead Code & Duplicates (**Priority 3**)
- Multiple duplicate files: `src/` and `public/js/` contain similar modules
- Unused test files: `final-detection-test.js`, `test-*.js` scattered
- Multiple Docker configs without clear purpose
- Redundant API client implementations in `src/clients/`

## Implementation Plan

### Phase 1: Module Contract Fixes (Week 1)
**Goal**: Standardize ESM exports and fix missing functions

1. **Fix apiClient.js exports** ⚡
   ```javascript
   // Add missing named exports:
   export { detectSingleWithRetry, uploadDetection, getSessionSummary, createReport }
   ```

2. **Create utils/coordsMap.js** ⚡
   ```javascript
   export function mapModelToCanvas(detection, modelSize, canvasSize, videoRect)
   export function normalizeCoordinates(bbox, sourceWidth, sourceHeight)
   ```

3. **Unify report-upload-service.js** ⚡
   - Move `/src/services/report-upload-service.js` to `/public/js/`
   - Update imports in camera_detection.js

### Phase 2: Coordinate Alignment Fix (Week 1-2) 
**Goal**: Achieve ±2px overlay accuracy

1. **Implement coordinate mapping system** ⚡⚡⚡
   - Calculate video display rectangle from CSS object-fit
   - Transform YOLO model coordinates (normalized) to canvas pixels
   - Handle aspect ratio mismatches between video source and display

2. **Fix overlay rendering** ⚡⚡
   - Update bounding box drawing in camera_detection.js  
   - Test across mobile/desktop viewports
   - Validate ±2px accuracy with measurement tools

### Phase 3: ONNX Runtime Optimization (Week 2)
**Goal**: Achieve ≤2s TTFD and ≥15 FPS

1. **Single bundle loading** ⚡
   - Use only `ort.all.bundle.min.mjs` for production
   - Remove 23+ redundant ONNX files
   - Implement lazy loading with dynamic imports

2. **Memory management** ⚡
   - Reuse inference sessions
   - Pre-allocate tensor buffers  
   - Add GPU acceleration detection

3. **Web Worker preprocessing** ⚡
   - Move image preprocessing to `preprocess.worker.js`
   - Async batch processing for multiple frames

### Phase 4: Session Flow Integration (Week 2-3)
**Goal**: End-to-end session persistence with summary modal

1. **Session lifecycle** ⚡⚡  
   - Start session → continuous detection → end session → summary modal
   - Persist detections in Redis via API
   - Track unique hazard types and confidence metrics

2. **Summary modal implementation** ⚡⚡
   - Show session statistics (duration, detection count, hazard types)
   - Display Cloudinary URLs for saved detection images  
   - Export functionality for reports

3. **Redis integration** ⚡
   - Session state synchronization
   - Real-time detection counting
   - P95 API latency ≤150ms validation

### Phase 5: Code Cleanup (Week 3)
**Goal**: Remove dead code, fix imports/exports

1. **Dead code removal** ⚡
   - Remove duplicate modules in `/src/` folder
   - Clean up test files and unused scripts
   - Consolidate Docker configurations

2. **Import/export standardization** ⚡  
   - Ensure all modules use consistent ESM syntax
   - Fix circular dependencies if any
   - Update test imports accordingly

## Success Metrics

### Performance Targets
- **TTFD**: ≤2 seconds (from page load to first detection)
- **FPS**: ≥15 FPS steady-state during detection  
- **API Latency**: P95 ≤150ms for detection requests
- **Overlay Accuracy**: ±2px bounding box alignment across all viewports

### Quality Gates  
- **Zero import/export errors** in browser console
- **All existing tests passing** + new tests for coordinate mapping
- **Mobile/desktop compatibility** verified
- **Memory leak prevention** during long detection sessions

## Risk Assessment

### High Risk
- **Coordinate mapping complexity**: Different video aspect ratios, CSS object-fit behavior
- **ONNX performance regression**: Changes to loading/memory management could impact FPS

### Medium Risk  
- **Redis connection stability**: Railway hosted Redis reliability
- **Cloudinary upload limits**: Rate limiting during high detection sessions

### Low Risk
- **Module refactoring**: Well-defined ESM patterns, clear interfaces

## Next Steps
1. **Start with Phase 1** (module fixes) - lowest risk, high impact
2. **Focus on coordinate mapping** - most critical for user experience  
3. **Performance optimization** - measure before/after each change
4. **Incremental testing** - validate each phase before proceeding

---
*Generated on 2025-08-08 for Hazard Detection System v1.0.0*