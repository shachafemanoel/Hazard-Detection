// Enhanced Camera Detection System with Hybrid ONNX + API Detection

document.addEventListener("DOMContentLoaded", async () => {
  // DOM Elements
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
  const switchCameraBtn = document.getElementById("switch-camera");
  const settingsBtn = document.getElementById("settings-btn");
  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext("2d");
  const sensitivitySlider = document.getElementById("sensitivity-slider");
  const settingsPanel = document.getElementById("settings-panel");
  const loadingOverlay = document.getElementById("loading-overlay");
  
  // Status and stats elements
  const connectionStatus = document.getElementById("connection-status");
  const loadingStatus = document.getElementById("loading-status");
  const loadingProgressBar = document.getElementById("loading-progress-bar");
  const fpsDisplay = document.getElementById("fps-display");
  const processingTime = document.getElementById("processing-time");
  const frameCountDisplay = document.getElementById("frame-count");
  const currentDetections = document.getElementById("current-detections");
  const sessionDetections = document.getElementById("session-detections");
  const hazardTypesList = document.getElementById("hazard-types-list");
  const detectionCountBadge = document.getElementById("detection-count-badge");
  const fpsBadge = document.getElementById("fps-badge");

  // Summary modal elements
  const summaryModal = new bootstrap.Modal(document.getElementById('summaryModal'));
  const exportSummaryBtn = document.getElementById("export-summary");
  const viewDashboardBtn = document.getElementById("view-dashboard");
  const totalDetectionsCount = document.getElementById("total-detections-count");
  const sessionDurationDisplay = document.getElementById("session-duration");
  const uniqueHazardsCount = document.getElementById("unique-hazards-count");
  const detectionsGrid = document.getElementById("detections-grid");
  const savedReportsList = document.getElementById("saved-reports-list");

  // Constants
  const FIXED_SIZE = 480;
  const API_HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
  const SESSION_UPDATE_INTERVAL = 1000; // 1 second
  const DEFAULT_SAVE_INTERVAL = 120; // frames
  const PERFORMANCE_UPDATE_INTERVAL = 1000; // 1 second

  // Road Damage Classes
  const CLASS_NAMES = [
    'Alligator Crack', 'Block Crack', 'Crosswalk Blur', 'Lane Blur',
    'Longitudinal Crack', 'Manhole', 'Patch Repair', 'Pothole',
    'Transverse Crack', 'Wheel Mark Crack'
  ];

  // Camera Detection Session Tracking
  let cameraSession = {
    startTime: null,
    detections: [],
    totalDetections: 0,
    uniqueHazards: new Set(),
    isActive: false
  };
  
  // Function to start camera session
  function startCameraSession() {
    cameraSession = {
      startTime: Date.now(),
      detections: [],
      totalDetections: 0,
      uniqueHazards: new Set(),
      isActive: true
    };
    updateCameraSessionDisplay();
  }
  
  // Function to end camera session
  function endCameraSession() {
    cameraSession.isActive = false;
    // Show final summary
    if (cameraSession.totalDetections > 0) {
      setTimeout(() => showCameraSessionSummary(), 1000);
    }
  }
  
  // Function to add detection to camera session
  function addCameraDetection(detection) {
    if (!cameraSession.isActive) return;
    
    cameraSession.detections.push({
      ...detection,
      timestamp: Date.now(),
      id: Date.now() + Math.random()
    });
    cameraSession.totalDetections++;
    cameraSession.uniqueHazards.add(detection.type);
    updateCameraSessionDisplay();
  }
  
  // Function to update camera session display
  function updateCameraSessionDisplay() {
    if (!cameraSession.startTime) return;
    
    const sessionDuration = Date.now() - cameraSession.startTime;
    const durationMinutes = Math.floor(sessionDuration / 60000);
    const durationSeconds = Math.floor((sessionDuration % 60000) / 1000);
    
    // Update session displays in camera interface
    const sessionTotalEl = document.getElementById('camera-session-total');
    const sessionDurationEl = document.getElementById('camera-session-duration');
    const sessionTypesEl = document.getElementById('camera-session-types');
    
    if (sessionTotalEl) sessionTotalEl.textContent = cameraSession.totalDetections;
    if (sessionDurationEl) sessionDurationEl.textContent = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;
    if (sessionTypesEl) sessionTypesEl.textContent = cameraSession.uniqueHazards.size;
  }
  
  // Function to show camera session summary
  function showCameraSessionSummary() {
    updateSummaryData();
    summaryModal.show();
  }

  function hideSummaryModal() {
    summaryModal.hide();
  }
  
  // Start periodic camera session updates
  setInterval(() => {
    if (cameraSession.isActive) {
      updateCameraSessionDisplay();
    }
  }, 1000); // Update every second
  
  // Periodic API health check to detect when model becomes ready
  setInterval(async () => {
    if (apiAvailable && useApi && detecting) {
      try {
        const isHealthy = await window.testApiConnection();
        if (isHealthy) {
          console.log("✅ Periodic health check passed");
          // Reset failure count when model becomes ready
          if (window.apiFailureCount > 0) {
            window.apiFailureCount = 0;
            console.log("🔄 Model ready - resetting API failure count");
          }
        }
      } catch (error) {
        // Silently ignore health check failures during periodic checks
      }
    }
  }, 10000); // Check every 10 seconds
  
  // Function to determine optimal video constraints based on screen and device
  async function getOptimalVideoConstraints() {
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Detect device type and capabilities
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = /(iPad|tablet|playbook|silk)|(android(?!.*mobi))/i.test(navigator.userAgent);
    
    // Calculate optimal resolution based on screen size and device type
    let idealWidth, idealHeight, maxWidth, maxHeight;
    
    if (isMobile && !isTablet) {
      // Mobile phones - optimize for performance
      idealWidth = Math.min(640, screenWidth * devicePixelRatio * 0.8);
      idealHeight = Math.min(480, screenHeight * devicePixelRatio * 0.6);
      maxWidth = 1280;
      maxHeight = 720;
    } else if (isTablet) {
      // Tablets - balance quality and performance
      idealWidth = Math.min(1280, screenWidth * devicePixelRatio * 0.7);
      idealHeight = Math.min(720, screenHeight * devicePixelRatio * 0.5);
      maxWidth = 1920;
      maxHeight = 1080;
    } else {
      // Desktop/laptop - prioritize quality
      idealWidth = Math.min(1920, screenWidth * 0.8);
      idealHeight = Math.min(1080, screenHeight * 0.6);
      maxWidth = 3840; // 4K support
      maxHeight = 2160;
    }
    
    // Test camera capabilities to find best supported resolution
    const testConstraints = {
      video: {
        width: { ideal: idealWidth, max: maxWidth },
        height: { ideal: idealHeight, max: maxHeight },
        facingMode: currentCamera,
        frameRate: { ideal: 30, max: 60 }
      }
    };
    
    try {
      // Test if the device supports the ideal constraints
      const testStream = await navigator.mediaDevices.getUserMedia(testConstraints);
      const videoTrack = testStream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      
      // Stop test stream immediately
      testStream.getTracks().forEach(track => track.stop());
      
      console.log(`✅ Camera capabilities detected:`, {
        resolution: `${settings.width}x${settings.height}`,
        frameRate: settings.frameRate,
        deviceType: isMobile ? 'Mobile' : isTablet ? 'Tablet' : 'Desktop'
      });
      
      // Return optimized constraints based on actual capabilities
      return {
        video: {
          width: { ideal: settings.width, max: maxWidth },
          height: { ideal: settings.height, max: maxHeight },
          facingMode: currentCamera,
          frameRate: { ideal: Math.min(30, settings.frameRate || 30) }
        }
      };
    } catch (error) {
      console.warn('🔄 Camera capability test failed, using fallback constraints:', error);
      
      // Fallback to conservative constraints
      return {
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: currentCamera,
          frameRate: { ideal: 30 }
        }
      };
    }
  }
  
  // Function to handle different API error types and implement fallbacks
  function handleApiError(error) {
    const errorMessage = error.message || '';
    const modelLoadingErrors = ['model not loaded', 'Service may still be starting', 'Model is loading', 'Backend not ready', 'PyTorch model not loaded', 'OpenVino model not loaded', 'Model initialization'];
    const backendDependencyErrors = ['ExportOptions', 'torch.onnx._internal.exporter'];
    const imageFormatErrors = ['cvtColor', 'OpenCV'];
    const sessionErrors = ['Session', '404'];

    if (modelLoadingErrors.some(e => errorMessage.includes(e))) {
      console.warn('🚀 Backend model still loading - this is temporary during startup');
      showNotification('Backend model loading - will use when ready', 'info');
      updateConnectionStatus('connected', 'API Connected (Model Loading...)');
      return true;
    }

    if (backendDependencyErrors.some(e => errorMessage.includes(e))) {
      console.warn('🔧 PyTorch ONNX export error detected - this is a backend dependency issue');
      apiAvailable = false;
      useApi = false;
      showNotification('Backend model error detected - using local detection only', 'warning');
      updateConnectionStatus('warning', 'Local ONNX Detection (Backend Issue)');
      return true;
    }

    if (imageFormatErrors.some(e => errorMessage.includes(e))) {
      console.warn('🖼️ Image format error - adjusting image preprocessing');
      return false;
    }

    if (sessionErrors.some(e => errorMessage.includes(e))) {
      console.log('🔄 Session expired - will create new session');
      apiSessionId = null;
      return false;
    }

    return false;
  }
  
  // Make camera session functions globally available
  window.startCameraSession = startCameraSession;
  window.endCameraSession = endCameraSession;
  window.showCameraSessionSummary = showCameraSessionSummary;
  window.getOptimalVideoConstraints = getOptimalVideoConstraints;

  // Enhanced detection configuration for real-time processing (10 classes) - following upload.js patterns
  const DETECTION_CONFIG = {
    minConfidence: 0.4,           // Higher for real-time to reduce noise
    nmsThreshold: 0.5,            // Higher NMS for more classes
    maxDetections: 30,            // Lower limit for real-time performance
    minBoxSize: 6,                // Smaller for crack detection
    aspectRatioFilter: 25.0,      // Allow longer shapes for cracks/markings
    trackingEnabled: true,        // Enable object tracking
    confidenceDecayRate: 0.92,    // Slightly faster decay for more classes
    detectionInterval: 4,         // Process every 4th frame for performance
    // Class-specific minimum confidences for real-time
    classThresholds: {
      0: 0.35, // Alligator Crack - real-time adjusted
      1: 0.40, // Block Crack - standard
      2: 0.45, // Crosswalk Blur - higher (avoid false marking detections)
      3: 0.45, // Lane Blur - higher (avoid false marking detections)
      4: 0.35, // Longitudinal Crack - real-time adjusted
      5: 0.50, // Manhole - higher (avoid false infrastructure detections)
      6: 0.40, // Patch Repair - standard
      7: 0.35, // Pothole - clear damage, allow lower threshold
      8: 0.35, // Transverse Crack - real-time adjusted
      9: 0.40  // Wheel Mark Crack - standard
    }
  };

  // Enhanced color scheme for different road damage types
  const hazardColors = {
    'Alligator Crack': '#FF4444',    // Red - Critical structural damage
    'Block Crack': '#FF6600',        // Red-Orange - Significant cracking
    'Crosswalk Blur': '#4444FF',     // Blue - Safety marking issues
    'Lane Blur': '#6644FF',          // Purple - Traffic marking issues  
    'Longitudinal Crack': '#FF8844', // Orange - Directional cracking
    'Manhole': '#888888',            // Gray - Infrastructure elements
    'Patch Repair': '#44FF88',       // Green - Previous repairs
    'Pothole': '#FF0088',            // Pink - Critical surface damage
    'Transverse Crack': '#FFAA44',   // Light Orange - Cross cracking
    'Wheel Mark Crack': '#AA4444'    // Dark Red - Load-induced damage
  };

  // Detection state
  let stream = null;
  let detecting = false;
  let currentCamera = 'user'; // 'user' for front, 'environment' for back
  let session = null;
  let optimalConstraints = null; // Store optimal video constraints
  let apiSessionId = null; // Session ID for API detection
  let apiAvailable = false;
  let useApi = false; // Flag to control API usage
  let frameCount = 0;
  let detectionStats = {
    totalDetections: 0,
    sessionStart: Date.now(),
    frameProcessingTimes: [],
    detectedHazards: new Set()
  };

  let sessionDetectionsSummary = []; // Store detailed detection information for summary
  let savedImagesCount = 0; // Track number of saved images
  let DETECTION_SAVE_INTERVAL = 120; // Default save interval

  // Object tracking state
  let trackedObjects = new Map();
  let nextObjectId = 0;
  const INTERPOLATION_FRAMES = 5;
  const TRACKING_PERSISTENCE_FRAMES = 30;
  const MAX_TRACKING_DISTANCE = 50;

  // Queue for detections awaiting upload
  const pendingDetections = [];

  // Create detection image with bounding boxes
  function createDetectionImage(videoElement, detections) {
    const detectionCanvas = document.createElement('canvas');
    const detectionCtx = detectionCanvas.getContext('2d');
    
    // Set canvas size to match video
    detectionCanvas.width = videoElement.videoWidth || videoElement.clientWidth;
    detectionCanvas.height = videoElement.videoHeight || videoElement.clientHeight;
    
    // Draw video frame
    detectionCtx.drawImage(videoElement, 0, 0, detectionCanvas.width, detectionCanvas.height);
    
    // Draw detections on the image
    detections.forEach((detection, index) => {
      let [x1, y1, x2, y2, score, classId] = detection;
      
      // Fix class ID mapping
      const correctedClassId = Math.floor(classId) - 1;
      const classIndex = Math.max(0, correctedClassId);
      const labelName = CLASS_NAMES[classIndex] || `Unknown Class ${classIndex}`;
      
      // Scale coordinates to canvas size
      const scaleX = detectionCanvas.width / FIXED_SIZE;
      const scaleY = detectionCanvas.height / FIXED_SIZE;
      
      if (!letterboxParams) return;
      
      const { offsetX, offsetY, newW, newH } = letterboxParams;
      x1 = (x1 - offsetX) * scaleX * (detectionCanvas.width / newW);
      y1 = (y1 - offsetY) * scaleY * (detectionCanvas.height / newH);
      x2 = (x2 - offsetX) * scaleX * (detectionCanvas.width / newW);
      y2 = (y2 - offsetY) * scaleY * (detectionCanvas.height / newH);
      
      const boxW = x2 - x1;
      const boxH = y2 - y1;
      
      if (boxW < 1 || boxH < 1) return;
      
      // Draw bounding box
      const color = hazardColors[labelName] || '#00FF00';
      detectionCtx.strokeStyle = color;
      detectionCtx.lineWidth = 3;
      detectionCtx.strokeRect(x1, y1, boxW, boxH);
      
      // Draw label background
      const text = `${labelName} ${(score * 100).toFixed(1)}%`;
      detectionCtx.font = 'bold 14px Arial';
      const textWidth = detectionCtx.measureText(text).width;
      const labelHeight = 20;
      
      detectionCtx.fillStyle = color;
      detectionCtx.fillRect(x1, y1 - labelHeight, textWidth + 10, labelHeight);
      
      // Draw label text
      detectionCtx.fillStyle = '#000000';
      detectionCtx.fillText(text, x1 + 5, y1 - 5);
    });
    
    return detectionCanvas;
  }

  // Save image and create detection report via API
  async function saveImageAndCreateReport({ blob, metadata }) {
    const formData = new FormData();
    formData.append('file', blob, `detection_${Date.now()}.jpg`);

    for (const key in metadata) {
      if (Object.hasOwnProperty.call(metadata, key)) {
        const value = metadata[key];
        if (typeof value === 'object' && value !== null) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value);
        }
      }
    }

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Detection report uploaded:', result);
    return result;
  }

  // Upload detection image and report
  async function uploadDetection(canvas, detections) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) return reject('❌ No blob from canvas');

        try {
          const metadata = {
            detections: detections.map(det => {
              const [x1, y1, x2, y2, score, classId] = det;
              const correctedClassId = Math.floor(classId) - 1;
              const classIndex = Math.max(0, correctedClassId);
              return {
                class: CLASS_NAMES[classIndex] || `Unknown Class ${classIndex}`,
                confidence: score,
                bbox: [x1, y1, x2, y2]
              };
            }),
            timestamp: new Date().toISOString(),
            source: 'live_camera_detection',
            sessionId: apiSessionId || 'local_session',
            frameNumber: frameCount,
            geoData: geoData
          };

          const result = await saveImageAndCreateReport({ blob, metadata });
          resolve(result.report.image.url);
        } catch (error) {
          console.error('Upload error:', error);
          reject(error);
        }
      }, 'image/jpeg', 0.9);
    });
  }

  // Geolocation data for saved detections
  let geoData = null;
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoData = JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        console.warn("Geolocation unavailable:", err.message);
      }
    );
  }

  // Performance monitoring
  let fpsCounter = 0;
  let lastFpsUpdate = Date.now();
  let performanceHistory = [];
  let adaptiveQualityEnabled = true;
  
  // Offscreen canvas for processing
  const offscreen = document.createElement("canvas");
  offscreen.width = FIXED_SIZE;
  offscreen.height = FIXED_SIZE;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  let letterboxParams = null;
  let confidenceThreshold = 0.5;

  let initialized = false;

  // Ensure canvas dimensions always match the displayed video
  function syncCanvasSize() {
    if (!video || !canvas) return;
    const width = video.clientWidth || video.videoWidth;
    const height = video.clientHeight || video.videoHeight;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
  }

  // Keep canvas in sync when the window resizes
  window.addEventListener('resize', syncCanvasSize);

  // Update UI status
  function updateConnectionStatus(status, message) {
    const indicator = connectionStatus.querySelector('.status-indicator');
    const text = connectionStatus.querySelector('.status-text');
    
    indicator.className = `fas fa-circle status-indicator ${status}`;
    text.textContent = message;
  }

// Show loading overlay with progress
  function showLoading(message, progress = 0) {
    loadingStatus.textContent = message;
    loadingProgressBar.style.width = `${progress}%`;
    loadingOverlay.style.display = 'flex';
  }

  // Hide loading overlay
  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }

  // Show notification
  function showNotification(message, type = 'info') {
    notify(message, type);
  }


  // End API detection session using API client
  async function endApiSessionLocal() {
    if (!apiSessionId) return { message: "No active session" };
    
    try {
      const result = await window.endApiSession(apiSessionId);
      apiSessionId = null;
      return result;
    } catch (error) {
      console.error("❌ Failed to end API session:", error);
      apiSessionId = null;
      return { message: "Session ended with error" };
    }
  }

  // Load ONNX model
  async function loadModel() {
    showLoading("Loading ONNX Runtime model...", 25);
    
    // Prioritized model paths - using the latest road damage detection model
    const modelPaths = [
      './object_detection_model/last_model_train12052025.onnx',          // Primary model
      './object_detection_model/road_damage_detection_last_version.onnx', // Fallback 1
      './object_detection_model/road_damage_detection_simplified.onnx',   // Fallback 2
      './object_detection_model/model 18_7.onnx'                          // Fallback 3
    ];
    
    let modelPath = null;
    for (const path of modelPaths) {
      try {
        const encodedPath = encodeURI(path);
        const response = await fetch(encodedPath, { method: 'HEAD' });
        if (response.ok) {
          modelPath = encodedPath;
          console.log(`✅ Found ONNX model at: ${path}`);
          break;
        }
      } catch (e) {
        console.log(`❌ Failed to access model at ${path}:`, e.message);
      }
    }
    
    if (!modelPath) {
      throw new Error('No ONNX model found in any of the expected locations');
    }

    showLoading("Initializing ONNX Runtime...", 50);

    try {
      try {
        session = await ort.InferenceSession.create(modelPath, { executionProviders: ['webgl'] });
        console.log("✅ ONNX model loaded with WebGL backend");
      } catch (err) {
        console.log("💻 WebGL not available, using CPU backend (this is normal):");
        session = await ort.InferenceSession.create(modelPath, { 
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'disabled',
          enableCpuMemArena: false,
          logSeverityLevel: 2
        });
        console.log("✅ ONNX model loaded with CPU backend");
      }
    } catch (err) {
      console.error("❌ Failed to create ONNX session with any provider:", err);
      throw new Error(`Failed to initialize AI model: ${err.message}`);
    }

    showLoading("Model loaded successfully!", 100);
    return true;
  }


  // Initialize detection system with ONNX fallback
  async function initializeDetection() {
    showLoading("Initializing Detection System...", 0);
    initialized = false;
    useApi = false; // Default to ONNX-only
    apiAvailable = false;

    try {
      // Always load ONNX model first
      await loadModel();
      console.log('✅ ONNX model loaded');

      try {
        // Attempt to load remote API configuration and start session
        await window.loadApiConfig();
        const apiOk = await window.testApiConnection();
        if (apiOk) {
          apiSessionId = await window.startApiSession();
          apiAvailable = true;
          useApi = true;
          console.log('✅ API session started, using remote detection');
          updateConnectionStatus('connected', 'Enhanced Mode (API + ONNX)');
        } else {
          showNotification('Remote API unavailable, running local model', 'warning');
          console.warn('⚠️ API unavailable, using ONNX-only detection');
          updateConnectionStatus('ready', 'Local ONNX Detection Mode');
        }
      } catch (err) {
        console.warn('⚠️ Initialization error:', err.message);
        console.warn('→ Falling back to ONNX-only detection');
        showNotification('Remote API unavailable, running local model', 'warning');
        updateConnectionStatus('ready', 'Local ONNX Detection Mode');
      }

      const modeMessage = apiAvailable && useApi
        ? '🚀 Enhanced detection ready with API + ONNX support'
        : '🎯 Local detection ready with ONNX model';

      // 1. Always load the local ONNX model first
      showLoading("Loading local AI model...", 10);
      await loadModel();
      console.log('✅ ONNX model loaded.');
      updateConnectionStatus('ready', 'Local Model Ready');

      // 2. Try to connect to the API, but don't fail if it's unavailable
      try {
        showLoading("Checking for remote API...", 70);
        // The loadApiConfig is necessary to resolve the API base URL.
        // It can throw "No healthy endpoint found" if the API is down.
        await window.loadApiConfig();
        const apiOk = await window.testApiConnection();
        if (apiOk) {
          showLoading("Starting API session...", 85);
          apiSessionId = await window.startApiSession();
          useApi = true;
          apiAvailable = true;
          console.log('✅ API session started, using remote detection');
          showNotification('Remote API connected. Using enhanced detection.', 'success');
          updateConnectionStatus('connected', 'Enhanced Mode (API + ONNX)');
        } else {
          // This case handles when testApiConnection returns false but doesn't throw an error.
          console.warn('⚠️ API unavailable, using ONNX-only detection');
          showNotification('Remote API unavailable, running local model', 'warning');
          updateConnectionStatus('warning', 'ONNX-Only Mode');
        }
      } catch (err) {
        // This case handles when resolveBaseUrl or testApiConnection throws an error
        // (e.g., "No healthy endpoint found")
        console.warn('⚠️ API initialization failed:', err.message);
        console.warn('→ Falling back to ONNX-only detection');
        showNotification('Remote API unavailable, running local model', 'warning');
        updateConnectionStatus('warning', 'ONNX-Only Mode');
        // `useApi` is already false, so we just continue without re-throwing the error.
      }

      // 3. Finalize initialization
      const modeMessage = useApi
        ? "🚀 Enhanced detection ready (API + ONNX)"
        : "🎯 Local detection ready (ONNX only)";
      

      showNotification(modeMessage, 'success');
      initialized = true;
      startProcessingLoop();
      return true;

    } catch (error) {
      // This catch block now only handles critical errors, like the ONNX model failing to load.
      console.error("❌ Critical initialization failed:", error);
      showNotification(`Initialization failed: ${error.message}`, 'error');
      updateConnectionStatus('error', 'Initialization Failed');
      return false;
    } finally {
      // A short delay to ensure the final loading message is visible before hiding.
      setTimeout(() => {
        hideLoading();
      }, 500);
    }
  }

  // Compute letterbox parameters
  function computeLetterboxParams() {
    const scale = Math.min(FIXED_SIZE / video.videoWidth, FIXED_SIZE / video.videoHeight);
    const newW = Math.round(video.videoWidth * scale);
    const newH = Math.round(video.videoHeight * scale);
    const offsetX = Math.floor((FIXED_SIZE - newW) / 2);
    const offsetY = Math.floor((FIXED_SIZE - newH) / 2);
    letterboxParams = { scale, newW, newH, offsetX, offsetY };
  }

  // Process frame with ONNX
  async function detectWithOnnx(imageData) {
    if (!session) return [];

    const startTime = performance.now();
    
    try {
      // Prepare tensor data (matching upload.js logic)
      const { data, width, height } = imageData;
      const tensorData = new Float32Array(width * height * 3);
      
      for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
        tensorData[j] = data[i] / 255;       // R
        tensorData[j + 1] = data[i + 1] / 255; // G
        tensorData[j + 2] = data[i + 2] / 255; // B
      }

      // Convert to CHW format
      const chwData = new Float32Array(3 * width * height);
      for (let c = 0; c < 3; c++) {
        for (let h = 0; h < height; h++) {
          for (let w = 0; w < width; w++) {
            chwData[c * width * height + h * width + w] = 
              tensorData[h * width * 3 + w * 3 + c];
          }
        }
      }

      const dims = [1, 3, height, width];
      const tensor = new ort.Tensor("float32", chwData, dims);
      const feeds = { images: tensor };

      const results = await session.run(feeds);
      const outputKey = Object.keys(results)[0];
      const output = results[outputKey];
      const outputData = output.data;

      // Enhanced detection parsing with filtering
      const rawBoxes = [];
      for (let i = 0; i < outputData.length; i += 6) {
        rawBoxes.push(outputData.slice(i, i + 6));
      }

      // Apply intelligent filtering for road damage detection
      const filteredBoxes = applyDetectionFilters(rawBoxes);

      const processingTime = performance.now() - startTime;
      detectionStats.frameProcessingTimes.push(processingTime);
      
      if (filteredBoxes.length > 0) {
        console.log(`🔍 Frame ${frameCount}: ${rawBoxes.length} raw → ${filteredBoxes.length} filtered detections`);
      }
      
      return filteredBoxes;
    } catch (error) {
      console.error("ONNX detection error:", error);
      return [];
    }
  }

  // Enhanced detection filtering for road damage (real-time optimized)
  function applyDetectionFilters(boxes) {
    let validBoxes = [];
    
    // Filter by confidence, size and aspect ratio
    for (const box of boxes) {
      let [x1, y1, x2, y2, score, classId] = box;
      
      // Fix class ID mapping - model outputs class_id + 1, so subtract 1
      const correctedClassId = Math.floor(classId) - 1;
      const classIndex = Math.max(0, correctedClassId); // Ensure non-negative
      
      // Use class-specific confidence thresholds if available
      const minThreshold = DETECTION_CONFIG.classThresholds[classIndex] || DETECTION_CONFIG.minConfidence;
      
      // Skip low confidence detections
      if (score < minThreshold) continue;
      
      // Validate coordinates
      if (x1 >= x2 || y1 >= y2) continue;
      
      const width = x2 - x1;
      const height = y2 - y1;
      
      // Filter tiny boxes
      if (width < DETECTION_CONFIG.minBoxSize || height < DETECTION_CONFIG.minBoxSize) continue;
      
      // Filter extreme aspect ratios (likely false positives)
      const aspectRatio = Math.max(width/height, height/width);
      if (aspectRatio > DETECTION_CONFIG.aspectRatioFilter) continue;
      
      // Ensure box is within image bounds
      if (x1 < 0 || y1 < 0 || x2 > FIXED_SIZE || y2 > FIXED_SIZE) continue;
      
      validBoxes.push(box);
    }
    
    // Sort by confidence (highest first)
    validBoxes.sort((a, b) => b[4] - a[4]);
    
    // Limit number of detections for real-time performance
    if (validBoxes.length > DETECTION_CONFIG.maxDetections) {
      validBoxes = validBoxes.slice(0, DETECTION_CONFIG.maxDetections);
    }
    
    // Apply Non-Maximum Suppression (simplified for real-time)
    return applyNMSRealtime(validBoxes, DETECTION_CONFIG.nmsThreshold);
  }

  // Optimized Non-Maximum Suppression for real-time processing
  function applyNMSRealtime(boxes, threshold) {
    if (boxes.length === 0) return [];
    
    const result = [];
    const suppressed = new Array(boxes.length).fill(false);
    
    for (let i = 0; i < boxes.length; i++) {
      if (suppressed[i]) continue;
      
      result.push(boxes[i]);
      
      // Mark overlapping boxes as suppressed
      for (let j = i + 1; j < boxes.length; j++) {
        if (suppressed[j]) continue;
        
        const iou = calculateIoUFast(boxes[i], boxes[j]);
        if (iou > threshold) {
          suppressed[j] = true;
        }
      }
    }
    
    return result;
  }

  // Fast IoU calculation optimized for real-time
  function calculateIoUFast(box1, box2) {
    const [x1a, y1a, x2a, y2a] = [box1[0], box1[1], box1[2], box1[3]];
    const [x1b, y1b, x2b, y2b] = [box2[0], box2[1], box2[2], box2[3]];
    
    const xLeft = Math.max(x1a, x1b);
    const yTop = Math.max(y1a, y1b);
    const xRight = Math.min(x2a, x2b);
    const yBottom = Math.min(y2a, y2b);
    
    if (xRight <= xLeft || yBottom <= yTop) return 0;
    
    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
    const box1Area = (x2a - x1a) * (y2a - y1a);
    const box2Area = (x2b - x1b) * (y2b - y1b);
    const unionArea = box1Area + box2Area - intersectionArea;
    
    return intersectionArea / unionArea;
  }

  // Process frame with API using API client
  async function detectWithApiClient(canvas) {
    if (!apiAvailable || !apiSessionId) {
      return [];
    }

    try {
      // Ensure we have a valid canvas
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        console.warn("❌ Invalid canvas for API detection");
        return [];
      }

      // Create blob from canvas
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob from canvas"));
          }
        }, 'image/jpeg', 0.9);
      });

      if (!blob || blob.size === 0) {
        console.warn("❌ Invalid blob created from canvas");
        return [];
      }

      // Use API client for detection
      const result = await window.detectWithApi(apiSessionId, blob);
      
      // Log new detections for debugging
      if (result.detections && result.detections.length > 0) {
        const newDetections = result.detections.filter(det => det.is_new);
        if (newDetections.length > 0) {
          console.log("🆕 New hazards detected via API:", newDetections.map(d => `${d.class_name} (${(d.confidence * 100).toFixed(1)}%)`));
        }
      }

      // Reset failure count on successful API call
      if (window.apiFailureCount > 0) {
        window.apiFailureCount = 0;
        console.log("✅ API detection recovered");
      }

      // Convert API format to internal format
      // API returns bbox as [x, y, width, height], we need [x1, y1, x2, y2]
      return result.detections.map(det => {
        const [x, y, width, height] = det.bbox;
        const classIndex = CLASS_NAMES.indexOf(det.class_name);
        
        return [
          x,                    // x1
          y,                    // y1  
          x + width,            // x2
          y + height,           // y2
          det.confidence,       // confidence
          classIndex !== -1 ? classIndex + 1 : 1  // class_id (add 1 to match model format)
        ];
      });
    } catch (error) {
      console.warn("API detection failed:", error.message);
      
      // Enhanced error handling
      const errorHandled = handleApiError(error);
      
      // Show user notification for API errors
      if (!errorHandled && !error.message.includes('model loading')) {
        showNotification('API detection temporarily unavailable', 'warning');
      }
      
      // Handle failure counting
      if (!error.message.includes('model not loaded') && 
          !error.message.includes('Service may still be starting') &&
          !error.message.includes('PyTorch model not loaded') &&
          !error.message.includes('OpenVino model not loaded')) {
        if (!window.apiFailureCount) window.apiFailureCount = 0;
        window.apiFailureCount++;
        
        if (window.apiFailureCount > 5) {
          console.warn("🚫 Too many API failures, temporarily disabling API detection");
          useApi = false;
          // Re-enable after 30 seconds
          setTimeout(() => {
            window.apiFailureCount = 0;
            useApi = true;
            console.log("🔄 Re-enabling API detection");
          }, 30000);
        }
      }
      
      return [];
    }
  }

  // Enhanced detection saving with Cloudinary integration
  async function saveDetection(videoElement, detections, primaryDetection) {
    try {
      if (!videoElement || detections.length === 0) {
        console.warn("❌ Invalid video or no detections for saving");
        return;
      }

      // Create detection image with bounding boxes
      const detectionCanvas = createDetectionImage(videoElement, detections);
      
      let imageUrl;
      
      // Upload to the unified endpoint
      try {
        imageUrl = await uploadDetection(detectionCanvas, detections);
        console.log("☁️ Detection report uploaded, image URL:", imageUrl);
      } catch (uploadError) {
        console.warn("⚠️ Upload failed, using data URL as fallback:", uploadError.message);
        imageUrl = detectionCanvas.toDataURL("image/jpeg", 0.9);
      }

      // Create a detection report with primary detection info
      const [x1, y1, x2, y2, score, classId] = primaryDetection;
      const correctedClassId = Math.floor(classId) - 1;
      const classIndex = Math.max(0, correctedClassId);
      const label = CLASS_NAMES[classIndex] || `Unknown Class ${classIndex}`;

      const report = {
        type: label,
        location: geoData ? JSON.parse(geoData) : { lat: 31.7683, lng: 35.2137 },
        time: new Date().toISOString(),
        image: imageUrl,
        status: "unreviewed",
        reportedBy: "live_camera",
        confidence: Math.round(score * 100),
        sessionId: apiSessionId || 'local_session',
        frameNumber: frameCount,
        detectionMode: apiAvailable ? 'hybrid' : 'onnx_only',
        // Additional metadata for summary
        allDetections: detections.map(det => {
          const [dx1, dy1, dx2, dy2, dscore, dclassId] = det;
          const dcorrectedClassId = Math.floor(dclassId) - 1;
          const dclassIndex = Math.max(0, dcorrectedClassId);
          return {
            type: CLASS_NAMES[dclassIndex] || `Unknown Class ${dclassIndex}`,
            confidence: dscore,
            bbox: [dx1, dy1, dx2, dy2]
          };
        })
      };

      pendingDetections.push(report);

      // Update saved images count
      savedImagesCount++;
      updateSavedImagesDisplay();

      console.log("📝 Detection with image queued:", { 
        type: label, 
        confidence: `${Math.round(score * 100)}%`, 
        timestamp: report.time,
        mode: report.detectionMode,
        imageType: imageUrl.startsWith('data:') ? 'dataURL' : 'cloudinary',
        totalDetections: detections.length
      });
    } catch (err) {
      console.error("❌ Error during detection saving:", err);
      showNotification('Failed to save detection image', 'error');
    }
  }

  // Helper function to calculate distance between two box centers
  function boxDistance(box1, box2) {
    const centerX1 = (box1[0] + box1[2]) / 2;
    const centerY1 = (box1[1] + box1[3]) / 2;
    const centerX2 = (box2[0] + box2[2]) / 2;
    const centerY2 = (box2[1] + box2[3]) / 2;
    return Math.sqrt(Math.pow(centerX1 - centerX2, 2) + Math.pow(centerY1 - centerY2, 2));
  }

  // Calculate Intersection over Union (IoU) for better tracking
  function calculateIoU(box1, box2) {
    const [x1a, y1a, x2a, y2a] = box1;
    const [x1b, y1b, x2b, y2b] = box2;
    
    const xLeft = Math.max(x1a, x1b);
    const yTop = Math.max(y1a, y1b);
    const xRight = Math.min(x2a, x2b);
    const yBottom = Math.min(y2a, y2b);
    
    if (xRight < xLeft || yBottom < yTop) return 0;
    
    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
    const box1Area = (x2a - x1a) * (y2a - y1a);
    const box2Area = (x2b - x1b) * (y2b - y1b);
    const unionArea = box1Area + box2Area - intersectionArea;
    
    return intersectionArea / unionArea;
  }

  // Interpolate box position based on velocity
  function interpolateBox(trackedObj, framesSinceLastUpdate) {
    if (!trackedObj.velocity || framesSinceLastUpdate === 0) {
      return trackedObj.box;
    }
    
    const [x1, y1, x2, y2, score, classId] = trackedObj.box;
    const [vx, vy] = trackedObj.velocity;
    
    // Apply velocity with dampening
    const dampening = Math.min(framesSinceLastUpdate / INTERPOLATION_FRAMES, 1);
    const newX1 = x1 + vx * framesSinceLastUpdate * dampening;
    const newY1 = y1 + vy * framesSinceLastUpdate * dampening;
    const newX2 = x2 + vx * framesSinceLastUpdate * dampening;
    const newY2 = y2 + vy * framesSinceLastUpdate * dampening;
    
    return [newX1, newY1, newX2, newY2, score, classId];
  }

  // Track objects across frames
  function trackObjects(newDetections) {
    const currentFrame = frameCount;
    const processedBoxes = [];
    const usedDetections = new Set();
    
    // Filter detections by confidence using class-specific thresholds
    const validDetections = newDetections.filter(box => {
      const classIndex = Math.floor(box[5]);
      const classThreshold = DETECTION_CONFIG.classThresholds[classIndex] || DETECTION_CONFIG.minConfidence;
      const threshold = Math.max(confidenceThreshold, classThreshold);
      return box[4] >= threshold;
    });
    
    // Update existing tracked objects
    for (const [id, trackedObj] of trackedObjects) {
      let bestMatch = null;
      let bestScore = 0;
      let bestDetectionIndex = -1;
      
      // Find best matching detection for this tracked object
      validDetections.forEach((detection, index) => {
        if (usedDetections.has(index)) return;
        
        const [x1, y1, x2, y2, score, classId] = detection;
        
        // Only match same class
        // Fix class ID mapping for comparison
        const correctedClassId = Math.floor(classId) - 1;
        const detectionClassIndex = Math.max(0, correctedClassId);
        if (detectionClassIndex !== trackedObj.classId) return;
        
        // Calculate matching score (combination of IoU and distance)
        const iou = calculateIoU(trackedObj.box, [x1, y1, x2, y2]);
        const distance = boxDistance(trackedObj.box, [x1, y1, x2, y2]);
        const matchScore = iou * 0.7 + (1 - Math.min(distance / MAX_TRACKING_DISTANCE, 1)) * 0.3;
        
        if (matchScore > bestScore && distance < MAX_TRACKING_DISTANCE) {
          bestMatch = detection;
          bestScore = matchScore;
          bestDetectionIndex = index;
        }
      });
      
      if (bestMatch && bestScore > 0.3) {
        // Update tracked object with new detection
        const [newX1, newY1, newX2, newY2, newScore, newClassId] = bestMatch;
        const [oldX1, oldY1, oldX2, oldY2] = trackedObj.box;
        
        // Calculate velocity
        const framesDiff = currentFrame - trackedObj.lastDetectionFrame;
        if (framesDiff > 0) {
          const vx = (newX1 - oldX1) / framesDiff;
          const vy = (newY1 - oldY1) / framesDiff;
          trackedObj.velocity = [vx, vy];
        }
        
        trackedObj.box = [newX1, newY1, newX2, newY2, Math.max(trackedObj.confidence, newScore), newClassId];
        trackedObj.lastSeen = currentFrame;
        trackedObj.lastDetectionFrame = currentFrame;
        trackedObj.confidence = Math.max(trackedObj.confidence * 0.9, newScore);
        
        usedDetections.add(bestDetectionIndex);
      } else {
        // Update position using velocity interpolation
        const framesSinceLastDetection = currentFrame - trackedObj.lastDetectionFrame;
        if (framesSinceLastDetection <= INTERPOLATION_FRAMES) {
          trackedObj.box = interpolateBox(trackedObj, framesSinceLastDetection);
        }
        trackedObj.lastSeen = currentFrame;
        trackedObj.confidence *= 0.95; // Decay confidence when not detected
      }
    }
    
    // Add new objects for unmatched detections
    validDetections.forEach((detection, index) => {
      if (usedDetections.has(index)) return;
      
      const [x1, y1, x2, y2, score, classId] = detection;
      const newId = nextObjectId++;
      
      trackedObjects.set(newId, {
        id: newId,
        box: [x1, y1, x2, y2, score, classId],
        // Fix class ID mapping - model outputs class_id + 1, so subtract 1
        classId: Math.max(0, Math.floor(classId) - 1),
        confidence: score,
        lastSeen: currentFrame,
        lastDetectionFrame: currentFrame,
        velocity: [0, 0],
        age: 0
      });
    });
    
    // Remove old tracked objects and collect active ones
    for (const [id, trackedObj] of trackedObjects) {
      if (currentFrame - trackedObj.lastSeen > TRACKING_PERSISTENCE_FRAMES || trackedObj.confidence < 0.3) {
        trackedObjects.delete(id);
      } else {
        processedBoxes.push(trackedObj.box);
        trackedObj.age++;
      }
    }
  }

  // Professional bounding box drawing function for camera detection
  function drawProfessionalBoundingBox(ctx, options) {
    const { x1, y1, x2, y2, label, confidence, classIndex, detectionIndex, color, isInterpolated } = options;
    
    const boxW = x2 - x1;
    const boxH = y2 - y1;
    const scorePerc = (confidence * 100).toFixed(1);
    
    // Save current context state
    ctx.save();
    
    // Calculate dynamic styling based on confidence
    const alpha = Math.min(0.6 + confidence * 0.4, 1.0);
    const lineWidth = Math.max(2, Math.min(5, confidence * 6));
    const cornerSize = Math.max(8, Math.min(14, confidence * 16));
    
    // Adjust for interpolated/tracked objects
    if (isInterpolated) {
      ctx.globalAlpha = alpha * 0.7;
      ctx.setLineDash([6, 3]);
    } else {
      ctx.globalAlpha = alpha;
      ctx.setLineDash([]);
    }
    
    // Set shadow for depth effect
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    // Draw main bounding box
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
    
    // Draw confidence indicator bar
    const confBarWidth = Math.min(boxW * 0.6, 40);
    const confBarHeight = 3;
    const confBarX = x1 + (boxW - confBarWidth) / 2;
    const confBarY = y2 - 6;
    
    // Background bar
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(confBarX, confBarY, confBarWidth, confBarHeight);
    
    // Confidence fill
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = color;
    ctx.fillRect(confBarX, confBarY, confBarWidth * confidence, confBarHeight);
    
    // Professional label design
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    const mainText = label;
    const confText = `${scorePerc}%`;
    const idText = `#${detectionIndex}`;
    const trackingText = isInterpolated ? 'TRACKED' : '';
    
    const mainTextWidth = ctx.measureText(mainText).width;
    const confTextWidth = ctx.measureText(confText).width;
    const idTextWidth = ctx.measureText(idText).width;
    const trackingTextWidth = trackingText ? ctx.measureText(trackingText).width : 0;
    
    const labelPadding = 6;
    const labelSpacing = 3;
    const totalLabelWidth = mainTextWidth + confTextWidth + idTextWidth + trackingTextWidth + labelPadding * 2 + labelSpacing * 3;
    const labelHeight = 18;
    
    // Smart label positioning
    let labelX = x1;
    let labelY = y1 - labelHeight - 3;
    
    // Adjust if label goes outside canvas bounds
    if (labelX + totalLabelWidth > canvas.width) {
      labelX = canvas.width - totalLabelWidth - 3;
    }
    if (labelY < 0) {
      labelY = y2 + 3;
    }
    
    // Draw label background with gradient effect
    ctx.globalAlpha = 0.9;
    
    // Create gradient background
    const gradient = ctx.createLinearGradient(labelX, labelY, labelX, labelY + labelHeight);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, adjustColorBrightness(color, -15));
    
    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, labelX, labelY, totalLabelWidth, labelHeight, 3);
    
    // Draw label text with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 1;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#FFFFFF';
    
    // Main label text
    ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
    ctx.fillText(mainText, labelX + labelPadding, labelY + 12);
    
    // Confidence text
    ctx.font = 'bold 9px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#E0E0E0';
    ctx.fillText(confText, labelX + labelPadding + mainTextWidth + labelSpacing, labelY + 12);
    
    // Detection ID
    ctx.font = 'bold 8px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#CCCCCC';
    ctx.fillText(idText, labelX + labelPadding + mainTextWidth + confTextWidth + labelSpacing * 2, labelY + 12);
    
    // Tracking indicator
    if (trackingText) {
      ctx.font = 'bold 7px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#FFD700';
      ctx.fillText(trackingText, labelX + labelPadding + mainTextWidth + confTextWidth + idTextWidth + labelSpacing * 3, labelY + 11);
    }
    
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
  
  // Helper function to adjust color brightness
  function adjustColorBrightness(color, amount) {
    const usePound = color[0] === '#';
    const col = usePound ? color.slice(1) : color;
    const num = parseInt(col, 16);
    let r = (num >> 16) + amount;
    let g = (num >> 8 & 0x00FF) + amount;
    let b = (num & 0x0000FF) + amount;
    r = r > 255 ? 255 : r < 0 ? 0 : r;
    g = g > 255 ? 255 : g < 0 ? 0 : g;
    b = b > 255 ? 255 : b < 0 ? 0 : b;
    return (usePound ? '#' : '') + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
  }

  // Draw detection results with object tracking and professional bounding boxes
  function drawResults(boxes, useApiResults = false) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update tracked objects with current detections
    trackObjects(boxes);

    let currentFrameDetections = 0;
    const detectedTypes = new Set();

      // Draw all tracked objects (including interpolated ones)
      for (const [id, trackedObj] of trackedObjects) {
        let [x1, y1, x2, y2, score, classId] = trackedObj.box;

        // Fix class ID mapping - model outputs class_id + 1, so subtract 1
        const correctedClassId = Math.floor(classId) - 1;
        const classIndex = Math.max(0, correctedClassId); // Ensure non-negative

        // Scale coordinates back to displayed video dimensions
        if (!useApiResults) {
          const { offsetX, offsetY, newW, newH } = letterboxParams;
          const scaleX = canvas.width / newW;
          const scaleY = canvas.height / newH;
          x1 = (x1 - offsetX) * scaleX;
          y1 = (y1 - offsetY) * scaleY;
          x2 = (x2 - offsetX) * scaleX;
          y2 = (y2 - offsetY) * scaleY;
        } else {
          const scaleX = canvas.width / video.videoWidth;
          const scaleY = canvas.height / video.videoHeight;
          x1 *= scaleX;
          y1 *= scaleY;
          x2 *= scaleX;
          y2 *= scaleY;
        }

        const boxW = x2 - x1;
        const boxH = y2 - y1;

        if (boxW < 1 || boxH < 1) {
          continue;
        }

      currentFrameDetections++;
      const labelName = CLASS_NAMES[classIndex] || `Unknown Class ${classIndex}`;
      
      console.log(`🔍 Camera Detection: Raw classId=${classId}, Corrected=${classIndex}, Label="${labelName}"`);  // Debug log
      
      detectedTypes.add(labelName);
      detectionStats.detectedHazards.add(labelName);

      // Enhanced visual styling with hazard-specific colors and tracking
      const framesSinceLastDetection = frameCount - trackedObj.lastDetectionFrame;
      const isInterpolated = framesSinceLastDetection > 0;
      
      // Use hazard-specific colors
      let baseColor = hazardColors[labelName] || '#00FF00';
      let color = isInterpolated ? '#FFD700' : baseColor; // Gold for interpolated
      
      // Professional bounding box drawing
      drawProfessionalBoundingBox(ctx, {
        x1, y1, x2, y2,
        label: labelName,
        confidence: trackedObj.confidence,
        classIndex: classIndex,
        detectionIndex: trackedObj.id,
        color: color,
        isInterpolated: isInterpolated
      });

      console.log(`📦 Tracked object #${trackedObj.id}:`, labelName, (trackedObj.confidence * 100).toFixed(1) + "%", isInterpolated ? "(interpolated)" : "(detected)");
      
      // Add to camera session tracking (only for new detections, not interpolated)
      if (!isInterpolated) {
        addCameraDetection({
          type: labelName,
          confidence: trackedObj.confidence,
          classIndex: classIndex,
          coordinates: { x1, y1, x2, y2 },
          objectId: trackedObj.id
        });
      }

      // Save detection periodically with bounding box image
      if (frameCount % DETECTION_SAVE_INTERVAL === 0 && !isInterpolated) { // Save based on user setting
        // Get current frame detections for this class
        const currentFrameDetections = [];
        for (const [id, trackedObj] of trackedObjects) {
          if (Math.floor(trackedObj.box[5]) - 1 === classIndex) {
            currentFrameDetections.push(trackedObj.box);
          }
        }
        
        if (currentFrameDetections.length > 0) {
          saveDetection(video, currentFrameDetections, trackedObj.box).catch((e) => console.error(e));
        }
      }

    }

    // Update statistics
    currentDetections.textContent = currentFrameDetections;
    detectionStats.totalDetections += currentFrameDetections;
    sessionDetections.textContent = detectionStats.totalDetections;
    detectionCountBadge.textContent = `${currentFrameDetections} hazards`;

    // Update hazard types list
    if (detectedTypes.size > 0) {
      hazardTypesList.innerHTML = Array.from(detectedTypes)
        .map(type => `<div class="hazard-type">${type}</div>`)
        .join('');
    } else {
      hazardTypesList.innerHTML = '<div class="no-hazards">No hazards detected</div>';
    }
  }

  function drawDetections(drawCtx, detections, useApiResults = false) {
    drawResults(detections, useApiResults);
  }

  // Update FPS and performance stats with adaptive quality
  function updatePerformanceStats() {
    fpsCounter++;
    const now = Date.now();
    
    if (now - lastFpsUpdate >= 1000) {
      const fps = Math.round(fpsCounter * 1000 / (now - lastFpsUpdate));
      fpsDisplay.textContent = fps;
      fpsBadge.textContent = `${fps} FPS`;
      
      // Average processing time
      const avgProcessingTime = detectionStats.frameProcessingTimes.length > 0 
        ? Math.round(detectionStats.frameProcessingTimes.reduce((a, b) => a + b, 0) / detectionStats.frameProcessingTimes.length)
        : 0;
      processingTime.textContent = `${avgProcessingTime}ms`;
      
      // Performance monitoring for adaptive quality
      performanceHistory.push({
        fps: fps,
        processingTime: avgProcessingTime,
        timestamp: now
      });
      
      // Keep only recent performance data (last 10 seconds)
      performanceHistory = performanceHistory.filter(entry => now - entry.timestamp < 10000);
      
      // Adaptive quality adjustment
      if (adaptiveQualityEnabled && performanceHistory.length >= 3) {
        checkAndAdjustQuality();
      }
      
      fpsCounter = 0;
      lastFpsUpdate = now;
      
      // Keep only recent processing times
      if (detectionStats.frameProcessingTimes.length > 30) {
        detectionStats.frameProcessingTimes = detectionStats.frameProcessingTimes.slice(-30);
      }
    }
  }
  
  // Adaptive quality adjustment based on performance
  function checkAndAdjustQuality() {
    const avgFps = performanceHistory.reduce((sum, entry) => sum + entry.fps, 0) / performanceHistory.length;
    const avgProcessingTime = performanceHistory.reduce((sum, entry) => sum + entry.processingTime, 0) / performanceHistory.length;
    
    // Poor performance thresholds
    const lowFpsThreshold = 15;
    const highProcessingThreshold = 150; // ms
    
    // Good performance thresholds  
    const goodFpsThreshold = 25;
    const lowProcessingThreshold = 50; // ms
    
    if (avgFps < lowFpsThreshold || avgProcessingTime > highProcessingThreshold) {
      // Performance is poor - reduce quality
      if (DETECTION_CONFIG.detectionInterval < 8) {
        DETECTION_CONFIG.detectionInterval += 1;
        console.log(`⚡ Performance low (${avgFps.toFixed(1)} FPS, ${avgProcessingTime.toFixed(1)}ms) - reducing detection frequency to every ${DETECTION_CONFIG.detectionInterval} frames`);
        showNotification(`Adjusting detection frequency for better performance`, 'info');
      }
    } else if (avgFps > goodFpsThreshold && avgProcessingTime < lowProcessingThreshold) {
      // Performance is good - can increase quality
      if (DETECTION_CONFIG.detectionInterval > 2) {
        DETECTION_CONFIG.detectionInterval -= 1;
        console.log(`🚀 Performance good (${avgFps.toFixed(1)} FPS, ${avgProcessingTime.toFixed(1)}ms) - increasing detection frequency to every ${DETECTION_CONFIG.detectionInterval} frames`);
      }
    }
  }

  // Add detecting class to camera wrapper
  function setDetectingState(isDetecting) {
      const cameraWrapper = document.getElementById('camera-wrapper');
    if (isDetecting) {
      cameraWrapper.classList.add('detecting');
    } else {
      cameraWrapper.classList.remove('detecting');
    }
  }
  // Set initial state of buttons
  function updateButtonStates() {
      if (detecting) {
          startBtn.style.display = "none";
          stopBtn.style.display = "inline-block";
          switchCameraBtn.style.display = "inline-block";
      } else {
          startBtn.style.display = "inline-block";
          stopBtn.style.display = "none";
          switchCameraBtn.style.display = "none";
      }
  }
  // Main detection loop with improved frame handling
  async function processFrame() {
    if (!detecting || !session) return;

    frameCount++;
    frameCountDisplay.textContent = frameCount;

    if (!letterboxParams) computeLetterboxParams();

    let detections = [];
    let useApiResults = false;

    // Process detection using configurable interval for better performance
    if (frameCount % DETECTION_CONFIG.detectionInterval === 0) {
      // Prepare frame for detection
      offCtx.fillStyle = "black";
      offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
      offCtx.drawImage(video, letterboxParams.offsetX, letterboxParams.offsetY, letterboxParams.newW, letterboxParams.newH);

      const imageData = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);

      // Try session-based API detection first (if available), then fallback to ONNX
      if (apiAvailable && useApi && apiSessionId && frameCount % 4 === 0) { // Use API every 4th frame for better responsiveness
        try {
          // Create a proper canvas with video frame for API detection
          const apiCanvas = document.createElement('canvas');
          apiCanvas.width = FIXED_SIZE;
          apiCanvas.height = FIXED_SIZE;
          const apiCtx = apiCanvas.getContext('2d');
          
          // Draw video frame properly formatted for detection
          apiCtx.fillStyle = "black";
          apiCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
          apiCtx.drawImage(video, letterboxParams.offsetX, letterboxParams.offsetY, letterboxParams.newW, letterboxParams.newH);
          
          console.log("🌐 Attempting session-based API detection...");
          detections = await detectWithApiClient(apiCanvas);
          if (detections.length > 0) {
            useApiResults = true;
            console.log("🔥 Using session-based API detection results:", detections.length, "detections");
          } else {
            console.log("🔍 Session-based API returned no detections");
          }
        } catch (error) {
          console.warn("Session-based API detection failed, using ONNX fallback:", error);
        }
      }

      // Fallback to ONNX if API didn't return results or failed
      if (detections.length === 0 && session) {
        detections = await detectWithOnnx(imageData);
      }
    }

    // Draw detections (new and persisted)
    drawDetections(ctx, detections, useApiResults);
    updatePerformanceStats();

    requestAnimationFrame(processFrame);
  }

  function startProcessingLoop() {
    requestAnimationFrame(processFrame);
  }

  // Event Listeners
  startBtn.addEventListener("click", async () => {
    if (!session) {
      showNotification("Model not loaded. Please wait for model initialization.", 'warning');
      return;
    }

    try {
      startBtn.disabled = true;
      updateConnectionStatus('processing', 'Starting Camera...');

      // API session was already started during initialization

      // Get optimal constraints based on device capabilities
      updateConnectionStatus('processing', 'Optimizing camera settings...');
      optimalConstraints = await getOptimalVideoConstraints();
      
      console.log('🎯 Using optimal video constraints:', optimalConstraints);
      const constraints = optimalConstraints;

      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      
      detecting = true;
      updateButtonStates(); // Hide start, show stop

      video.addEventListener("loadeddata", () => {
        syncCanvasSize();
        computeLetterboxParams();
        setDetectingState(true);
        
        // Reset detection stats and summary for new session
        detectionStats = {
          totalDetections: 0,
          sessionStart: Date.now(),
          frameProcessingTimes: [],
          detectedHazards: new Set()
        };
        sessionDetectionsSummary = [];
        
        // Start camera session tracking
        startCameraSession();
        
        const statusMsg = apiAvailable && useApi ? 'Enhanced API + ONNX Detection Active' : 'ONNX Detection Active';
        updateConnectionStatus('processing', statusMsg);
        startProcessingLoop();
      }, { once: true });

    } catch (err) {
      showNotification("לא ניתן לפתוח מצלמה", 'error');
      console.error("Camera error:", err);
      detecting = false;
      updateButtonStates();
      startBtn.disabled = false;
      updateConnectionStatus('ready', 'System Ready');
    }
  });

  stopBtn.addEventListener("click", async () => {
    detecting = false;

    setDetectingState(false);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    video.srcObject = null;

    updateButtonStates();
    startBtn.disabled = false;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    console.log("Camera stopped");
    
    // End camera session tracking
    endCameraSession();

    // End API session and get summary
    if (apiAvailable && apiSessionId) {
      try {
        const sessionSummary = await endApiSessionLocal();
        console.log("📊 API detection session completed:", sessionSummary);
      } catch (error) {
        console.warn("⚠️ Failed to properly end API session:", error);
      }
    }

    // Send queued detections to API (matching upload_tf.js logic)
    if (pendingDetections.length > 0) {
      console.log(`📨 Sending ${pendingDetections.length} detections to server...`);
      for (const detection of pendingDetections) {
        try {
          const res = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(detection)
          });
          const result = await res.json();
          console.log("✅ Detection saved:", result);
        } catch (e) {
          console.error("🔥 Failed to send detection:", e);
        }
      }
      pendingDetections.length = 0;
    }

    // Show summary modal if there were detections
    if (detectionStats.totalDetections > 0 || sessionDetectionsSummary.length > 0) {
        // Fetch reports for this trip and then show summary
        if (apiSessionId) {
            fetchReports({ tripId: apiSessionId }).then(data => {
                showSummaryModal(data.reports);
            }).catch(error => {
                console.error("Failed to fetch reports for summary:", error);
                // Fallback to showing modal without server data if fetch fails
                showSummaryModal([]);
            });
        } else {
            // If there's no session ID, show summary with whatever is local (likely nothing)
            showSummaryModal([]);
        }
    }

    // Reset stats and clear tracking data
    frameCount = 0;

    // Don't reset detection stats immediately - keep for summary modal
    // They will be reset when starting a new session

    updateConnectionStatus('ready', 'System Ready');
  });

  // switch camera
  switchCameraBtn.addEventListener("click", async () => {
    if (!detecting) return;
    
    currentCamera = currentCamera === 'user' ? 'environment' : 'user';
    
    // Stop current stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // Start with new camera
    try {
      // Recalculate optimal constraints for new camera
      updateConnectionStatus('processing', 'Optimizing new camera settings...');
      optimalConstraints = await getOptimalVideoConstraints();
      
      console.log('🔄 Camera switch - new optimal constraints:', optimalConstraints);
      const constraints = optimalConstraints;

      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      
      video.addEventListener("loadeddata", () => {
        syncCanvasSize();
        computeLetterboxParams();
      }, { once: true });
      
    } catch (err) {
      showNotification("Failed to switch camera", 'error');
      console.error("Camera switch error:", err);
    }
  });

  // Settings button toggle with accessibility
  settingsBtn.addEventListener("click", () => {
    const isExpanded = settingsPanel.classList.contains('show');
    settingsPanel.classList.toggle('show');
    settingsBtn.setAttribute('aria-expanded', !isExpanded);
    settingsPanel.setAttribute('aria-hidden', isExpanded);
  });

  // Sensitivity slider with real-time feedback
  sensitivitySlider.addEventListener("input", (e) => {
    confidenceThreshold = parseFloat(e.target.value);
    const valueElement = document.getElementById('sensitivity-value');
    if (valueElement) {
      valueElement.textContent = `${Math.round(confidenceThreshold * 100)}%`;
    }
    
    // Update detection config in real-time
    DETECTION_CONFIG.minConfidence = confidenceThreshold;
    console.log(`🎚️ Detection sensitivity updated: ${Math.round(confidenceThreshold * 100)}%`);
  });

  // Save interval slider
  const saveIntervalSlider = document.getElementById('save-interval-slider');
  if (saveIntervalSlider) {
    saveIntervalSlider.addEventListener("input", (e) => {
      const newInterval = parseInt(e.target.value);
      const valueElement = document.getElementById('save-interval-value');
      if (valueElement) {
        valueElement.textContent = newInterval;
      }
      
      // Update detection save interval
      DETECTION_SAVE_INTERVAL = newInterval;
      console.log(`💾 Auto-save interval updated: every ${newInterval} frames`);
    });
  }
  // Summary Modal Functions
  function showSummaryModal(reports = []) {
    updateSummaryData(reports);
    summaryModal.show();
  }

  function hideSummaryModal() {
    summaryModal.hide();
  }

  function updateSummaryData(reports = []) {
    // Update session stats from server data
    totalDetectionsCount.textContent = reports.length;
    
    // Calculate and display session duration
    const sessionDuration = Date.now() - detectionStats.sessionStart;
    const minutes = Math.floor(sessionDuration / 60000);
    const seconds = Math.floor((sessionDuration % 60000) / 1000);
    sessionDurationDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Update unique hazards count from server data
    const uniqueHazards = new Set(reports.map(r => r.type));
    uniqueHazardsCount.textContent = uniqueHazards.size;
    
    // Update detections grid
    updateDetectionsGrid(reports);
    
    // Load saved reports (this is for a separate list in the modal, can remain)
    loadSavedReports();
  }

  function updateDetectionsGrid(reports = []) {
    if (reports.length === 0) {
      detectionsGrid.innerHTML = `
        <div class="no-detections">
          <i class="fas fa-search"></i>
          <p>No hazards were saved to the server for this session</p>
        </div>
      `;
      return;
    }

    detectionsGrid.innerHTML = reports.map((report, index) => `
      <div class="detection-item">
        ${report.image ? `
          <div class="detection-image">
            <img src="${report.image}" alt="${report.type}" onclick="showImageModal('${report.image}', '${report.type}')" />
          </div>
        ` : ''}
        <div class="detection-content">
          <div class="detection-item-header">
            <span class="detection-type">${report.type}</span>
            <span class="detection-confidence">${report.confidence}%</span>
          </div>
          <div class="detection-timestamp">${new Date(report.time).toLocaleTimeString()}</div>
          <div class="detection-location">
            <i class="fas fa-map-marker-alt"></i>
            ${report.location ? `${report.location.lat.toFixed(4)}, ${report.location.lng.toFixed(4)}` : 'Live Camera Feed'}
          </div>
        </div>
      </div>
    `).join('');
  }

  // Show image in modal
  function showImageModal(imageSrc, title) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
      <div class="image-modal-overlay" onclick="this.parentElement.remove()">
        <div class="image-modal-content" onclick="event.stopPropagation()">
          <div class="image-modal-header">
            <h3>${title}</h3>
            <button onclick="this.closest('.image-modal').remove()" class="image-modal-close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="image-modal-body">
            <img src="${imageSrc}" alt="${title}" style="max-width: 100%; max-height: 80vh;" />
          </div>
        </div>
      </div>
    `;
    
    // Add modal styles
    const style = document.createElement('style');
    style.textContent = `
      .image-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
      }
      .image-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .image-modal-content {
        background: #fff;
        border-radius: 8px;
        max-width: 90vw;
        max-height: 90vh;
        overflow: auto;
        cursor: default;
      }
      .image-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 15px 20px;
        border-bottom: 1px solid #eee;
      }
      .image-modal-header h3 {
        margin: 0;
        color: #333;
      }
      .image-modal-close {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #666;
      }
      .image-modal-body {
        padding: 20px;
        text-align: center;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(modal);
  }

  async function loadSavedReports() {
    try {
      savedReportsList.innerHTML = `
        <div class="loading-reports">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Loading saved reports...</p>
        </div>
      `;

      // Fetch saved reports from the server with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch('/api/reports', {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        
        // Handle different API response formats
        let reports = [];
        if (Array.isArray(data)) {
          reports = data;
        } else if (data.reports && Array.isArray(data.reports)) {
          reports = data.reports;
        } else if (data.data && Array.isArray(data.data)) {
          reports = data.data;
        } else {
          console.log('Unexpected API response format:', data);
          reports = [];
        }
        
        if (reports.length === 0) {
          savedReportsList.innerHTML = `
            <div class="no-detections">
              <i class="fas fa-inbox"></i>
              <p>No saved reports found</p>
            </div>
          `;
          return;
        }

        // Show recent reports (last 10)
        const recentReports = reports.slice(0, 10);
        
        savedReportsList.innerHTML = recentReports.map(report => `
          <div class="report-item">
            <div class="report-thumbnail" style="background-image: url('${report.image || '/images/placeholder.jpg'}')"></div>
            <div class="report-info">
              <div class="report-type">${report.type}</div>
              <div class="report-details">
                ${new Date(report.time).toLocaleDateString()} • ${report.location}
              </div>
            </div>
            <div class="report-status ${report.status === 'uploaded' ? 'uploaded' : 'pending'}">
              ${report.status}
            </div>
          </div>
        `).join('');
      } else if (response.status === 404) {
        // API endpoint doesn't exist - show placeholder
        savedReportsList.innerHTML = `
          <div class="no-detections">
            <i class="fas fa-info-circle"></i>
            <p>Reports API not available</p>
          </div>
        `;
      } else {
        throw new Error(`Failed to fetch reports: ${response.status}`);
      }
    } catch (error) {
      console.error('Error loading saved reports:', error);
      
      // Show different messages based on error type
      let errorMessage = 'Error loading reports';
      if (error.name === 'AbortError') {
        errorMessage = 'Request timed out';
      } else if (error.message.includes('404') || error.message.includes('Failed to fetch')) {
        errorMessage = 'Reports service unavailable';
      } else if (error.name === 'TypeError') {
        errorMessage = 'Connection error';
      }
      
      savedReportsList.innerHTML = `
        <div class="no-detections">
          <i class="fas fa-exclamation-triangle"></i>
          <p>${errorMessage}</p>
        </div>
      `;
    }
  }

  function exportSummary() {
    const summaryData = {
      sessionStats: {
        totalDetections: detectionStats.totalDetections,
        sessionDuration: Date.now() - detectionStats.sessionStart,
        uniqueHazards: Array.from(detectionStats.detectedHazards),
        sessionStart: new Date(detectionStats.sessionStart).toISOString(),
        sessionEnd: new Date().toISOString()
      },
      detections: sessionDetectionsSummary,
      performance: {
        averageProcessingTime: detectionStats.frameProcessingTimes.length > 0 
          ? Math.round(detectionStats.frameProcessingTimes.reduce((a, b) => a + b, 0) / detectionStats.frameProcessingTimes.length)
          : 0,
        totalFrames: frameCount
      }
    };

    const blob = new Blob([JSON.stringify(summaryData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `detection-summary-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Summary exported successfully', 'success');
  }

exportSummaryBtn.addEventListener('click', exportSummary);
  
  viewDashboardBtn.addEventListener('click', () => {
    window.location.href = '/dashboard.html';
  });

  // Additional UI elements for new functionality
  const captureBtn = document.getElementById('capture-btn');
  const summaryBtn = document.getElementById('summary-btn');
  const imagePreviewModal = new bootstrap.Modal(document.getElementById('imagePreviewModal'));
  const previewImage = document.getElementById('preview-image');
  const detectionMetadata = document.getElementById('detection-metadata');
  const saveDetectionBtn = document.getElementById('save-detection-btn');

  // Global variable to store current captured frame data for saving
  let currentCapturedData = null;

  // Manual capture function
  function captureCurrentFrame() {
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      showNotification('No video available for capture', 'error');
      return;
    }

    try {
      // Create canvas to capture the current frame
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth;
      captureCanvas.height = video.videoHeight;
      const captureCtx = captureCanvas.getContext('2d');
      
      // Draw the current video frame
      captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
      
      // Get current detections if available
      const currentDetections = lastDetections || [];
      
      // Create image with detections drawn on it for preview
      let previewCanvas = captureCanvas;
      if (currentDetections.length > 0) {
        previewCanvas = createDetectionImage(video, currentDetections);
      }
      
      // Store capture data for potential saving
      currentCapturedData = {
        canvas: captureCanvas,
        detections: currentDetections,
        timestamp: new Date().toISOString()
      };
      
      // Show preview in modal
      const imageDataUrl = previewCanvas.toDataURL('image/jpeg', 0.9);
      previewImage.src = imageDataUrl;
      
      // Update metadata
      const metadata = `
        <p><strong>Capture Time:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Detections Found:</strong> ${currentDetections.length}</p>
        ${currentDetections.length > 0 ? `
          <div class="detection-list">
            ${currentDetections.map((det) => {
              const [, , , , score, classId] = det;
              const correctedClassId = Math.floor(classId) - 1;
              const classIndex = Math.max(0, correctedClassId);
              const label = CLASS_NAMES[classIndex] || `Unknown Class ${classIndex}`;
              return `<p>• ${label} (${(score * 100).toFixed(1)}% confidence)</p>`;
            }).join('')}
          </div>
        ` : ''}
      `;
      detectionMetadata.innerHTML = metadata;
      
      // Show the modal
      imagePreviewModal.show();
      
      showNotification('Frame captured successfully', 'success');
      
    } catch (error) {
      console.error('Error capturing frame:', error);
      showNotification('Failed to capture frame', 'error');
    }
  }

  // Save the previewed detection
  async function savePreviewedDetection() {
    if (!currentCapturedData) {
      showNotification('No captured data to save', 'error');
      return;
    }

    try {
      const { canvas, detections, timestamp } = currentCapturedData;
      
      if (detections.length === 0) {
        // Save as manual capture without detections
        const imageUrl = await uploadDetection(canvas, []);
        
        const report = {
          type: 'Manual Capture',
          confidence: 100,
          timestamp: timestamp,
          imageUrl: imageUrl,
          location: { x: 0, y: 0, width: canvas.width, height: canvas.height },
          manual: true
        };
        
        // Note: Manual captures are handled separately from automatic detections
        // They could be stored in localStorage or sent to the server directly
        showNotification('Manual capture saved successfully', 'success');
      } else {
        // Save with detections using existing saveDetection function
        const primaryDetection = detections[0]; // Use first detection as primary
        await saveDetection(video, detections, primaryDetection);
        showNotification('Detection report saved successfully', 'success');
      }
      
      // Hide modal and clear captured data
      imagePreviewModal.hide();
      currentCapturedData = null;
      
    } catch (error) {
      console.error('Error saving previewed detection:', error);
      showNotification('Failed to save detection report', 'error');
    }
  }

  // Manual capture button
  if (captureBtn) {
    captureBtn.addEventListener('click', captureCurrentFrame);
  }

  // Summary button
  if (summaryBtn) {
    summaryBtn.addEventListener('click', showCameraSessionSummary);
  }

  // Save detection button in preview modal
  if (saveDetectionBtn) {
    saveDetectionBtn.addEventListener('click', savePreviewedDetection);
  }

  // Initialize on load
  async function main() {
    updateButtonStates();
    startBtn.disabled = true;
    
    const success = await initializeDetection();
    
    if (success) {
      startBtn.disabled = false;
      // Status is set by initializeDetection
    } else {
      startBtn.disabled = true;
      // Status is set by initializeDetection on failure
    }
    
    console.log("🚀 Enhanced Camera Detection System Loaded");
  }
  main();
});