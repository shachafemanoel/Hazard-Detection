// camera_detection.js - Refactored for camera.html
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { storage } from "./firebaseConfig.js";
import { setApiUrl, checkHealth, startSession, detectHazards } from './apiClient.js';

// Global state
let cameraState = {
  stream: null,
  detecting: false,
  session: null,
  frameCount: 0,
  lastFrameTime: 0,
  animationFrameId: null,
  confidenceThreshold: 0.5,
  modelInputSize: 320, // Will be detected from model
  detectionMode: 'api', // 'api' or 'local'
  apiSessionId: null,
  apiAvailable: false
};

// External API configuration - Railway Production
const API_CONFIG = {
  baseUrl: 'https://hazard-api-production-production.up.railway.app',
  // Separate timeout for detection requests and health checks
  timeout: 10000, // Increased timeout for Railway
  healthTimeout: 5000,
  retryAttempts: 3,
  retryDelay: 1000
};

const DEFAULT_SIZE = 320;
const pendingDetections = [];
const classNames = ['crack', 'knocked', 'pothole', 'surface damage']; // Updated for best0408 model

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
const DETECTION_LIFETIME = 2000; // Detections stay on screen for 2 seconds
let detectedObjectCount = 0;
let uniqueHazardTypes = new Set();

// Global state for alert
let lastHazardAlertTime = 0;
const HAZARD_ALERT_COOLDOWN = 5000; // 5 seconds cooldown



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
    saveSessionButton.addEventListener('click', saveSessionReport);
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
    startButton.disabled = false;
    console.log('✅ Using external API for detection');
    return true;
  } else {
    console.log('⚠️ External API not available, falling back to local model');
    cameraState.detectionMode = 'local';
    cameraState.apiAvailable = false;
    updateDetectionModeInfo('local');
    return await loadLocalModel();
  }
}

async function checkAPIAvailability() {
  try {
    setApiUrl(API_CONFIG.baseUrl);
    const health = await checkHealth(API_CONFIG.healthTimeout); // aligned with spec: GET /health
    if (health.status === 'healthy') {
      updateDetectionModeInfo('api');
      return true;
    }
    console.warn('❌ API health check returned non-healthy status:', health.status);
    return false;
  } catch (error) {
    console.warn('❌ API health check failed:', error.message);
    return false;
  }
}

async function startAPISession() {
  try {
    cameraState.apiSessionId = await startSession(); // aligned with spec: POST /session/start
    console.log('📋 API Session created:', cameraState.apiSessionId);
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
      'object_detection_model/best0408.onnx'
    ];

    let loaded = false;
    for (const path of modelPaths) {
      console.log(`🔍 Attempting to load model from: ${path}`);
      try {
        // Check if ONNX Runtime is available
        if (typeof ort === 'undefined') {
          console.error('❌ ONNX Runtime (ort) is not available');
          throw new Error('ONNX Runtime not loaded');
        }
        
        console.log('✅ ONNX Runtime available, checking model file...');
        
        // Check if model exists
        const headResp = await fetch(path, { method: 'HEAD' });
        console.log(`📡 HEAD request response: ${headResp.status} ${headResp.statusText}`);
        
        if (!headResp.ok) {
          console.warn(`❌ Model not found at ${path} (status: ${headResp.status})`);
          continue;
        }

        const contentLength = headResp.headers.get('Content-Length');
        console.log(`📦 Model found (size: ${contentLength || 'unknown'} bytes)`);

        console.log('🔄 Creating ONNX inference session...');
        
        // Create session with only WASM provider to avoid WebGL issues
        cameraState.session = await ort.InferenceSession.create(path, { 
          executionProviders: ['wasm'] 
        });
        
        console.log('✅ ONNX session created successfully');

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
  
  // Check if detection system is ready
  if (cameraState.detectionMode === 'local' && !cameraState.session) {
    console.warn("Local model not loaded yet.");
    if (typeof notify === "function") {
      notify("Local model not loaded. Cannot start detection.", "warning");
    }
    return;
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
      // Set canvas to match video DISPLAY dimensions (not video source dimensions)
      const videoRect = video.getBoundingClientRect();
      canvas.width = videoRect.width;
      canvas.height = videoRect.height;
      
      // Also update canvas style to match exactly
      canvas.style.width = videoRect.width + 'px';
      canvas.style.height = videoRect.height + 'px';
      
      console.log(`📐 Video source dimensions: ${video.videoWidth}x${video.videoHeight}`);
      console.log(`📐 Video display dimensions: ${videoRect.width}x${videoRect.height}`);
      console.log(`📐 Canvas dimensions: ${canvas.width}x${canvas.height}`);
      console.log(`📐 Model input size: ${cameraState.modelInputSize}x${cameraState.modelInputSize}`);
      
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
  
  // Calculate scaling from model input size to canvas display size
  coordinateScale.modelToDisplayX = canvas.width / cameraState.modelInputSize;
  coordinateScale.modelToDisplayY = canvas.height / cameraState.modelInputSize;
  
  // Calculate scaling from video source to canvas display size  
  coordinateScale.videoToDisplayX = canvas.width / video.videoWidth;
  coordinateScale.videoToDisplayY = canvas.height / video.videoHeight;
  
  console.log(`📏 Coordinate scaling:`, {
    modelToDisplay: `${coordinateScale.modelToDisplayX.toFixed(3)}x, ${coordinateScale.modelToDisplayY.toFixed(3)}y`,
    videoToDisplay: `${coordinateScale.videoToDisplayX.toFixed(3)}x, ${coordinateScale.videoToDisplayY.toFixed(3)}y`,
    modelSize: `${cameraState.modelInputSize}x${cameraState.modelInputSize}`,
    videoSize: `${video.videoWidth}x${video.videoHeight}`,
    displaySize: `${canvas.width}x${canvas.height}`
  });
}

function updateCanvasSize() {
  if (!cameraState.detecting || !video.videoWidth || !video.videoHeight) {
    return;
  }
  
  // Get video element's current display size
  const videoRect = video.getBoundingClientRect();
  
  // Update canvas dimensions to match video display
  const newWidth = Math.floor(videoRect.width);
  const newHeight = Math.floor(videoRect.height);
  
  if (canvas.width !== newWidth || canvas.height !== newHeight) {
    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.style.width = newWidth + 'px';
    canvas.style.height = newHeight + 'px';
    
    // Update coordinate scaling
    updateCoordinateScaling();
    
    console.log(`📐 Canvas resized to ${newWidth}x${newHeight} to match video display`);
  }
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

function stopCamera() {
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
  captureButton.hidden = true;
  
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
  persistentDetections = persistentDetections.filter(d => (now - d.timestamp) < DETECTION_LIFETIME);
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

    const startTime = performance.now();
    let waitTime = 100;

    try {
        const inputTensor = preprocessFrame();
        if (!inputTensor) {
            waitTime = 33;
            setTimeout(() => {
                if (cameraState.detecting) {
                    cameraState.animationFrameId = requestAnimationFrame(detectionLoop);
                }
            }, waitTime);
            return;
        }

        let detections = [];
        if (cameraState.detectionMode === 'api') {
            detections = await runAPIDetection();
        } else {
            detections = await runLocalDetection(inputTensor);
        }

        if (!cameraState.detecting) {
            return;
        }

        updatePersistentDetections(detections || []);
        detectedObjectCount = persistentDetections.length;
        updateUniqueHazardTypesFromPersistent();
        drawPersistentDetections();

        if (cameraState.frameCount % 30 === 0 && detections && detections.length > 0) {
            const avgConf = detections.reduce((sum, d) => sum + d.score, 0) / detections.length;
            console.log(`🎯 Frame ${cameraState.frameCount}: ${detections.length} new, ${persistentDetections.length} persistent. Avg conf: ${(avgConf * 100).toFixed(1)}%`);
        }

        detectionSession.totalFrames++;
        if (detections && detections.length > 0) {
            detectionSession.detectionFrames++;
            detections.forEach(detection => {
                const label = classNames[detection.classId] || `Class ${detection.classId}`;
                addDetectionToSession({ type: label, confidence: detection.score, coordinates: detection, frame: cameraState.frameCount });
            });
            updateDetectionSessionSummary();
        }

        updateDetectionCount(detectedObjectCount);
        updateFPS();

        if (detections && detections.length > 0 && cameraState.frameCount % 90 === 0) {
            await saveDetections(detections);
        }

        cameraState.frameCount++;
        const processingTime = performance.now() - startTime;
        waitTime = Math.max(0, 100 - processingTime);

    } catch (err) {
        console.error("❌ Error in detection loop:", err);
        waitTime = 100;
    }

    setTimeout(() => {
        if (cameraState.detecting) {
            cameraState.animationFrameId = requestAnimationFrame(detectionLoop);
        }
    }, waitTime);
}


function preprocessFrame() {
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

  return new ort.Tensor('float32', data, [1, 3, inputSize, inputSize]);
}

function drawPersistentDetections() {
    if (!video.videoWidth || !video.videoHeight) {
        console.warn('⚠️ Video not ready for drawing, skipping persistent draw.');
        return;
    }

    try {
        if (cameraState.detecting) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
    } catch (error) {
        console.error('❌ Failed to draw video to canvas:', error);
        return;
    }

    const hazardColors = {
        'Alligator Crack': '#FF4444',
        'Block Crack': '#FF6600',
        'Construction Joint Crack': '#FF8844',
        'Crosswalk Blur': '#4444FF',
        'Lane Blur': '#6644FF',
        'Longitudinal Crack': '#FF8844',
        'Manhole': '#888888',
        'Patch Repair': '#44FF88',
        'Pothole': '#FF0088',
        'Transverse Crack': '#FFAA44',
        'Wheel Mark Crack': '#AA4444'
    };

    persistentDetections.forEach((detection, index) => {
        const { x1, y1, x2, y2, score, classId } = detection;
        let canvasX1, canvasY1, canvasX2, canvasY2;

        if (cameraState.detectionMode === 'api') {
            canvasX1 = x1 * coordinateScale.videoToDisplayX;
            canvasY1 = y1 * coordinateScale.videoToDisplayY;
            canvasX2 = x2 * coordinateScale.videoToDisplayX;
            canvasY2 = y2 * coordinateScale.videoToDisplayY;
        } else {
            canvasX1 = x1 * coordinateScale.modelToDisplayX;
            canvasY1 = y1 * coordinateScale.modelToDisplayY;
            canvasX2 = x2 * coordinateScale.modelToDisplayX;
            canvasY2 = y2 * coordinateScale.modelToDisplayY;
        }

        const label = classNames[classId] || `Class ${classId}`;
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

function updateDetectionModeInfo(mode) {
  if (!detectionModeInfo) return;
  
  if (mode === 'api') {
    detectionModeInfo.innerHTML = '🌐 Cloud AI';
    detectionModeInfo.style.color = '#00ff88';
  } else if (mode === 'local') {
    detectionModeInfo.innerHTML = '💻 Local Model';
    detectionModeInfo.style.color = '#ffa500';
  } else {
    detectionModeInfo.innerHTML = 'Initializing...';
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
        type: classNames[d.classId] || `Class ${d.classId}`,
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
      const response = await fetch("/api/upload", {
        method: "POST",
        body: detection.formData,
        credentials: "include"
      });
      
      if (response.ok) {
        const result = await response.json();
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
    const response = await fetch('/api/session-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionSummary),
      credentials: 'include'
    });
    
    if (response.ok) {
      const result = await response.json();
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
  
  const boxW = x2 - x1;
  const boxH = y2 - y1;
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
  ctx.strokeRect(x1, y1, boxW, boxH);
  
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
  ctx.fillRect(x1 - cornerThickness, y1 - cornerThickness, cornerLength, cornerThickness);
  ctx.fillRect(x1 - cornerThickness, y1 - cornerThickness, cornerThickness, cornerLength);
  
  // Top-right corner
  ctx.fillRect(x2 - cornerLength + cornerThickness, y1 - cornerThickness, cornerLength, cornerThickness);
  ctx.fillRect(x2, y1 - cornerThickness, cornerThickness, cornerLength);
  
  // Bottom-left corner
  ctx.fillRect(x1 - cornerThickness, y2, cornerLength, cornerThickness);
  ctx.fillRect(x1 - cornerThickness, y2 - cornerLength + cornerThickness, cornerThickness, cornerLength);
  
  // Bottom-right corner
  ctx.fillRect(x2 - cornerLength + cornerThickness, y2, cornerLength, cornerThickness);
  ctx.fillRect(x2, y2 - cornerLength + cornerThickness, cornerThickness, cornerLength);
  
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
  let labelX = x1;
  let labelY = y1 - labelHeight - 4;
  
  // Adjust if label goes outside canvas bounds
  if (labelX + totalLabelWidth > canvas.width) {
    labelX = canvas.width - totalLabelWidth - 4;
  }
  if (labelY < 0) {
    labelY = y2 + 4;
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

// Function to add detection to session
function addDetectionToSession(detection) {
  detectionSession.detections.push({
    ...detection,
    timestamp: Date.now(),
    id: Date.now() + Math.random()
  });
  detectionSession.detectionCount++;
  detectionSession.uniqueHazards.add(detection.type);
  detectionSession.confidenceSum += detection.confidence;
}

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
    ); // aligned with spec: POST /detect/{session_id}, multipart/form-data, field name "file"
    
    cameraState.apiAvailable = true;
    
    // Validate API response
    if (!result || typeof result !== 'object') {
      console.warn('⚠️ Invalid API response format:', result);
      return [];
    }
    
    // Check for detections array
    const detections = result.detections || [];
    console.log(`🔍 API returned ${detections.length} detections`);
    
    return parseAPIDetections(detections);
  } catch (error) {
    console.error('❌ API detection attempt failed:', error.message);
    cameraState.apiAvailable = false;
    cameraState.detectionMode = 'local';
    updateDetectionModeInfo('local');
    updateStatus('API error - switched to local model');
    if (!cameraState.session) {
      await loadLocalModel();
    }
    // Return empty array instead of throwing to prevent endless error loop
    return [];
  }
}

async function runLocalDetection(inputTensor) {
  try {
    // Run inference - use the actual input name from the model
    const inputName = cameraState.session.inputNames[0];
    const feeds = {};
    feeds[inputName] = inputTensor;
    console.log(`🔄 Running local inference with input: ${inputName}`);
    const results = await cameraState.session.run(feeds);
    
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
      
      // Skip low confidence detections
      if (score < cameraState.confidenceThreshold) {
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
      
      const detection = {
        x1: Math.max(0, Math.min(x1, cameraState.modelInputSize)),
        y1: Math.max(0, Math.min(y1, cameraState.modelInputSize)),
        x2: Math.max(0, Math.min(x2, cameraState.modelInputSize)),
        y2: Math.max(0, Math.min(y2, cameraState.modelInputSize)),
        score: score,
        classId: Math.max(0, Math.min(Math.floor(classId), classNames.length - 1))
      };
      
      detections.push(detection);
      
      // Log first few detections for debugging
      if (detections.length <= 3) {
        console.log(`📦 Detection ${detections.length}: (${detection.x1.toFixed(1)}, ${detection.y1.toFixed(1)}, ${detection.x2.toFixed(1)}, ${detection.y2.toFixed(1)}) conf=${score.toFixed(3)} class=${detection.classId}`);
      }
    }
    
    console.log(`✅ Parsed ${detections.length} valid local detections`);
    return detections;
    
  } catch (error) {
    console.error('❌ Local detection failed:', error);
    return [];
  }
}

function parseAPIDetections(apiDetections) {
  const detections = [];
  
  if (!Array.isArray(apiDetections)) {
    console.warn('⚠️ API detections is not an array:', apiDetections);
    return [];
  }
  
  for (const detection of apiDetections) {
    if (!detection) {
      console.warn('⚠️ Empty detection object, skipping');
      continue;
    }
    
    // Handle the API response format: bbox array [x1, y1, x2, y2]
    let x1, y1, x2, y2, score, classId;
    
    if (detection.bbox && Array.isArray(detection.bbox) && detection.bbox.length >= 4) {
      // API format: {bbox: [x1, y1, x2, y2], confidence: score, class_id: id}
      [x1, y1, x2, y2] = detection.bbox;
      score = detection.confidence;
      classId = detection.class_id;
    } else if (detection.x1 !== undefined && detection.y1 !== undefined) {
      // Alternative format: {x1, y1, x2, y2, score, classId}
      x1 = detection.x1;
      y1 = detection.y1;
      x2 = detection.x2;
      y2 = detection.y2;
      score = detection.score || detection.confidence;
      classId = detection.classId || detection.class_id;
    } else {
      console.warn('⚠️ Unrecognized detection format:', detection);
      continue;
    }
    
    const parsed = {
      x1: parseFloat(x1),
      y1: parseFloat(y1),
      x2: parseFloat(x2),
      y2: parseFloat(y2),
      score: parseFloat(score),
      classId: parseInt(classId || 0)
    };
    
    // Validate and filter
    if (parsed.score >= cameraState.confidenceThreshold &&
        parsed.x1 < parsed.x2 && parsed.y1 < parsed.y2) {
      detections.push(parsed);
    }
  }
  
  console.log(`📝 Parsed ${detections.length} API detections`);
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