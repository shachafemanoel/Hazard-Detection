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
  const brightnessSlider = document.getElementById('brightness-slider');
  const zoomSlider = document.getElementById('zoom-slider');
  const ctx = canvas.getContext('2d');
  const supportsFacingMode = navigator.mediaDevices.getSupportedConstraints().facingMode;
  const DETECTION_CONFIG = (() => {
    const qp = new URLSearchParams(location.search);
    const classes = qp.get('classes');
    return {
      // If classes query provided, filter; otherwise show all classes
      allowedClasses: classes ? new Set(classes.split(',').map(s => s.trim().toLowerCase())) : null,
      debug: qp.get('debug') === '1'
    };
  })();
  
  // Verify all required elements are present
  if (!startBtn || !stopBtn || !switchBtn || !video || !canvas || !ctx) {
    console.error('Required DOM elements not found');
    alert('Error: Required page elements not found. Please refresh the page.');
    return;
  }
  // Initial UI state
  try {
    stopBtn.style.display = 'none';
    switchBtn.style.display = 'none';
    if (cameraSelect) cameraSelect.style.display = 'none';
  } catch {}
  // Ensure controls reflect current state
  try { updateUIState(); } catch {}
  const objectCountOverlay = document.getElementById('object-count-overlay');
  const loadingOverlay = document.getElementById('loading-overlay');
  const hazardTypesOverlay = document.getElementById('hazard-types-overlay');
  
  const FIXED_SIZE = 640; // Match yolo_tfjs.js default size
  let stream = null;
  let detecting = false;
  let session = null;
  let isStarting = false;
  let isSwitching = false;
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

  function setBusy(el, busy) {
    try { if (el) el.setAttribute('aria-busy', busy ? 'true' : 'false'); } catch {}
  }

  function updateUIState() {
    const canSwitch = (videoDevices.length > 1) || supportsFacingMode;
    const isReady = (modelStatus === ModelStatus.READY) || (modelStatus === ModelStatus.ERROR); // allow camera start even if model failed

    if (startBtn) {
      startBtn.style.display = detecting ? 'none' : 'inline-block';
      startBtn.disabled = !isReady || isStarting;
      startBtn.setAttribute('aria-disabled', String(startBtn.disabled));
    }

    if (stopBtn) {
      stopBtn.style.display = detecting ? 'inline-block' : 'none';
      stopBtn.disabled = isSwitching || isStarting;
      stopBtn.setAttribute('aria-disabled', String(stopBtn.disabled));
    }

    if (switchBtn) {
      switchBtn.style.display = detecting && canSwitch ? 'inline-block' : 'none';
      switchBtn.disabled = isSwitching;
      switchBtn.setAttribute('aria-disabled', String(switchBtn.disabled));
    }
    if (cameraSelect) {
      cameraSelect.style.display = detecting && videoDevices.length > 1 ? 'inline-block' : 'none';
      cameraSelect.disabled = isSwitching;
    }

    const slidersDisabled = !detecting || isSwitching || isStarting;
    if (brightnessSlider) brightnessSlider.disabled = slidersDisabled;
    if (zoomSlider) zoomSlider.disabled = slidersDisabled;

    if (!detecting) {
      if (objectCountOverlay) objectCountOverlay.textContent = '';
      if (hazardTypesOverlay) hazardTypesOverlay.textContent = '';
    }
  }

  // Zoom/brightness helpers
  function applyBrightness(percent = 100) {
    const clamped = Math.max(50, Math.min(150, Number(percent)));
    video.style.filter = `brightness(${clamped}%)`;
  }

  async function applyZoom(level = 1) {
    const container = video.parentElement; // wraps both video & canvas
    const track = stream?.getVideoTracks?.()[0];
    const caps = track?.getCapabilities ? track.getCapabilities() : null;
    if (caps && 'zoom' in caps) {
      const min = caps.zoom.min ?? 1;
      const max = caps.zoom.max ?? 3;
      const clamped = Math.max(min, Math.min(max, Number(level)));
      try {
        await track.applyConstraints({ advanced: [{ zoom: clamped }] });
      } catch (e) {
        console.warn('Zoom constraints failed, falling back to CSS scale:', e);
        if (container) {
          container.style.transformOrigin = 'center center';
          container.style.transform = `scale(${clamped})`;
        }
      }
    } else {
      if (container) {
        container.style.transformOrigin = 'center center';
        container.style.transform = `scale(${Number(level)})`;
      }
    }
  }

  function resetVisualAdjustments() {
    const container = video.parentElement;
    if (container) container.style.transform = '';
    video.style.filter = '';
  }

  function configureCameraControls() {
    // Brightness: basic CSS filter always available
    if (brightnessSlider) {
      brightnessSlider.value = brightnessSlider.value || '100';
      applyBrightness(brightnessSlider.value);
    }

    // Zoom: prefer track capability, else fallback to CSS scale
    try {
      const track = stream?.getVideoTracks?.()[0];
      const caps = track?.getCapabilities ? track.getCapabilities() : null;
      if (zoomSlider) {
        if (caps && 'zoom' in caps) {
          const { min = 1, max = 3, step = 0.1 } = caps.zoom || {};
          zoomSlider.min = String(min);
          zoomSlider.max = String(max);
          zoomSlider.step = String(step);
          if (!zoomSlider.value) zoomSlider.value = String(min);
        } else {
          // CSS fallback 1-3 scale
          zoomSlider.min = '1';
          zoomSlider.max = '3';
          zoomSlider.step = '0.1';
          if (!zoomSlider.value) zoomSlider.value = '1';
        }
        applyZoom(zoomSlider.value);
      }
    } catch (e) {
      console.warn('Failed to configure zoom slider:', e);
    }
  }

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
      
      updateUIState();
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
      if (startBtn) startBtn.disabled = false;
      updateUIState();
      return;
    }

    // Check WebAssembly support
    if (!('WebAssembly' in window)) {
      const errorMsg = 'WebAssembly is not supported in this browser. The application cannot run.';
      console.error('❌', errorMsg);
      updateLoadingUI(ModelStatus.ERROR, 0, errorMsg);
      if (startBtn) startBtn.disabled = false;
      updateUIState();
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
        updateUIState();
        return true;

      } catch (err) {
        console.error(`❌ Attempt ${modelLoadAttempts} failed:`, err);
        
        if (modelLoadAttempts === MAX_LOAD_ATTEMPTS) {
          const errorMsg = `Failed to load model after ${MAX_LOAD_ATTEMPTS} attempts: ${err.message}`;
          console.error('❌', errorMsg);
          reportError(ErrorCodes.MODEL_LOAD, errorMsg);
          updateLoadingUI(ModelStatus.ERROR, 0, errorMsg);
          if (startBtn) startBtn.disabled = false;
          updateUIState();
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

  let classNames = ['pothole', 'crack'];

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
    try {
      const main = document.getElementById('camera-container');
      if (main) main.setAttribute('aria-busy', status !== ModelStatus.READY ? 'true' : 'false');
    } catch {}

    const statusMessages = {
      [ModelStatus.NOT_STARTED]: 'Initializing...',
      [ModelStatus.LOADING_RUNTIME]: 'Loading AI Runtime...',
      [ModelStatus.LOADING_MODEL]: 'Loading AI Model...',
      [ModelStatus.WARMING_UP]: 'Preparing Model...',
      [ModelStatus.READY]: 'Ready!',
      [ModelStatus.ERROR]: `Error: ${error || 'Unknown error'}`
    };

    if (status === ModelStatus.ERROR) {
      loadingOverlay.style.display = 'flex';
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
            <button onclick="(function(){ const el=document.getElementById('loading-overlay'); if(el) el.style.display='none'; })()" class="btn btn-outline-light">
              <i class="fas fa-video me-2"></i> Continue with Camera Only
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
      // Show/hide based on status
      if (status === ModelStatus.READY) {
        loadingOverlay.style.display = 'none';
      } else {
        loadingOverlay.style.display = 'flex';
      }
    }
    // Sync button states with model status
    try { updateUIState(); } catch {}
  }

  async function loadModel() {
    try {
      modelStatus = ModelStatus.NOT_STARTED;
      updateLoadingUI(modelStatus, 0);

      // Optional network connectivity check (non-fatal)
      try {
        const networkTest = await fetch('/ort/ort.min.js', { method: 'HEAD' });
        if (!networkTest.ok) console.warn('ORT asset not accessible via HEAD check');
      } catch (err) {
        console.warn('Network HEAD check failed, continuing:', err);
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
                <button onclick="(function(){ const el=document.getElementById('loading-overlay'); if(el) el.style.display='none'; })()" class="btn btn-outline-light">
                  <i class="fas fa-video me-2"></i> Continue with Camera Only
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
      if (module.classNames) {
        window.classNames = module.classNames;
        classNames = module.classNames;
      }
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
      let detections = window.postprocessDetections(boxes, 0.5, 0.5);

      // Filter by allowed classes
      if (DETECTION_CONFIG.allowedClasses && DETECTION_CONFIG.allowedClasses.size > 0) {
        detections = detections.filter(d => DETECTION_CONFIG.allowedClasses.has(classNames[d.classId]?.toLowerCase()));
      }
      
      // Draw detections using the optimized drawing function
      window.drawDetections(ctx, video, detections, classNames, letterboxParams);

      // Optional debug annotations: show class id and mapped name
      if (DETECTION_CONFIG.debug && detections.length) {
        const scaleX = canvas.width / 640;
        const scaleY = canvas.height / 640;
        ctx.save();
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 12px monospace';
        ctx.textBaseline = 'top';
        for (const d of detections) {
          const x = d.x1 * scaleX;
          const y = d.y1 * scaleY;
          const name = classNames[d.classId] || `cls${d.classId}`;
          ctx.fillText(`id:${d.classId} ${name}`, x + 2, y + 2);
        }
        ctx.restore();
      }

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

    if (stream) {
        stopStream(stream);
        stream = null;
    }

    if (videoDevices.length === 0) {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error("Initial camera permission was not granted.", err);
      }
      await enumerateAndPopulateCameras();
      if (videoDevices.length === 0) {
        throw new Error("No video devices found on this system.");
      }
    }

    const constraints = {
      video: {
        aspectRatio: { ideal: 16 / 9 },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      }
    };

    if (preferredDeviceId) {
      constraints.video.deviceId = { exact: preferredDeviceId };
    } else if (supportsFacingMode) {
      constraints.video.facingMode = { ideal: currentFacingMode };
    } else if (videoDevices.length > 0) {
      constraints.video.deviceId = { exact: videoDevices[currentCamIndex].deviceId };
    }

    console.log("Using constraints:", JSON.stringify(constraints, null, 2));

    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    const videoTrack = mediaStream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    
    const actualDeviceId = videoTrack.getSettings().deviceId;
    const targetDevice = videoDevices.find(d => d.deviceId === actualDeviceId);

    currentCamIndex = videoDevices.findIndex(d => d.deviceId === actualDeviceId);
    if (settings.facingMode) {
        currentFacingMode = settings.facingMode;
    } else if (targetDevice && targetDevice.label) {
        const label = targetDevice.label.toLowerCase();
        if (label.includes('front')) currentFacingMode = 'user';
        else if (label.includes('back') || label.includes('rear')) currentFacingMode = 'environment';
    }
    
    mediaStream.getTracks().forEach(track => addTrackEventListeners(track));
    return { stream: mediaStream, device: targetDevice || { deviceId: actualDeviceId, label: videoTrack.label } };
  }

  async function startCamera(preferredDeviceId = null) {
    try {
      if (isStarting) return;
      isStarting = true; setBusy(startBtn, true); updateUIState();
      const { stream: mediaStream, device } = await initCamera(preferredDeviceId);
      stream = mediaStream;
      
      if (device && device.deviceId) {
        currentCamIndex = videoDevices.findIndex(d => d.deviceId === device.deviceId);
        if (cameraSelect) cameraSelect.value = device.deviceId;
      }

      video.muted = true;
      video.srcObject = stream;
      console.log(`📱 Started camera: ${device?.label || 'Unknown'}`);
      
      detectedObjectCount = 0;
      uniqueHazardTypes = [];
      updateUIState();
      
      video.addEventListener("loadeddata", () => {
        syncCanvasToVideo();
        if (window.announceStatus) window.announceStatus("Camera started successfully. Hazard detection is now active.", "assertive");
        configureCameraControls();
        detecting = true;
        updateUIState();
        if (rafId) cancelAnimationFrame(rafId);
        detectLoop();
      }, { once: true });
      
      return true;
    } catch (err) {
      console.error("❌ Camera initialization failed:", err);
      reportError(ErrorCodes.CAMERA_SWITCH, `Failed to start camera: ${err.message}. Please ensure you have granted camera permissions.`);
      throw err;
    } finally {
      isStarting = false; setBusy(startBtn, false); updateUIState();
    }
  }

  async function switchCamera(targetDeviceId = null) {
    if (!stream) {
      console.log("Stream not active, calling startCamera() instead of switch.");
      await startCamera(targetDeviceId);
      return;
    }
    
    console.log('🔄 Switching camera...');
    isSwitching = true; updateUIState(); setBusy(switchBtn, true);
    let newStream, device;

    try {
        // Pause ongoing detection loop safely
        detecting = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        isProcessingFrame = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Initialize a new stream for the requested device/facing
        if (targetDeviceId) {
          ({ stream: newStream, device } = await initCamera(targetDeviceId));
        } else if (videoDevices.length > 1) {
          const nextIndex = (currentCamIndex + 1) % videoDevices.length;
          ({ stream: newStream, device } = await initCamera(videoDevices[nextIndex].deviceId));
        } else if (supportsFacingMode) {
          currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
          ({ stream: newStream, device } = await initCamera());
        } else {
          throw new Error('Cannot switch camera - no alternative found');
        }

        // Stop previous stream to release the camera
        const prevStream = stream;
        if (prevStream) { try { stopStream(prevStream); } catch (e) { console.warn('Failed stopping previous stream:', e); } }

        // Attach new stream
        stream = newStream;
        video.muted = true;
        video.srcObject = stream;

        if (device && device.deviceId && cameraSelect) {
          cameraSelect.value = device.deviceId;
        }

        // Wait for metadata to have correct dimensions
        await new Promise(resolve => {
          const onReady = () => {
            video.removeEventListener('loadedmetadata', onReady);
            syncCanvasToVideo();
            configureCameraControls();
            detecting = true;
            if (window.announceStatus) {
              const selectedOption = cameraSelect?.options?.[cameraSelect.selectedIndex];
              window.announceStatus(`Switched to ${selectedOption?.text || device?.label || 'next camera'}`, "polite");
            }
            // restart detection loop
            if (rafId) cancelAnimationFrame(rafId);
            detectLoop();
            resolve();
          };
          video.addEventListener('loadedmetadata', onReady, { once: true });
        });

    } catch (err) {
        console.error("❌ Camera switch failed:", err);
        reportError(ErrorCodes.CAMERA_SWITCH, 'Failed to switch camera: ' + err.message);
        // Try to recover by starting the default camera
        try {
            await startCamera();
        } catch (fallbackErr) {
            reportError(ErrorCodes.CAMERA_SWITCH, 'Fallback camera restart also failed: ' + fallbackErr.message);
        }
    } finally {
        isSwitching = false; setBusy(switchBtn, false); updateUIState();
    }
  }

  function stopCamera() {
    detecting = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    isProcessingFrame = false;
    if (stream) {
      stopStream(stream);
      stream = null;
    }
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frameCount = 0;
    detectedObjectCount = 0;
    uniqueHazardTypes = [];
    resetVisualAdjustments();
    console.log('⏹️ Camera stopped');
    updateUIState();
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
      const selectedDeviceId = cameraSelect ? cameraSelect.value : null;
      await startCamera(selectedDeviceId);
    } catch (err) {
      // Error is reported in startCamera
    }
  });

  if (cameraSelect) {
    cameraSelect.addEventListener("change", async () => {
      const selectedDeviceId = cameraSelect.value;
      if (!selectedDeviceId) return;
      try {
        await switchCamera(selectedDeviceId);
      } catch (err) {
        reportError(ErrorCodes.CAMERA_SWITCH, 'Camera switch via dropdown failed: ' + err.message);
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

  // Stop button handler
  stopBtn.addEventListener('click', () => {
    stopCamera();
    stopLocationTracking();
    updateUIState();
  });

  // Brightness/Zoom UI handlers
  if (brightnessSlider) {
    brightnessSlider.addEventListener('input', (e) => applyBrightness(e.target.value));
  }
  if (zoomSlider) {
    zoomSlider.addEventListener('input', (e) => { applyZoom(e.target.value); });
  }

}); // end DOMContentLoaded
