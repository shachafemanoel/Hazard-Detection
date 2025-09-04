// upload_tf_fixed.js
// Global error handler
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
  if (modelStatus !== ModelStatus.ERROR) {
    modelStatus = ModelStatus.ERROR;
    modelError = event.reason;
    updateLoadingUI(ModelStatus.ERROR, 0, 'Unexpected error: ' + event.reason.message);
  }
});

// Check for WebAssembly support
if (!('WebAssembly' in window)) {
  alert('This browser does not support WebAssembly. The application may not work correctly.');
}

document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
  const switchBtn = document.getElementById("switch-camera");
  const cameraSelect = document.getElementById("camera-select");
  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext('2d');
  const supportsFacingMode = navigator.mediaDevices.getSupportedConstraints().facingMode;
  
  // Verify all required elements are present
  if (!startBtn || !stopBtn || !switchBtn || !video || !canvas || !ctx) {
    console.error('Required DOM elements not found');
    alert('Error: Required page elements not found. Please refresh the page.');
    return;
  }
  const objectCountOverlay = document.getElementById('object-count-overlay');
  const loadingOverlay = document.getElementById('loading-overlay');
  const hazardTypesOverlay = document.getElementById('hazard-types-overlay');
  
  const FIXED_SIZE = 640; // Match yolo_tfjs.js default size
  let stream = null;
  let detecting = false;
  let session = null;
  let frameCount = 0;
  let lastSaveTime = 0;
  let _lastCoords = null;
  let _watchId    = null;
  let videoDevices = [];
  let currentCamIndex = 0;
  let currentFacingMode = 'environment';
  let skipFrames = 3;
  const targetFps = 15;
  let rafId = null;
  let lastResizeCheck = 0;
  let isProcessingFrame = false;
  let detectedObjectCount = 0;
  let uniqueHazardTypes = [];
  const trackEventHandlers = new WeakMap();

  function addTrackEventListeners(track) {
    const endedHandler = () => onCameraEnded(track);
    track.addEventListener('ended', endedHandler);
    trackEventHandlers.set(track, { ended: endedHandler });
  }

  function removeTrackEventListeners(track) {
    const handlers = trackEventHandlers.get(track);
    if (handlers) {
      track.removeEventListener('ended', handlers.ended);
      trackEventHandlers.delete(track);
    }
  }

  function stopStream(mediaStream) {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => {
        removeTrackEventListeners(track);
        track.stop();
        console.log(`⏹️ Stopped track: ${track.kind} - ${track.label}`);
      });
    }
  }

  function onCameraEnded(track) {
    console.log(`⚠️ Camera track ended: ${track.label}`);
    if (detecting) {
      console.log('🔄 Camera ended during detection, attempting restart...');
    }
  }

  async function enumerateAndPopulateCameras() {
    try {
      console.log("🔍 Enumerating media devices...");
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter((d) => d.kind === "videoinput");
      videoDevices.sort((a, b) => {
        const aLabel = (a.label || '').toLowerCase();
        const bLabel = (b.label || '').toLowerCase();
        const aIsRear = aLabel.includes('back') || aLabel.includes('rear') || aLabel.includes('environment');
        const bIsRear = bLabel.includes('back') || bLabel.includes('rear') || bLabel.includes('environment');
        if (aIsRear && !bIsRear) return -1;
        if (!aIsRear && bIsRear) return 1;
        return 0;
      });
      console.log(`📸 Found ${videoDevices.length} video devices.`);
      
      if (cameraSelect && videoDevices.length > 0) {
        cameraSelect.innerHTML = "";
        videoDevices.forEach((device, index) => {
          const option = document.createElement("option");
          option.value = device.deviceId;
          const label = device.label || `Camera ${index + 1}`;
          const isRear = label.toLowerCase().includes('back') || label.toLowerCase().includes('rear') || label.toLowerCase().includes('environment');
          option.textContent = isRear ? `📷 ${label} (Rear)` : `🤳 ${label} (Front)`;
          cameraSelect.appendChild(option);
        });
      }
      
      if (videoDevices.length > 1 || supportsFacingMode) {
        switchBtn.style.display = 'inline-block';
        if (videoDevices.length > 1 && cameraSelect) cameraSelect.style.display = 'inline-block';
        else if (cameraSelect) cameraSelect.style.display = 'none';
      } else {
        switchBtn.style.display = 'none';
        if (cameraSelect) cameraSelect.style.display = 'none';
      }
    } catch (err) {
      console.warn("⚠️ Could not enumerate video devices:", err);
    }
  }

  let modelLoadAttempts = 0;
  const MAX_LOAD_ATTEMPTS = 3;
  const LOAD_TIMEOUT = 30000; // 30 seconds timeout

  async function initializeWithRetry() {
    await enumerateAndPopulateCameras();
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    // Pre-load check for ONNX Runtime
    if (!window.ort) {
      const errorMsg = 'ONNX Runtime not loaded. Please check your internet connection and refresh the page.';
      console.error('❌', errorMsg);
      updateLoadingUI(ModelStatus.ERROR, 0, errorMsg);
      if (startBtn) startBtn.disabled = true;
      return;
    }

    // Check WebAssembly support
    if (!('WebAssembly' in window)) {
      const errorMsg = 'WebAssembly is not supported in this browser. The application cannot run.';
      console.error('❌', errorMsg);
      updateLoadingUI(ModelStatus.ERROR, 0, errorMsg);
      if (startBtn) startBtn.disabled = true;
      return;
    }

    while (modelLoadAttempts < MAX_LOAD_ATTEMPTS) {
      modelLoadAttempts++;
      console.log(`📦 Model load attempt ${modelLoadAttempts}/${MAX_LOAD_ATTEMPTS}`);
      updateLoadingUI(ModelStatus.LOADING_MODEL, (modelLoadAttempts - 1) * 25, 
        `Loading AI model (Attempt ${modelLoadAttempts}/${MAX_LOAD_ATTEMPTS})...`);

      try {
        // Import optimized functions with timeout
        const importTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Function import timed out')), 10000));
        
        await Promise.race([
          importOptimizedFunctions(),
          importTimeout
        ]).catch(err => {
          throw new Error(`Failed to import optimized functions: ${err.message}`);
        });

        // Load model with timeout
        const modelTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Model loading timed out')), LOAD_TIMEOUT));

        await Promise.race([
          (async () => {
            const success = await loadModel();
            if (!success) throw new Error('Model initialization returned false');
            console.log("✅ Model loaded successfully on attempt", modelLoadAttempts);
            return true;
          })(),
          modelTimeout
        ]);

        // Quick verification test
        updateLoadingUI(ModelStatus.WARMING_UP, 75, 'Verifying model...');
        const testTensor = new window.ort.Tensor(
          'float32', 
          new Float32Array(FIXED_SIZE * FIXED_SIZE * 3).fill(0.5),
          [1, 3, FIXED_SIZE, FIXED_SIZE]
        );
        await session.run({ images: testTensor });

        // If we get here, everything worked
        console.log("✅ Model verified and ready to use");
        return true;

      } catch (err) {
        console.error(`❌ Attempt ${modelLoadAttempts} failed:`, err);
        
        if (modelLoadAttempts === MAX_LOAD_ATTEMPTS) {
          const errorMsg = `Failed to load model after ${MAX_LOAD_ATTEMPTS} attempts: ${err.message}`;
          console.error('❌', errorMsg);
          reportError(ErrorCodes.MODEL_LOAD, errorMsg);
          updateLoadingUI(ModelStatus.ERROR, 0, errorMsg);
          if (startBtn) startBtn.disabled = true;
          return false;
        }

        // Wait before retrying with increasing delay
        const delay = Math.min(2000 * modelLoadAttempts, 10000);
        console.log(`⏳ Waiting ${delay/1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        updateLoadingUI(ModelStatus.NOT_STARTED, 0, 
          `Retrying in ${delay/1000} seconds... (Attempt ${modelLoadAttempts + 1}/${MAX_LOAD_ATTEMPTS})`);
      }
    }
  }

  // Start initialization
  initializeWithRetry();

  const classNames = ['crack', 'pothole'];

  function initLocationTracking() {
    return new Promise(resolve => {
      console.log("🌍 Starting location tracking...");
      if (!navigator.geolocation) {
        console.warn("⚠️ Geolocation not supported");
        return resolve(null);
      }
      if (_lastCoords) {
        console.log("📍 Using existing location cache");
        return resolve(_lastCoords);
      }
      let done = false;
      const handleCoords = (coords) => {
        if (done) return;
        done = true;
        _lastCoords = coords;
        console.log("📍 Location acquired:", coords.latitude, coords.longitude);
        resolve(coords);
      };
      navigator.geolocation.getCurrentPosition(
        pos => handleCoords(pos.coords),
        () => {
          navigator.geolocation.getCurrentPosition(
            pos2 => handleCoords(pos2.coords),
            () => {
              console.log("⚠️ Location access failed, continuing without initial location");
              resolve(null);
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
          );
        },
        { enableHighAccuracy: true, timeout: 3000, maximumAge: 60000 }
      );
      try {
        _watchId = navigator.geolocation.watchPosition(
          pos => { _lastCoords = pos.coords; },
          err => { console.warn("watchPosition error:", err.code, err.message); },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
        );
      } catch (watchErr) {
        console.warn("Failed to start watchPosition:", watchErr);
      }
    });
  }

  function stopLocationTracking() {
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
      _watchId = null;
    }
  }

  async function saveDetection(canvas, label = "Unknown") {
    let geoData, locationNote;
    if (_lastCoords) {
      geoData = JSON.stringify({ lat: _lastCoords.latitude, lng: _lastCoords.longitude });
      locationNote = "GPS (Cached)";
    } else {
      try {
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }));
        geoData = JSON.stringify({ lat: position.coords.latitude, lng: position.coords.longitude });
        locationNote = "GPS (Fresh)";
        _lastCoords = position.coords;
      } catch (gpsErr) {
        try {
          const ipRes  = await fetch("https://ipapi.co/json/");
          const ipJson = await ipRes.json();
          geoData = JSON.stringify({ lat: ipJson.latitude, lng: ipJson.longitude });
          locationNote = "Approximate (IP)";
        } catch (ipErr) {
          reportError(ErrorCodes.UNSUPPORTED, 'IP location fallback failed: ' + ipErr.message);
          geoData = JSON.stringify({ lat: 32.0853, lng: 34.7818 });
          locationNote = "Default Location";
        }
      }
    }
    canvas.toBlob(async blob => {
      if (!blob) return reportError(ErrorCodes.FILE_READ, 'Failed to generate image blob');
      
      // Create form data with image and metadata
      const file = new File([blob], `detection_${Date.now()}.jpg`, { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("geoData", geoData);
      formData.append("hazardTypes", label);
      formData.append("locationNote", locationNote);
      formData.append("timestamp", new Date().toISOString());
      
      try {
        // Upload to server (which will use Cloudinary)
        const res = await fetch("/upload-detection", {
          method: "POST",
          body: formData,
          credentials: "include",
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText);
        }

        const response = await res.json();
        
        // Show success message with location info
        toastOnce(
          `save-${Date.now()}`, 
          `✅ ${label} detected & saved (${locationNote})`, 
          'success'
        );

        // Log for monitoring
        console.log("🎯 Detection saved successfully:", {
          type: label,
          location: locationNote,
          timestamp: new Date().toISOString()
        });

      } catch (err) {
        console.error("❌ Upload failed:", err);
        reportError(
          ErrorCodes.UPLOAD_FAILED, 
          `Failed to save detection: ${err.message}`,
          { toastOptions: { duration: 5000 } }
        );
      }
    }, "image/jpeg", 0.9);
  }

  const ModelStatus = {
    NOT_STARTED: 'not_started',
    LOADING_RUNTIME: 'loading_runtime',
    LOADING_MODEL: 'loading_model',
    WARMING_UP: 'warming_up',
    READY: 'ready',
    ERROR: 'error'
  };

  let modelStatus = ModelStatus.NOT_STARTED;
  let modelError = null;

  function updateLoadingUI(status, progress, error = null) {
    if (!loadingOverlay) return;

    const statusMessages = {
      [ModelStatus.NOT_STARTED]: 'Initializing...',
      [ModelStatus.LOADING_RUNTIME]: 'Loading AI Runtime...',
      [ModelStatus.LOADING_MODEL]: 'Loading AI Model...',
      [ModelStatus.WARMING_UP]: 'Preparing Model...',
      [ModelStatus.READY]: 'Ready!',
      [ModelStatus.ERROR]: `Error: ${error || 'Unknown error'}`
    };

    if (status === ModelStatus.ERROR) {
      loadingOverlay.innerHTML = `
        <div class="alert alert-danger error-message p-4 shadow-sm">
          <div class="d-flex align-items-center mb-3">
            <i class="fas fa-exclamation-triangle fa-2x me-3"></i>
            <h4 class="alert-heading mb-0">Error Loading Model</h4>
          </div>
          <p class="mb-3">${error || 'An unknown error occurred'}</p>
          ${modelError?.stack ? `
            <div class="error-details small text-muted bg-light bg-opacity-10 p-2 rounded mb-3 overflow-auto" style="max-block-size: 150px">
              ${modelError.stack}
            </div>
          ` : ''}
          <hr>
          <div class="d-flex justify-content-center gap-2">
            <button onclick="location.reload()" class="btn btn-primary">
              <i class="fas fa-redo me-2"></i> Try Again
            </button>
            <button onclick="window.HDTests.quickCheck()" class="btn btn-outline-secondary">
              <i class="fas fa-stethoscope me-2"></i> Run Diagnostics
            </button>
          </div>
        </div>
      `;
    } else {
      // Only update inner HTML if elements don't exist
      if (!loadingOverlay.querySelector('.loading-status')) {
        loadingOverlay.innerHTML = `
          <div class="loading-content p-4 text-center">
            <div class="loading-icon mb-3">
              <i class="fas fa-circle-notch fa-spin fa-3x text-primary"></i>
            </div>
            <h4 class="loading-status mb-3">${statusMessages[status]}</h4>
            <div class="progress" style="height: 10px;">
              <div class="progress-bar progress-bar-striped progress-bar-animated" 
                   role="progressbar" 
                   style="--bs-progress-width: ${progress}%" 
                   aria-valuenow="${progress}" 
                   aria-valuemin="0" 
                   aria-valuemax="100">
              </div>
            </div>
            <div class="progress-text mt-2 text-muted small">
              <span class="progress-percentage">${progress}%</span> Complete
            </div>
          </div>
        `;
      } else {
        // Update existing elements
        const statusEl = loadingOverlay.querySelector('.loading-status');
        const progressBar = loadingOverlay.querySelector('.progress-bar');
        const progressText = loadingOverlay.querySelector('.progress-percentage');
        
        if (statusEl) statusEl.textContent = statusMessages[status];
        if (progressBar) {
          progressBar.style.setProperty('--bs-progress-width', `${progress}%`);
          progressBar.setAttribute('aria-valuenow', progress);
        }
        if (progressText) progressText.textContent = `${progress}%`;
      }
    }
  }

  async function loadModel() {
    try {
      modelStatus = ModelStatus.NOT_STARTED;
      updateLoadingUI(modelStatus, 0);

      // Check network connectivity
      try {
        const networkTest = await fetch('/ort/ort.min.js', { method: 'HEAD' });
        if (!networkTest.ok) throw new Error('Network connectivity issue');
      } catch (err) {
        throw new Error('Network connectivity issue - please check your internet connection');
      }

      // Verify ONNX runtime is ready
      const ort = window.ort;
      if (!ort) {
        throw new Error('ONNX Runtime not loaded or initialized. Please refresh the page.');
      }

      // Determine best backend
      modelStatus = ModelStatus.LOADING_RUNTIME;
      updateLoadingUI(modelStatus, 20);

      const modelPath = '/object_detecion_model/best-11-8-2025.onnx';
      console.log(`📁 Loading model from ${modelPath}...`);

      // Verify model file exists
      try {
        const modelTest = await fetch(modelPath, { method: 'HEAD' });
        if (!modelTest.ok) throw new Error('Model file not found');
      } catch (err) {
        throw new Error(`Model file not accessible: ${err.message}`);
      }

      modelStatus = ModelStatus.LOADING_MODEL;
      updateLoadingUI(modelStatus, 40);

      // Initialize session with progress tracking
      try {
        const sessionPromise = window.getOnnxSession(modelPath);
        
        // Add timeout for session creation
        const sessionTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session creation timed out')), 30000));
        
        session = await Promise.race([sessionPromise, sessionTimeout]);
        
        if (!session) {
          throw new Error('Failed to create inference session - null session returned');
        }

        // Get backend info
        const backend = session.handler?.backend || 'unknown';
        console.log(`📊 Using backend: ${backend}`);
        
        modelStatus = ModelStatus.WARMING_UP;
        updateLoadingUI(modelStatus, 60);

        // Warmup with progress tracking
        console.log("🔥 Starting model warmup...");
        const warmupStart = performance.now();
        await window.warmupOnnx(session, FIXED_SIZE);
        const warmupTime = performance.now() - warmupStart;
        console.log(`✨ Warmup completed in ${warmupTime.toFixed(0)}ms`);

        modelStatus = ModelStatus.READY;
        updateLoadingUI(modelStatus, 100);

        // Show success message before hiding
        updateLoadingUI(ModelStatus.READY, 100, '✅ Model Ready!');
        
        // Hide loading overlay after showing success
        setTimeout(() => {
          if (loadingOverlay && modelStatus === ModelStatus.READY) {
            loadingOverlay.style.display = 'none';
          }
        }, 1500);

        console.log("✅ Model loaded, warmed up, and verified successfully");
        return true;

      } catch (error) {
        console.error('❌ Model initialization error:', error);
        modelError = error;
        modelStatus = ModelStatus.ERROR;
        
        // Create user-friendly error message
        let userMessage = 'Failed to load AI model. ';
        if (error.message.includes('timeout')) {
          userMessage += 'The process took too long. Please check your internet connection and try again.';
        } else if (error.message.includes('file not found')) {
          userMessage += 'The model file is missing. Please contact support.';
        } else if (error.message.includes('out of memory')) {
          userMessage += 'Not enough memory available. Try closing other tabs or refreshing the page.';
        } else {
          userMessage += error.message;
        }

        updateLoadingUI(modelStatus, 0, userMessage);
        if (loadingOverlay) {
          loadingOverlay.innerHTML = `
            <div class="alert alert-danger error-message p-4 shadow-sm">
              <div class="d-flex align-items-center mb-3">
                <i class="fas fa-exclamation-triangle fa-2x me-3"></i>
                <h4 class="alert-heading mb-0">Loading Error</h4>
              </div>
              <p class="mb-3">${userMessage}</p>
              <div class="error-details small text-muted bg-light bg-opacity-10 p-2 rounded mb-3 overflow-auto" style="max-height: 150px">
                ${error.stack || ''}
              </div>
              <hr>
              <div class="error-actions d-flex gap-2 justify-content-center">
                <button onclick="location.reload()" class="btn btn-primary">
                  <i class="fas fa-redo me-2"></i> Try Again
                </button>
                <button onclick="window.HDTests.quickCheck()" class="btn btn-outline-secondary">
                  <i class="fas fa-stethoscope me-2"></i> Run Diagnostics
                </button>
              </div>
            </div>
          `;
        }
        return false;
      }
    } catch (error) {
      console.error("❌ Fatal error during model loading:", error);
      modelError = error;
      modelStatus = ModelStatus.ERROR;
      updateLoadingUI(modelStatus, 0, `Critical error: ${error.message}`);
      return false;
    }
  }

  async function importOptimizedFunctions() {
    try {
      const module = await import('./yolo_tfjs.js');
      window.getOnnxSession = module.getOnnxSession;
      window.warmupOnnx = module.warmupOnnx;
      window.preprocessFrameToTensor = module.preprocessFrameToTensor;
      window.runModel = module.runModel;
      window.postprocessDetections = module.postprocessDetections;
      window.drawDetections = module.drawDetections;
      console.log("✅ Optimized YOLO functions imported");
    } catch (err) {
      console.warn("⚠️ Failed to import optimized functions, using fallback:", err);
    }
  }

  function syncCanvasToVideo() {
    const now = performance.now();
    if (now - lastResizeCheck < 100) return;
    lastResizeCheck = now;
    if (video.videoWidth && video.videoHeight && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      console.log(`📐 Canvas resized to ${video.videoWidth}x${video.videoHeight}`);
    }
  }

  async function detectLoop() {
    if (!detecting || !session || !video.videoWidth) return;
    if (isProcessingFrame) {
      rafId = requestAnimationFrame(detectLoop);
      return;
    }
    isProcessingFrame = true;
    syncCanvasToVideo();
    
    // Skip frames for performance
    if (frameCount++ % skipFrames !== 0) {
      isProcessingFrame = false;
      rafId = requestAnimationFrame(detectLoop);
      return;
    }

    try {
      // Use optimized preprocessing from yolo_tfjs.js
      const { tensor, letterboxParams } = window.preprocessFrameToTensor(video, FIXED_SIZE);
      
      // Run model inference
      const boxes = await window.runModel(session, tensor);
      
      // Process detections
      const detections = window.postprocessDetections(boxes, 0.5, 0.5);
      
      // Draw detections using the optimized drawing function
      window.drawDetections(ctx, video, detections, classNames, letterboxParams);

      // Save detection if needed
      if (detections.length > 0 && (!lastSaveTime || Date.now() - lastSaveTime > 10000)) {
        lastSaveTime = Date.now();
        // Find detection with highest confidence
        const topDetection = detections.reduce((best, current) => current.score > best.score ? current : best);
        const label = `${classNames[topDetection.classId]} (${(topDetection.score*100).toFixed(1)}%)`;
        await saveDetection(canvas, label);
      }

      // Update detection counts
      detectedObjectCount = detections.length;
      const currentTypes = new Set(detections.map(d => classNames[d.classId]));
      uniqueHazardTypes = Array.from(new Set([...uniqueHazardTypes, ...currentTypes]));
      
      // Update UI overlays
      if (objectCountOverlay) {
        objectCountOverlay.textContent = `Objects: ${detectedObjectCount}`;
      }
      if (hazardTypesOverlay) {
        hazardTypesOverlay.textContent = `Types: ${uniqueHazardTypes.join(', ')}`;
      }

    } catch (err) {
      console.error("Error during detection loop:", err);
      if (typeof reportError === 'function') {
        reportError(ErrorCodes.INFERENCE, err.message || err);
      }
    }

    isProcessingFrame = false;
    if (detecting) rafId = requestAnimationFrame(detectLoop);
  }

  async function initCamera(preferredDeviceId = null) {
    console.log('🎥 Initializing camera...', { preferredDeviceId, currentFacingMode });
    if (!videoDevices.length) {
      try {
        const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
        initialStream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.warn('⚠️ Initial camera open failed', err);
      }
      await enumerateAndPopulateCameras();
    }
    const targetDevice = preferredDeviceId ? videoDevices.find(d => d.deviceId === preferredDeviceId) : videoDevices[0];
    const constraints = {
      video: {
        aspectRatio: { ideal: 16 / 9 },
        inlineSize: { ideal: 1280 },
        blockSize: { ideal: 720 }
      }
    };
    if (targetDevice) {
      constraints.video.deviceId = { exact: targetDevice.deviceId };
      const label = (targetDevice.label || '').toLowerCase();
      if (label.includes('front')) currentFacingMode = 'user';
      if (label.includes('back') || label.includes('rear') || label.includes('environment')) currentFacingMode = 'environment';
    } else {
      constraints.video.facingMode = currentFacingMode;
    }
    if (!constraints.video.facingMode) constraints.video.facingMode = { ideal: currentFacingMode };
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    mediaStream.getTracks().forEach(track => addTrackEventListeners(track));
    return { stream: mediaStream, device: targetDevice };
  }

  async function startCamera() {
    try {
      const { stream: mediaStream, device } = await initCamera();
      stream = mediaStream;
      currentCamIndex = videoDevices.findIndex(d => d.deviceId === (device && device.deviceId));
      if (cameraSelect && device) cameraSelect.value = device.deviceId;
      video.muted = true;
      video.srcObject = stream;
      console.log(`📱 Started camera: ${device.label || 'Unknown'}`);
      startBtn.style.display = "none";
      stopBtn.style.display = "inline-block";
      detectedObjectCount = 0;
      uniqueHazardTypes = [];
      if (videoDevices.length > 1 || supportsFacingMode) {
        switchBtn.style.display = 'inline-block';
        if (videoDevices.length > 1 && cameraSelect) cameraSelect.style.display = 'inline-block';
      }
      video.addEventListener("loadeddata", () => {
        syncCanvasToVideo();
        if (window.announceStatus) window.announceStatus("Camera started successfully. Hazard detection is now active.", "assertive");
        detecting = true;
        if (rafId) cancelAnimationFrame(rafId);
        detectLoop();
      }, { once: true });
      return true;
    } catch (err) {
      console.error("❌ Camera initialization failed:", err);
      throw err;
    }
  }

  async function switchCamera(targetDeviceId = null) {
    if (!stream) throw new Error('Cannot switch camera - invalid state');
    console.log('🔄 Switching camera...');
    stopStream(stream);
    if (videoDevices.length > 1) {
      const nextIndex = targetDeviceId ? videoDevices.findIndex(d => d.deviceId === targetDeviceId) : (currentCamIndex + 1) % videoDevices.length;
      const { stream: newStream, device } = await initCamera(videoDevices[nextIndex].deviceId);
      stream = newStream;
      currentCamIndex = nextIndex;
      if (cameraSelect) cameraSelect.value = device.deviceId;
    } else if (supportsFacingMode) {
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      const { stream: newStream } = await initCamera();
      stream = newStream;
    } else {
      throw new Error('Cannot switch camera - no alternative found');
    }
    video.muted = true;
    video.srcObject = stream;
    return new Promise(resolve => {
      video.addEventListener('loadeddata', () => {
        syncCanvasToVideo();
        resolve();
      }, { once: true });
    });
  }

  function stopCamera() {
    detecting = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (stream) {
      stopStream(stream);
      stream = null;
    }
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frameCount = 0;
    detectedObjectCount = 0;
    uniqueHazardTypes = [];
    console.log('⏹️ Camera stopped');
  }

  startBtn.addEventListener("click", async () => {
    console.log("🚀 Starting camera and location tracking...");
    if (window.announceStatus) window.announceStatus("Starting camera and location services", "assertive");
    toastOnce('location-start', "Starting location services...", "info");
    try {
      const locationResult = await initLocationTracking();
      if (locationResult) {
        toastOnce('location-active', "Location tracking active ✓", "success");
      } else {
        toastOnce('location-fallback', "Location failed - using fallback methods", "warning");
      }
    } catch (err) {
      toastOnce('location-unavailable', "Location unavailable - using default location", "warning");
      console.warn("⚠️ Location tracking failed:", err);
    }
    try {
      await startCamera();
    } catch (err) {
      reportError(ErrorCodes.CAMERA_SWITCH, 'Failed to start camera: ' + err.message);
    }
  });

  if (cameraSelect) {
    cameraSelect.addEventListener("change", async () => {
      if (!stream) return reportError(ErrorCodes.CAMERA_INACTIVE, 'Camera must be started before switching');
      const selectedDeviceId = cameraSelect.value;
      if (!selectedDeviceId) return;
      try {
        await switchCamera(selectedDeviceId);
        if (window.announceStatus) {
          const selectedOption = cameraSelect.options[cameraSelect.selectedIndex];
          window.announceStatus(`Switched to ${selectedOption.text}`, "polite");
        }
      } catch (err) {
        reportError(ErrorCodes.CAMERA_SWITCH, 'Camera switch via dropdown failed: ' + err.message);
        try {
          await startCamera(); // try to restart default
        } catch (fallbackErr) {
          reportError(ErrorCodes.CAMERA_SWITCH, 'Fallback camera also failed: ' + fallbackErr.message);
        }
      }
    });
  }

  switchBtn.addEventListener("click", async () => {
    try {
      await switchCamera();
    } catch (err) {
      reportError(ErrorCodes.CAMERA_SWITCH, 'Camera switch failed: ' + err.message);
    }
  });

  stopBtn.addEventListener("click", () => {
    if (window.announceStatus) window.announceStatus("Camera stopped. Hazard detection is now inactive.", "assertive");
    if (objectCountOverlay) objectCountOverlay.textContent = '';
    if (hazardTypesOverlay) hazardTypesOverlay.textContent = '';
    stopCamera();
    startBtn.style.display = "inline-block";
    stopBtn.style.display = "none";
    switchBtn.style.display = "none";
    if (cameraSelect) cameraSelect.style.display = "none";
    stopLocationTracking();
  });

  // Smoke Tests
  async function runSmokeTestCamera() {
    // Implementation for smoke tests
  }
  if (!window.HDTests) window.HDTests = {};
  window.HDTests.runSmokeTestCamera = runSmokeTestCamera;
});
