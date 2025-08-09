// camera_detection.js - Refactored for camera.html
// Firebase imports removed - now using Cloudinary via API
import { setApiUrl, checkHealth, startSession, detectHazards, detectSingleWithRetry } from './apiClient.js';
import { resolveBaseUrl, probeHealth } from './network.js';
import { RealtimeClient } from './realtime-client.js';
import { BASE_API_URL } from './config.js';
import { fetchWithTimeout } from './utils/fetchWithTimeout.js';
import { ensureOk, getJsonOrThrow } from './utils/http.js';
import { stopStream } from './utils/cameraCleanup.js';
import { startLoop, stopLoop } from './utils/rafLoop.js';
import {
  getVideoDisplayRect,
  mapModelToCanvas,
  centerToCornerBox,
  validateMappingAccuracy,
  debugDrawMapping,
  computeContainMapping,
  computeCoverMapping,
  modelToCanvasBox
} from './utils/coordsMap.js';
import { uploadDetectionReport, generateSummaryModalData } from './report-upload-service.js';
import { pendingReportsQueue } from './pendingReportsQueue.js';
import { FallbackDetectionProvider } from './fallbackDetectionProvider.js';
import { 
  loadONNXRuntime, 
  createInferenceSession, 
  getInferenceSession, 
  createTensor, 
  disposeInferenceSession,
  monitorMemoryUsage,
  performanceMonitor 
} from './onnx-runtime-loader.js';
import { 
  startDetectionSession, 
  endDetectionSession, 
  addDetectionToSession, 
  recordFrameProcessed,
  updateSessionSummaryModal,
  getCurrentSessionStatus,
  createSessionReport
} from './session-manager.js';

// Global state
let cameraState = {
  stream: null,
  detecting: false,
  session: null,
  frameCount: 0,
  lastFrameTime: 0,
  animationFrameId: null,
  confidenceThreshold: window.CONFIDENCE_THRESHOLD || 0.5,
  modelInputSize: 320, // Will be detected from model
  detectionMode: 'api', // 'api', 'local', 'fallback'
  apiSessionId: null,
  apiAvailable: false
};

window.HAZARD_FALLBACK = false;
const fallbackProvider = new FallbackDetectionProvider();

// External API configuration - Railway Production
const API_CONFIG = {
  baseUrl: BASE_API_URL,
  // Separate timeout for detection requests and health checks
  timeout: 10000, // Increased timeout for Railway
  healthTimeout: 5000,
  retryAttempts: 3,
  retryDelay: 1000
};

const DEFAULT_SIZE = 320;
const pendingDetections = [];
// Class names for hazard detection model (best0608)
const CLASS_NAMES = [
  'crack',
  'knocked',
  'pothole',
  'surface damage'
];

const GLOBAL_CONFIDENCE_THRESHOLD = window.CONFIDENCE_THRESHOLD || 0.5;
const CLASS_THRESHOLDS = window.CLASS_THRESHOLDS || {};

// Class-specific confidence thresholds and geometric filters
// Reducing false positives (faces detected as crack) with higher thresholds
const CLASS_CONFIG = {
  crack: {
    threshold: 0.65,      // Higher threshold to reduce face false positives
    minArea: 25,          // Minimum area (width * height)
    maxArea: 1200,        // Maximum area to exclude large objects
    minAspectRatio: 0.3,  // Minimum width/height ratio for crack shapes
    maxAspectRatio: 8.0,  // Maximum width/height ratio
    geometryCheck: 'elongated' // Check for elongated shapes typical of cracks
  },
  knocked: {
    threshold: 0.55,
    minArea: 20,
    maxArea: 800,
    minAspectRatio: 0.5,
    maxAspectRatio: 4.0,
    geometryCheck: 'compact'
  },
  pothole: {
    threshold: 0.50,
    minArea: 30,
    maxArea: 1500,
    minAspectRatio: 0.8,  // More circular/square shape
    maxAspectRatio: 2.5,
    geometryCheck: 'circular'
  },
  'surface damage': {
    threshold: 0.60,
    minArea: 40,
    maxArea: 2000,
    minAspectRatio: 0.4,
    maxAspectRatio: 6.0,
    geometryCheck: 'irregular'
  }
};

// Geometry validation and utility helpers for detections
function validateDetectionGeometry({ width, height, area, aspectRatio, className }) {
  const cfg = CLASS_CONFIG[className];
  if (!cfg) return true;
  if (area < cfg.minArea || area > cfg.maxArea) return false;
  if (aspectRatio < cfg.minAspectRatio || aspectRatio > cfg.maxAspectRatio) return false;
  // Optional shape heuristics
  switch (cfg.geometryCheck) {
    case 'elongated':
      // elongated shapes should have one side significantly longer
      if (Math.max(width, height) / Math.max(1, Math.min(width, height)) < 2.0) return false;
      break;
    case 'circular':
      // near-square/circle
      if (aspectRatio < 0.6 || aspectRatio > 1.7) return false;
      break;
    case 'compact':
      // moderate aspect ratio
      if (aspectRatio < 0.6 || aspectRatio > 1.8) return false;
      break;
    default:
      break;
  }
  return true;
}

function iou(boxA, boxB) {
  const x1 = Math.max(boxA.x1, boxB.x1);
  const y1 = Math.max(boxA.y1, boxB.y1);
  const x2 = Math.min(boxA.x2, boxB.x2);
  const y2 = Math.min(boxA.y2, boxB.y2);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const areaA = (boxA.x2 - boxA.x1) * (boxA.y2 - boxA.y1);
  const areaB = (boxB.x2 - boxB.x1) * (boxB.y2 - boxB.y1);
  const uni = areaA + areaB - inter;
  return uni > 0 ? inter / uni : 0;
}

function applyNMS(detections, nmsThreshold = 0.5, maxKeep = 50) {
  if (!detections || detections.length === 0) return [];
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const det of sorted) {
    let overlaps = false;
    for (const k of kept) {
      if (iou(det, k) > nmsThreshold && det.classId === k.classId) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) kept.push(det);
    if (kept.length >= maxKeep) break;
  }
  return kept;
}

function isInCooldown(className) {
  const last = CLASS_COOLDOWNS.get(className);
  if (!last) return false;
  return Date.now() - last < COOLDOWN_DURATION;
}

function updateCooldown(className) {
  CLASS_COOLDOWNS.set(className, Date.now());
}

// Per-class cooldown timers to prevent spam reporting
const CLASS_COOLDOWNS = new Map(); // className -> lastReportTime
const COOLDOWN_DURATION = 3000; // 3 seconds between reports of same class

// Detection session tracking
let detectionSession = {
  startTime: Date.now(),
  detections: [],
  totalFrames: 0,
  detectionFrames: 0,
  uniqueHazards: new Set(),
  savedReports: 0,
  confidenceSum: 0,
  detectionCount: 0
};

// New state for persistent detections
let persistentDetections = [];

function switchToFallback(reason) {
  window.HAZARD_FALLBACK = true;
  cameraState.detectionMode = 'fallback';
  updateDetectionModeInfo('fallback');
  if (typeof window.showWarning === 'function') {
    window.showWarning(`Fallback mode active: ${reason}`);
  } else {
    console.warn('Fallback mode active:', reason);
  }
  updateStatus('Fallback mode active');
  updateDebugPanel({ error: reason });
}

const debugPanel = typeof document !== 'undefined' ? document.getElementById('debug-panel') : null;
function updateDebugPanel(info = {}) {
  if (!debugPanel) return;
  const parts = [];
  parts.push(`mode: ${cameraState.detectionMode}`);
  parts.push(`queue: ${pendingReportsQueue.size()}`);
  if (info.error) parts.push(`err: ${info.error}`);
  debugPanel.textContent = parts.join(' | ');
}
const DETECTION_LIFETIME = 2000; // Detections stay on screen for 2 seconds
let detectedObjectCount = 0;
let uniqueHazardTypes = new Set();

// Global state for alert
let lastHazardAlertTime = 0;
const HAZARD_ALERT_COOLDOWN = 5000; // 5 seconds cooldown

// RealtimeClient for non-blocking API streaming
let rtClient = null;
let latestCanvas = null;
let lastNetworkLatencyMs = 0;

// Backpressure and adaptive send rate scheduler
let inFlight = false;
let lastSendAt = 0;
let targetIntervalMs = 160;            // start at ~6 fps sending
let emaProc = 160;                      // exponential moving average of processing_time_ms

// Model processing constants
const MODEL_W = 480, MODEL_H = 480;
let modelToDispMapping = null;         // letterbox mapping data

// Noise reduction for logs
let lastSkipLogAt = 0;

/**
 * Check if we should send a frame based on adaptive timing
 * @param {number} now - Current timestamp
 * @returns {boolean} Whether to send this frame
 */
function shouldSend(now) {
  return !inFlight && (now - lastSendAt) >= targetIntervalMs;
}

/**
 * Update timing based on server processing speed
 * @param {number} procMs - Server processing time in milliseconds
 */
function updateTiming(procMs) {
  // EMA to follow server speed
  emaProc = 0.8 * emaProc + 0.2 * procMs;
  targetIntervalMs = Math.max(140, Math.min(400, emaProc * 1.1));
}

/**
 * Throttled logging for skipped frames
 * @param {number} now - Current timestamp
 */
function logSkip(now) {
  if (now - lastSkipLogAt > 3000) { 
    console.debug('[perf] Upload busy, skipping frames'); 
    lastSkipLogAt = now; 
  }
}

/**
 * Process API request with proper error handling and backpressure
 * @param {Blob} blob Image blob to send
 * @param {number} startTime Request start timestamp
 * @returns {Promise} Request promise
 */
async function processApiRequest(blob, startTime) {
  try {
    const controller = new AbortController();
    const adaptiveTimeout = Math.min(8000, Math.max(3000, lastNetworkLatencyMs * 2));
    const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);
    
    console.log(`[api] Processing request with ${adaptiveTimeout}ms timeout`);
    
    const result = await rtClient.send(blob, { signal: controller.signal });
    
    clearTimeout(timeoutId);
    inFlight = false;
    
    const processingTime = performance.now() - startTime;
    console.log(`[perf] API request completed in ${processingTime.toFixed(1)}ms`);
    
    return result;
    
  } catch (error) {
    inFlight = false;
    console.error('[api] Failed to send frame:', error);
    throw error;
  }
}

// Offscreen canvas for model-sized letterboxed frames
const modelCanvas = new OffscreenCanvas(MODEL_W, MODEL_H);
const modelCtx = modelCanvas.getContext('2d');

/**
 * Draw video frame letterboxed to exactly 480×480 for server upload
 * @param {HTMLVideoElement} video - Video element
 * @returns {Object} Mapping data for coordinate transformation
 */
function drawToModelCanvas(video) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  
  const scale = Math.min(MODEL_W / vw, MODEL_H / vh);
  const dw = Math.round(vw * scale), dh = Math.round(vh * scale);
  const dx = Math.floor((MODEL_W - dw) / 2), dy = Math.floor((MODEL_H - dh) / 2);
  
  // Clear and fill with black background
  modelCtx.clearRect(0, 0, MODEL_W, MODEL_H);
  modelCtx.fillStyle = 'black';
  modelCtx.fillRect(0, 0, MODEL_W, MODEL_H);
  
  // Draw letterboxed video
  modelCtx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
  
  return { dx, dy, dw, dh, scale };
}

/**
 * Resize overlay canvas to exactly match video display with proper DPR
 * @param {HTMLVideoElement} video - Video element
 * @param {HTMLCanvasElement} overlay - Overlay canvas
 */
function resizeOverlayToVideo(video, overlay) {
  const dpr = window.devicePixelRatio || 1;
  overlay.width = Math.round(video.clientWidth * dpr);
  overlay.height = Math.round(video.clientHeight * dpr);
  overlay.style.width = `${video.clientWidth}px`;
  overlay.style.height = `${video.clientHeight}px`;
  const ctx = overlay.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Map bounding box from model coordinates to display coordinates
 * @param {Array} modelBox - [x, y, w, h] in model space (480x480)
 * @param {Object} mapping - Model to display mapping data
 * @returns {Array} [x, y, w, h] in display coordinates
 */
function mapBoxModelToDisplay([x, y, w, h], mapping) {
  if (!mapping) return [x, y, w, h]; // Fallback if no mapping
  
  const { dx, dy, dw, dh } = mapping; // letterboxed draw on 480×480
  
  // Remove model letterbox offset and scale to display
  const scaleX = canvas.width / MODEL_W;
  const scaleY = canvas.height / MODEL_H;
  
  const dispX = (x - dx) * scaleX;
  const dispY = (y - dy) * scaleY;
  const dispW = w * scaleX;
  const dispH = h * scaleY;
  
  return [dispX, dispY, dispW, dispH];
}

/**
 * Normalize detection object from various server response formats
 * @param {Object} d - Raw detection object
 * @param {Array} classes - Class names array
 * @returns {Object} Normalized detection
 */
function normalizeDet(d, classes) {
  const cls = d.class_id ?? d.class ?? d.cls;
  const score = d.confidence ?? d.score;
  const box = d.bbox ?? d.box;
  let xywh = Array.isArray(box) ? box : [box?.x ?? 0, box?.y ?? 0, box?.w ?? box?.width ?? 0, box?.h ?? box?.height ?? 0];
  
  // Convert from xyxy to xywh if needed
  if ((d.format ?? '').toLowerCase() === 'xyxy' || (Array.isArray(box) && box.length === 4 && box[2] > box[0] && box[3] > box[1])) {
    const [x1, y1, x2, y2] = xywh;
    xywh = [x1, y1, x2 - x1, y2 - y1];
  }
  
  return { 
    classId: cls, 
    className: classes?.[cls] ?? String(cls), 
    score: Math.min(1.0, Math.max(0.0, score ?? 0)), 
    box: xywh,
    x1: xywh[0],
    y1: xywh[1], 
    x2: xywh[0] + xywh[2],
    y2: xywh[1] + xywh[3]
  };
}

/**
 * Update session statistics UI elements
 * @param {Object} sessionStats - Session statistics from server
 */
function updateSessionStatsUI(sessionStats) {
  if (sessionStats.total_detections !== undefined) {
    const totalEl = document.getElementById('session-total-detections');
    if (totalEl) totalEl.textContent = sessionStats.total_detections;
  }
  
  if (sessionStats.unique_hazards !== undefined) {
    const uniqueEl = document.getElementById('session-unique-hazards');
    if (uniqueEl) uniqueEl.textContent = sessionStats.unique_hazards;
  }
  
  if (sessionStats.pending_reports !== undefined) {
    const pendingEl = document.getElementById('session-pending-reports');
    if (pendingEl) pendingEl.textContent = sessionStats.pending_reports;
  }
  
  console.log(`📊 Session Stats: ${sessionStats.total_detections} total, ${sessionStats.unique_hazards} unique, ${sessionStats.pending_reports} pending`);
}

// Web Worker for fast preprocessing
let preprocessWorker = null;
let workerRequestId = 0;
const pendingWorkerRequests = new Map();



// Global coordinate transformation parameters
let coordinateScale = {
  // Model input size to video display scaling
  modelToDisplayX: 1.0,
  modelToDisplayY: 1.0,
  // Video source to display scaling
  videoToDisplayX: 1.0,
  videoToDisplayY: 1.0,
  // Offset coordinates
  offsetX: 0,
  offsetY: 0,
  // Model input size
  modelInputSize: 320
};

// DOM elements
let video, canvas, ctx, loadingOverlay, startButton, stopButton, captureButton, settingsButton;
let loadingStatus, detectionCountBadge, fpsBadge, hazardTypesDisplay, hazardTypesList;
let confidenceSlider, confidenceValue, settingsPanel, hazardToastElement, detectionModeInfo;

// Offscreen canvas for processing (will be resized based on model)
const offscreen = document.createElement("canvas");
const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

// Reusable buffer for frame preprocessing to avoid per-frame allocations
let preprocessBuffer = null;
let preprocessBufferSize = 0;

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  // Get DOM elements
  video = document.getElementById("camera-stream");
  canvas = document.getElementById("overlay-canvas");
  loadingOverlay = document.getElementById("loading-overlay");
  startButton = document.getElementById("start-camera");
  stopButton = document.getElementById("stop-camera");
  captureButton = document.getElementById("capture-btn");
  settingsButton = document.getElementById("settings-btn");
  
  // Status elements
  loadingStatus = document.getElementById("loading-status");
  detectionCountBadge = document.getElementById("detection-count-badge");
  fpsBadge = document.getElementById("fps-badge");
  hazardTypesDisplay = document.getElementById("hazard-types-display");
  hazardTypesList = document.getElementById("hazard-types-list");
  
  // Settings elements
  confidenceSlider = document.getElementById("confidence-threshold");
  confidenceValue = document.getElementById("confidence-value");
  settingsPanel = document.getElementById("settings-panel");
  hazardToastElement = document.getElementById("hazardToast");
  detectionModeInfo = document.getElementById("detection-mode-info");

  // Validate required elements
  if (!video || !canvas || !startButton || !stopButton) {
    console.error('Missing required DOM elements for camera detection');
    return;
  }

  ctx = canvas.getContext("2d");

  // Start button disabled until initialization completes
  startButton.disabled = true;

  // Set up event listeners
  setupEventListeners();

  // Add window resize listener to update canvas scaling
  window.addEventListener('resize', debounce(updateCanvasSize, 100));

  // Initialize detection (API or local model) then signal readiness
  initializeDetection()
    .finally(() => {
      document.dispatchEvent(new Event('cameraReady'));
    });

  console.log('📷 Camera detection system initialized');
}

function setupEventListeners() {
  // Camera controls
  startButton.addEventListener("click", startCamera);
  stopButton.addEventListener("click", stopCamera);
  captureButton.addEventListener("click", captureFrame);

  // Settings
  if (settingsButton) {
    settingsButton.addEventListener("click", toggleSettings);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsPanel && settingsPanel.classList.contains('show')) {
      settingsPanel.classList.remove('show');
      if (settingsButton) {
        settingsButton.setAttribute('aria-expanded', 'false');
      }
    }
  });
  
  // Summary modal
  const summaryButton = document.getElementById('summary-btn');
  const saveSessionButton = document.getElementById('save-session-report');
  
  if (saveSessionButton) {
    saveSessionButton.addEventListener('click', async () => {
      try {
        saveSessionButton.disabled = true;
        // Create spinner element safely
        const spinner = document.createElement('i');
        spinner.className = 'fas fa-spinner fa-spin';
        const text = document.createTextNode(' Saving...');
        saveSessionButton.replaceChildren(spinner, text);
        
        const report = await createSessionReport();
        
        // Create check element safely
        const checkIcon = document.createElement('i');
        checkIcon.className = 'fas fa-check';
        const textSaved = document.createTextNode(' Saved!');
        saveSessionButton.replaceChildren(checkIcon, textSaved);
        saveSessionButton.classList.remove('btn-success');
        saveSessionButton.classList.add('btn-success');
        
        // Show success message
        if (typeof notify === 'function') {
          notify(`Session report saved successfully! Report ID: ${report.id || 'unknown'}`, 'success');
        }
        
        setTimeout(() => {
          saveSessionButton.disabled = false;
          // Create save element safely
          const saveIcon = document.createElement('i');
          saveIcon.className = 'fas fa-save';
          const textSave = document.createTextNode(' Save Session Report');
          saveSessionButton.replaceChildren(saveIcon, textSave);
          saveSessionButton.classList.remove('btn-success');
          saveSessionButton.classList.add('btn-success');
        }, 2000);
        
      } catch (error) {
        console.error('❌ Failed to save session report:', error);
        saveSessionButton.disabled = false;
        // Create warning element safely
        const warningIcon = document.createElement('i');
        warningIcon.className = 'fas fa-exclamation-triangle';
        const textFail = document.createTextNode(' Save Failed');
        saveSessionButton.replaceChildren(warningIcon, textFail);
        saveSessionButton.classList.remove('btn-success');
        saveSessionButton.classList.add('btn-danger');
        
        if (typeof notify === 'function') {
          notify('Failed to save session report. Please try again.', 'error');
        }
        
        setTimeout(() => {
          // Create save element safely
          const saveIcon = document.createElement('i');
          saveIcon.className = 'fas fa-save';
          const textRestore = document.createTextNode(' Save Session Report');
          saveSessionButton.replaceChildren(saveIcon, textRestore);
          saveSessionButton.classList.remove('btn-danger');
          saveSessionButton.classList.add('btn-success');
        }, 3000);
      }
    });
  }
  
  // Update summary modal when opened
  document.addEventListener('shown.bs.modal', function (e) {
    if (e.target.id === 'detection-summary-modal') {
      updateRecentDetectionsList();
      const saveSessionButton = document.getElementById('save-session-report');
      if (saveSessionButton) {
        saveSessionButton.disabled = detectionSession.detectionCount === 0;
      }
    }
  });
  
  if (confidenceSlider) {
    confidenceSlider.addEventListener("input", (e) => {
      cameraState.confidenceThreshold = parseFloat(e.target.value);
      if (confidenceValue) {
        confidenceValue.textContent = cameraState.confidenceThreshold;
      }
    });
  }
}

function toggleSettings() {
  if (settingsPanel) {
    const isVisible = settingsPanel.classList.contains('show');
    settingsPanel.classList.toggle('show');
    settingsButton.setAttribute('aria-expanded', !isVisible);
  }
}

async function initializeDetection() {
  // First, try to connect to external API
  const apiAvailable = await checkAPIAvailability();
  
  if (apiAvailable) {
    cameraState.detectionMode = 'api';
    cameraState.apiAvailable = true;
    updateStatus("Connected to cloud AI - Ready to start");
    updateDetectionModeInfo('api');
    // Coordinate scaling will be updated when camera starts
    startButton.disabled = false;
    console.log('✅ Using external API for detection');
    return true;
  } else {
    console.log('⚠️ External API not available, will use local model (lazy loaded on camera start)');
    cameraState.detectionMode = 'local';
    cameraState.apiAvailable = false;
    updateDetectionModeInfo('local');
    updateStatus("Local AI model ready - Will load on camera start");
    startButton.disabled = false;
    return true; // Ready to start, model will load lazily
  }
}

async function checkAPIAvailability() {
  try {
    console.log('🔍 Resolving API endpoint automatically...');
    
    // Use automatic endpoint resolution instead of hardcoded baseUrl
    const baseUrl = await resolveBaseUrl();
    console.log(`📡 Using resolved endpoint: ${baseUrl}`);
    
    setApiUrl(baseUrl);
    const health = await checkHealth(API_CONFIG.healthTimeout); // aligned with spec: GET /health
    
    if (health.status === 'healthy') {
      updateDetectionModeInfo('api');
      cameraState.detectionMode = 'api';
      console.log('✅ API health check passed with automatic endpoint resolution');
      window.HAZARD_FALLBACK = false;
      return true;
    }
    console.warn('❌ API health check returned non-healthy status:', health.status);
    switchToFallback('health check failed');
    return false;
  } catch (error) {
    console.warn('❌ API health check failed:', error.message);
    switchToFallback('health check error');
    return false;
  }
}

async function startAPISession() {
  try {
    // Use new session manager for comprehensive session handling
    cameraState.apiSessionId = await startDetectionSession({
      confidenceThreshold: cameraState.confidenceThreshold,
      source: 'web_camera',
      location: await getCurrentLocation().catch(() => null)
    });
    
    console.log('📋 Detection session created:', cameraState.apiSessionId);
    updateStatus("Connected to cloud AI - Session active");
    return true;
  } catch (error) {
    console.error('❌ Session creation failed:', error.message);
    updateStatus("Cloud AI session failed - Will fallback to local");
    return false;
  }
}

async function loadLocalModel() {
  try {
    updateStatus("Loading local AI model...");
    
    const modelPaths = [
      'object_detection_model/best0608.onnx'  // Primary model (migrated from best0408)
    ];

    let loaded = false;
    for (const path of modelPaths) {
      console.log(`🔍 Attempting to load model from: ${path}`);
      try {
        // Load ONNX Runtime using the loader module
        console.log('🔄 Loading ONNX Runtime...');
        await loadONNXRuntime();
        
        console.log('✅ ONNX Runtime loaded, checking model file...');
        
        // Check if model exists
        const headResp = await fetchWithTimeout(path, { method: 'HEAD', timeout: 5000 });
        console.log(`📡 HEAD request response: ${headResp.status} ${headResp.statusText}`);
        
        if (!headResp.ok) {
          console.warn(`❌ Model not found at ${path} (status: ${headResp.status})`);
          continue;
        }

        const contentLength = headResp.headers.get('Content-Length');
        console.log(`📦 Model found (size: ${contentLength || 'unknown'} bytes)`);

        console.log('🔄 Creating optimized ONNX inference session...');
        
        // Use optimized ONNX Runtime loader with automatic device detection
        cameraState.session = await createInferenceSession(path);
        
        console.log('✅ Optimized ONNX session created successfully');

        // Determine model input size from session metadata (falls back to 480)
        const inputName = cameraState.session.inputNames[0];
        const inputMeta = cameraState.session.inputMetadata?.[inputName];
        const dims = inputMeta?.dimensions || inputMeta?.shape;
        cameraState.modelInputSize = Array.isArray(dims) && dims.length >= 4 ? dims[2] : 480;
        console.log(`📐 Using model input size: ${cameraState.modelInputSize}x${cameraState.modelInputSize}`);

        // Log session info for debugging
        console.log('📋 Input names:', cameraState.session.inputNames);
        console.log('📋 Output names:', cameraState.session.outputNames);

        // Resize offscreen canvas to match model requirements
        offscreen.width = cameraState.modelInputSize;
        offscreen.height = cameraState.modelInputSize;
        
        loaded = true;
        console.log(`✅ Model loaded successfully from ${path}`);
        updateStatus("Model loaded - Ready to start");
        startButton.disabled = false;
        break;
        
      } catch (err) {
        console.error(`❌ Failed to load model at ${path}:`, err);
        console.error('Error details:', err.message, err.stack);
      }
    }

    if (!loaded) {
      throw new Error('No model could be loaded');
    }

  } catch (err) {
    console.error("❌ Failed to load model:", err);
    updateStatus("Model loading failed");
    if (typeof notify === 'function') {
      notify('Failed to load AI model. Please refresh the page.', 'error');
    }
  } finally {
    // Hide loading overlay
    setTimeout(() => {
      if (loadingOverlay) {
        loadingOverlay.style.display = "none";
      }
    }, 1500);
  }
}

async function startCamera() {
  if (cameraState.detecting) return;
  
  // Check if detection system is ready (lazy load local model if needed)
  if (cameraState.detectionMode === 'local' && !cameraState.session) {
    console.log("🚀 Lazy loading local model on first camera start...");
    const modelLoaded = await loadLocalModel();
    if (!modelLoaded) {
      if (typeof notify === "function") {
        notify("Failed to load local model. Cannot start detection.", "error");
      }
      return;
    }
  }
  
  // For API mode, create session if needed
  if (cameraState.detectionMode === 'api' && !cameraState.apiSessionId) {
    const sessionCreated = await startAPISession();
    if (!sessionCreated) {
      console.warn("Failed to create API session, falling back to local model");
      cameraState.detectionMode = 'local';
      const localLoaded = await loadLocalModel();
      if (!localLoaded) {
        if (typeof notify === "function") {
          notify("Both API and local model failed. Cannot start detection.", "error");
        }
        return;
      }
    }
  }

  try {
    updateStatus("Starting camera...");
    
    cameraState.stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: "environment",
        width: { ideal: 480 }, 
        height: { ideal: 480 } 
      }
    });
    
    video.srcObject = cameraState.stream;
    cameraState.detecting = true;
    
    // Update UI
    startButton.hidden = true;
    stopButton.hidden = false;
    captureButton.hidden = false;
    
    // Also add loadedmetadata as backup
    video.addEventListener("loadedmetadata", () => {
      console.log('📊 Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight);
      if (!canvas.width || !canvas.height) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        console.log('📐 Canvas dimensions set from metadata');
      }
    });
    
    // Use both loadeddata and canplay events to ensure video is ready
    video.addEventListener("canplay", () => {
      // Use improved canvas sizing to fix black gaps and DPR issues
      resizeOverlayToVideo(video, canvas);
      
      console.log(`📐 Video source dimensions: ${video.videoWidth}x${video.videoHeight}`);
      console.log(`📐 Video display dimensions: ${video.clientWidth}x${video.clientHeight}`);
      console.log(`📐 Canvas dimensions: ${canvas.width}x${canvas.height}`);
      console.log(`📐 Model processing: ${MODEL_W}x${MODEL_H}`);
      
      // Calculate scaling factors for coordinate transformation
      updateCoordinateScaling();
      
      // Test drawing video to canvas immediately
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        console.log('🎥 Initial video frame drawn to canvas successfully');
      } catch (error) {
        console.error('❌ Failed to draw initial video frame:', error);
      }
      
      updateStatus("Camera active - Detecting hazards");
      cameraState.lastFrameTime = performance.now();
      detectionLoop();
    }, { once: true });
    
    console.log("📷 Camera started successfully");
    
  } catch (err) {
    console.error("Error accessing camera:", err);
    if (typeof notify === "function") {
      notify("Could not access camera. Please grant permission.", "error");
    }
    
    cameraState.detecting = false;
    startButton.hidden = false;
    stopButton.hidden = true;
    captureButton.hidden = true;
    updateStatus("Camera access failed");
  }
}

function updateCoordinateScaling() {
  if (!video.videoWidth || !video.videoHeight || !canvas.width || !canvas.height) {
    console.warn('⚠️ Cannot calculate coordinate scaling - missing dimensions');
    return;
  }
  
  // Use new coordinate mapping system for accurate video-canvas alignment
  const videoDisplayRect = getVideoDisplayRect(video);
  const dpr = window.devicePixelRatio || 1;
  
  // Store video display rectangle for use in detection rendering
  coordinateScale.videoDisplayRect = videoDisplayRect;
  coordinateScale.canvasSize = {
    width: canvas.width,
    height: canvas.height
  };
  
  // Store canvas offset for proper overlay positioning
  coordinateScale.canvasOffset = {
    x: parseFloat(canvas.style.left) || 0,
    y: parseFloat(canvas.style.top) || 0
  };
  
  // Model processing size (square input for both API and local modes)
  const processingSize = cameraState.detectionMode === 'api' ? 480 : cameraState.modelInputSize;
  coordinateScale.modelInputSize = processingSize;
  coordinateScale.devicePixelRatio = dpr;
  
  // Enhanced scaling with DPR awareness for ±2px accuracy
  coordinateScale.modelToDisplayX = videoDisplayRect.width / processingSize;
  coordinateScale.modelToDisplayY = videoDisplayRect.height / processingSize;
  coordinateScale.offsetX = videoDisplayRect.x;
  coordinateScale.offsetY = videoDisplayRect.y;
  coordinateScale.videoToDisplayX = canvas.width / video.videoWidth / dpr;
  coordinateScale.videoToDisplayY = canvas.height / video.videoHeight / dpr;
  
  console.log(`📏 Enhanced coordinate mapping:`, {
    mode: cameraState.detectionMode,
    processingSize: `${processingSize}x${processingSize}`,
    videoDisplay: `${videoDisplayRect.width.toFixed(1)}x${videoDisplayRect.height.toFixed(1)} at (${videoDisplayRect.x.toFixed(1)}, ${videoDisplayRect.y.toFixed(1)})`,
    videoSource: `${video.videoWidth}x${video.videoHeight}`,
    canvasSize: `${canvas.width}x${canvas.height}`,
    objectFit: window.getComputedStyle(video).objectFit,
    dpr: dpr
  });
  
  // Validate mapping accuracy for quality assurance with ±2px requirement
  const testDetection = {
    x: 0.5, // Center of image
    y: 0.5,
    width: 0.2,
    height: 0.3
  };
  
  const mappedCoords = mapModelToCanvas(
    testDetection,
    processingSize,
    coordinateScale.canvasSize,
    videoDisplayRect
  );
  
  const tolerance = { x: dpr >= 2 ? 1 : 2, y: dpr >= 2 ? 1 : 2 };
  const isAccurate = validateMappingAccuracy(testDetection, mappedCoords, tolerance);
  if (!isAccurate) {
    console.warn('⚠️ Coordinate mapping validation failed for test detection');
  } else {
    console.log(`✅ Coordinate mapping validated within ±${tolerance.x}px tolerance`);
  }
}

function updateCanvasSize() {
  if (!cameraState.detecting || !video.videoWidth || !video.videoHeight) {
    return;
  }
  
  // Use the new resizing function to fix black gap and DPR issues
  resizeOverlayToVideo(video, canvas);
  
  // Update coordinate scaling
  updateCoordinateScaling();
  
  console.log(`📐 Canvas resized to ${canvas.width}x${canvas.height} (display: ${canvas.style.width} x ${canvas.style.height})`);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function stopCamera() {
  if (!cameraState.detecting) return;
  
  cameraState.detecting = false;
  
  // Stop camera stream
  if (cameraState.stream) {
    stopStream(cameraState.stream);
    cameraState.stream = null;
  }
  
  video.srcObject = null;
  
  // Cancel animation frame
  if (cameraState.animationFrameId) {
    cancelAnimationFrame(cameraState.animationFrameId);
    cameraState.animationFrameId = null;
  }
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Update UI
  startButton.hidden = false;
  stopButton.hidden = true;
  captureButton.hidden = true;
  
  // Clean up ONNX Runtime resources
  if (cameraState.session) {
    try {
      disposeInferenceSession();
      console.log('🗑️ ONNX Runtime session disposed');
    } catch (error) {
      console.warn('⚠️ Error disposing ONNX session:', error);
    }
  }
  
  // Monitor memory usage after cleanup
  monitorMemoryUsage();
  
  // End detection session and show summary
  try {
    const sessionSummary = await endDetectionSession();
    if (sessionSummary) {
      // Update modal with final session data
      updateSessionSummaryModal();
      
      // Show session summary modal
      const summaryModal = new bootstrap.Modal(document.getElementById('detection-summary-modal'));
      summaryModal.show();
      
      console.log('📊 Session summary:', sessionSummary);
    }
  } catch (error) {
    console.error('❌ Error ending session:', error);
  }
  
  // Reset performance metrics
  performanceMonitor.reset();
  
  // Reset status
  updateStatus("Camera stopped");
  updateDetectionCount(0);
  updateFPS(0);
  hideHazardTypes();
  
  // Send pending detections
  if (pendingDetections.length > 0) {
    sendPendingDetections();
  }
  
  console.log("📷 Camera stopped");
}

async function captureFrame() {
  if (!cameraState.detecting) return;
  
  try {
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const captureCtx = captureCanvas.getContext('2d');
    
    // Draw video frame and overlay
    captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    captureCtx.drawImage(canvas, 0, 0, captureCanvas.width, captureCanvas.height);
    
    // Save image
    const blob = await new Promise(resolve => captureCanvas.toBlob(resolve, 'image/jpeg', 0.8));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `hazard-capture-${timestamp}.jpg`;
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    if (typeof notify === 'function') {
      notify('Frame captured successfully', 'success');
    }
    
    console.log("📸 Frame captured:", filename);
    
  } catch (err) {
    console.error("Error capturing frame:", err);
    if (typeof notify === 'function') {
      notify('Failed to capture frame', 'error');
    }
  }
}

function showHazardAlert(detection) {
    if (!hazardToastElement) return;

    const now = Date.now();
    if (now - lastHazardAlertTime < HAZARD_ALERT_COOLDOWN) {
        return; // Too soon to show another alert
    }

    lastHazardAlertTime = now;

    const hazardType = CLASS_NAMES[detection.classId] || `Class ${detection.classId}`;
    const confidence = (detection.score * 100).toFixed(0);

    const toastBody = hazardToastElement.querySelector('#toast-hazard-details');
    if (toastBody) {
        toastBody.textContent = `Hazard Detected: ${hazardType} (${confidence}%)`;
    }

    const toast = new bootstrap.Toast(hazardToastElement, {
        autohide: true,
        delay: 3000 // Auto-dismiss after 3 seconds
    });

    toast.show();

    const alertSound = document.querySelector('audio');
    if (alertSound) {
        alertSound.play().catch(e => console.warn("Could not play alert sound:", e));
    }
}

function updatePersistentDetections(newDetections) {
  const now = Date.now();
  persistentDetections = persistentDetections.filter(d => (now - d.timestamp) < DETECTION_LIFETIME);
  
  // Apply NMS to reduce duplicates and limit total detections
  const filteredDetections = applyNMS(newDetections, 0.4, 8);
  
  const existingDetectionsMap = new Map(persistentDetections.map(d => [d.id, d]));

  filteredDetections.forEach(newDet => {
    const id = `${newDet.classId}-${Math.round(newDet.x1 / 20)}-${Math.round(newDet.y1 / 20)}`;
    if (existingDetectionsMap.has(id)) {
      const existing = existingDetectionsMap.get(id);
      existing.timestamp = now;
      existing.score = newDet.score;
      existing.x1 = newDet.x1;
      existing.y1 = newDet.y1;
      existing.x2 = newDet.x2;
      existing.y2 = newDet.y2;
    } else {
      const detectionToAdd = { ...newDet, id, timestamp: now };
      persistentDetections.push(detectionToAdd);
      if (detectionToAdd.score > 0.8) {
        showHazardAlert(detectionToAdd);
      }
    }
  });
}

function updateUniqueHazardTypesFromPersistent() {
  if (!hazardTypesDisplay || !hazardTypesList) return;
  uniqueHazardTypes.clear();
  persistentDetections.forEach(d => {
    uniqueHazardTypes.add(CLASS_NAMES[d.classId] || `Class ${d.classId}`);
  });
  if (uniqueHazardTypes.size === 0) {
    hideHazardTypes();
    return;
  }
  hazardTypesList.textContent = [...uniqueHazardTypes].join(', ');
  hazardTypesDisplay.hidden = false;
}

async function detectionLoop() {
    if (!cameraState.detecting) {
        return;
    }

    const startTime = performance.now();
    let waitTime = 33; // Target ~30 FPS baseline

    try {
        // Handle API mode with adaptive scheduling
        if (cameraState.detectionMode === 'api') {
            await ensureRtConnected();
            
            // Check if we should send this frame
            if (shouldSend(startTime)) {
                // Create letterboxed frame for upload with optimized quality
                modelToDispMapping = drawToModelCanvas(video);
                if (modelToDispMapping) {
                    inFlight = true;
                    lastSendAt = startTime;
                    
                    try {
                        // Adaptive quality based on network performance
                        const quality = lastNetworkLatencyMs > 1000 ? 0.7 : 0.85;
                        
                        // Convert offscreen canvas to blob for upload
                        const blob = await modelCanvas.convertToBlob({ type: 'image/jpeg', quality });
                        
                        // Send with optimized timeout and abort safety
                        const controller = new AbortController();
                        const adaptiveTimeout = Math.min(8000, Math.max(3000, lastNetworkLatencyMs * 2));
                        const timeoutId = setTimeout(() => controller.abort(), adaptiveTimeout);
                        
                        rtClient.send(blob).catch(error => {
                            console.error('❌ Failed to send frame:', error);
                        }).finally(() => {
                            clearTimeout(timeoutId);
                            inFlight = false;
                        });
                    } catch (error) {
                        console.error('❌ Failed to create payload from frame:', error);
                        inFlight = false;
                    }
                }
            } else {
                // Throttled logging for skipped frames
                logSkip(startTime);
            }
            
            // Note: API detections are handled asynchronously in handleApiDetections
        } else if (cameraState.detectionMode === 'fallback') {
            const detections = fallbackProvider.detect(video);
            updatePersistentDetections(detections || []);
            detectedObjectCount = persistentDetections.length;
            updateUniqueHazardTypesFromPersistent();
            detectionSession.totalFrames++;
            if (detections && detections.length > 0) {
                detectionSession.detectionFrames++;
            }
        } else {
            // Optimized local detection mode
            const inputTensor = await preprocessFrame();
            if (inputTensor) {
                const detections = await runLocalDetection(inputTensor);

                if (!cameraState.detecting) {
                    return;
                }

                updatePersistentDetections(detections || []);
                detectedObjectCount = persistentDetections.length;
                updateUniqueHazardTypesFromPersistent();

                // Reduced logging frequency for better performance
                if (cameraState.frameCount % 60 === 0 && detections && detections.length > 0) {
                    const avgConf = detections.reduce((sum, d) => sum + d.score, 0) / detections.length;
                    console.log(`🎯 Frame ${cameraState.frameCount}: ${detections.length} new, ${persistentDetections.length} persistent. Avg conf: ${(avgConf * 100).toFixed(1)}%`);
                }

                detectionSession.totalFrames++;
                if (detections && detections.length > 0) {
                    detectionSession.detectionFrames++;
                    detections.forEach(detection => {
                        const label = CLASS_NAMES[detection.classId] || `Class ${detection.classId}`;

                        // Update per-class cooldown to prevent spam
                        updateCooldown(label);
                        // Use new session manager for detection tracking
                        addDetectionToSession({
                            hazards: [{
                                class: label,
                                confidence: detection.score,
                                bbox: detection
                            }],
                            confidence: detection.score
                        }, canvas);
                    });
                    updateDetectionSessionSummary();
                }
            }
        }
        
        // Always draw persistent detections and update UI
        drawPersistentDetections();
        updateDetectionCount(detectedObjectCount);
        updateFPS();
        updateDebugPanel();
        
        cameraState.frameCount++;

        if (cameraState.detectionMode === 'fallback' && cameraState.frameCount % 60 === 0) {
            checkAPIAvailability();
        }

        // Optimized adaptive throttle based on performance
        const processingTime = performance.now() - startTime;
        if (cameraState.detectionMode === 'api') {
            // Dynamic FPS adaptation based on network conditions
            const baseFrameMs = 66; // ~15 FPS baseline for API mode
            const latencyFactor = Math.min(2.0, lastNetworkLatencyMs / 500); // Scale with latency
            const targetFrameMs = Math.min(200, Math.max(33, baseFrameMs * latencyFactor));
            waitTime = Math.max(0, targetFrameMs - processingTime);

            // Performance logging every 2 seconds
            if (cameraState.frameCount % 120 === 0) {
                const actualFps = (1000 / (targetFrameMs + processingTime)).toFixed(1);
                console.log(`⏱️ API Mode - Target FPS: ${actualFps}, RTT: ${lastNetworkLatencyMs}ms, Processing: ${processingTime.toFixed(1)}ms`);
            }
        } else {
            // Local mode: maintain 15-30 FPS depending on device performance
            const targetFrameMs = processingTime > 50 ? 66 : 33; // Adaptive based on processing speed
            waitTime = Math.max(0, targetFrameMs - processingTime);

            // Performance logging for local mode
            if (cameraState.frameCount % 120 === 0) {
                const actualFps = (1000 / (targetFrameMs + processingTime)).toFixed(1);
                console.log(`⏱️ ${cameraState.detectionMode === 'fallback' ? 'Fallback' : 'Local'} Mode - FPS: ${actualFps}, Processing: ${processingTime.toFixed(1)}ms`);
            }
        }

    } catch (err) {
        console.error("❌ Error in detection loop:", err);
        waitTime = 100;
        inFlight = false; // Reset upload state on error
    }

    // Record frame processing for session manager
    recordFrameProcessed();
    
    // Reduced memory monitoring frequency for better performance
    if (cameraState.frameCount % 300 === 0) {
        monitorMemoryUsage();
    }
    
    // Use requestAnimationFrame for smooth performance
    if (cameraState.detecting) {
        if (waitTime <= 0) {
            cameraState.animationFrameId = requestAnimationFrame(detectionLoop);
        } else {
            setTimeout(() => {
                if (cameraState.detecting) {
                    cameraState.animationFrameId = requestAnimationFrame(detectionLoop);
                }
            }, waitTime);
        }
    }
}

async function preprocessFrame() {
  if (!video.videoWidth || !video.videoHeight) return null;
  
  const inputSize = cameraState.modelInputSize;
  
  // Resize video frame to exact model input size (no letterboxing for coordinate simplicity)
  // This ensures model coordinates map directly to the processed image
  offCtx.drawImage(video, 0, 0, inputSize, inputSize);
  
  // Allocate reusable buffer if needed
  if (!preprocessBuffer || preprocessBufferSize !== inputSize) {
    preprocessBuffer = new Float32Array(3 * inputSize * inputSize);
    preprocessBufferSize = inputSize;
  }

  // Get image data and convert to tensor
  const imageData = offCtx.getImageData(0, 0, inputSize, inputSize);
  const data = preprocessBuffer;

  // Convert RGBA to RGB and normalize to [0, 1]
  for (let i = 0, j = 0; i < imageData.data.length; i += 4, j++) {
    const r = imageData.data[i] / 255.0;
    const g = imageData.data[i + 1] / 255.0;
    const b = imageData.data[i + 2] / 255.0;

    // Pack in CHW format (channels, height, width)
    data[j] = r;                                   // R channel
    data[j + inputSize * inputSize] = g;          // G channel
    data[j + 2 * inputSize * inputSize] = b;      // B channel
  }

  // Throttle logging to reduce console overhead
  if (cameraState.frameCount % 60 === 0) {
    console.log(`🎯 Preprocessed frame: ${inputSize}x${inputSize}`);
  }

  return await createTensor(data, [1, 3, inputSize, inputSize]);
}

function drawPersistentDetections() {
    if (!video.videoWidth || !video.videoHeight) {
        console.warn('⚠️ Video not ready for drawing, skipping draw.');
        return;
    }

    try {
        if (cameraState.detecting) {
            // Overlay canvas should not redraw the video; clear only
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    } catch (error) {
        console.error('❌ Failed to draw video to canvas:', error);
        return;
    }

    // Early return if no detections to draw (but video is already drawn)
    if (persistentDetections.length === 0) {
        return;
    }

    const hazardColors = {
        crack: '#FF8844',
        knocked: '#FFD400',
        pothole: '#FF4444',
        'surface damage': '#44D7B6'
    };

    persistentDetections.forEach((detection, index) => {
        const { x1, y1, x2, y2, score, classId } = detection;
        let canvasX1, canvasY1, canvasX2, canvasY2;

        // Prefer precise mapping path for API mode with known letterboxing
        if (cameraState.detectionMode === 'api' && modelToDispMapping && coordinateScale.videoDisplayRect) {
            const { dx, dy, dw, dh } = modelToDispMapping;
            const vr = coordinateScale.videoDisplayRect;
            // Normalize within content region (remove model letterbox), then map to video display rect
            const nx1 = (x1 - dx) / dw;
            const ny1 = (y1 - dy) / dh;
            const nx2 = (x2 - dx) / dw;
            const ny2 = (y2 - dy) / dh;
            // Clamp
            const cnx1 = Math.max(0, Math.min(1, nx1));
            const cny1 = Math.max(0, Math.min(1, ny1));
            const cnx2 = Math.max(0, Math.min(1, nx2));
            const cny2 = Math.max(0, Math.min(1, ny2));
            canvasX1 = vr.x + cnx1 * vr.width;
            canvasY1 = vr.y + cny1 * vr.height;
            canvasX2 = vr.x + cnx2 * vr.width;
            canvasY2 = vr.y + cny2 * vr.height;
        } else if (coordinateScale.videoDisplayRect && coordinateScale.canvasSize) {
            // Generic mapping path (local model path assumes no letterboxing)
            const centerDetection = {
                x: (x1 + x2) / 2 / coordinateScale.modelInputSize,
                y: (y1 + y2) / 2 / coordinateScale.modelInputSize,
                width: (x2 - x1) / coordinateScale.modelInputSize,
                height: (y2 - y1) / coordinateScale.modelInputSize
            };
            const mappedCoords = mapModelToCanvas(
                centerDetection,
                coordinateScale.modelInputSize,
                coordinateScale.canvasSize,
                coordinateScale.videoDisplayRect
            );
            const cornerBox = centerToCornerBox(mappedCoords);
            canvasX1 = cornerBox.x;
            canvasY1 = cornerBox.y;
            canvasX2 = cornerBox.x + cornerBox.width;
            canvasY2 = cornerBox.y + cornerBox.height;
        } else {
            // Fallback
            console.warn('⚠️ Using fallback coordinate scaling - enhanced mapping not available');
            canvasX1 = x1 * (coordinateScale.modelToDisplayX || 1) + (coordinateScale.offsetX || 0);
            canvasY1 = y1 * (coordinateScale.modelToDisplayY || 1) + (coordinateScale.offsetY || 0);
            canvasX2 = x2 * (coordinateScale.modelToDisplayX || 1) + (coordinateScale.offsetX || 0);
            canvasY2 = y2 * (coordinateScale.modelToDisplayY || 1) + (coordinateScale.offsetY || 0);
        }

        const label = CLASS_NAMES[classId] || `Class ${classId}`;
        const color = hazardColors[label] || '#00FF00';

        drawProfessionalBoundingBox(ctx, {
            x1: canvasX1, y1: canvasY1, x2: canvasX2, y2: canvasY2,
            label: label, confidence: score, detectionIndex: index + 1, color: color
        });
    });
}


function updateStatus(message) {
  if (loadingStatus) {
    loadingStatus.textContent = message;
  }
  console.log("📊 Status:", message);
}

async function ensureRtConnected() {
  if (!rtClient) {
    console.log('📡 Initializing RealtimeClient...');
    rtClient = new RealtimeClient({
      timeout: 30000,
      maxRetries: 3,
      backoffMs: 500
    });
    
    // Set up message handler for API detections
    rtClient.onMessage((msg) => {
      const processingTime = msg._metadata?.processingTime || 0;
      lastNetworkLatencyMs = processingTime;
      console.log(`📥 Received API response, RTT: ${processingTime}ms`);
      
      // Enhanced logging for debugging
      if (msg.success !== undefined) {
        console.log(`📊 API Response: success=${msg.success}, detections=${msg.detections?.length || 0}, new_reports=${msg.new_reports?.length || 0}`);
      }
      
      // Log any API errors
      if (msg.success === false) {
        console.error('❌ API returned error response:', msg.error || 'Unknown error');
      }
      
      handleApiDetections(msg.detections || [], processingTime, msg.session_stats, msg);
    });
    
    rtClient.onError((error) => {
      console.error('❌ RealtimeClient error:', error.message);
      inFlight = false; // Reset upload state on error
    });
  }
  
  if (!rtClient.isConnected()) {
    console.log('📡 Connecting to realtime API...');
    try {
      await rtClient.connect();
      console.log('✅ RealtimeClient connected');
    } catch (error) {
      console.error('❌ Failed to connect RealtimeClient:', error.message);
      throw error;
    }
  }
}

function handleApiDetections(detections, processingTime, sessionStats = null, response = null) {
  // Update timing for adaptive scheduler
  updateTiming(processingTime);

  console.log(`⚡ Processing ${detections.length} API detections, inference: ${processingTime}ms`);

  if (!Array.isArray(detections) || detections.length === 0) {
    switchToFallback('empty detections');
    return;
  }
  
  // Parse server response fields if available
  if (response) {
    // Handle new_reports to show success toasts
    if (response.new_reports?.length > 0) {
      response.new_reports.forEach(report => {
        if (typeof notify === 'function') {
          notify(`New ${report.hazard_type} report saved`, 'success');
        }
      });
    }
    
    // Update session stats UI counters
    if (sessionStats) {
      updateSessionStatsUI(sessionStats);
    }
  }
  
  // Parse and update detections
  const parsedDetections = parseAPIDetections(detections);
  
  // Update persistent detections (this handles the visual state)
  updatePersistentDetections(parsedDetections);
  detectedObjectCount = persistentDetections.length;
  updateUniqueHazardTypesFromPersistent();
  
  // Update session tracking
  if (parsedDetections.length > 0) {
    detectionSession.detectionFrames++;
    parsedDetections.forEach(detection => {
      const label = CLASS_NAMES[detection.classId] || `Class ${detection.classId}`;
      
      // Update per-class cooldown to prevent spam
      updateCooldown(label);
      // Use new session manager for detection tracking
      addDetectionToSession({
        hazards: [{
          class: label,
          confidence: detection.score,
          bbox: detection
        }],
        confidence: detection.score
      }, canvas);
    });
    updateDetectionSessionSummary();
  }

  updateDebugPanel();

  // Reset inFlight flag (replaces isUploading)
  inFlight = false;
}

export { handleApiDetections, switchToFallback };

function initializeWorker() {
  if (!preprocessWorker && typeof Worker !== 'undefined') {
    try {
      preprocessWorker = new Worker('/js/preprocess.worker.js');
      
      preprocessWorker.onmessage = function(event) {
        const { id, type, result, error } = event.data;
        const request = pendingWorkerRequests.get(id);
        
        if (request) {
          pendingWorkerRequests.delete(id);
          
          if (type === 'success') {
            request.resolve(result);
          } else if (type === 'error') {
            request.reject(new Error(error));
          }
        }
      };
      
      preprocessWorker.onerror = function(error) {
        console.error('❌ Worker error:', error);
        // Fallback to main thread processing
        preprocessWorker = null;
      };
      
      // Initialize worker with default size
      sendWorkerMessage('init', { size: 416 });
      console.log('🔧 Preprocessing worker initialized');
      
    } catch (error) {
      console.warn('⚠️ Worker not available, using main thread processing:', error.message);
      preprocessWorker = null;
    }
  }
}

function sendWorkerMessage(type, data) {
  return new Promise((resolve, reject) => {
    if (!preprocessWorker) {
      reject(new Error('Worker not available'));
      return;
    }
    
    const id = ++workerRequestId;
    pendingWorkerRequests.set(id, { resolve, reject });
    
    preprocessWorker.postMessage({ id, type, data });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      if (pendingWorkerRequests.has(id)) {
        pendingWorkerRequests.delete(id);
        reject(new Error('Worker request timeout'));
      }
    }, 5000);
  });
}

async function updateLatestCanvas() {
  if (!video.videoWidth || !video.videoHeight) return;
  
  // Initialize worker if not done yet
  if (!preprocessWorker) {
    initializeWorker();
  }
  
  // Dynamic sizing based on network conditions
  let targetSize = 480;
  let quality = 0.9;
  
  if (lastNetworkLatencyMs > 600) {
    targetSize = 416;
    quality = 0.65;
  } else if (lastNetworkLatencyMs < 350) {
    targetSize = 480;
    quality = 0.9;
  }
  
  // Try worker-based processing first
  if (preprocessWorker && typeof createImageBitmap !== 'undefined' && video.readyState >= 2) {
    try {
      // Create ImageBitmap from video with built-in resizing
      const imageBitmap = await createImageBitmap(video, {
        resizeWidth: targetSize,
        resizeHeight: targetSize,
        resizeQuality: 'medium'
      });
      
      // Process in worker
      const result = await sendWorkerMessage('process_frame', {
        imageBitmap: imageBitmap,
        size: targetSize,
        quality: quality,
        outputFormat: 'blob'
      });
      
      if (result.type === 'blob') {
        latestCanvas = result.blob; // Store blob directly for RealtimeClient
        return;
      }
    } catch (error) {
      console.warn('⚠️ Worker processing failed, falling back to main thread:', error.message);
    }
  }
  
  // Fallback to main thread processing
  if (!latestCanvas) {
    latestCanvas = document.createElement('canvas');
  }
  
  latestCanvas.width = targetSize;
  latestCanvas.height = targetSize;
  
  const ctx = latestCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, targetSize, targetSize);
}

function updateDetectionModeInfo(mode) {
  if (!detectionModeInfo) return;
  
  if (mode === 'api') {
    detectionModeInfo.textContent = '🌐 Cloud AI';
    detectionModeInfo.style.color = '#00ff88';
  } else if (mode === 'local') {
    detectionModeInfo.textContent = '💻 Local Model';
    detectionModeInfo.style.color = '#ffa500';
  } else if (mode === 'fallback') {
    detectionModeInfo.textContent = '🛟 Fallback';
    detectionModeInfo.style.color = '#ff4d4d';
  } else {
    detectionModeInfo.textContent = 'Initializing...';
    detectionModeInfo.style.color = '#ffffff';
  }
}

function updateDetectionCount(count) {
  if (detectionCountBadge) {
    detectionCountBadge.textContent = `${count} hazard${count !== 1 ? 's' : ''}`;
  }
}

function updateFPS() {
  const now = performance.now();
  if (cameraState.lastFrameTime > 0) {
    const fps = Math.round(1000 / (now - cameraState.lastFrameTime));
    if (fpsBadge) {
      fpsBadge.textContent = `${fps} FPS`;
    }
  }
  cameraState.lastFrameTime = now;
}

function hideHazardTypes() {
  if (hazardTypesDisplay) {
    hazardTypesDisplay.hidden = true;
  }
}

async function saveDetections(detections) {
  try {
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const captureCtx = captureCanvas.getContext('2d');
    
    // Draw video frame and overlay
    captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    captureCtx.drawImage(canvas, 0, 0, captureCanvas.width, captureCanvas.height);
    
    const detectionData = {
      timestamp: new Date().toISOString(),
      detections: detections.map(d => ({
        type: CLASS_NAMES[d.classId] || `Class ${d.classId}`,
        confidence: d.score,
        bounds: { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 }
      })),
      location: await getCurrentLocation(),
      sessionId: `session_${detectionSession.startTime}`
    };
    
    // Convert canvas to blob and save
    captureCanvas.toBlob(async (blob) => {
      if (!blob) {
        console.error('Failed to create image blob');
        return;
      }
      
      const formData = new FormData();
      formData.append('file', blob, `detection_${Date.now()}.jpg`);
      formData.append('hazardTypes', detectionData.detections.map(d => d.type).join(','));
      formData.append('geoData', JSON.stringify(detectionData.location));
      formData.append('time', detectionData.timestamp);
      formData.append('locationNote', 'Camera Detection');
      formData.append('sessionId', detectionData.sessionId);
      
      pendingDetections.push({ formData, detectionData });
      console.log("💾 Detection saved to queue");
      
    }, 'image/jpeg', 0.8);
    
  } catch (err) {
    console.error("Error saving detection:", err);
  }
}

async function sendPendingDetections() {
  if (pendingDetections.length === 0) return;
  
  console.log(`📨 Sending ${pendingDetections.length} detections to server...`);
  
  for (const detection of pendingDetections) {
    try {
      const response = await fetchWithTimeout("/api/upload", {
        method: "POST",
        body: detection.formData,
        credentials: "include"
      });
      
      if (response.ok) {
        const result = await getJsonOrThrow(response);
        detectionSession.savedReports++;
        console.log("✅ Detection sent:", result);
        if (typeof notify === 'function') {
          notify(`Detection saved: ${result.message}`, 'success');
        }
      } else {
        console.error("❌ Failed to send detection:", response.status);
        if (typeof notify === 'function') {
          notify('Failed to save detection to server', 'error');
        }
      }
    } catch (err) {
      console.error("❌ Error sending detection:", err);
      if (typeof notify === 'function') {
        notify('Network error while saving detection', 'error');
      }
    }
  }
  
  pendingDetections.length = 0;
  updateDetectionSessionSummary();
}

// Function to update recent detections list in modal
function updateRecentDetectionsList() {
  const listElement = document.getElementById('recent-detections-list');
  if (!listElement) return;
  
  if (detectionSession.detections.length === 0) {
    const noDetectionsPara = document.createElement('p');
    noDetectionsPara.className = 'text-muted';
    noDetectionsPara.textContent = 'No detections recorded yet.';
    listElement.replaceChildren(noDetectionsPara);
    return;
  }
  
  const recentDetections = detectionSession.detections
    .slice(-20) // Last 20 detections
    .reverse(); // Most recent first
  
  const html = recentDetections.map(detection => {
    const timeStr = new Date(detection.timestamp).toLocaleTimeString();
    const confidencePercent = Math.round(detection.confidence * 100);
    
    return `
      <div class="detection-item border rounded p-2 mb-2 bg-light">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong class="text-primary">${detection.type}</strong>
            <span class="badge bg-secondary ms-2">${confidencePercent}%</span>
          </div>
          <small class="text-muted">${timeStr}</small>
        </div>
      </div>
    `;
  }).join('');
  
  // Create detection list elements safely
  const fragment = document.createDocumentFragment();
  detectionSession.detections.forEach(detection => {
    const item = document.createElement('div');
    item.className = 'detection-item';
    
    const className = document.createElement('strong');
    className.textContent = detection.className || 'Unknown';
    
    const confidence = document.createElement('span');
    confidence.textContent = ` (${(detection.confidence * 100).toFixed(1)}%)`;
    
    const timestamp = document.createElement('small');
    timestamp.className = 'text-muted d-block';
    timestamp.textContent = new Date(detection.timestamp).toLocaleTimeString();
    
    item.appendChild(className);
    item.appendChild(confidence);
    item.appendChild(timestamp);
    fragment.appendChild(item);
  });
  listElement.replaceChildren(fragment);
}

// Function to save complete session report
async function saveSessionReport() {
  if (detectionSession.detectionCount === 0) {
    if (typeof notify === 'function') {
      notify('No detections to save', 'warning');
    }
    return;
  }
  
  try {
    // Create session summary
    const sessionSummary = {
      sessionId: `session_${detectionSession.startTime}`,
      startTime: new Date(detectionSession.startTime).toISOString(),
      endTime: new Date().toISOString(),
      totalDetections: detectionSession.detectionCount,
      totalFrames: detectionSession.totalFrames,
      detectionFrames: detectionSession.detectionFrames,
      uniqueHazards: Array.from(detectionSession.uniqueHazards),
      avgConfidence: detectionSession.detectionCount > 0 ? 
    detectionSession.confidenceSum / detectionSession.detectionCount : 0,
      detections: detectionSession.detections,
      location: await getCurrentLocation()
    };
    
    // Send any pending detections first
    await sendPendingDetections();
    
    // Save session summary
    const response = await fetchWithTimeout('/api/session-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionSummary),
      credentials: 'include'
    });
    
    if (response.ok) {
      const result = await getJsonOrThrow(response);
      if (typeof notify === 'function') {
        notify(`Session report saved: ${result.message}`, 'success');
      }
      
      // Close modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('detection-summary-modal'));
      if (modal) modal.hide();
      
    } else {
      throw new Error(`Server error: ${response.status}`);
    }
    
  } catch (err) {
    console.error('Error saving session report:', err);
    if (typeof notify === 'function') {
      notify('Failed to save session report', 'error');
    }
  }
}

// Professional bounding box drawing function
function drawProfessionalBoundingBox(ctx, options) {
  const { x1, y1, x2, y2, label, confidence, detectionIndex, color } = options;

  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;
  const cx1 = Math.max(0, Math.min(canvasW, x1));
  const cy1 = Math.max(0, Math.min(canvasH, y1));
  const cx2 = Math.max(0, Math.min(canvasW, x2));
  const cy2 = Math.max(0, Math.min(canvasH, y2));
  const boxW = Math.max(0, cx2 - cx1);
  const boxH = Math.max(0, cy2 - cy1);
  const scorePerc = (Math.min(1, Math.max(0, confidence)) * 100).toFixed(1);
  
  // Save current context state
  ctx.save();
  
  // Calculate dynamic styling based on confidence
  const alpha = Math.min(0.7 + confidence * 0.3, 1.0);
  const lineWidth = Math.max(2, Math.min(6, confidence * 8));
  const cornerSize = Math.max(8, Math.min(16, confidence * 20));
  
  // Set shadow for depth effect
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  
  // Draw main bounding box
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(cx1, cy1, boxW, boxH);
  
  // Reset shadow for corner markers
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // Draw professional corner markers
  ctx.fillStyle = color;
  ctx.globalAlpha = Math.min(alpha + 0.2, 1.0);
  
  const cornerThickness = Math.max(2, lineWidth / 2);
  const cornerLength = cornerSize;
  
  // Top-left corner
  ctx.fillRect(cx1 - cornerThickness, cy1 - cornerThickness, cornerLength, cornerThickness);
  ctx.fillRect(cx1 - cornerThickness, cy1 - cornerThickness, cornerThickness, cornerLength);
  
  // Top-right corner
  ctx.fillRect(cx2 - cornerLength + cornerThickness, cy1 - cornerThickness, cornerLength, cornerThickness);
  ctx.fillRect(cx2, cy1 - cornerThickness, cornerThickness, cornerLength);
  
  // Bottom-left corner
  ctx.fillRect(cx1 - cornerThickness, cy2, cornerLength, cornerThickness);
  ctx.fillRect(cx1 - cornerThickness, cy2 - cornerLength + cornerThickness, cornerThickness, cornerLength);
  
  // Bottom-right corner
  ctx.fillRect(cx2 - cornerLength + cornerThickness, cy2, cornerLength, cornerThickness);
  ctx.fillRect(cx2, cy2 - cornerLength + cornerThickness, cornerThickness, cornerLength);
  
  // Professional label design
  ctx.font = 'bold 12px "Inter", "Segoe UI", Arial, sans-serif';
  const mainText = label;
  const confText = `${scorePerc}%`;
  const idText = `#${detectionIndex}`;
  
  const mainTextWidth = ctx.measureText(mainText).width;
  const confTextWidth = ctx.measureText(confText).width;
  const idTextWidth = ctx.measureText(idText).width;
  
  const labelPadding = 8;
  const labelSpacing = 4;
  const totalLabelWidth = mainTextWidth + confTextWidth + idTextWidth + labelPadding * 2 + labelSpacing * 2;
  const labelHeight = 22;
  
  // Smart label positioning
  let labelX = cx1;
  let labelY = cy1 - labelHeight - 4;
  
  // Adjust if label goes outside canvas bounds
  if (labelX + totalLabelWidth > canvas.width) {
    labelX = canvas.width - totalLabelWidth - 4;
  }
  if (labelY < 0) {
    labelY = cy2 + 4;
  }
  
  // Draw label background
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = color;
  drawRoundedRect(ctx, labelX, labelY, totalLabelWidth, labelHeight, 4);
  
  // Draw label text with shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 1;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = '#FFFFFF';
  
  // Main label text
  ctx.font = 'bold 11px "Inter", "Segoe UI", Arial, sans-serif';
  ctx.fillText(mainText, labelX + labelPadding, labelY + 14);
  
  // Confidence text
  ctx.font = 'bold 10px "Inter", "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#E0E0E0';
  ctx.fillText(confText, labelX + labelPadding + mainTextWidth + labelSpacing, labelY + 14);
  
  // Detection ID
  ctx.font = 'bold 8px "Inter", "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#CCCCCC';
  ctx.fillText(idText, labelX + labelPadding + mainTextWidth + confTextWidth + labelSpacing * 2, labelY + 13);
  
  // Restore context state
  ctx.restore();
}

// Helper function to draw rounded rectangles
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

// addDetectionToSession is imported from session-manager.js

// Function to update session summary display
function updateDetectionSessionSummary() {
  const sessionDuration = Date.now() - detectionSession.startTime;
  const durationMinutes = Math.floor(sessionDuration / 60000);
  const durationSeconds = Math.floor((sessionDuration % 60000) / 1000);
  const avgConfidence = detectionSession.detectionCount > 0 ? 
    detectionSession.confidenceSum / detectionSession.detectionCount : 0;
  
  // Update session stats if elements exist
  const totalDetectionsEl = document.getElementById('session-total-detections');
  const sessionDurationEl = document.getElementById('session-duration');
  const uniqueHazardsEl = document.getElementById('session-unique-hazards');
  const avgConfidenceEl = document.getElementById('session-avg-confidence');
  
  if (totalDetectionsEl) totalDetectionsEl.textContent = detectionSession.detectionCount;
  if (sessionDurationEl) sessionDurationEl.textContent = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;
  if (uniqueHazardsEl) uniqueHazardsEl.textContent = detectionSession.uniqueHazards.size;
  if (avgConfidenceEl) avgConfidenceEl.textContent = `${Math.round(avgConfidence * 100)}%`;
}

async function runAPIDetection() {
  try {
    // Create a high-quality capture from the video stream for API detection
    const captureCanvas = document.createElement('canvas');
    const captureCtx = captureCanvas.getContext('2d');
    
    // Resize to 480x480 for the API model
    captureCanvas.width = 480;
    captureCanvas.height = 480;
    
    // Draw current video frame
    captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    
    // Create blob with optimized quality for API
    const blob = await new Promise((resolve) =>
      captureCanvas.toBlob(resolve, 'image/jpeg', 0.9)
    );
    
    // Validate blob before sending
    if (!blob || blob.size === 0) {
      throw new Error('Failed to create image blob from video frame');
    }
    
    const result = await detectHazards(
      cameraState.apiSessionId,
      blob
    );

    cameraState.apiAvailable = result.ok;

    if (!result.ok) {
      console.warn('⚠️ Invalid API response format:', result.error);
      return [];
    }

    const detections = parseAPIDetections(result.detections);
    console.log(`🔍 API returned ${detections.length} detections`);

    return detections;
  } catch (error) {
    console.error('❌ API detection attempt failed:', error.message);
    cameraState.apiAvailable = false;
    switchToFallback(error.message);
    // Return fallback detections
    return fallbackProvider.detect(captureCanvas);
  }
}

async function runLocalDetection(inputTensor) {
  try {
    // Run inference - use the actual input name from the model
    const inputName = cameraState.session.inputNames[0];
    const feeds = {};
    feeds[inputName] = inputTensor;
    console.log(`🔄 Running local inference with input: ${inputName}`);
    
    // Monitor inference performance
    const inferenceStart = performance.now();
    const results = await cameraState.session.run(feeds);
    const inferenceDuration = performance.now() - inferenceStart;
    
    performanceMonitor.recordInference(inferenceDuration);
    
    if (cameraState.frameCount % 30 === 0) {
        const metrics = performanceMonitor.getMetrics();
        console.log(`📊 Inference metrics: avg=${metrics.avgInferenceTime.toFixed(1)}ms, max=${metrics.maxInferenceTime.toFixed(1)}ms, count=${metrics.inferenceCount}`);
    }
    
    // Get output tensor
    const outputKey = Object.keys(results)[0];
    const output = results[outputKey];
    const outputData = output.data;
    
    console.log(`📊 Output key: ${outputKey}`);
    console.log(`📊 Output shape:`, output.dims);
    console.log(`📊 Output data length: ${outputData.length}`);
    
    // Validate output format
    if (outputData.length === 0) {
      console.warn('⚠️ Empty model output');
      return [];
    }
    
    if (outputData.length % 6 !== 0) {
      console.error(`❌ Invalid output format: ${outputData.length} values (expected multiple of 6)`);
      return [];
    }
    
    // Parse detections - YOLO format: [x1, y1, x2, y2, confidence, class_id]
    const detections = [];
    const rawDetectionCount = outputData.length / 6;
    
    console.log(`🔍 Raw output length: ${outputData.length}, detections: ${rawDetectionCount}`);
    console.log(`📝 First few values:`, Array.from(outputData.slice(0, 12)).map(v => v.toFixed(3)));
    
    for (let i = 0; i < outputData.length; i += 6) {
      const [x1, y1, x2, y2, score, classId] = outputData.slice(i, i + 6);
      
      // Skip invalid detections
      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2) || isNaN(score) || isNaN(classId)) {
        continue;
      }
      
      // Apply class-specific confidence thresholds
      const clampedClassId = Math.max(0, Math.min(Math.floor(classId), CLASS_NAMES.length - 1));
      const className = CLASS_NAMES[clampedClassId];
      const classThreshold = CLASS_CONFIG[className]?.threshold || cameraState.confidenceThreshold;
      
      if (score < classThreshold) {
        continue;
      }
      
      // Skip phantom detections (tiny boxes or at origin)
      if (Math.abs(x2 - x1) < 5 || Math.abs(y2 - y1) < 5) {
        continue;
      }
      
      // Skip detections at origin (0,0) - often phantom detections
      if (x1 < 1 && y1 < 1) {
        continue;
      }
      
      // Validate coordinates
      if (x1 >= x2 || y1 >= y2) {
        continue;
      }
      
      // Ensure coordinates are within model bounds
      if (x1 < 0 || y1 < 0 || x2 > cameraState.modelInputSize || y2 > cameraState.modelInputSize) {
        continue;
      }
      
      const clampedX1 = Math.max(0, Math.min(x1, cameraState.modelInputSize));
      const clampedY1 = Math.max(0, Math.min(y1, cameraState.modelInputSize));
      const clampedX2 = Math.max(0, Math.min(x2, cameraState.modelInputSize));
      const clampedY2 = Math.max(0, Math.min(y2, cameraState.modelInputSize));
      
      const width = clampedX2 - clampedX1;
      const height = clampedY2 - clampedY1;
      const area = width * height;
      const aspectRatio = height > 0 ? width / height : 0;
      
      // Apply geometry validation for local detections
      const passedGeometry = validateDetectionGeometry({
        width, height, area, aspectRatio, className
      });
      
      if (!passedGeometry) {
        continue; // Skip detections that fail geometry checks
      }
      
      const detection = {
        x1: clampedX1,
        y1: clampedY1,
        x2: clampedX2,
        y2: clampedY2,
        score: score,
        classId: Math.max(0, Math.min(Math.floor(classId), CLASS_NAMES.length - 1)),
        className: className,
        area: area,
        aspectRatio: aspectRatio,
        passedGeometryCheck: passedGeometry
      };
      
      detections.push(detection);
      
      // Log first few detections for debugging
      if (detections.length <= 3) {
        console.log(`📦 Detection ${detections.length}: (${detection.x1.toFixed(1)}, ${detection.y1.toFixed(1)}, ${detection.x2.toFixed(1)}, ${detection.y2.toFixed(1)}) conf=${score.toFixed(3)} class=${detection.classId}`);
      }
    }
    
    // Apply NMS to reduce duplicate local detections
    const filteredDetections = applyNMS(detections, 0.5, 8);
    
    console.log(`✅ Parsed ${detections.length} valid local detections, ${filteredDetections.length} after NMS`);
    return filteredDetections;
    
  } catch (error) {
    console.error('❌ Local detection failed:', error);
    return [];
  }
}

/**
 * Parse and normalize API detections
 * @param {Array<import('./result_normalizer.js').NormalizedDetection>} apiDetections
 * @returns {Array<DetectionResult>} Normalized detections in model space
 */
function parseAPIDetections(apiDetections) {
  if (!Array.isArray(apiDetections)) return [];
  const detections = [];
  for (const det of apiDetections) {
    if (!det || !det.box) continue;
    const x1 = det.box.x;
    const y1 = det.box.y;
    const x2 = det.box.x + det.box.w;
    const y2 = det.box.y + det.box.h;
    if (x2 <= x1 || y2 <= y1) continue;
    const className = det.class_name || 'unknown';
    const classId = CLASS_NAMES.indexOf(className);
    const score = det.confidence || 0;
    const classThreshold = CLASS_THRESHOLDS[className] ?? GLOBAL_CONFIDENCE_THRESHOLD;
    if (score < classThreshold) continue;
    detections.push({
      x1, y1, x2, y2,
      score,
      classId: classId >= 0 ? classId : 0,
      className,
      area: det.box.w * det.box.h,
      aspectRatio: det.box.h > 0 ? det.box.w / det.box.h : 0,
      passedGeometryCheck: true,
      isNew: false,
      reportId: null
    });
  }
  return detections;
}

function tensorToImageData(tensor) {
  const data = tensor.data;
  const size = cameraState.modelInputSize;
  const imageData = new ImageData(size, size);
  
  for (let i = 0; i < size * size; i++) {
    const r = Math.round(data[i] * 255);
    const g = Math.round(data[i + size * size] * 255);
    const b = Math.round(data[i + 2 * size * size] * 255);
    
    imageData.data[i * 4] = r;
    imageData.data[i * 4 + 1] = g;
    imageData.data[i * 4 + 2] = b;
    imageData.data[i * 4 + 3] = 255;
  }
  
  return imageData;
}

async function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      }),
      () => resolve(null),
      { timeout: 5000, enableHighAccuracy: false }
    );
  });
}