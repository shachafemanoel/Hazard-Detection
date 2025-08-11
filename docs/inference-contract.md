# Inference Contract - Hazard Detection System

## Overview

This document defines the unified interface contract for hazard detection inference engines across local and remote implementations. All detection engines must conform to this contract to ensure seamless interoperability.

## Contract Specification

### Detection Result Format

All inference engines MUST return detection results in the following standardized format:

```typescript
interface DetectionResult {
  detections: Detection[];
  width: number;        // Source image width
  height: number;       // Source image height
  timings: InferenceTimings;
  engine: EngineInfo;
}

interface Detection {
  x1: number;          // Left coordinate (pixels)
  y1: number;          // Top coordinate (pixels) 
  x2: number;          // Right coordinate (pixels)
  y2: number;          // Bottom coordinate (pixels)
  score: number;       // Confidence score [0.0-1.0]
  classId: number;     // Class index
  className: string;   // Human-readable class name
}

interface InferenceTimings {
  preprocess_ms: number;
  infer_ms: number;
  postprocess_ms: number;
  total_ms: number;
}

interface EngineInfo {
  name: string;        // 'local' | 'remote' | 'worker'
  backend: string;     // 'webgpu' | 'wasm' | 'openvino' | 'fastapi'
  version: string;     // Engine version
  modelPath?: string;  // Model identifier
}
```

### Class Definitions

The system supports 4 hazard classes:
- `0: 'crack'` - Road surface cracks
- `1: 'knocked'` - Knocked/damaged areas  
- `2: 'pothole'` - Potholes and holes
- `3: 'surface damage'` - General surface damage

### Coordinate System

- **Coordinate Origin**: Top-left corner (0,0)
- **Units**: Pixels in source image space
- **Bounds**: All coordinates MUST be within [0, width] × [0, height]
- **Format**: Absolute pixel coordinates (not normalized)

### Performance Requirements

#### Local Inference
- **TTFD**: ≤2 seconds (Time To First Detection)
- **FPS**: ≥15 FPS sustained on desktop, ≥10 FPS on mobile
- **Memory**: Stable memory usage, no leaks during extended sessions

#### Remote Inference  
- **API Latency**: P95 ≤120ms for `/infer` endpoint
- **Health Check**: `/healthz` must respond within 5s
- **Failover**: Automatic fallback to local inference within 2 frames

### Error Handling

All engines MUST handle errors gracefully:

```typescript
interface InferenceError {
  type: 'model_load' | 'inference' | 'timeout' | 'network';
  message: string;
  timestamp: number;
  engine: string;
}
```

### Validation Requirements

#### Input Validation
- Image dimensions: 1×1 to 4096×4096 pixels
- Supported formats: JPEG, PNG, WebP
- File size limit: 10MB maximum

#### Output Validation
- All detection coordinates within image bounds
- Score values in range [0.0, 1.0] 
- ClassId values in range [0, 3]
- Non-empty timings object with positive values

### Integration Points

#### Camera Detection Flow
1. Video frame capture
2. Coordinate mapping (model space → canvas space)
3. Detection filtering and NMS
4. Canvas rendering with ±2px accuracy
5. Session tracking and auto-reporting

#### Upload Detection Flow  
1. File validation and EXIF parsing
2. Image preprocessing and letterboxing
3. Model inference
4. DetectionEvent emission
5. Canvas rendering and save functionality

#### Auto-Reporting Integration
```typescript
interface AutoReportingEvent {
  detections: Detection[];
  sessionId: string;
  timestamp: number;
  location?: GeoLocation;
  confidence_threshold: number;
}
```

## Implementation Requirements

### Local Engine (Web Worker)
- File: `public/js/inference.worker.js`
- ONNX model: `public/object_detection_model/best0608.onnx`
- Runtime: ONNX Runtime Web (WebGPU preferred, WASM fallback)
- Input size: 640×640 pixels
- Backpressure: Single in-flight inference

### Remote Engine (FastAPI)
- Base URL: `https://hazard-api-production-production.up.railway.app`
- Endpoint: `POST /infer`
- Model: OpenVINO optimized
- Response format: JSON conforming to DetectionResult

### Orchestration Engine
- File: `public/js/camera_detection.js`
- Responsibilities: Engine selection, failover, circuit breaking
- Fallback logic: Remote → Local within 2s timeout
- Health monitoring: Continuous endpoint probing

## Validation Scripts

### Runtime Validation
```javascript
function validateDetectionResult(result) {
  const errors = [];
  
  // Required fields
  if (!result.detections || !Array.isArray(result.detections)) {
    errors.push('Missing or invalid detections array');
  }
  
  if (typeof result.width !== 'number' || result.width <= 0) {
    errors.push('Invalid width');
  }
  
  if (typeof result.height !== 'number' || result.height <= 0) {
    errors.push('Invalid height');
  }
  
  // Validate each detection
  result.detections?.forEach((det, i) => {
    if (det.x1 >= det.x2 || det.y1 >= det.y2) {
      errors.push(`Detection ${i}: Invalid coordinates`);
    }
    
    if (det.score < 0 || det.score > 1) {
      errors.push(`Detection ${i}: Score out of range`);
    }
    
    if (det.classId < 0 || det.classId > 3) {
      errors.push(`Detection ${i}: Invalid classId`);
    }
  });
  
  return errors.length === 0 ? null : errors;
}
```

### Contract Compliance Testing
- Unit tests: `tests/inference-contract.test.js`
- Integration tests: Cross-engine validation
- Performance benchmarks: Automated timing validation

## Migration Path

### Current State (2025-08-11)
- Local engine: Functional with coordinate mapping issues
- Remote engine: FastAPI available but integration incomplete  
- Upload flow: DetectionEvent emission needs implementation

### Required Changes
1. Standardize detection output format across engines
2. Implement runtime validation in all engines
3. Fix coordinate mapping in upload workflow
4. Add comprehensive contract testing
5. Update auto-reporting to consume standardized events

## Acceptance Criteria

- [ ] All engines return results conforming to DetectionResult interface
- [ ] Runtime validation prevents invalid data propagation
- [ ] Coordinate mapping achieves ±2px accuracy requirement
- [ ] Performance benchmarks meet specified targets
- [ ] Auto-reporting integrates seamlessly with both engines
- [ ] Contract tests pass for local and remote implementations
- [ ] Upload workflow emits correct DetectionEvent format

---

**Version**: 1.0  
**Last Updated**: 2025-08-11  
**Status**: DRAFT - Implementation Required