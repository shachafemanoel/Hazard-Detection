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
  timeout: 10000, // Increased timeout for Railway
  retryAttempts: 3,
  retryDelay: 1000
};

const DEFAULT_SIZE = 320;
const pendingDetections = [];
const classNames = ['Alligator Crack', 'Block Crack', 'Construction Joint Crack', 'Crosswalk Blur', 'Lane Blur', 'Longitudinal Crack', 'Manhole', 'Patch Repair', 'Pothole', 'Transverse Crack', 'Wheel Mark Crack'];

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
let confidenceSlider, confidenceValue, settingsPanel, hazardModal, detectionModeInfo;

// Offscreen canvas for processing (will be resized based on model)
const offscreen = document.createElement("canvas");
const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

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
  hazardModal = document.getElementById("hazard-alert-modal");
  detectionModeInfo = document.getElementById("detection-mode-info");

  // Validate required elements
  if (!video || !canvas || !startButton || !stopButton) {
    console.error('Missing required DOM elements for camera detection');
    return;
  }

  ctx = canvas.getContext("2d");

  // Set up event listeners
  setupEventListeners();
  
  // Add window resize listener to update canvas scaling
  window.addEventListener('resize', debounce(updateCanvasSize, 100));
  
  // Initialize detection (API or local model)
  initializeDetection();
  
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
      saveSessionButton.disabled = detectionSession.detectionCount === 0;
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
    const health = await checkHealth(); // aligned with spec: GET /health
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
        
        // Use 480x480 as indicated by the error message
        cameraState.modelInputSize = 640;
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
        width: { ideal: 640 }, 
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

async function detectionLoop() {
  if (!cameraState.detecting) return;
  
  const startTime = performance.now();
  let waitTime = 100; // Default wait time
  
  try {
    // Draw video frame first, even if no detections
    if (video.videoWidth && video.videoHeight) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    
    // Process frame
    const inputTensor = preprocessFrame();
    if (!inputTensor) {
      // Still draw video even if processing failed
      // Wait before next frame to sync with model processing speed
      setTimeout(() => {
        if (cameraState.detecting) {
          cameraState.animationFrameId = requestAnimationFrame(detectionLoop);
        }
      }, 33); // ~30 FPS max
      return;
    }
    
    let detections = [];
    
    if (cameraState.detectionMode === 'api') {
      // Use external API for detection
      detections = await runAPIDetection();
    } else {
      // Use local model for detection
      detections = await runLocalDetection(inputTensor);
    }
    
    if (!detections) {
      console.warn('⚠️ No detections received');
      cameraState.animationFrameId = requestAnimationFrame(detectionLoop);
      return;
    }
    
    console.log(`✅ Received ${detections.length} detections from ${cameraState.detectionMode} mode`);
    
    // Draw detections on overlay canvas
    drawDetections(detections);
    
    // Log detection summary every 30 frames
    if (cameraState.frameCount % 30 === 0 && detections.length > 0) {
      const avgConf = detections.reduce((sum, d) => sum + d.score, 0) / detections.length;
      console.log(`🎯 Frame ${cameraState.frameCount}: ${detections.length} detections, avg confidence: ${(avgConf * 100).toFixed(1)}%`);
    }
    
    // Log processing speed every 60 frames (will be calculated at the end)
    if (cameraState.frameCount % 60 === 0) {
      const currentProcessingTime = performance.now() - startTime;
      console.log(`📊 Processing: ${currentProcessingTime.toFixed(1)}ms per frame, effective FPS: ${(1000/Math.max(currentProcessingTime, 100)).toFixed(1)}`);
    }
    
    // Update session tracking
    detectionSession.totalFrames++;
    if (detections.length > 0) {
      detectionSession.detectionFrames++;
      
      // Add detections to session
      detections.forEach(detection => {
        const label = classNames[detection.classId] || `Class ${detection.classId}`;
        addDetectionToSession({
          type: label,
          confidence: detection.score,
          coordinates: detection,
          frame: cameraState.frameCount
        });
      });
      
      // Update session summary
      updateDetectionSessionSummary();
    }
    
    // Update UI
    updateDetectionCount(detections.length);
    updateHazardTypes(detections);
    updateFPS();
    
    // Save significant detections every 3 seconds (90 frames at 30 FPS)
    if (detections.length > 0 && cameraState.frameCount % 90 === 0) {
      await saveDetections(detections);
    }
    
    cameraState.frameCount++;
    
    // Calculate processing time and sync with model speed
    const processingTime = performance.now() - startTime;
    const minFrameTime = 100; // Minimum 100ms between frames (max 10 FPS)
    waitTime = Math.max(0, minFrameTime - processingTime);
    
  } catch (err) {
    console.error("❌ Error in detection loop:", err);
    // Keep default wait time in case of error
    waitTime = 100;
  }
  
  // Schedule next frame with appropriate delay
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
  
  // Get image data and convert to tensor
  const imageData = offCtx.getImageData(0, 0, inputSize, inputSize);
  const data = new Float32Array(3 * inputSize * inputSize);
  
  // Convert RGBA to RGB and normalize to [0, 1]
  for (let i = 0; i < imageData.data.length; i += 4) {
    const pixelIndex = i / 4;
    const r = imageData.data[i] / 255.0;
    const g = imageData.data[i + 1] / 255.0;
    const b = imageData.data[i + 2] / 255.0;
    
    // Pack in CHW format (channels, height, width)
    data[pixelIndex] = r;                                    // R channel
    data[pixelIndex + inputSize * inputSize] = g;           // G channel
    data[pixelIndex + 2 * inputSize * inputSize] = b;       // B channel
  }
  
  console.log(`🎯 Preprocessed frame: ${inputSize}x${inputSize}, tensor shape: [1, 3, ${inputSize}, ${inputSize}]`);
  
  return new ort.Tensor('float32', data, [1, 3, inputSize, inputSize]);
}

function drawDetections(detections) {
  // Clear previous detections and draw current video frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Ensure video is ready and has valid dimensions
  if (!video.videoWidth || !video.videoHeight) {
    console.warn('⚠️ Video not ready for drawing');
    return;
  }
  
  // Draw the current video frame as background
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch (error) {
    console.error('❌ Failed to draw video to canvas:', error);
    return;
  }
  
  if (detections.length === 0) {
    // Draw a test indicator when no detections
    ctx.save();
    ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.fillRect(10, 10, 100, 30);
    ctx.fillStyle = '#00FF00';
    ctx.font = '14px Arial';
    ctx.fillText('No detections', 15, 30);
    ctx.restore();
    return;
  }
  
  console.log(`🔍 Drawing ${detections.length} detections`);
  
  // Draw test indicator when we have detections
  ctx.save();
  ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.fillRect(10, 50, 150, 30);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '14px Arial';
  ctx.fillText(`${detections.length} detections`, 15, 70);
  ctx.restore();
  
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
  
  detections.forEach((detection, index) => {
    const { x1, y1, x2, y2, score, classId } = detection;
    
    // Coordinate transformation depends on detection source
    let canvasX1, canvasY1, canvasX2, canvasY2;
    
    if (cameraState.detectionMode === 'api') {
      // API returns coordinates in original image space, scale to canvas
      canvasX1 = x1 * coordinateScale.videoToDisplayX;
      canvasY1 = y1 * coordinateScale.videoToDisplayY;
      canvasX2 = x2 * coordinateScale.videoToDisplayX;
      canvasY2 = y2 * coordinateScale.videoToDisplayY;
    } else {
      // Local model returns coordinates in model input space, scale to canvas  
      canvasX1 = x1 * coordinateScale.modelToDisplayX;
      canvasY1 = y1 * coordinateScale.modelToDisplayY;
      canvasX2 = x2 * coordinateScale.modelToDisplayX;
      canvasY2 = y2 * coordinateScale.modelToDisplayY;
    }
    
    const width = canvasX2 - canvasX1;
    const height = canvasY2 - canvasY1;
    
    const coordSource = cameraState.detectionMode === 'api' ? 'image' : 'model';
    console.log(`📦 Detection ${index}: ${coordSource}(${x1.toFixed(1)},${y1.toFixed(1)}) → canvas(${canvasX1.toFixed(1)},${canvasY1.toFixed(1)}) size=${width.toFixed(1)}x${height.toFixed(1)}`);
    
    // Debug: Always draw first few detections for testing
    const isDebugMode = index < 3; // Show first 3 detections for debugging
    
    // Skip detections that are too small or outside bounds (but not in debug mode)
    if (!isDebugMode && (width < 5 || height < 5 || canvasX1 < 0 || canvasY1 < 0 || canvasX2 > canvas.width || canvasY2 > canvas.height)) {
      console.warn(`⚠️ Skipping invalid detection: ${width.toFixed(1)}x${height.toFixed(1)} at (${canvasX1.toFixed(1)},${canvasY1.toFixed(1)})`);
      return;
    }
    
    // Ensure detection is visible for debugging  
    if (isDebugMode && (width < 20 || height < 20)) {
      console.log(`🔍 Debug: Expanding small detection from ${width.toFixed(1)}x${height.toFixed(1)} to 20x20`);
      const centerX = (canvasX1 + canvasX2) / 2;
      const centerY = (canvasY1 + canvasY2) / 2;
      canvasX1 = centerX - 10;
      canvasY1 = centerY - 10;
      canvasX2 = centerX + 10;
      canvasY2 = centerY + 10;
    }
    
    const label = classNames[classId] || `Class ${classId}`;
    const color = hazardColors[label] || '#00FF00';
    
    // Draw professional bounding box  
    try {
      drawProfessionalBoundingBox(ctx, {
        x1: canvasX1,
        y1: canvasY1,
        x2: canvasX2,
        y2: canvasY2,
        label: label,
        confidence: score,
        detectionIndex: index + 1,
        color: color
      });
      
      console.log(`✅ Drew detection ${index + 1}: ${label} at (${canvasX1.toFixed(1)},${canvasY1.toFixed(1)})`);
    } catch (error) {
      console.error(`❌ Failed to draw professional box, using fallback:`, error);
      
      // Fallback: draw simple rectangle
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      ctx.strokeRect(canvasX1, canvasY1, canvasX2 - canvasX1, canvasY2 - canvasY1);
      
      // Simple label
      ctx.fillStyle = color;
      ctx.font = '14px Arial';
      ctx.fillText(`${label} ${(score * 100).toFixed(0)}%`, canvasX1, canvasY1 - 5);
      ctx.restore();
      
      console.log(`✅ Drew fallback detection ${index + 1}: ${label}`);
    }
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

function updateHazardTypes(detections) {
  if (!hazardTypesDisplay || !hazardTypesList) return;
  
  if (detections.length === 0) {
    hideHazardTypes();
    return;
  }
  
  const uniqueTypes = [...new Set(detections.map(d => classNames[d.classId] || `Class ${d.classId}`))];
  hazardTypesList.textContent = uniqueTypes.join(', ');
  hazardTypesDisplay.hidden = false;
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
      avgConfidence: detectionSession.confidenceSum / detectionSession.detectionCount,
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
  const scorePerc = (confidence * 100).toFixed(1);
  
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
    
    // Use video dimensions for better quality (not the model input size)
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    
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