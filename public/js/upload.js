document.addEventListener("DOMContentLoaded", async function () {
  // אלמנטים של מסך הבית וממשק ההעלאה
  const homeScreenContent = document.getElementById('home-screen-content');
  const detectionSection = document.getElementById('detection-section');
  const showUploadSectionBtn = document.getElementById('show-upload-section-btn');
  const closeUploadSectionBtn = document.getElementById('close-upload-section-btn');

  const imageUpload = document.getElementById("image-upload");
  const confidenceSlider = document.getElementById("confidence-slider");
  const confValueSpan = document.getElementById("conf-value");
  const canvas = document.getElementById("preview-canvas");
  const ctx = canvas ? canvas.getContext("2d") : null; // Check if canvas exists
  const saveBtn = document.getElementById("save-detection");
  const getLocationBtn = document.getElementById("get-location-btn");

  let geoData = null;
  let currentLocationData = null;

  // פונקציה לקבלת מיקום נוכחי
  async function getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser."));
        return;
      }

      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 דקות מטמון
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const locationData = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          console.log("📍 Got current location:", locationData);
          resolve(JSON.stringify(locationData));
        },
        (error) => {
          console.warn("⚠️ High-accuracy location error:", error.message);
          // נסיון עם הגדרות פחות מדויקות
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const locationData = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
              };
              console.log("📍 Got fallback location:", locationData);
              resolve(JSON.stringify(locationData));
            },
            (fallbackError) => {
              reportError(ErrorCodes.UNSUPPORTED, 'Location access failed: ' + fallbackError.message);
              reject(fallbackError);
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
          );
        },
        options
      );
    });
  }

  function getGeoDataFromImage(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          EXIF.getData(img, function () {
            const lat = EXIF.getTag(this, "GPSLatitude");
            const lon = EXIF.getTag(this, "GPSLongitude");
            if (!lat || !lon) return resolve(null);

            const toDecimal = (dms, ref) => {
              const [deg, min, sec] = dms;
              let decimal = deg + min / 60 + sec / 3600;
              if (ref === "S" || ref === "W") decimal *= -1;
              return decimal;
            };

            const latitude = toDecimal(lat, EXIF.getTag(this, "GPSLatitudeRef") || "N");
            const longitude = toDecimal(lon, EXIF.getTag(this, "GPSLongitudeRef") || "E");
            resolve(JSON.stringify({ lat: latitude, lng: longitude }));
          });
        };
        img.onerror = () => resolve(null); // Handle image load errors
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null); // Handle file read errors
      reader.readAsDataURL(file);
    });
  }

  // ניהול תצוגת מסך הבית וממשק ההעלאה
  if (showUploadSectionBtn) {
    showUploadSectionBtn.addEventListener('click', () => {
      if(homeScreenContent) homeScreenContent.style.display = 'none';
      if(detectionSection) detectionSection.style.display = 'block';
    });
  }

  if (closeUploadSectionBtn) {
    closeUploadSectionBtn.addEventListener('click', () => {
      if(detectionSection) detectionSection.style.display = 'none';
      if(homeScreenContent) homeScreenContent.style.display = 'block';
      // איפוס אופציונלי של שדות וקנבס בעת סגירה
      if (imageUpload) imageUpload.value = '';
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (confValueSpan && confidenceSlider) confValueSpan.textContent = confidenceSlider.value;
      currentImage = null;
      geoData = null;
      if (saveBtn) saveBtn.disabled = true;
      const tooltip = document.getElementById("tooltip");
      if (tooltip) tooltip.style.display = "none";
    });
  }

  // שמירת התמונה והנתונים
  if(saveBtn) {
    saveBtn.addEventListener("click", async () => {
      if (!canvas) {
        return reportError(ErrorCodes.UNSUPPORTED, "Canvas element not found.");
      }

      if (!geoData) {
        console.log("⚠️ No location data, attempting to get current location...");
        try {
          const currentLoc = await getCurrentLocation();
          geoData = currentLoc;
          currentLocationData = currentLoc;
          toastOnce('location-acquired-save', "Current location acquired for report", 'success');
        } catch (err) {
          console.warn("⚠️ Could not get location for save:", err);
          geoData = JSON.stringify({ lat: 32.0853, lng: 34.7818 }); // תל אביב
          toastOnce('location-default-save', "Using default location (Tel Aviv)", 'warning');
        }
      }

      canvas.toBlob(async (blob) => {
        if (!blob) {
          return reportError(ErrorCodes.FILE_READ, 'Failed to generate image blob for saving.');
        }
    
        const file = new File([blob], "detection.jpg", { type: "image/jpeg" });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("geoData", geoData);
        formData.append("hazardTypes", hazardTypes.join(","));
        
        let locationNote = "Unknown";
        if (currentLocationData === geoData) locationNote = "Current GPS";
        else if (geoData.includes('32.0853')) locationNote = "Default Location";
        else locationNote = "EXIF GPS";
        formData.append("locationNote", locationNote);

        try {
            const res = await fetch("/upload-detection", {
                method: "POST",
                body: formData,
                credentials: "include",
            });
            if (!res.ok) throw new Error(`Server responded with ${res.status}`);
            const result = await res.json();
            toastOnce('save-success', `✅ Report saved successfully!`, 'success');
        } catch (err) {
            reportError(ErrorCodes.UNSUPPORTED, 'Server upload failed: ' + err.message);
        }

        setTimeout(() => {
            if (imageUpload) imageUpload.value = '';
            if (canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }, 2500);
      }, "image/jpeg", 0.95);
    });
  }

  // כפתור קבלת מיקום ידני
  if (getLocationBtn) {
    getLocationBtn.addEventListener("click", async () => {
      console.log("📍 Manual location request...");
      getLocationBtn.disabled = true;
      getLocationBtn.innerHTML = '<i class="fas fa-spinner fa-spin text-xl mr-3"></i><span class="text-sm font-medium">Getting Location...</span>';
      
      try {
        const currentLoc = await getCurrentLocation();
        geoData = currentLoc;
        currentLocationData = currentLoc;
        toastOnce('location-acquired-manual', "Location acquired successfully", 'success');
        getLocationBtn.innerHTML = '<i class="fas fa-check text-xl mr-3"></i><span class="text-sm font-medium">Location Acquired</span>';
      } catch (err) {
        reportError(ErrorCodes.CAMERA_PERMISSION, 'Manual location failed: ' + err.message);
        getLocationBtn.innerHTML = '<i class="fas fa-exclamation-triangle text-xl mr-3"></i><span class="text-sm font-medium">Location Failed</span>';
      } finally {
        setTimeout(() => {
          getLocationBtn.innerHTML = '<i class="fas fa-map-marker-alt text-xl mr-3"></i><span class="text-sm font-medium">Get Current Location</span>';
          getLocationBtn.disabled = false;
        }, 3000);
      }
    });
  }
  
  const FIXED_SIZE = 640;
  const classNames = ['crack', 'pothole'];
  let session = null;
  ort.env.wasm.wasmPaths = '/ort/';

  let optimizedFunctions = {};
  try {
    const module = await import('./yolo_tfjs.js');
    optimizedFunctions = { ...module };
    console.log("✅ Optimized YOLO functions imported for upload");
  } catch (err) {
    console.warn("⚠️ Failed to import optimized functions for upload:", err);
  }

  try {
    if (optimizedFunctions.getOnnxSession) {
      session = await optimizedFunctions.getOnnxSession('/object_detecion_model/best-11-8-2025.onnx');
      if (optimizedFunctions.warmupOnnx) {
        await optimizedFunctions.warmupOnnx(session, FIXED_SIZE);
        console.log("🔥 Upload session warmed up");
      }
    } else {
      session = await ort.InferenceSession.create('/object_detecion_model/best-11-8-2025.onnx', { executionProviders: ['cpu'] });
    }
    console.log("✅ YOLO model loaded for upload!");
  } catch (err) {
    reportError(ErrorCodes.MODEL_LOAD, err.message || err);
  }

  let confidenceThreshold = 0.5;
  if (confidenceSlider) {
    confidenceThreshold = parseFloat(confidenceSlider.value);
    confidenceSlider.addEventListener("input", (e) => {
      confidenceThreshold = parseFloat(e.target.value);
      if(confValueSpan) confValueSpan.textContent = confidenceThreshold;
      if (currentImage) runInferenceOnImage(currentImage);
    });
  }

  let currentImage = null;
  let letterboxParams = { offsetX: 0, offsetY: 0, newW: FIXED_SIZE, newH: FIXED_SIZE };

  let currentStatus = 'ready';
  let currentMode = 'upload';

  function setStatus(status, message = '') {
    currentStatus = status;
    console.log(`📊 Status: ${status} - ${message}`);
    const statusElement = document.querySelector('.status-indicator');
    if (statusElement) {
      statusElement.className = `status-indicator status-${status}`;
      statusElement.textContent = message;
    }
    
    if (message && status !== 'ready') {
      const type = status === 'error' ? 'error' : status === 'success' ? 'success' : 'info';
      const toastKey = `${status}-${message.substring(0, 20)}`;
      if (type === 'error') {
        reportError(ErrorCodes.UNSUPPORTED, message);
      } else {
        toastOnce(toastKey, message, type);
      }
    }
  }

  function setModeBadge(mode) {
    currentMode = mode;
    const badge = document.querySelector('.mode-badge');
    if (badge) {
      badge.className = `mode-badge mode-${mode}`;
      badge.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    }
  }

  function setupDragAndDrop() {
    const canvasContainer = document.querySelector('.canvas-container');
    if (!canvasContainer) return;
    
    canvasContainer.style.transition = 'all 0.3s ease';
    
    const onDragOver = (e) => {
      e.preventDefault(); e.stopPropagation();
      canvasContainer.classList.add('drag-over');
      setStatus('drag-over', 'Drop image to upload');
    };
    const onDragLeave = (e) => {
      e.preventDefault(); e.stopPropagation();
      canvasContainer.classList.remove('drag-over');
      setStatus('ready', 'Ready to upload image');
    };
    const onDrop = (e) => {
      e.preventDefault(); e.stopPropagation();
      canvasContainer.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) handleFileInput(e.dataTransfer.files[0]);
    };
    
    canvasContainer.addEventListener('dragover', onDragOver);
    canvasContainer.addEventListener('dragleave', onDragLeave);
    canvasContainer.addEventListener('drop', onDrop);
  }

  function enhanceFileInput() {
    if (!imageUpload) return;
    imageUpload.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleFileInput(e.target.files[0]);
    });
  }

  async function handleFileInput(file) {
    if (!file || !canvas) return setStatus('error', 'No file or canvas not available');
    if (!file.type.startsWith('image/')) return setStatus('error', 'Please select a valid image file');
    if (file.size > 10 * 1024 * 1024) return setStatus('error', 'Image file too large (Max 10MB)');
    
    setStatus('processing', 'Processing image...');
    setModeBadge('processing');
    
    try {
      const exifData = await getGeoDataFromImage(file);
      if (exifData) {
        geoData = exifData;
        currentLocationData = exifData;
        setStatus('location-found', 'Found location in image metadata');
      } else {
        console.log('⚠️ No EXIF location data, trying current location...');
        try {
          const currentLoc = await getCurrentLocation();
          geoData = currentLoc;
          currentLocationData = currentLoc;
          setStatus('location-current', 'Using current location');
        } catch (locationErr) {
          setStatus('warning', 'No location available - you can still analyze the image');
          geoData = null;
          currentLocationData = null;
        }
      }
      
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = async () => {
          currentImage = img;
          await renderPreviewImage(img);
          await runInferenceOnImage(img);
          setStatus('ready', 'Image loaded and analyzed');
          setModeBadge('analysis');
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      reportError(ErrorCodes.FILE_READ, 'Error processing image file: ' + err.message);
    }
  }

  async function renderPreviewImage(imageElement, animate = true) {
    if (!canvas || !ctx) return;
    
    canvas.width = FIXED_SIZE; canvas.height = FIXED_SIZE;
    const { offsetX, offsetY, newW, newH } = optimizedFunctions.computeLetterboxParams(imageElement.width, imageElement.height, FIXED_SIZE);
    letterboxParams = { offsetX, offsetY, newW, newH };
    
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
    ctx.drawImage(imageElement, offsetX, offsetY, newW, newH);
  }

  function initUploadUI() {
    console.log('🎨 Initializing Upload UI...');
    setStatus('ready', 'Ready to upload image');
    setModeBadge('upload');
    setupDragAndDrop();
    enhanceFileInput();
  }

  initUploadUI();

  async function runInferenceOnImage(imageElement) {
    if (!session || !canvas) {
      return reportError(ErrorCodes.MODEL_LOAD, "Model session not ready or canvas not found.");
    }

    try {
      const { tensor, letterboxParams: lbParams } = optimizedFunctions.preprocessFrameToTensor(imageElement, FIXED_SIZE);
      letterboxParams = lbParams;
      
      const rawBoxes = await optimizedFunctions.runModel(session, tensor);
      const processedBoxes = optimizedFunctions.postprocessDetections(rawBoxes, confidenceThreshold, 0.5);
      
      // The raw output from postprocessDetections is what our drawing function expects
      drawDetectionsOverlay(processedBoxes);

    } catch (err) {
      reportError(ErrorCodes.INFERENCE, err.message || err);
    }
  }

  let hazardTypes = [];
  let hasHazard = false;

  function drawDetectionsOverlay(boxes) {
    if (!ctx || !currentImage) return;
    hazardTypes = [];
    hasHazard = false;
    
    // Use the new centralized drawing function
    optimizedFunctions.drawDetections(ctx, currentImage, boxes, classNames, letterboxParams);

    const detectionCount = boxes.length;
    if (detectionCount > 0) {
        hasHazard = true;
        hazardTypes = [...new Set(boxes.map(b => classNames[Math.floor(b.classId)]))];
        setStatus('detections-found', `Found ${detectionCount} hazard(s): ${hazardTypes.join(', ')}`);
    } else {
        setStatus('no-detections', 'No hazards detected in image');
    }

    if (saveBtn) saveBtn.disabled = !hasHazard;
  }

  const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');
  if (sidebarLogoutBtn) {
    sidebarLogoutBtn.addEventListener("click", async () => {
      try {
        const response = await fetch("/logout", { method: "GET" });
        if (response.redirected) window.location.href = response.url;
      } catch (error) {
        reportError(ErrorCodes.UNSUPPORTED, 'Logout failed: ' + error.message);
      }
    });
  }

  // ====== SMOKE TESTS FOR UPLOAD FUNCTIONALITY ======
  async function runSmokeTestUpload() {
    // Smoke test implementation can be expanded here
  }

  if (!window.HDTests) window.HDTests = {};
  window.HDTests.runSmokeTestUpload = runSmokeTestUpload;
});