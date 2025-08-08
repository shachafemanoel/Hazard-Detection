# Hazard Detection System - Questions & Clarifications

## Critical Questions Before Implementation

### 1. Video-Canvas Coordinate Mapping 🎯
**Question**: What is the expected behavior when video aspect ratio doesn't match canvas aspect ratio?

**Current Issue**: The overlay canvas is sized to match the video display, but we don't handle object-fit transformations properly.

**Options**:
- A) Stretch/squash coordinates to match canvas (may distort bounding boxes)
- B) Maintain aspect ratio and clip/pad (may miss edge detections)  
- C) Calculate actual video display rectangle within canvas (preserves accuracy)

**Recommendation**: Option C - Calculate the actual video display rectangle and map coordinates accordingly.

---

### 2. Session Persistence Strategy 🗄️
**Question**: Should detection data be stored locally (browser) or only server-side (Redis)?

**Current State**: 
- Redis storage implemented server-side
- Client tracks detections in memory only
- Session data lost on page refresh

**Considerations**:
- **Local storage**: Faster access, works offline, limited size (~5-10MB)  
- **Redis only**: Consistent across devices, requires network, better for analytics
- **Hybrid approach**: Cache locally, sync with Redis

**Recommendation**: Hybrid - cache session summary locally, persist full detection data in Redis.

---

### 3. ONNX Bundle Strategy 📦
**Question**: Which ONNX runtime bundle should we use for production?

**Current Options**:
```
ort.all.bundle.min.mjs     (2.1MB - includes WebGL, WebGPU, WASM)
ort.wasm.bundle.min.mjs    (1.1MB - WASM only)  
ort.webgl.min.mjs          (800KB - WebGL only)
ort.webgpu.bundle.min.mjs  (1.8MB - WebGPU + fallbacks)
```

**Performance Requirements**: ≤2s TTFD, ≥15 FPS

**Recommendation**: Start with `ort.webgpu.bundle.min.mjs` for modern browsers, fallback to WASM bundle.

---

### 4. Cloudinary Upload Timing ☁️
**Question**: When should we upload detection images to Cloudinary?

**Options**:
- A) **Real-time**: Upload every detection immediately (high bandwidth)
- B) **End-of-session**: Upload all detections when session ends (potential data loss)
- C) **Selective**: Upload only high-confidence or unique detections (complexity)
- D) **Batched**: Upload every N detections or every X seconds (balanced)

**Current Implementation**: Upload happens server-side after detection API call.

**Recommendation**: Option D - Batch upload every 10 detections or 30 seconds, whichever comes first.

---

### 5. Error Recovery Strategy ⚠️
**Question**: How should the client handle API failures during detection?

**Current Behavior**: API errors logged but detection continues with cached results.

**Scenarios**:
- Network timeout during detection
- Model service unavailable  
- Session expired/invalid
- Redis connection lost

**Recommendation**: Implement exponential backoff with local fallback mode (cache last N detections).

---

### 6. Mobile Performance Targets 📱
**Question**: Should we use different performance targets for mobile vs desktop?

**Current Targets**: 
- TTFD ≤2s (all devices)
- FPS ≥15 (all devices)

**Mobile Considerations**:
- Limited memory (1-4GB typical)
- Slower CPU/GPU
- Variable network conditions  
- Battery usage concerns

**Recommendation**: Adaptive performance - reduce model input size on mobile devices if needed.

---

### 7. Coordinate Precision Requirements 📐
**Question**: Is ±2px overlay accuracy sufficient for all hazard types?

**Context**: 
- Potholes: Usually 20-100px in size
- Cracks: Can be 1-5px thin lines  
- Surface damage: Variable size

**±2px Impact**:
- Large objects (>40px): 5-10% error (acceptable)
- Small objects (<10px): 20-40% error (potentially problematic)

**Recommendation**: Maintain ±2px for now, but consider tighter tolerance (±1px) for crack detection.

---

### 8. Development vs Production Configs 🔧
**Question**: Should we maintain separate build configurations for development and production?

**Current State**: Single configuration used for all environments.

**Development Needs**:
- Detailed logging
- Unminified ONNX bundles  
- Debug coordinate overlay
- Performance profiling

**Production Needs**:
- Minimal logging
- Optimized bundles
- Error reporting
- Analytics integration

**Recommendation**: Add `NODE_ENV` based configuration switching.

---

### 9. Testing Strategy 🧪
**Question**: What testing approach should we take for coordinate mapping and detection accuracy?

**Current Tests**: Basic API integration tests exist.

**Missing Tests**:
- Coordinate transformation accuracy
- Video-canvas alignment across viewports
- ONNX runtime performance benchmarks
- Session persistence edge cases

**Recommendation**: Add visual regression tests for coordinate mapping and performance benchmarks.

---

### 10. Deployment Pipeline 🚀
**Question**: Should we implement a staging environment for testing performance changes?

**Current Deployment**: Direct to Railway production.

**Performance Risk**: Changes to ONNX loading or coordinate mapping could break production.

**Recommendation**: Use Railway preview deployments for performance testing before promoting to main.

---

## Implementation Priorities

### Must Answer Before Starting:
1. **Video-canvas coordinate strategy** (#1)
2. **ONNX bundle selection** (#3)  
3. **Error recovery approach** (#5)

### Can Decide During Implementation:
4. **Session persistence details** (#2)
5. **Cloudinary upload timing** (#4)
6. **Mobile performance targets** (#6)

### Address Later:
7. **Coordinate precision refinement** (#7)
8. **Development configurations** (#8)  
9. **Extended testing strategy** (#9)
10. **Staging environment setup** (#10)

---
*Questions compiled on 2025-08-08 - Please review and prioritize before implementation begins.*