// Enhanced Camera Detection System with Hybrid ONNX + API Detection
document.addEventListener("DOMContentLoaded", async () => {
  // DOM Elements
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
  const switchCameraBtn = document.getElementById("switch-camera");
  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext("2d");
  const sensitivitySlider = document.getElementById("sensitivity-slider");
  
  // Status and stats elements
  const connectionStatus = document.getElementById("connection-status");
  const loadingOverlay = document.getElementById("loading-overlay");
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

  // Configuration
  const FIXED_SIZE = 640;
  const API_URL = "https://hazard-api-production-production.up.railway.app";
  
  // Updated class names to match the API service
  const classNames = [
    'crack',
    'knocked', 
    'pothole',
    'surface_damage'
  ];

  // Detection state
  let stream = null;
  let detecting = false;
  let currentCamera = 'user'; // 'user' for front, 'environment' for back
  let session = null;
  let apiAvailable = false;
  let frameCount = 0;
  let detectionStats = {
    totalDetections: 0,
    sessionStart: Date.now(),
    frameProcessingTimes: [],
    detectedHazards: new Set()
  };

  // Performance monitoring
  let fpsCounter = 0;
  let lastFpsUpdate = Date.now();
  
  // Offscreen canvas for processing
  const offscreen = document.createElement("canvas");
  offscreen.width = FIXED_SIZE;
  offscreen.height = FIXED_SIZE;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  let letterboxParams = null;
  let confidenceThreshold = 0.5;

  // Update UI status
  function updateConnectionStatus(status, message) {
    const indicator = connectionStatus.querySelector('.status-indicator');
    const text = connectionStatus.querySelector('.status-text');
    
    indicator.className = `fas fa-circle status-indicator ${status}`;
    text.textContent = message;
  }

  // Show loading overlay with progress
  function showLoading(message, progress = 0) {
    loadingOverlay.style.display = 'flex';
    loadingStatus.textContent = message;
    loadingProgressBar.style.width = `${progress}%`;
  }

  // Hide loading overlay
  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }

  // Show notification
  function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
      <span class="notification-text">${message}</span>
      <button onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(notification);
    
    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }

  // Test API availability
  async function testApiConnection() {
    try {
      const response = await fetch(`${API_URL}/health`, { 
        method: 'GET',
        timeout: 5000 
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("✅ API service is available:", data);
        apiAvailable = true;
        updateConnectionStatus('connected', 'API Enhanced Mode');
        return true;
      }
    } catch (error) {
      console.warn("⚠️ API service unavailable, using ONNX only:", error.message);
    }
    
    apiAvailable = false;
    updateConnectionStatus('warning', 'ONNX Only Mode');
    return false;
  }

  // Load ONNX model
  async function loadOnnxModel() {
    try {
      showLoading("Loading ONNX Runtime model...", 25);
      
      // Enhanced model path detection with fallbacks
      const modelPaths = [
        './object_detecion_model/model 18_7.onnx',
        './object_detecion_model/road_damage_detection_last_version.onnx',
        './object_detecion_model/last_model_train12052025.onnx',
        './object_detecion_model/road_damage_detection_simplified.onnx'
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

      // Try WebGL first, then fallback to CPU
      try {
        session = await ort.InferenceSession.create(modelPath, { 
          executionProviders: ['webgl'],
          graphOptimizationLevel: 'disabled',
          enableCpuMemArena: false,
          logSeverityLevel: 2
        });
        console.log("✅ ONNX model loaded with WebGL acceleration");
      } catch (err) {
        console.warn("WebGL backend failed, falling back to CPU:", err);
        session = await ort.InferenceSession.create(modelPath, {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'disabled',
          enableCpuMemArena: false,
          logSeverityLevel: 2
        });
        console.log("✅ ONNX model loaded with CPU backend");
      }

      showLoading("Model loaded successfully!", 100);
      return true;
    } catch (err) {
      console.error("❌ Failed to load ONNX model:", err);
      showNotification("Failed to load AI model. Detection may be limited.", 'error');
      return false;
    }
  }

  // Initialize detection system
  async function initializeDetection() {
    showLoading("Initializing Detection System...", 0);
    
    // Test API connection
    showLoading("Testing API connection...", 10);
    await testApiConnection();
    
    // Load ONNX model
    const onnxLoaded = await loadOnnxModel();
    
    if (!onnxLoaded && !apiAvailable) {
      hideLoading();
      showNotification("No detection models available. Please check your connection.", 'error');
      return false;
    }

    hideLoading();
    showNotification(
      apiAvailable ? "Enhanced detection ready with API support" : "Basic detection ready", 
      'success'
    );
    return true;
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
      // Prepare tensor data
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
      const outputData = results[outputKey].data;

      // Parse detections
      const boxes = [];
      for (let i = 0; i < outputData.length; i += 6) {
        const box = outputData.slice(i, i + 6);
        if (box[4] >= confidenceThreshold) { // confidence check
          boxes.push(box);
        }
      }

      const processingTime = performance.now() - startTime;
      detectionStats.frameProcessingTimes.push(processingTime);
      
      return boxes;
    } catch (error) {
      console.error("ONNX detection error:", error);
      return [];
    }
  }

  // Process frame with API (when available)
  async function detectWithApi(canvas) {
    if (!apiAvailable) return [];

    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');

      const response = await fetch(`${API_URL}/detect`, {
        method: 'POST',
        body: formData,
        timeout: 2000 // Short timeout for real-time detection
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      const result = await response.json();
      
      // Convert API format to our box format [x1, y1, x2, y2, confidence, classId]
      return result.detections.map(det => [
        det.bbox[0], det.bbox[1], 
        det.bbox[0] + det.bbox[2], det.bbox[1] + det.bbox[3],
        det.confidence,
        classNames.indexOf(det.class) !== -1 ? classNames.indexOf(det.class) : 0
      ]);
    } catch (error) {
      console.warn("API detection failed:", error);
      return [];
    }
  }

  // Draw detection results
  function drawDetections(boxes, useApiResults = false) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let currentFrameDetections = 0;
    const detectedTypes = new Set();

    boxes.forEach((box) => {
      let [x1, y1, x2, y2, score, classId] = box;
      
      // Scale coordinates back to video dimensions
      const scaleX = video.videoWidth / FIXED_SIZE;
      const scaleY = video.videoHeight / FIXED_SIZE;
      
      if (!useApiResults) {
        x1 *= scaleX;
        y1 *= scaleY;
        x2 *= scaleX;
        y2 *= scaleY;
      }

      const boxW = x2 - x1;
      const boxH = y2 - y1;

      if (boxW <= 1 || boxH <= 1) return;

      currentFrameDetections++;
      const labelName = classNames[Math.floor(classId)] || `Class ${classId}`;
      const scorePerc = (score * 100).toFixed(1);
      
      detectedTypes.add(labelName);
      detectionStats.detectedHazards.add(labelName);

      // Enhanced visual styling
      const color = useApiResults ? '#00FF41' : '#FF6B35'; // Green for API, Orange for ONNX
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, boxW, boxH);

      // Label background
      ctx.fillStyle = color;
      ctx.font = 'bold 16px Inter';
      const text = `${labelName} (${scorePerc}%)`;
      const textWidth = ctx.measureText(text).width;
      const textBgY = y1 > 25 ? y1 - 25 : y1;
      
      ctx.fillRect(x1, textBgY, textWidth + 10, 25);
      ctx.fillStyle = '#000';
      ctx.fillText(text, x1 + 5, textBgY + 18);
    });

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

  // Update FPS and performance stats
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
      
      fpsCounter = 0;
      lastFpsUpdate = now;
      
      // Keep only recent processing times
      if (detectionStats.frameProcessingTimes.length > 30) {
        detectionStats.frameProcessingTimes = detectionStats.frameProcessingTimes.slice(-30);
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

  // Main detection loop
  async function detectLoop() {
    if (!detecting) return;

    frameCount++;
    frameCountDisplay.textContent = frameCount;

    // Process every 2nd frame for better performance
    if (frameCount % 2 !== 0) {
      requestAnimationFrame(detectLoop);
      return;
    }

    if (!letterboxParams) computeLetterboxParams();

    // Prepare frame for detection
    offCtx.fillStyle = "black";
    offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
    offCtx.drawImage(video, letterboxParams.offsetX, letterboxParams.offsetY, letterboxParams.newW, letterboxParams.newH);

    const imageData = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);
    
    let detections = [];
    let useApiResults = false;

    // Try API detection first (if available), then fallback to ONNX
    if (apiAvailable && frameCount % 10 === 0) { // Use API every 10th frame
      detections = await detectWithApi(offscreen);
      if (detections.length > 0) {
        useApiResults = true;
        console.log("🔥 Using API detection results");
      }
    }

    // Fallback to ONNX if API didn't return results
    if (detections.length === 0 && session) {
      detections = await detectWithOnnx(imageData);
    }

    drawDetections(detections, useApiResults);
    updatePerformanceStats();

    requestAnimationFrame(detectLoop);
  }

  // Event Listeners
  startBtn.addEventListener("click", async () => {
    if (!session && !apiAvailable) {
      const initialized = await initializeDetection();
      if (!initialized) return;
    }

    try {
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: currentCamera
        }
      };

      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      
      startBtn.style.display = "none";
      stopBtn.style.display = "inline-block";
      switchCameraBtn.style.display = "inline-block";

      video.addEventListener("loadeddata", () => {
        computeLetterboxParams();
        detecting = true;
        setDetectingState(true);
        detectionStats.sessionStart = Date.now();
        detectLoop();
      }, { once: true });

    } catch (err) {
      showNotification("Camera access denied or unavailable", 'error');
      console.error("Camera error:", err);
    }
  });

  stopBtn.addEventListener("click", () => {
    detecting = false;
    setDetectingState(false);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    video.srcObject = null;
    startBtn.style.display = "inline-block";
    stopBtn.style.display = "none";
    switchCameraBtn.style.display = "none";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Reset stats
    frameCount = 0;
    fpsCounter = 0;
    detectionStats = {
      totalDetections: 0,
      sessionStart: Date.now(),
      frameProcessingTimes: [],
      detectedHazards: new Set()
    };
    
    updateConnectionStatus('ready', 'System Ready');
  });

  switchCameraBtn.addEventListener("click", async () => {
    if (!detecting) return;
    
    currentCamera = currentCamera === 'user' ? 'environment' : 'user';
    
    // Stop current stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    // Start with new camera
    try {
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: currentCamera
        }
      };

      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      
      video.addEventListener("loadeddata", () => {
        computeLetterboxParams();
      }, { once: true });
      
    } catch (err) {
      showNotification("Failed to switch camera", 'error');
      console.error("Camera switch error:", err);
    }
  });

  sensitivitySlider.addEventListener("input", (e) => {
    confidenceThreshold = parseFloat(e.target.value);
    e.target.parentElement.querySelector('.value').textContent = `${Math.round(confidenceThreshold * 100)}%`;
  });

  // Initialize on load
  updateConnectionStatus('ready', 'System Ready');
  console.log("🚀 Enhanced Camera Detection System Loaded");
});