// camera_detection.js - Refactored for camera.html
// Firebase imports removed - now using Cloudinary via API

import { uploadDetection, startSession } from './apiClient.js';
import { 
  DETECTION_CONFIG, 
  UI_CONFIG, 
  CAMERA_CONFIG,
  FEATURE_FLAGS 
} from './config.js';

// Import auto-reporting service
import { 
  initializeAutoReporting,
  processDetectionForAutoReporting,
  setAutoReportingEnabled,
  setAutoReportingThreshold,
  getAutoReportingStats,
  clearAutoReportingSession,
  cleanupAutoReporting 
} from './auto-reporting-service.js';

// Import utilities
import { 
  getVideoDisplayRect, 
  mapModelToCanvas, 
  validateMappingAccuracy 
} from './utils/coordsMap.js';

// Import inference contract validator
import { 
  validateDetectionResult, 
  convertToContractFormat,
  logContractFailure,
  ContractValidationError 
} from './inference-contract-validator.js';

// Import ONNX runtime loader
import { 
  loadONNXRuntime, 
  createInferenceSession, 
  getInferenceSession, 
  disposeInferenceSession,
  createTensor,
  performanceMonitor 
} from './onnx-runtime-loader.js';

// Import the preprocessing and inference workers
const preprocessWorker = new Worker('./preprocess.worker.js', { type: 'module' });
const inferenceWorker = new Worker('./inference.worker.js', { type: 'module' });

// Global state
let cameraState = {
  stream: null,
  detecting: false,
  modelLoaded: false,
  frameCount: 0,
  lastFrameTime: 0,
  animationFrameId: null,
  confidenceThreshold: 0.5,
  iouThreshold: 0.45, // New IOU threshold
  modelInputSize: 640, // Default, will be detected from model
  backend: 'unknown',
  inferenceTimings: { preprocess_ms: 0, infer_ms: 0, postprocess_ms: 0 },
  sessionId: null,
  modelLoadStartTime: null // Track when model loading started
};

const classNames = ['crack', 'knocked', 'pothole', 'surface damage']; // Updated for best0608 model

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
let detectedObjectCount = 0;
let uniqueHazardTypes = new Set();

// Global state for alert
let lastHazardAlertTime = 0;

// Worker communication
let workerRequestId = 0;
const pendingWorkerRequests = new Map();

// Backpressure for inference
let inferenceInProgress = false;

// Global coordinate transformation parameters
let coordinateScale = {
  // Model input size to video display scaling
  modelToDisplayX: 1.0,
  modelToDisplayY: 1.0,
  // Video source to display scaling
  videoToDisplayX: 1.0,
  videoToDisplayY: 1.0
};

// DOM elements
let video, canvas, ctx, loadingOverlay, startButton, stopButton, saveReportButton, switchCameraBtn, settingsButton;
let loadingStatus, detectionCountBadge, fpsBadge, hazardTypesDisplay, hazardTypesList;
let confidenceSlider, confidenceValue, iouSlider, iouValue, settingsPanel, hazardToastElement, detectionModeInfo;

// Offscreen canvas for processing (will be resized based on model)
const offscreen = document.createElement("canvas");
const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

// Reusable buffer for frame preprocessing to avoid per-frame allocations
let preprocessBuffer = null;
let preprocessBufferSize = 0;

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  // Record initialization start time for timeout tracking
  cameraState.modelLoadStartTime = Date.now();
  
  // Get DOM elements
  video = document.getElementById("camera-stream");
  canvas = document.getElementById("overlay-canvas");
  loadingOverlay = document.getElementById("loading-overlay");
  startButton = document.getElementById("start-camera");
  stopButton = document.getElementById("stop-camera");
  saveReportButton = document.getElementById("save-report-btn");
  switchCameraBtn = document.getElementById("switch-camera-btn");
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
  iouSlider = document.getElementById("iou-threshold");
  iouValue = document.getElementById("iou-value");
  settingsPanel = document.getElementById("settings-panel");
  hazardToastElement = document.getElementById("hazardToast");
  detectionModeInfo = document.getElementById("detection-mode-info");

  // Validate required elements
  if (!video || !canvas || !startButton || !stopButton) {
    console.error('Missing required DOM elements for camera detection');
    return;
  }

  ctx = canvas.getContext("2d");

  // Start button disabled until model is fully loaded and ready
  startButton.disabled = true;
  if (startButton) {
    startButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading Model...';
  }

  // Set up event listeners
  setupEventListeners();

  // Add window resize and orientation change listeners to update canvas scaling
  window.addEventListener('resize', debounce(updateCanvasSize, 100));
  window.addEventListener('orientationchange', debounce(() => {
    // Wait for orientation change to complete
    setTimeout(updateCanvasSize, 300);
  }, 100));
  
  // Add visibility change listener for performance optimization
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Initialize detection (local model) - this is async and will update UI when ready
  initializeDetection();

  // Initialize auto-reporting service
  initializeAutoReporting({
    enabled: true,
    minConfidence: 0.7
  }).then((enabled) => {
    console.log(`🚨 Auto-reporting service initialized: ${enabled ? 'enabled' : 'disabled'}`);
  }).catch((error) => {
    console.warn('⚠️ Auto-reporting service initialization failed:', error);
  });

  console.log('📷 Camera detection system initializing with enhanced error handling...');
}

function setupEventListeners() {
  // Camera controls
  startButton.addEventListener("click", startCamera);
  stopButton.addEventListener("click", stopCamera);
  if (saveReportButton) {
    saveReportButton.addEventListener("click", () => saveReport(true)); // Manual save
  }
  if (switchCameraBtn) {
    switchCameraBtn.addEventListener("click", switchCamera);
  }

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
    // Space bar for start/stop
    if (e.code === 'Space' && !e.target.matches('input, button, textarea')) {
      e.preventDefault();
      if (!startButton.hidden) {
        startButton.click();
      } else if (!stopButton.hidden) {
        stopButton.click();
      }
    }
    // +/- for threshold adjustment
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      if (confidenceSlider) {
        confidenceSlider.value = Math.min(parseFloat(confidenceSlider.max), parseFloat(confidenceSlider.value) + parseFloat(confidenceSlider.step));
        confidenceSlider.dispatchEvent(new Event('input'));
      }
    }
    if (e.key === '-') {
      e.preventDefault();
      if (confidenceSlider) {
        confidenceSlider.value = Math.max(parseFloat(confidenceSlider.min), parseFloat(confidenceSlider.value) - parseFloat(confidenceSlider.step));
        confidenceSlider.dispatchEvent(new Event('input'));
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
        saveSessionButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        const report = await createSessionReport();
        
        saveSessionButton.innerHTML = '<i class="fas fa-check"></i> Saved!';
        saveSessionButton.classList.remove('btn-success');
        saveSessionButton.classList.add('btn-success');
        
        // Show success message
        if (typeof notify === 'function') {
          notify(`Session report saved successfully! Report ID: ${report.id || 'unknown'}`, 'success');
        }
        
        setTimeout(() => {
          saveSessionButton.disabled = false;
          saveSessionButton.innerHTML = '<i class="fas fa-save"></i> Save Session Report';
          saveSessionButton.classList.remove('btn-success');
          saveSessionButton.classList.add('btn-success');
        }, 2000);
        
      } catch (error) {
        console.error('❌ Failed to save session report:', error);
        saveSessionButton.disabled = false;
        saveSessionButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Save Failed';
        saveSessionButton.classList.remove('btn-success');
        saveSessionButton.classList.add('btn-danger');
        
        if (typeof notify === 'function') {
          notify('Failed to save session report. Please try again.', 'error');
        }
        
        setTimeout(() => {
          saveSessionButton.innerHTML = '<i class="fas fa-save"></i> Save Session Report';
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
  if (iouSlider) {
    iouSlider.addEventListener("input", (e) => {
      cameraState.iouThreshold = parseFloat(e.target.value);
      if (iouValue) {
        iouValue.textContent = cameraState.iouThreshold;
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
  updateStatus("Loading local AI model...");
  startButton.disabled = true;
  loadingOverlay.style.display = "flex";
  
  const modelLoadTimeout = setTimeout(() => {
    if (!cameraState.modelLoaded) {
      const timeoutSeconds = UI_CONFIG.LOADING_TIMEOUT / 1000;
      console.error(`⏱️ Model loading timeout after ${timeoutSeconds} seconds`);
      updateStatus("Model loading timeout - Please refresh page");
      notify(`Model loading is taking too long (>${timeoutSeconds}s). Please refresh the page and try again.`, 'error');
      loadingOverlay.style.display = "none";
    }
  }, UI_CONFIG.LOADING_TIMEOUT);

  try {
    console.log('🚀 Initializing ONNX Runtime with enhanced loader...');
    
    // Load ONNX Runtime
    updateStatus("Loading ONNX Runtime...");
    await loadONNXRuntime();
    
    // Create inference session with automatic model resolution
    updateStatus("Creating inference session...");
    const session = await createInferenceSession();
    
    // Update state
    clearTimeout(modelLoadTimeout);
    cameraState.modelLoaded = true;
    cameraState.modelInputSize = 640; // Default, can be detected from session
    cameraState.backend = session._sessionOptions?.executionProviders?.[0] || 'unknown';
    
    // Success state
    updateStatus(`Model ready (${cameraState.backend}) - Start camera`);
    detectionModeInfo.innerHTML = `💻 Local Model (${cameraState.backend})`;
    detectionModeInfo.style.color = '#28a745';
    startButton.disabled = false;
    startButton.innerHTML = '<i class="fas fa-play"></i> Start Camera';
    loadingOverlay.style.display = "none";
    
    console.log('✅ Enhanced ONNX model initialization completed successfully');
    
    if (typeof notify === 'function') {
      notify(`AI model loaded successfully with ${cameraState.backend} backend!`, 'success');
    }
    
    // Initialize auto-reporting
    if (FEATURE_FLAGS.AUTO_REPORTING_ENABLED) {
      await initializeAutoReporting(cameraState.sessionId || 'camera-session');
      console.log('✅ Auto-reporting initialized');
    }
    
  } catch (error) {
    clearTimeout(modelLoadTimeout);
    cameraState.modelLoaded = false;
    updateStatus("Model loading failed - Check console for details");
    detectionModeInfo.innerHTML = `❌ Model Failed`;
    detectionModeInfo.style.color = '#dc3545';
    startButton.disabled = true;
    
    const errorMsg = error.message || 'Unknown initialization error';
    console.error('❌ Enhanced model initialization error:', errorMsg);
    notify(`Failed to load AI model: ${errorMsg}`, 'error');
    loadingOverlay.style.display = "none";
  }

  inferenceWorker.onmessage = (event) => {
    const { type, payload } = event.data;
    switch (type) {
      case 'engine_info':
        // Intermediate loading info - don't mark as ready yet
        console.log('🔧 ONNX Runtime info:', payload);
        updateStatus(`Loading model (${payload.backend} backend)...`);
        break;
      case 'init_success':
        clearTimeout(modelLoadTimeout);
        cameraState.modelLoaded = true;
        cameraState.modelInputSize = payload.inputSize;
        cameraState.backend = payload.backend;
        
        // Enhanced success message with performance info
        const totalTime = payload.totalInitTime || payload.initTime;
        updateStatus(`Model ready (${payload.backend}, ${totalTime.toFixed(0)}ms) - Start camera`);
        detectionModeInfo.innerHTML = `💻 Local Model (${payload.backend})`;
        detectionModeInfo.style.color = '#28a745'; // Green for ready state
        startButton.disabled = false;
        startButton.innerHTML = '<i class="fas fa-play"></i> Start Camera';
        loadingOverlay.style.display = "none";
        
        console.log('✅ Local model fully ready for inference:', payload);
        
        // Show success notification
        if (typeof notify === 'function') {
          notify(`AI model loaded successfully with ${payload.backend} backend!`, 'success');
        }
        break;
      case 'init_error':
        clearTimeout(modelLoadTimeout);
        cameraState.modelLoaded = false;
        updateStatus("Model loading failed - Check console for details");
        detectionModeInfo.innerHTML = `❌ Model Failed`;
        detectionModeInfo.style.color = '#dc3545'; // Red for error
        
        const errorMsg = payload.message || 'Unknown error';
        console.error('❌ Model initialization error:', errorMsg);
        notify(`Failed to load AI model: ${errorMsg}`, 'error');
        loadingOverlay.style.display = "none";
        
        // Offer retry option
        setTimeout(() => {
          if (confirm('Model loading failed. Would you like to retry?')) {
            initializeDetection();
          }
        }, 1000);
        break;
      case 'inference_result':
        // Handle inference results from worker
        const { detections, timings, backend } = payload;
        cameraState.inferenceTimings = timings;
        cameraState.backend = backend;
        
        // Validate inference result against contract
        try {
          const detectionResult = {
            detections: detections || [],
            width: video.videoWidth || coordinateScale.videoSource?.width || 1280,
            height: video.videoHeight || coordinateScale.videoSource?.height || 720,
            timings: timings || { preprocess_ms: 0, infer_ms: 0, postprocess_ms: 0, total_ms: 0 },
            engine: {
              name: 'local',
              backend: backend || 'unknown',
              version: '1.0',
              modelPath: '/object_detection_model/best0608.onnx'
            }
          };
          
          const validation = validateDetectionResult(detectionResult, {
            strict: false, // Allow warnings but don't throw
            logWarnings: true,
            throwOnError: false
          });
          
          if (!validation.valid) {
            console.warn('⚠️ Camera inference contract validation failed:', validation.errors);
          }
          
        } catch (contractError) {
          if (contractError instanceof ContractValidationError) {
            logContractFailure(contractError, {
              engine: 'camera/local',
              sessionId: cameraState.sessionId,
              detectionCount: detections?.length || 0
            });
          } else {
            console.error('❌ Unexpected contract validation error:', contractError);
          }
        }
        
        updatePersistentDetections(detections || []);
        detectedObjectCount = persistentDetections.length;
        updateUniqueHazardTypesFromPersistent();

        if (detections && detections.length > 0) {
          detectionSession.detectionFrames++;
          detections.forEach(detection => {
            const label = classNames[detection.classId] || `Class ${detection.classId}`;
            addDetectionToSession({
              hazards: [{
                class: label,
                confidence: detection.score,
                bbox: detection
              }],
              confidence: detection.score
            }, video); // Pass video element for image capture
          });
          updateDetectionSessionSummary();
          
          // Process detections for auto-reporting
          processDetectionForAutoReporting(detections, video).then((result) => {
            if (result.processed) {
              console.log(`🚨 Auto-reporting: ${result.reportsCreated} report(s) created from ${result.detectionCount} detection(s)`);
              // Update UI to show auto-report status
              updateAutoReportingStatus(result);
            }
          }).catch((error) => {
            console.warn('⚠️ Auto-reporting processing error:', error);
          });
        }
        inferenceInProgress = false; // Allow next frame to be processed
        break;
      case 'contract_validation_error':
        console.error('🚫 Worker contract validation failed:', payload.errors);
        // Continue processing but log the contract violation
        const { detections: errorDetections, timings: errorTimings, backend: errorBackend } = payload;
        cameraState.inferenceTimings = errorTimings;
        cameraState.backend = errorBackend;
        
        // Still update UI but mark as potentially invalid
        updatePersistentDetections(errorDetections || []);
        detectedObjectCount = persistentDetections.length;
        updateUniqueHazardTypesFromPersistent();
        
        // Show warning to user
        if (typeof notify === 'function') {
          notify('⚠️ Detection quality warning: Contract validation failed', 'warning');
        }
        
        inferenceInProgress = false;
        break;
      case 'run_error':
        console.error('❌ Inference run error:', payload.message);
        inferenceInProgress = false; // Allow next frame to be processed
        break;
    }
  };

  // Initialize with enhanced options and fallback support
  inferenceWorker.postMessage({
    type: 'init',
    payload: {
      modelUrl: null, // Let worker try all fallback paths
      opts: {
        threshold: cameraState.confidenceThreshold,
        iou: cameraState.iouThreshold,
        inputSize: cameraState.modelInputSize,
        classes: classNames
      }
    }
  });
  
  console.log('🚀 Initializing ONNX model with fallback support...');
}

let currentCameraDeviceId = null;
let availableCameraDevices = [];

async function getConnectedCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  availableCameraDevices = devices.filter(device => device.kind === 'videoinput');
  if (availableCameraDevices.length > 1) {
    switchCameraBtn.hidden = false;
  } else {
    switchCameraBtn.hidden = true;
  }
  console.log('📷 Available camera devices:', availableCameraDevices);
}

async function switchCamera() {
  if (availableCameraDevices.length <= 1) return;

  const currentIndex = availableCameraDevices.findIndex(device => device.deviceId === currentCameraDeviceId);
  const nextIndex = (currentIndex + 1) % availableCameraDevices.length;
  const nextCamera = availableCameraDevices[nextIndex];

  console.log('🔄 Switching to camera:', nextCamera.label);

  // Stop current stream if any
  if (cameraState.stream) {
    cameraState.stream.getTracks().forEach(track => track.stop());
  }

  currentCameraDeviceId = nextCamera.deviceId;
  await startCameraStream(nextCamera.deviceId);
}

async function startCamera() {
  if (cameraState.detecting) return;

  // Enhanced model loading check with better user feedback
  if (!cameraState.modelLoaded) {
    const remainingTime = cameraState.modelLoadStartTime ? 
      Math.max(0, 30 - Math.floor((Date.now() - cameraState.modelLoadStartTime) / 1000)) : 30;
    
    if (remainingTime > 0) {
      notify(`AI model is still loading... Please wait ${remainingTime}s more.`, "warning");
    } else {
      notify("AI model loading failed. Please refresh the page.", "error");
    }
    return;
  }

  // Start a new session
  cameraState.sessionId = await startSession();
  if (!cameraState.sessionId) {
    notify("Failed to start a new session. Please try again.", "error");
    return;
  }

  // Clear auto-reporting session state for new session
  clearAutoReportingSession();

  await getConnectedCameras();
  if (availableCameraDevices.length === 0) {
    notify("No camera devices found.", "error");
    return;
  }

  // Use the first camera by default, or the previously selected one
  const initialDeviceId = currentCameraDeviceId || availableCameraDevices[0].deviceId;
  currentCameraDeviceId = initialDeviceId;

  await startCameraStream(initialDeviceId);
}

async function startCameraStream(deviceId) {
  try {
    updateStatus("Starting camera...");

    cameraState.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    video.srcObject = cameraState.stream;
    cameraState.detecting = true;

    // Update UI
    startButton.hidden = true;
    stopButton.hidden = false;
    saveReportButton.hidden = false;

    // Listen for loadedmetadata to set canvas size correctly
    video.onloadedmetadata = () => {
      console.log('📊 Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight);
      // Small delay to ensure video element has rendered before sizing canvas
      setTimeout(() => {
        updateCanvasSize();
        // Start detection loop only after video is ready and canvas is sized
        if (!cameraState.animationFrameId) {
          cameraState.lastFrameTime = performance.now();
          detectionLoop();
        }
      }, 100);
    };

    // Fallback for canplay if loadedmetadata doesn't fire as expected
    video.oncanplay = () => {
      if (!cameraState.animationFrameId) {
        console.log('🎥 Video canplay, ensuring canvas size and starting loop.');
        setTimeout(() => {
          updateCanvasSize();
          cameraState.lastFrameTime = performance.now();
          detectionLoop();
        }, 100);
      }
    };

    console.log("📷 Camera started successfully");
    updateStatus("Camera active - Detecting hazards");

  } catch (err) {
    console.error("Error accessing camera:", err);
    notify("Could not access camera. Please grant permission.", "error");

    cameraState.detecting = false;
    startButton.hidden = false;
    stopButton.hidden = true;
    saveReportButton.hidden = true;
    updateStatus("Camera access failed");
  }
}

function updateCoordinateScaling() {
  if (!video.videoWidth || !video.videoHeight || !canvas.width || !canvas.height) {
    console.warn('⚠️ Cannot calculate coordinate scaling - missing dimensions');
    return;
  }
  
  const dpr = window.devicePixelRatio || 1;
  
  // Get accurate video display rectangle accounting for object-fit
  const videoDisplayRect = getVideoDisplayRect(video);
  
  // Store mapping parameters for consistent coordinate transformation
  coordinateScale = {
    videoDisplayRect,
    canvasSize: {
      width: canvas.width,
      height: canvas.height
    },
    modelInputSize: cameraState.modelInputSize,
    dpr,
    videoSource: {
      width: video.videoWidth,
      height: video.videoHeight
    },
    canvasDisplaySize: {
      width: parseFloat(canvas.style.width),
      height: parseFloat(canvas.style.height)
    }
  };
  
  console.log(`📏 Coordinate mapping initialized:`, {
    mode: 'local-detection',
    modelInput: `${coordinateScale.modelInputSize}x${coordinateScale.modelInputSize}`,
    videoSource: `${video.videoWidth}x${video.videoHeight}`,
    videoDisplay: `${videoDisplayRect.width.toFixed(1)}x${videoDisplayRect.height.toFixed(1)} at (${videoDisplayRect.x.toFixed(1)}, ${videoDisplayRect.y.toFixed(1)})`,
    canvasBuffer: `${canvas.width}x${canvas.height}`,
    canvasDisplay: `${coordinateScale.canvasDisplaySize.width}x${coordinateScale.canvasDisplaySize.height}`,
    dpr,
    objectFit: window.getComputedStyle(video).objectFit
  });
  
  // Validate mapping accuracy with test detection
  validateMappingSetup();
}

function validateMappingSetup() {
  // Test detection at center of frame
  const testDetection = {
    x1: coordinateScale.modelInputSize * 0.4,
    y1: coordinateScale.modelInputSize * 0.4,
    x2: coordinateScale.modelInputSize * 0.6,
    y2: coordinateScale.modelInputSize * 0.6
  };
  
  const mappedCoords = mapModelToCanvas(
    testDetection,
    coordinateScale.modelInputSize,
    coordinateScale.canvasSize,
    coordinateScale.videoDisplayRect,
    coordinateScale.dpr
  );
  
  const mapping = {
    displayWidth: coordinateScale.videoDisplayRect.width,
    displayHeight: coordinateScale.videoDisplayRect.height,
    offsetX: coordinateScale.videoDisplayRect.x,
    offsetY: coordinateScale.videoDisplayRect.y,
    dpr: coordinateScale.dpr
  };
  
  const isAccurate = validateMappingAccuracy(
    {
      x1: testDetection.x1 / coordinateScale.modelInputSize,
      y1: testDetection.y1 / coordinateScale.modelInputSize,
      x2: testDetection.x2 / coordinateScale.modelInputSize,
      y2: testDetection.y2 / coordinateScale.modelInputSize
    },
    mappedCoords,
    { x: 1, y: 1 }, // ≤1px tolerance as required
    mapping
  );
  
  if (!isAccurate) {
    console.error('❌ Coordinate mapping validation failed - accuracy requirement not met');
  } else {
    console.log('✅ Coordinate mapping validation passed - ≤1px accuracy achieved');
  }
}

function updateCanvasSize() {
  if (!video.videoWidth || !video.videoHeight) {
    return;
  }
  
  const dpr = window.devicePixelRatio || 1;
  const videoRect = video.getBoundingClientRect();
  
  // Canvas is positioned via CSS - ensure it matches container
  // The canvas should already be positioned correctly via CSS absolute positioning
  
  // Set canvas display size to match video element (CSS pixels)
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  
  // Set canvas drawing buffer size with DPR for crisp rendering
  canvas.width = Math.round(videoRect.width * dpr);
  canvas.height = Math.round(videoRect.height * dpr);
  
  // Scale context to account for DPR - this ensures crisp rendering
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
  // Update coordinate scaling with accurate parameters
  updateCoordinateScaling();
  
  console.log(`📐 Canvas resized to ${canvas.width}x${canvas.height} (buffer pixels) / ${videoRect.width}x${videoRect.height} (display pixels), DPR: ${dpr}`);
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

// Handle visibility change for performance optimization
function handleVisibilityChange() {
  if (document.hidden) {
    // Page is hidden - reduce processing
    console.log('🔴 Page hidden - reducing processing');
  } else {
    // Page is visible - resume full processing
    console.log('🔵 Page visible - resuming full processing');
    if (cameraState.detecting && coordinateScale.videoDisplayRect) {
      // Update canvas size in case screen orientation changed while hidden
      setTimeout(updateCanvasSize, 100);
    }
  }
}

// Optimized frame processing with visibility awareness
function shouldProcessFrame() {
  // Skip processing if page is hidden (performance optimization)
  if (document.hidden) {
    return false;
  }
  
  // Skip processing if inference is in progress (backpressure)
  if (inferenceInProgress) {
    return false;
  }
  
  return true;
}

async function stopCamera() {
  if (!cameraState.detecting) return;
  
  cameraState.detecting = false;
  
  // Stop camera stream
  if (cameraState.stream) {
    cameraState.stream.getTracks().forEach(track => track.stop());
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
  saveReportButton.hidden = true;
  switchCameraBtn.hidden = true;
  
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
  
  // Reset status
  updateStatus("Camera stopped");
  updateDetectionCount(0);
  updateFPS(0);
  hideHazardTypes();
  
  console.log("📷 Camera stopped");
}

function showHazardAlert(detection) {
    if (!hazardToastElement) return;

    const now = Date.now();
    if (now - lastHazardAlertTime < DETECTION_CONFIG.HAZARD_ALERT_COOLDOWN) {
        return; // Too soon to show another alert
    }

    lastHazardAlertTime = now;

    const hazardType = classNames[detection.classId] || `Class ${detection.classId}`;
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
  persistentDetections = persistentDetections.filter(d => (now - d.timestamp) < DETECTION_CONFIG.DETECTION_LIFETIME);
  const existingDetectionsMap = new Map(persistentDetections.map(d => [d.id, d]));

  newDetections.forEach(newDet => {
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
    uniqueHazardTypes.add(classNames[d.classId] || `Class ${d.classId}`);
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

  // Use requestVideoFrameCallback if available for better sync
  if (video.requestVideoFrameCallback && !document.hidden) {
    video.requestVideoFrameCallback(processVideoFrame);
  } else {
    cameraState.animationFrameId = requestAnimationFrame(detectionLoop);
  }

  // Optimized frame processing check
  if (!shouldProcessFrame()) {
    // Still draw previous detections even if skipping inference
    drawPersistentDetections();
    updateFPS();
    return;
  }

  inferenceInProgress = true;

  try {
    // Create ImageBitmap from video for worker processing
    const imageBitmap = await createImageBitmap(video);

    // Send ImageBitmap to worker for inference
    inferenceWorker.postMessage({
      type: 'run_image_bitmap',
      payload: {
        bitmap: imageBitmap,
        opts: {
          threshold: cameraState.confidenceThreshold,
          iou: cameraState.iouThreshold,
          inputSize: cameraState.modelInputSize
        }
      }
    }, [imageBitmap]); // Transfer ownership of ImageBitmap

  } catch (err) {
    console.error("❌ Error in detection loop:", err);
    inferenceInProgress = false; // Reset on error
  }

  // Always draw persistent detections and update UI
  drawPersistentDetections();
  updateDetectionCount(detectedObjectCount);
  updateFPS();

  cameraState.frameCount++;

  // Record frame processing for session manager
  recordFrameProcessed();

  // Auto-save report if there are new detections (debounced)
  if (persistentDetections.length > 0) {
    saveReport(false);
  }
}

// Enhanced video frame processing callback for better performance
function processVideoFrame(now, metadata) {
  if (cameraState.detecting && shouldProcessFrame()) {
    detectionLoop();
  } else if (cameraState.detecting) {
    // Continue requesting frames even if not processing
    video.requestVideoFrameCallback(processVideoFrame);
  }
}

function drawPersistentDetections() {
    if (!video.videoWidth || !video.videoHeight || !coordinateScale.videoDisplayRect) {
        console.warn('⚠️ Video or coordinate mapping not ready for drawing');
        return;
    }

    // Performance optimization: batch canvas operations
    ctx.save();
    
    // Clear canvas for new frame - use CSS pixel dimensions for drawing operations
    const canvasDisplayWidth = canvas.width / coordinateScale.dpr;
    const canvasDisplayHeight = canvas.height / coordinateScale.dpr;
    ctx.clearRect(0, 0, canvasDisplayWidth, canvasDisplayHeight);
    
    const hazardColors = UI_CONFIG.HAZARD_COLORS;
    const detectionCount = persistentDetections.length;

    // Debug: Log detection rendering status (only log first few times)
    if (detectionCount > 0 && cameraState.frameCount < 5) {
        console.log(`🎨 Rendering ${detectionCount} detection(s)`, {
            canvasSize: `${canvas.width}x${canvas.height}`,
            displaySize: `${canvasDisplayWidth.toFixed(1)}x${canvasDisplayHeight.toFixed(1)}`,
            dpr: coordinateScale.dpr,
            videoDisplayRect: coordinateScale.videoDisplayRect,
            modelInputSize: coordinateScale.modelInputSize
        });
    }

    // Early exit if no detections to render
    if (detectionCount === 0) {
        ctx.restore();
        return;
    }

    // Batch render all detections
    persistentDetections.forEach((detection, index) => {
        const { x1, y1, x2, y2, score, classId } = detection;
        
        // Map model coordinates to canvas coordinates with DPR accuracy
        const mappedBox = mapModelToCanvas(
            { x1, y1, x2, y2 },
            coordinateScale.modelInputSize,
            coordinateScale.canvasSize,
            coordinateScale.videoDisplayRect,
            coordinateScale.dpr
        );

        const label = classNames[classId] || `Class ${classId}`;
        const color = hazardColors[label] || '#00FF00';

        // Debug: Log coordinate mapping for first detection (only first few frames)
        if (index === 0 && cameraState.frameCount < 3) {
            console.log(`🎯 Detection #${index + 1} coordinate mapping:`, {
                original: { x1, y1, x2, y2 },
                mapped: mappedBox,
                finalDrawCoords: {
                    x1: mappedBox.x1 / coordinateScale.dpr,
                    y1: mappedBox.y1 / coordinateScale.dpr,
                    x2: mappedBox.x2 / coordinateScale.dpr,
                    y2: mappedBox.y2 / coordinateScale.dpr
                },
                label,
                confidence: score.toFixed(3),
                color
            });
        }

        const drawCoords = {
            x1: mappedBox.x1 / coordinateScale.dpr, // Convert to CSS pixels for drawing context
            y1: mappedBox.y1 / coordinateScale.dpr,
            x2: mappedBox.x2 / coordinateScale.dpr,
            y2: mappedBox.y2 / coordinateScale.dpr
        };

        // Validate drawing coordinates are within canvas bounds
        if (drawCoords.x1 >= canvasDisplayWidth || drawCoords.y1 >= canvasDisplayHeight ||
            drawCoords.x2 <= 0 || drawCoords.y2 <= 0) {
            console.warn(`⚠️ Detection #${index + 1} is outside canvas bounds:`, {
                drawCoords,
                canvasBounds: { width: canvasDisplayWidth, height: canvasDisplayHeight }
            });
            return; // Skip this detection
        }

        // Draw bounding box with optimized rendering
        drawOptimizedBoundingBox(ctx, {
            ...drawCoords,
            label,
            confidence: score,
            detectionIndex: index + 1,
            color,
            totalDetections: detectionCount,
            canvasDisplayWidth,
            canvasDisplayHeight
        });
    });
    
    ctx.restore();
}

function updateStatus(message) {
  if (loadingStatus) {
    loadingStatus.textContent = message;
  }
  console.log("📊 Status:", message);
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

// Function to update recent detections list in modal
function updateRecentDetectionsList() {
  const listElement = document.getElementById('recent-detections-list');
  if (!listElement) return;
  
  if (detectionSession.detections.length === 0) {
    listElement.innerHTML = '<p class="text-muted">No detections recorded yet.</p>';
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
  
  listElement.innerHTML = html;
}

// Function to save complete session report
async function saveReport(manual = false) {
  if (detectionSession.detectionCount === 0) {
    notify('No detections to save in report.', 'warning');
    return;
  }

  // Debounce for auto-reports using config
  const now = Date.now();
  if (!manual && (now - (detectionSession.lastReportTime || 0) < CAMERA_CONFIG.AUTO_SAVE_DEBOUNCE)) {
    return; // Too soon for auto-report
  }

  try {
    // Draw current video frame + detections to an offscreen canvas
    const reportCanvas = document.createElement('canvas');
    reportCanvas.width = video.videoWidth;
    reportCanvas.height = video.videoHeight;
    const reportCtx = reportCanvas.getContext('2d');
    
    reportCtx.drawImage(video, 0, 0, reportCanvas.width, reportCanvas.height);
    // Redraw detections on the report canvas
    persistentDetections.forEach((detection, index) => {
      const { x1, y1, x2, y2, score, classId } = detection;
      const mappedBox = mapModelToCanvas(
          { x1, y1, x2, y2 },
          cameraState.modelInputSize, 
          { width: video.videoWidth, height: video.videoHeight }, 
          { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight }
      );
      const label = classNames[classId] || `Class ${classId}`;
      const hazardColors = UI_CONFIG.HAZARD_COLORS;
      const color = hazardColors[label] || '#00FF00';

      drawProfessionalBoundingBox(reportCtx, {
          x1: mappedBox.x1, y1: mappedBox.y1, x2: mappedBox.x2, y2: mappedBox.y2,
          label: label, confidence: score, detectionIndex: index + 1, color: color
      });
    });

    const blob = await new Promise(resolve => reportCanvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) {
      throw new Error('Failed to create image blob for report');
    }

    const reportData = {
      sessionId: cameraState.sessionId,
      imageBlob: blob,
      detections: persistentDetections.map(d => ({ bbox: [d.x1, d.y1, d.x2, d.y2], class: classNames[d.classId], score: d.score })),
      timestamp: new Date().toISOString(),
      confidenceThreshold: cameraState.confidenceThreshold,
      location: await getCurrentLocation()
    };

    await uploadDetection(reportData);

    notify('Report uploaded successfully!', 'success');
    detectionSession.lastReportTime = now;
    detectionSession.savedReports++;
    updateDetectionSessionSummary();

  } catch (err) {
    console.error('Error saving report:', err);
    notify('Failed to save report', 'error');
  }
}

// Optimized bounding box drawing function with enhanced visual quality
function drawOptimizedBoundingBox(ctx, options) {
  const { x1, y1, x2, y2, label, confidence, detectionIndex, color, totalDetections, canvasDisplayWidth, canvasDisplayHeight } = options;
  
  const boxW = x2 - x1;
  const boxH = y2 - y1;
  
  // Early return for invalid boxes
  if (boxW <= 0 || boxH <= 0) {
    console.warn('Invalid bounding box dimensions:', { x1, y1, x2, y2 });
    return;
  }
  
  const scorePerc = (Math.min(1, Math.max(0, confidence)) * 100).toFixed(0);
  
  // Save current context state
  ctx.save();
  
  // Enhanced visual styling based on confidence and hazard type
  const alpha = Math.min(0.85 + confidence * 0.15, 1.0);
  const baseLineWidth = Math.max(1.5, Math.min(4, 2 + confidence * 2));
  const lineWidth = baseLineWidth * Math.min(1.2, window.devicePixelRatio || 1);
  
  // Color intensity based on confidence
  const colorWithAlpha = adjustColorAlpha(color, alpha);
  
  // Main bounding box with enhanced styling
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colorWithAlpha;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  
  // Add subtle shadow for depth
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  
  ctx.strokeRect(x1, y1, boxW, boxH);
  
  // Clear shadow for subsequent draws
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // Semi-transparent fill with gradient effect
  const fillAlpha = Math.min(0.12 + confidence * 0.08, 0.2);
  ctx.globalAlpha = fillAlpha;
  
  // Create gradient fill for high-confidence detections
  if (confidence > 0.6 && boxW > 50 && boxH > 50) {
    const gradient = ctx.createLinearGradient(x1, y1, x1, y1 + boxH);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, adjustColorBrightness(color, -0.3));
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = color;
  }
  
  ctx.fillRect(x1, y1, boxW, boxH);
  
  // Enhanced corner markers for high-confidence detections
  if (confidence > 0.75 && boxW > 30 && boxH > 30) {
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = colorWithAlpha;
    ctx.lineWidth = lineWidth * 1.2;
    const cornerSize = Math.min(20, Math.min(boxW, boxH) / 3.5);
    drawEnhancedCornerMarkers(ctx, x1, y1, x2, y2, cornerSize);
  }
  
  // Optimized label rendering
  drawOptimizedLabel(ctx, {
    x1, y1, y2, label, scorePerc, color: colorWithAlpha,
    canvasWidth: canvasDisplayWidth,
    canvasHeight: canvasDisplayHeight,
    confidence,
    boxWidth: boxW,
    boxHeight: boxH
  });
  
  // Performance indicator for debugging (only show if many detections)
  if (detectionIndex === 1 && totalDetections > 8) {
    drawPerformanceIndicator(ctx, x2 - 45, y1 - 5, totalDetections);
  }
  
  // Restore context state
  ctx.restore();
}

// Enhanced corner markers with better visual design
function drawEnhancedCornerMarkers(ctx, x1, y1, x2, y2, size) {
  const cornerWidth = 3;
  ctx.lineWidth = cornerWidth;
  ctx.lineCap = 'round';
  
  // Top-left corner
  ctx.beginPath();
  ctx.moveTo(x1, y1 + size);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 + size, y1);
  ctx.stroke();
  
  // Top-right corner
  ctx.beginPath();
  ctx.moveTo(x2 - size, y1);
  ctx.lineTo(x2, y1);
  ctx.lineTo(x2, y1 + size);
  ctx.stroke();
  
  // Bottom-left corner
  ctx.beginPath();
  ctx.moveTo(x1, y2 - size);
  ctx.lineTo(x1, y2);
  ctx.lineTo(x1 + size, y2);
  ctx.stroke();
  
  // Bottom-right corner
  ctx.beginPath();
  ctx.moveTo(x2 - size, y2);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2, y2 - size);
  ctx.stroke();
  
  // Reset line cap
  ctx.lineCap = 'butt';
}

// Enhanced label drawing with adaptive sizing and better typography
function drawOptimizedLabel(ctx, { x1, y1, y2, label, scorePerc, color, canvasWidth, canvasHeight, confidence, boxWidth, boxHeight }) {
  // Adaptive font sizing based on box size and viewport
  const baseFontSize = Math.max(11, Math.min(16, Math.min(boxWidth / 8, boxHeight / 6, canvasWidth / 60)));
  const confFontSize = baseFontSize * 0.85;
  
  // Use optimized font stack for better performance and readability
  ctx.font = `${baseFontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';
  
  const mainText = label.charAt(0).toUpperCase() + label.slice(1); // Capitalize first letter
  const confText = `${scorePerc}%`;
  
  const mainTextMetrics = ctx.measureText(mainText);
  const confTextMetrics = ctx.measureText(confText);
  
  const labelPadding = Math.max(4, baseFontSize * 0.4);
  const labelSpacing = Math.max(4, baseFontSize * 0.3);
  const totalLabelWidth = mainTextMetrics.width + confTextMetrics.width + labelPadding * 2 + labelSpacing;
  const labelHeight = Math.max(18, baseFontSize * 1.6);
  
  // Smart label positioning with enhanced bounds checking
  let labelX = Math.max(2, Math.min(x1, canvasWidth - totalLabelWidth - 2));
  let labelY = y1 - labelHeight - 4; // Position above box with more spacing
  
  // If no space above, position below or inside based on box size
  if (labelY < 0) {
    if (y2 + labelHeight + 4 <= canvasHeight) {
      labelY = y2 + 4; // Below box
    } else if (boxHeight > labelHeight + 10) {
      labelY = y1 + 4; // Inside box at top
    } else {
      labelY = Math.max(2, canvasHeight - labelHeight - 2); // Bottom of canvas
    }
  }
  
  // Enhanced background with subtle gradient and rounded corners
  ctx.globalAlpha = Math.min(0.95, 0.8 + confidence * 0.15);
  
  // Create subtle gradient background
  const bgGradient = ctx.createLinearGradient(labelX, labelY, labelX, labelY + labelHeight);
  bgGradient.addColorStop(0, color);
  bgGradient.addColorStop(1, adjustColorBrightness(color, -0.15));
  ctx.fillStyle = bgGradient;
  
  // Draw rounded rectangle background
  drawRoundedRect(ctx, labelX, labelY, totalLabelWidth, labelHeight, 4);
  
  // Subtle inner border for depth
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = adjustColorBrightness(color, 0.3);
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  drawRoundedRectStroke(ctx, labelX, labelY, totalLabelWidth, labelHeight, 4);
  
  // Enhanced text rendering with multiple techniques for clarity
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = getContrastColor(color);
  ctx.textBaseline = 'middle';
  
  // Text shadow for better readability
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 1;
  ctx.shadowOffsetX = 0.5;
  ctx.shadowOffsetY = 0.5;
  
  // Main label text
  ctx.font = `${baseFontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText(mainText, labelX + labelPadding, labelY + labelHeight / 2);
  
  // Confidence percentage with different styling
  ctx.font = `${confFontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = adjustColorBrightness(getContrastColor(color), -0.2);
  ctx.fillText(confText, labelX + labelPadding + mainTextMetrics.width + labelSpacing, labelY + labelHeight / 2);
  
  // Clear shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// Enhanced performance indicator with better visual design
function drawPerformanceIndicator(ctx, x, y, count) {
  if (count <= 1) return;
  
  ctx.save();
  
  const width = 48;
  const height = 22;
  const radius = 6;
  
  // Background with gradient
  ctx.globalAlpha = 0.85;
  const bgGradient = ctx.createLinearGradient(x, y, x, y + height);
  bgGradient.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
  bgGradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
  ctx.fillStyle = bgGradient;
  drawRoundedRect(ctx, x, y, width, height, radius);
  
  // Color-coded indicator
  ctx.globalAlpha = 1.0;
  const indicatorColor = count > 15 ? '#ff4757' : count > 10 ? '#ffa502' : count > 5 ? '#ff6b6b' : '#2ed573';
  ctx.fillStyle = indicatorColor;
  ctx.font = '10px ui-monospace, "SF Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Add subtle glow effect
  ctx.shadowColor = indicatorColor;
  ctx.shadowBlur = 2;
  
  ctx.fillText(`${count} obj`, x + width / 2, y + height / 2);
  
  // Clear shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  
  ctx.restore();
}

// Utility functions for color manipulation
function adjustColorAlpha(color, alpha) {
  // Simple alpha adjustment - for production, use more robust color parsing
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function adjustColorBrightness(color, amount) {
  // Simple brightness adjustment
  if (color.startsWith('#')) {
    const r = Math.max(0, Math.min(255, parseInt(color.slice(1, 3), 16) + amount * 255));
    const g = Math.max(0, Math.min(255, parseInt(color.slice(3, 5), 16) + amount * 255));
    const b = Math.max(0, Math.min(255, parseInt(color.slice(5, 7), 16) + amount * 255));
    return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`;
  }
  return color;
}

function getContrastColor(hexColor) {
  // Simple contrast color calculation
  if (hexColor.startsWith('#')) {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  }
  return '#ffffff';
}

// Enhanced rounded rectangle with stroke
function drawRoundedRectStroke(ctx, x, y, width, height, radius) {
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
  ctx.stroke();
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

// Professional bounding box drawing for report generation
function drawProfessionalBoundingBox(ctx, options) {
  const { x1, y1, x2, y2, label, confidence, classIndex, detectionIndex, color } = options;
  
  const boxW = x2 - x1;
  const boxH = y2 - y1;
  
  // Early return for invalid boxes
  if (boxW <= 0 || boxH <= 0) {
    console.warn('Invalid bounding box dimensions for camera report:', { x1, y1, x2, y2 });
    return;
  }
  
  const scorePerc = (confidence * 100).toFixed(1);
  
  // Save current context state
  ctx.save();
  
  // Enhanced styling with better visual hierarchy
  const alpha = Math.min(0.85 + confidence * 0.15, 1.0);
  const lineWidth = Math.max(2, Math.min(5, 2 + confidence * 3));
  const cornerSize = Math.max(10, Math.min(18, confidence * 22));
  
  // Enhanced shadow for better depth perception
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  
  // Draw main bounding box with enhanced styling
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]); // Ensure solid line
  ctx.strokeRect(x1, y1, boxW, boxH);
  
  // Semi-transparent fill for better contrast
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = color;
  ctx.fillRect(x1, y1, boxW, boxH);
  
  // Clear shadow for subsequent elements
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // Enhanced corner markers for high-confidence detections
  if (confidence > 0.6 && Math.min(boxW, boxH) > 30) {
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, lineWidth * 0.8);
    ctx.lineCap = 'round';
    
    const cornerLength = Math.min(cornerSize, Math.min(boxW, boxH) / 3);
    
    // Draw enhanced corner markers
    // Top-left
    ctx.beginPath();
    ctx.moveTo(x1, y1 + cornerLength);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + cornerLength, y1);
    ctx.stroke();
    
    // Top-right
    ctx.beginPath();
    ctx.moveTo(x2 - cornerLength, y1);
    ctx.lineTo(x2, y1);
    ctx.lineTo(x2, y1 + cornerLength);
    ctx.stroke();
    
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x1, y2 - cornerLength);
    ctx.lineTo(x1, y2);
    ctx.lineTo(x1 + cornerLength, y2);
    ctx.stroke();
    
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x2 - cornerLength, y2);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, y2 - cornerLength);
    ctx.stroke();
    
    ctx.lineCap = 'butt';
  }
  
  // Enhanced label rendering
  drawProfessionalLabel(ctx, {
    x1, y1, y2, label, confidence, scorePerc, detectionIndex, color,
    canvasWidth: ctx.canvas.width, canvasHeight: ctx.canvas.height, boxWidth: boxW, boxHeight: boxH
  });
  
  // Restore context state
  ctx.restore();
}

// Enhanced label drawing function for camera reports
function drawProfessionalLabel(ctx, { x1, y1, y2, label, confidence, scorePerc, detectionIndex, color, canvasWidth, canvasHeight, boxWidth, boxHeight }) {
  // Adaptive font sizing
  const baseFontSize = Math.max(10, Math.min(14, Math.min(boxWidth / 6, boxHeight / 4)));
  const confFontSize = baseFontSize * 0.9;
  
  // Use professional font stack
  ctx.font = `bold ${baseFontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';
  
  const mainText = label.charAt(0).toUpperCase() + label.slice(1);
  const confText = `${scorePerc}%`;
  
  const mainTextMetrics = ctx.measureText(mainText);
  const confTextMetrics = ctx.measureText(confText);
  
  const labelPadding = Math.max(6, baseFontSize * 0.5);
  const labelSpacing = Math.max(6, baseFontSize * 0.4);
  const totalLabelWidth = mainTextMetrics.width + confTextMetrics.width + labelPadding * 2 + labelSpacing;
  const labelHeight = Math.max(20, baseFontSize * 1.8);
  
  // Smart label positioning
  let labelX = Math.max(2, Math.min(x1, canvasWidth - totalLabelWidth - 2));
  let labelY = y1 - labelHeight - 6;
  
  // If no space above, position below
  if (labelY < 0) {
    if (y2 + labelHeight + 6 <= canvasHeight) {
      labelY = y2 + 6;
    } else if (boxHeight > labelHeight + 12) {
      labelY = y1 + 6;
    } else {
      labelY = Math.max(2, canvasHeight - labelHeight - 2);
    }
  }
  
  // Enhanced background with gradient
  ctx.globalAlpha = Math.min(0.95, 0.85 + confidence * 0.1);
  
  const bgGradient = ctx.createLinearGradient(labelX, labelY, labelX, labelY + labelHeight);
  bgGradient.addColorStop(0, color);
  bgGradient.addColorStop(1, adjustColorBrightness(color, -0.2));
  ctx.fillStyle = bgGradient;
  
  // Draw rounded rectangle background
  drawRoundedRect(ctx, labelX, labelY, totalLabelWidth, labelHeight, 6);
  
  // Text rendering with shadow
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = getContrastColor(color);
  ctx.textBaseline = 'middle';
  
  // Text shadow for readability
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  
  // Main label text
  ctx.font = `bold ${baseFontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText(mainText, labelX + labelPadding, labelY + labelHeight / 2);
  
  // Confidence percentage
  ctx.font = `${confFontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = adjustColorBrightness(getContrastColor(color), -0.1);
  ctx.fillText(confText, labelX + labelPadding + mainTextMetrics.width + labelSpacing, labelY + labelHeight / 2);
  
  // Clear shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
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

// Function to get current location
async function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      () => {
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  });
}




// Function to convert center-based box to corner-based
function centerToCornerBox(box) {
  const x = box.x - box.width / 2;
  const y = box.y - box.height / 2;
  return { x, y, width: box.width, height: box.height };
}

// Function to monitor memory usage
function monitorMemoryUsage() {
  if (performance.memory) {
    const usedJSHeapSize = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
    const totalJSHeapSize = (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
    console.log(`🧠 Memory: ${usedJSHeapSize}MB / ${totalJSHeapSize}MB`);
  }
}

// Function to record a frame has been processed
function recordFrameProcessed() {
  detectionSession.totalFrames++;
}

// Function to add a detection to the session
function addDetectionToSession(detection, canvas) {
  const now = Date.now();
  
  detection.hazards.forEach(hazard => {
    detectionSession.detectionCount++;
    detectionSession.confidenceSum += hazard.confidence;
    detectionSession.uniqueHazards.add(hazard.class);
    
    detectionSession.detections.push({
      type: hazard.class,
      confidence: hazard.confidence,
      timestamp: now,
      bbox: hazard.bbox
    });
  });
}

// Function to end the detection session
async function endDetectionSession() {
  const sessionDuration = Date.now() - detectionSession.startTime;
  const avgConfidence = detectionSession.detectionCount > 0 ? 
    detectionSession.confidenceSum / detectionSession.detectionCount : 0;
  
  const summary = {
    duration: sessionDuration,
    totalDetections: detectionSession.detectionCount,
    uniqueHazards: Array.from(detectionSession.uniqueHazards),
    avgConfidence: avgConfidence,
    savedReports: detectionSession.savedReports
  };
  
  // Reset session
  detectionSession = {
    startTime: Date.now(),
    detections: [],
    totalFrames: 0,
    detectionFrames: 0,
    uniqueHazards: new Set(),
    savedReports: 0,
    confidenceSum: 0,
    detectionCount: 0
  };
  
  return summary;
}

// Function to update the session summary modal
function updateSessionSummaryModal() {
  // This function is called when the modal is shown, so we can assume the elements exist
  updateDetectionSessionSummary();
  updateRecentDetectionsList();
}

/**
 * Update auto-reporting status in UI
 * @param {Object} result - Auto-reporting processing result
 */
function updateAutoReportingStatus(result) {
  // Update any auto-reporting status indicators in the UI
  if (result.reportsCreated > 0) {
    // Show subtle indicator that auto-reports were created
    const statusIndicator = document.querySelector('.status-indicator .status-dot');
    if (statusIndicator) {
      statusIndicator.style.backgroundColor = '#28a745'; // Green for successful auto-report
      setTimeout(() => {
        statusIndicator.style.backgroundColor = ''; // Reset after 2 seconds
      }, 2000);
    }
    
    // Update detection session summary to include auto-report count
    detectionSession.autoReportsCreated = (detectionSession.autoReportsCreated || 0) + result.reportsCreated;
  }
}