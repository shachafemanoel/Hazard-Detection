# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hazard Detection is a real-time road hazard detection system using AI/ML with a hybrid architecture:
- **Frontend**: Static web app with ONNX Runtime for browser-based inference
- **Backend**: Node.js Express server with authentication and session management
- **API**: External FastAPI service for remote inference fallback
- **Models**: YOLO-based detection models in ONNX format

## Quick Start Commands

### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start

# Run tests
npm test

# Check streaming functionality
npm run stream:check
```

### Docker Development
```bash
# Build unified container
./build-unified.sh

# Run with compose
docker-compose -f docker-compose.unified.yml up -d

# Health check
curl http://localhost:3000/health
```

## Architecture

### Frontend Structure (`public/`)
- **Entry Points**: `login.html` → `upload.html` → `camera.html`
- **Auth Flow**: `route-guard.js` + `session-manager.js` gate access to main app
- **Detection Engine**: ONNX Runtime with WebGPU/WASM fallbacks
- **API Communication**: REST API via `apiClient.js` with Railway backend
- **Real-time**: Camera stream with overlay detection rendering

### Key Modules
- **`public/js/camera_detection.js`**: Main detection loop, camera handling, overlay rendering
- **`public/js/apiClient.js`**: HTTP client for external API, session management
- **`public/js/onnx-runtime-loader.js`**: ONNX model loading with backend selection
- **`public/js/utils/coordsMap.js`**: Video-to-canvas coordinate transformation
- **`public/js/inference.worker.js`**: Web Worker for inference processing
- **`public/js/auto-reporting-service.js`**: Automatic hazard reporting system

### Server Structure (`server/`)
- **`server/routes/server.js`**: Main Express server with Redis sessions
- **`server/routes/auth.js`**: Google OAuth integration
- **`server/services/reportUploadService.js`**: Cloudinary integration

### Model Files
- **Primary**: `public/onnx_models/best.onnx` (canonical path)
- **Fallback**: `public/onxx_models/best.onnx` (typo folder - legacy support)
- **ONNX Runtime**: `public/ort/` (WebGPU and WASM bundles)

## Common Development Tasks

### Adding New Detection Features
1. Update model preprocessing in `preprocess.worker.js`
2. Modify post-processing in `inference.worker.js` 
3. Update coordinate mapping in `utils/coordsMap.js`
4. Test with `public/test-onnx-model-loading.html`

### API Integration Changes
1. Update contracts in `apiClient.js`
2. Validate against external API at `https://hazard-api-production-production.up.railway.app`
3. Update session flow in `session-manager.js`
4. Test end-to-end with `test-api-connection.html`

### Performance Optimization
- **ONNX Backend Selection**: WebGPU → WASM-SIMD → WASM → Remote API
- **Target Performance**: ≥15 FPS, ≤2s TTFD (Time To First Detection)
- **Memory Management**: Reuse inference sessions, avoid GC pressure
- **Coordinate Accuracy**: ±2px overlay alignment across all viewports

### Testing Strategy
- **Unit**: Jest with `__tests__/*.test.js`
- **Integration**: Browser tests in `public/test-*.html`
- **Performance**: FPS/TTFD metrics logged in console
- **Smoke Tests**: `scripts/verify_onnx_web.mjs`

## Important Patterns

### ESM Module Structure
The project uses ES modules (`"type": "module"` in package.json):
```javascript
// ✅ Correct - Named exports
export { detectSingleWithRetry, uploadDetection };

// ✅ Correct - Dynamic imports for workers
const worker = new Worker('./inference.worker.js', { type: 'module' });
```

### Error Handling
```javascript
// ✅ Graceful fallbacks for ONNX backends
try {
  await ort.env.webgpu.init();
  backend = 'webgpu';
} catch {
  backend = 'wasm'; // fallback
}
```

### Coordinate Transformation
```javascript
// ✅ Video-to-canvas mapping with object-fit handling
const rect = getVideoDisplayRect(video, canvas);
const canvasBox = mapModelToCanvas(detection, 640, rect);
```

## Configuration

### Environment Variables
- **Required**: `SESSION_SECRET`
- **Optional**: `CLOUDINARY_*`, `GOOGLE_*`, `REDIS_*`, `MODEL_BACKEND`
- **Client Config**: `public/js/config.js` + `public/js/network.js`

### Feature Flags
- **Auto-reporting**: `FEATURE_FLAGS.AUTO_REPORTING_ENABLED`
- **Real-time**: `FEATURE_FLAGS.REALTIME_ENABLED` 
- **Debug**: `FEATURE_FLAGS.DEBUG_MODE`

### API Endpoints
- **Health**: `GET /health`
- **Detection**: `POST /detect`
- **Reports**: `POST /report`, `GET /session/:id/reports`
- **Auth**: Google OAuth via Passport.js

## Known Issues & Workarounds

### Model Path Typo
- Current: `/onxx_models/` (typo folder exists)
- Canonical: `/onnx_models/` (implement resolver for both)

### ONNX Runtime Threading
- Requires COOP/COEP headers for WASM threads
- Graceful fallback to single-threaded when headers missing

### Coordinate Alignment
- Different aspect ratios need custom mapping logic
- Mobile viewport handling requires DPR scaling
- Test accuracy with measurement tools

## Performance Targets

- **TTFD**: ≤2 seconds from page load to first detection
- **FPS**: ≥15 FPS steady-state during detection
- **API Latency**: P95 ≤150ms for external API calls  
- **Overlay Accuracy**: ±2px bounding box alignment
- **Memory**: No growth over 5-minute detection sessions

## Git Workflow

### Branch Strategy
- **Main**: `4uryeb-codex/fix-loading-backend-model`
- **Current**: `codebase`
- **Development**: Feature branches from main

### Commit Messages
```
feat(client): implement coordinate mapping system

Why:
- Fix ±2px overlay accuracy requirement
- Support all aspect ratios and viewports

What:
- Add getVideoDisplayRect() utility
- Implement mapModelToCanvas() transformation
- Update camera_detection.js overlay rendering

Tests:
- Added coordinate mapping unit tests
- Verified across mobile/desktop viewports

Metrics:
- Overlay accuracy: ±1.2px average
- No performance regression
```

## Specialized Agent System

This project uses a comprehensive agent system for handling complex development tasks. These agents can be invoked using the Task tool with specific `subagent_type` parameters.

### Project-Specific Agents

#### Core Development Leads

**`fe-platform-lead`** - Frontend platform management
- **Role**: Senior frontend manager for Detection UI + Dashboard + UX polish
- **Scope**: Detection view with camera/overlays, live dashboard, controls integration
- **Targets**: 60fps UI, <1s dashboard lag, keyboard/mouse/touch ROI support

**`detection-engine-lead`** - ONNX runtime and inference engine
- **Role**: In-browser ONNX runtime, pre/post-processing, engine selection, telemetry
- **Scope**: Model loading, WebGPU→WASM fallbacks, coordinate mapping, performance
- **Targets**: 20-30 FPS WebGPU, ≥15 FPS WASM, ≤2s TTFD, deterministic NMS

**`node-server-lead`** - Backend server and API proxy
- **Role**: REST/WebSocket server, report CRUD, API proxy to Python service
- **Scope**: `/reports` endpoints, `/events` streaming, `/infer` proxy, CORS setup
- **Targets**: Works offline, proxy recovery, JSON/lowdb storage

**`orchestration-lead`** - Cross-engine routing and health management
- **Role**: Smart routing between local ONNX and remote API with circuit breakers
- **Scope**: Health checks, latency measurement, seamless switching, status broadcasting
- **Targets**: ≤2 frame failover, automatic switchback after 3 green checks

#### Data and Quality Management

**`reports-data-lead`** - Report lifecycle and storage
- **Role**: Report schema design, CRUD operations, deduplication, export functionality
- **Scope**: IndexedDB store, versioned migrations, background sync, conflict resolution
- **Targets**: 10k item performance, zero data loss, export compatibility

**`interface-contracts-owner`** - API contracts and data validation
- **Role**: Shared data contracts, JSON schemas, cross-repo compatibility
- **Scope**: TypeScript types, Pydantic models, sample fixtures, version management
- **Targets**: Both repos compile against same contract, fixtures pass CI

**`qa-release-lead`** - Testing and release management
- **Role**: Contract tests, E2E flows, performance budgets, CI pipeline
- **Scope**: Playwright scenarios, FPS measurement, release checklists
- **Targets**: Green builds required for merges, comprehensive test coverage

#### Meta-Orchestration Agents

**`program-director`** - Cross-repo coordination
- **Role**: Overall engineering lead, scope setting, team coordination
- **Scope**: Task delegation, milestone tracking, contract enforcement
- **Targets**: 30+ FPS interface, ≤1s dashboard staleness, API p95 ≤120ms

**`agent-organizer`** - Multi-agent task coordination
- **Role**: Task decomposition, agent selection, workflow optimization
- **Scope**: Agent registry management, task queue optimization, resource tracking
- **Targets**: >95% selection accuracy, >99% task completion, optimal utilization

**`error-coordinator`** - Distributed error handling
- **Role**: Error correlation, cascade prevention, automated recovery
- **Scope**: Cross-agent error tracking, failure isolation, learning integration
- **Targets**: <30s detection, >90% recovery success, <5min MTTR

#### Utility and Maintenance

**`esm-test-fixer`** - CommonJS to ESM migration
- **Role**: Convert test files from CommonJS to ES Module syntax
- **Scope**: `require()` to `import` conversion, `__dirname` replacement, dependency fixes
- **Usage**: When tests fail with "require is not defined" in ESM projects

**`repo-sweeper-web`** - Codebase cleanup
- **Role**: Remove redundant files, clean build artifacts, optimize repository
- **Scope**: Dead code removal, cache cleanup, dependency analysis
- **Targets**: Build passes post-cleanup, no protected files affected

### Client Development Specialists

#### Frontend Engineering

**`frontend-developer`** - Modern web UI development
- **Role**: React/Vue/Angular component development with accessibility focus
- **Capabilities**: Responsive design, TypeScript strict mode, state management
- **Targets**: >90 Lighthouse score, WCAG 2.1 AA compliance, >85% test coverage

**`websocket-engineer`** - Real-time communication
- **Role**: WebSocket architectures, bidirectional protocols, event-driven systems
- **Capabilities**: Connection management, horizontal scaling, message queuing
- **Targets**: Sub-10ms latency, high throughput, robust reconnection

**`performance-engineer`** - System optimization
- **Role**: Bottleneck identification, load testing, scalability engineering
- **Capabilities**: Profiling, resource optimization, capacity planning
- **Targets**: SLA achievement, comprehensive monitoring, cost optimization

#### Code Quality and Testing

**`code-reviewer`** - Code quality and security
- **Role**: Security vulnerability detection, design pattern validation
- **Capabilities**: Static analysis, technical debt assessment, performance review
- **Targets**: Zero critical security issues, >80% coverage, <10 complexity

**`test-automator`** - Test framework development
- **Role**: Automated testing infrastructure, CI/CD integration
- **Capabilities**: UI/API testing, framework design, performance testing
- **Targets**: >80% coverage, <30min execution, <1% flaky tests

**`refactoring-specialist`** - Code transformation
- **Role**: Safe refactoring patterns, maintainability improvement
- **Capabilities**: Code smell detection, automated transformation, pattern application
- **Targets**: Zero behavior changes, maintained coverage, complexity reduction

#### Development Experience

**`debugger`** - Complex issue diagnosis
- **Role**: Systematic debugging, root cause analysis, production troubleshooting
- **Capabilities**: Memory debugging, concurrency issues, performance analysis
- **Targets**: Consistent reproduction, systematic elimination, comprehensive postmortem

**`dx-optimizer`** - Developer experience enhancement
- **Role**: Build performance, workflow automation, tooling optimization
- **Capabilities**: HMR acceleration, IDE configuration, testing optimization
- **Targets**: <30s builds, <100ms HMR, <2min test runs, developer satisfaction

### Agent Communication Protocol

All agents follow a standardized communication pattern:

1. **Context Query**: Request project context from context manager
2. **Progress Updates**: JSON status reports during execution  
3. **Completion Notification**: Structured delivery reports with metrics
4. **Cross-Agent Coordination**: Explicit handoff points between agents

### Usage Examples

```javascript
// Use the Task tool to invoke agents
// Example 1: Fix ESM compatibility issues
{
  "subagent_type": "esm-test-fixer",
  "description": "Convert CommonJS tests to ESM",
  "prompt": "My tests are failing with 'require is not defined'. Convert all test files to ESM syntax."
}

// Example 2: Optimize detection engine performance  
{
  "subagent_type": "detection-engine-lead", 
  "description": "Optimize ONNX inference performance",
  "prompt": "Current FPS is 8-12. Need to achieve ≥15 FPS with proper backend fallbacks."
}

// Example 3: Build comprehensive test suite
{
  "subagent_type": "test-automator",
  "description": "Create E2E test coverage",
  "prompt": "Need Playwright tests for camera detection flow: start→detect→save→summary."
}
```