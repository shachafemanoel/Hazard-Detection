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
  const FIXED_SIZE = 480;
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

  const pendingDetections = [];

  // Object tracking system
  let trackedObjects = new Map();
  let nextObjectId = 1;
  const MAX_TRACKING_DISTANCE = 150; // Maximum distance for object matching
  const TRACKING_PERSISTENCE_FRAMES = 20; // Keep tracked objects for 20 frames
  const INTERPOLATION_FRAMES = 4; // Number of frames to interpolate between detections

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
  
  // Offscreen canvas for processing
  const offscreen = document.createElement("canvas");
  offscreen.width = FIXED_SIZE;
  offscreen.height = FIXED_SIZE;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  let letterboxParams = null;
  let confidenceThreshold = 0.5;

  let initialized = false;

  // Update UI status
  function updateConnectionStatus(status, message) {
    const indicator = connectionStatus.querySelector('.status-indicator');
    const text = connectionStatus.querySelector('.status-text');
    
    indicator.className = `fas fa-circle status-indicator ${status}`;
    text.textContent = message;
  }

  // Show loading overlay with progress
  function showLoading(message, progress = 0) {
    loadingOverlay.classList.add('show');
    loadingStatus.textContent = message;
    loadingProgressBar.style.width = `${progress}%`;
  }

  // Hide loading overlay
  function hideLoading() {
    loadingOverlay.classList.remove('show');
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

  // Test API availability and start session
  async function testApiConnection() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
        signal: controller.signal
      });

      if (response.ok) {
        clearTimeout(timeoutId);
        const data = await response.json();
        console.log("✅ API service is available:", data);
        apiAvailable = true;
        useApi = true;
        updateConnectionStatus('connected', 'Enhanced API + ONNX Mode');
        showNotification("API service connected - Enhanced detection available", 'success');
        return true;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log("🔄 API health check timed out - using local detection");
      } else {
        console.log("🏠 API service not accessible - using local ONNX detection");
      }
    } finally {
      clearTimeout(timeoutId);
    }

    apiAvailable = false;
    updateConnectionStatus('ready', 'Local ONNX Detection Mode');
    console.log("🤖 Running in local detection mode - ONNX model will handle all detection");
    return false;
  }

  // Start API detection session
  async function startApiSession() {
    if (!apiAvailable) return false;
    
    try {
      const response = await fetch(`${API_URL}/session/start`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const data = await response.json();
        apiSessionId = data.session_id;
        console.log("✅ API session started:", apiSessionId);
        return true;
      } else {
        throw new Error(`Failed to start session: ${response.status}`);
      }
    } catch (error) {
      console.error("❌ Failed to start API session:", error);
      apiAvailable = false;
      updateConnectionStatus('warning', 'Session Failed - ONNX Only');
      return false;
    }
  }

  // End API detection session
  async function endApiSession() {
    if (!apiSessionId) return;
    
    try {
      const response = await fetch(`${API_URL}/session/${apiSessionId}/end`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("✅ API session ended:", data);
        apiSessionId = null;
        return data;
      }
    } catch (error) {
      console.error("❌ Failed to end API session:", error);
    }
    apiSessionId = null;
  }

  // Load ONNX model
  async function loadModel() {
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

  // Initialize detection system
  async function initializeDetection() {
    showLoading("Initializing Detection System...", 0);
    initialized = false;

    try {
      // Test API connection
      showLoading("Testing API connection...", 10);
      await testApiConnection();
      
      // Load ONNX model
      const onnxLoaded = await loadModel();
      
      if (!onnxLoaded && !apiAvailable) {
        throw new Error("No detection models available. Please check your connection.");
      }

      const modeMessage = apiAvailable 
        ? "🚀 Enhanced detection ready with API + ONNX support" 
        : "🎯 Local detection ready with ONNX model";
      
      showNotification(modeMessage, 'success');
      initialized = true;
      return true;
    } catch (error) {
      showNotification(`Initialization failed: ${error.message}`, 'error');
      return false;
    } finally {
      // A short delay to ensure the final loading message is visible before hiding.
      setTimeout(() => {
        hideLoading();
      }, 500); // 500ms delay
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

      // Parse detections (matching upload_tf.js logic)
      const boxes = [];
      for (let i = 0; i < outputData.length; i += 6) {
        boxes.push(outputData.slice(i, i + 6));
      }

      const processingTime = performance.now() - startTime;
      detectionStats.frameProcessingTimes.push(processingTime);
      
      return boxes;
    } catch (error) {
      console.error("ONNX detection error:", error);
      return [];
    }
  }

  // Process frame with API using session-based detection
  async function detectWithApi(canvas) {
    if (!apiAvailable || !apiSessionId) {
      // Try to start session if not available
      if (apiAvailable && !apiSessionId) {
        await startApiSession();
      }
      if (!apiSessionId) return [];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // Increased timeout for session-based detection

    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');

      const response = await fetch(`${API_URL}/detect/${apiSessionId}`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Session expired, try to start new one
          console.warn("Session expired, starting new session");
          apiSessionId = null;
          if (await startApiSession()) {
            return await detectWithApi(canvas); // Retry with new session
          }
        }
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      
      // Log new detections for debugging
      const newDetections = result.detections.filter(det => det.is_new);
      if (newDetections.length > 0) {
        console.log("🆕 New hazards detected via API:", newDetections.map(d => `${d.class_name} (${(d.confidence * 100).toFixed(1)}%)`));
      }

      return result.detections.map(det => [
        det.bbox[0], det.bbox[1],
        det.bbox[0] + det.bbox[2], det.bbox[1] + det.bbox[3],
        det.confidence,
        classNames.indexOf(det.class_name) !== -1 ? classNames.indexOf(det.class_name) : 0
      ]);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn("API detection request timed out");
      } else {
        console.warn("API detection failed:", error);
        // If session-related error, reset session
        if (error.message.includes('404') || error.message.includes('session')) {
          apiSessionId = null;
        }
      }
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function saveDetection(canvas, label, score) {
    try {
      // Create a simple detection report (matching upload_tf.js structure)
      const report = {
        type: label,
        location: "Unknown",
        time: new Date().toISOString(),
        image: canvas.toDataURL("image/jpeg", 0.9),
        status: "unreviewed",
        reportedBy: "anonymous"
      };

      pendingDetections.push(report);
      console.log("📝 Detection queued:", report);
    } catch (err) {
      console.error("❌ Error during image preparation:", err);
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
    
    // Filter detections by confidence
    const validDetections = newDetections.filter(box => box[4] >= confidenceThreshold);
    
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
        if (Math.floor(classId) !== trackedObj.classId) return;
        
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
        classId: Math.floor(classId),
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
    
    return processedBoxes;
  }

  // Draw detection results with object tracking
  function drawResults(boxes, useApiResults = false) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply object tracking to detections
    const trackedBoxes = trackObjects(boxes);

    let currentFrameDetections = 0;
    const detectedTypes = new Set();

    // Draw all tracked objects (including interpolated ones)
    for (const [id, trackedObj] of trackedObjects) {
      let [x1, y1, x2, y2, score, classId] = trackedObj.box;

      // Scale coordinates back to video dimensions
      if (!useApiResults) {
        const scaleX = video.videoWidth / FIXED_SIZE;
        const scaleY = video.videoHeight / FIXED_SIZE;
        x1 = x1 * scaleX;
        y1 = y1 * scaleY;
        x2 = x2 * scaleX;
        y2 = y2 * scaleY;
      }

      const boxW = x2 - x1;
      const boxH = y2 - y1;

      if (boxW < 1 || boxH < 1) continue;

      currentFrameDetections++;
      const labelName = classNames[Math.floor(classId)] || `Class ${classId}`;
      const scorePerc = (trackedObj.confidence * 100).toFixed(1);
      
      detectedTypes.add(labelName);
      detectionStats.detectedHazards.add(labelName);

      // Enhanced visual styling with tracking indicators
      const framesSinceLastDetection = frameCount - trackedObj.lastDetectionFrame;
      const isInterpolated = framesSinceLastDetection > 0;
      
      // Color and alpha based on tracking state
      let color = useApiResults ? '#00FF41' : '#00FF00';
      let alpha = Math.min(trackedObj.confidence + 0.2, 1.0);
      
      // Different visual style for interpolated vs detected boxes
      if (isInterpolated) {
        color = '#FFD700'; // Gold color for interpolated
        alpha *= 0.8; // Slightly more transparent
        ctx.setLineDash([5, 5]); // Dashed line for interpolated
      } else {
        ctx.setLineDash([]); // Solid line for detected
      }
      
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = isInterpolated ? 2 : 3;
      ctx.strokeRect(x1, y1, boxW, boxH);

      // Draw tracking ID (small number in top-left corner)
      ctx.fillStyle = color;
      ctx.font = 'bold 12px Arial';
      ctx.fillText(`#${trackedObj.id}`, x1 + 2, y1 + 12);

      // Label background (improved styling)
      ctx.font = 'bold 16px Arial';
      const text = `${labelName} (${scorePerc}%)`;
      const textWidth = ctx.measureText(text).width;
      const textBgY = y1 > 20 ? y1 - 20 : y1;
      
      ctx.fillRect(x1, textBgY, textWidth + 8, 20);
      ctx.fillStyle = 'black';
      ctx.fillText(text, x1 + 4, textBgY + 15);
      
      // Reset drawing state
      ctx.globalAlpha = 1.0;
      ctx.setLineDash([]);

      console.log(`📦 Tracked object #${trackedObj.id}:`, labelName, scorePerc + "%", isInterpolated ? "(interpolated)" : "(detected)");

      // Save detection periodically
      if (frameCount % 60 === 0 && !isInterpolated) {
        const snap = document.createElement('canvas');
        snap.width = canvas.width;
        snap.height = canvas.height;
        snap.getContext('2d').drawImage(canvas, 0, 0);
        saveDetection(snap, labelName, trackedObj.confidence).catch((e) => console.error(e));
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
  async function detectionLoop() {
    if (!detecting || !session) return;

    frameCount++;
    frameCountDisplay.textContent = frameCount;

    if (!letterboxParams) computeLetterboxParams();

    // Always draw current persistent detections for smooth visualization
    drawResults([], false);
    updatePerformanceStats();

    // Process detection every 4th frame for better performance
    if (frameCount % 4 === 0) {
      // Prepare frame for detection
      offCtx.fillStyle = "black";
      offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
      offCtx.drawImage(video, letterboxParams.offsetX, letterboxParams.offsetY, letterboxParams.newW, letterboxParams.newH);

      const imageData = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);
      
      let detections = [];
      let useApiResults = false;

      // Try API detection first (if available), then fallback to ONNX
      if (apiAvailable && useApi && apiSessionId && frameCount % 8 === 0) { // Use API every 8th frame
        try {
          detections = await detectWithApi(offscreen);
          if (detections.length > 0) {
            useApiResults = true;
            console.log("🔥 Using API detection results");
          }
        } catch (error) {
          console.warn("API detection failed, using ONNX fallback:", error);
        }
      }

      // Fallback to ONNX if API didn't return results or failed
      if (detections.length === 0 && session) {
        detections = await detectWithOnnx(imageData);
      }

      // Update detections with new results
      if (detections.length > 0) {
        drawResults(detections, useApiResults);
      }
    }

    requestAnimationFrame(detectionLoop);
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

      // Start API session if available
      if (apiAvailable && !apiSessionId) {
        updateConnectionStatus('processing', 'Starting API Session...');
        await startApiSession();
      }

      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: currentCamera
        }
      };

      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      
      detecting = true;
      updateButtonStates(); // Hide start, show stop

      video.addEventListener("loadeddata", () => {
        computeLetterboxParams();
        setDetectingState(true);
        detectionStats.sessionStart = Date.now();
        const statusMsg = apiSessionId ? 'API + ONNX Detection Active' : 'ONNX Detection Active';
        updateConnectionStatus('processing', statusMsg);
        detectionLoop();
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

    // End API session and get summary
    if (apiSessionId) {
      updateConnectionStatus('processing', 'Ending API Session...');
      try {
        const sessionSummary = await endApiSession();
        if (sessionSummary) {
          console.log("📊 Session Summary:", sessionSummary);
          if (sessionSummary.total_detections > 0) {
            showNotification(`Session ended: ${sessionSummary.total_detections} total detections`, 'success');
          }
        }
      } catch (error) {
        console.error("Failed to get session summary:", error);
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

    // Reset stats and clear tracking data
    frameCount = 0;
    trackedObjects.clear();
    nextObjectId = 1;

    detectionStats = {
      totalDetections: 0,
      sessionStart: Date.now(),
      frameProcessingTimes: [],
      detectedHazards: new Set()
    };

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

  // sensitivity
  sensitivitySlider.addEventListener("input", (e) => {
    confidenceThreshold = parseFloat(e.target.value);
    e.target.parentElement.querySelector('.value').textContent = `${Math.round(confidenceThreshold * 100)}%`;
  });
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