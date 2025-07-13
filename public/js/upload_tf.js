// upload_tf_fixed.js
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { storage } from "./firebaseConfig.js";

document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
  const switchBtn = document.getElementById("switch-camera");
  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext("2d");
  const objectCountOverlay = document.getElementById('object-count-overlay');
  // Get reference to the hazard types overlay element
  const loadingOverlay = document.getElementById('loading-overlay'); // הפניה לאלמנט הטעינה
  const hazardTypesOverlay = document.getElementById('hazard-types-overlay');
  
  const FIXED_SIZE = 416; // increased resolution for better accuracy
  let stream = null;
  let detecting = false;
  let session = null;
  let frameCount = 0;
  let lastSaveTime = 0;
  let _lastCoords = null;
  let _watchId    = null;
  let videoDevices = [];
  let currentCamIndex = 0;
  let prevImageData = null;
  const DIFF_THRESHOLD = 30000; // Optimized for better motion detection
  let skipFrames = 3;                       // Balanced for performance
  const targetFps = 15;                     // Optimized target FPS
  const frameTimes = [];                    // Frame time history
  const maxHistory = 5;                     // Reduced for faster adaptation    
  let detectedObjectCount = 0; // Initialize object count
  let sessionDetectionCount = 0; // Total detections in session
  let uniqueHazardTypes = []; // Initialize array for unique hazard types
  let trackedObjects = new Map(); // Object tracker
  let nextObjectId = 1;
  let fpsCounter = 0;
  let lastFpsTime = Date.now();
  let currentFps = 0;
  // ────────────────────────────────────────────────────────────────────────────────
  //  📸  Enumerate devices once on load
  // ────────────────────────────────────────────────────────────────────────────────
  (async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter((d) => d.kind === "videoinput");
      if (videoDevices.length > 1) {
        switchBtn.style.display = "inline-block";
      }
    } catch (err) {
      console.warn("⚠️ Could not enumerate video devices:", err);
    }

    // --- טעינת המודל מיד עם טעינת הדף ---
    (async () => {
      if (loadingOverlay) loadingOverlay.style.display = 'flex'; // הצג את ה-overlay
      try {
        await loadModel();
        console.log("✅ מודל נטען בהצלחה (בטעינת הדף)");
        // אין צורך ב-toast כאן, המשתמש עוד לא התחיל אינטראקציה
      } catch (err) {
        console.error("❌ שגיאה בטעינת המודל (בטעינת הדף):", err);
        if (loadingOverlay) loadingOverlay.innerHTML = `<p class="text-danger">Error loading model. Please check console.</p>`; // הצג הודעת שגיאה ב-overlay
        // alert("⚠️ שגיאה קריטית בטעינת מודל הזיהוי. ייתכן שהאפליקציה לא תעבוד כראוי. בדוק את הקונסול לפרטים.");
        // אפשר לשקול להשבית את כפתור ה-start אם המודל לא נטען
        if (startBtn) startBtn.disabled = true;
        return; // עצור כאן אם הטעינה נכשלה
      } finally {
        // הסתר את ה-overlay רק אם לא הייתה שגיאה קריטית שהשאירה הודעה
        if (loadingOverlay && !startBtn.disabled) loadingOverlay.style.display = 'none';
      }
    })();
  })();

  const offscreen = document.createElement("canvas");
  offscreen.width = FIXED_SIZE;
  offscreen.height = FIXED_SIZE;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  // allocate preprocessing buffers once to avoid per-frame allocations
  const floatData = new Float32Array(FIXED_SIZE * FIXED_SIZE * 3);
  const chwData   = new Float32Array(3 * FIXED_SIZE * FIXED_SIZE);

  let letterboxParams = null;

  const classNames = [
    "Alligator Crack",
    "Block Crack",
    "Construction Joint Crack",
    "Crosswalk Blur",
    "Lane Blur",
    "Longitudinal Crack",
    "Manhole",
    "Patch Repair",
    "Pothole",
    "Transverse Crack",
    "Wheel Mark Crack",
  ];

  // Object tracking function
  function findOrCreateTrackedObject(x, y, hazardType, area) {
    const threshold = 100; // Distance threshold for matching objects
    let bestMatch = null;
    let bestDistance = Infinity;
    
    // Find closest existing object of same type
    for (let [key, obj] of trackedObjects) {
      if (obj.hazardType === hazardType) {
        const distance = Math.sqrt(Math.pow(x - obj.x, 2) + Math.pow(y - obj.y, 2));
        if (distance < threshold && distance < bestDistance) {
          bestMatch = key;
          bestDistance = distance;
        }
      }
    }
    
    if (bestMatch) {
      // Update existing object position
      const obj = trackedObjects.get(bestMatch);
      obj.x = x;
      obj.y = y;
      obj.lastSeen = Date.now();
      obj.area = area;
      return bestMatch;
    } else {
      // Create new tracked object
      const newKey = `obj_${nextObjectId++}`;
      trackedObjects.set(newKey, {
        id: newKey,
        x: x,
        y: y,
        hazardType: hazardType,
        area: area,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        isNew: true
      });
      return newKey;
    }
  }
  
  // Clean up old tracked objects periodically
  function cleanupTrackedObjects() {
    const now = Date.now();
    const timeout = 3000; // 3 seconds
    
    for (let [key, obj] of trackedObjects) {
      if (now - obj.lastSeen > timeout) {
        trackedObjects.delete(key);
      }
    }
  }

  

/**
 * Enhanced location tracking with improved fallback system
 * Tries GPS -> Browser permissions -> IP location
 */
function initLocationTracking() {
  return new Promise(async (resolve) => {
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported by browser");
      await tryIPLocation();
      return resolve(_lastCoords);
    }

    // Check if location permission is already granted
    if (navigator.permissions) {
      try {
        const permission = await navigator.permissions.query({name: 'geolocation'});
        if (permission.state === 'denied') {
          console.warn("Location permission denied, trying IP fallback");
          await tryIPLocation();
          return resolve(_lastCoords);
        }
      } catch (err) {
        console.warn("Permission API not supported");
      }
    }

    let done = false;
    function handleCoords(coords, source = 'GPS') {
      if (done) return;
      done = true;
      _lastCoords = coords;
      console.log(`📍 Location obtained from ${source}:`, coords);
      resolve(coords);
    }

    // 1️⃣ Try High-Accuracy GPS
    navigator.geolocation.getCurrentPosition(
      pos => handleCoords(pos.coords, 'High-Accuracy GPS'),
      async (err) => {
        console.warn("High-Accuracy GPS failed:", err.code, err.message);
        
        if (err.code === err.PERMISSION_DENIED) {
          console.log("Permission denied, trying IP fallback");
          await tryIPLocation();
          return resolve(_lastCoords);
        }
        
        // 2️⃣ Try Low-Accuracy GPS
        navigator.geolocation.getCurrentPosition(
          pos2 => handleCoords(pos2.coords, 'Low-Accuracy GPS'),
          async (err2) => {
            console.warn("Low-Accuracy GPS failed:", err2.code, err2.message);
            // 3️⃣ Final fallback to IP
            await tryIPLocation();
            resolve(_lastCoords);
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // 4️⃣ Setup continuous location tracking if GPS is available
    if (!done) {
      setTimeout(() => {
        if (_lastCoords) {
          _watchId = navigator.geolocation.watchPosition(
            pos => {
              _lastCoords = pos.coords;
              console.log("📍 Location updated:", pos.coords);
            },
            err => {
              console.warn("watchPosition error:", err.code, err.message);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
          );
        }
      }, 1000);
    }
  });
}

/**
 * Try to get location from IP address
 */
async function tryIPLocation() {
  try {
    console.log("Attempting IP-based location...");
    const response = await fetch("https://ipapi.co/json/");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (data.latitude && data.longitude) {
      _lastCoords = {
        latitude: data.latitude,
        longitude: data.longitude,
        source: 'IP'
      };
      console.log("📍 IP-based location obtained:", _lastCoords);
      return true;
    }
  } catch (error) {
    console.warn("IP location failed:", error);
    try {
      // Fallback to another IP service
      const response = await fetch("https://api.ipify.org?format=json");
      const ipData = await response.json();
      console.log("Using fallback IP service for:", ipData.ip);
      // Could implement additional IP geolocation service here
    } catch (fallbackError) {
      console.warn("All location methods failed:", fallbackError);
    }
  }
  return false;
}

/**
 * Returns Promise with the latest location (or rejects if not available)
 */
function getLatestLocation() {
  return new Promise((resolve, reject) => {
    if (_lastCoords && _lastCoords.latitude && _lastCoords.longitude) {
      const lat = parseFloat(_lastCoords.latitude);
      const lng = parseFloat(_lastCoords.longitude);
      
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        resolve(JSON.stringify({ lat: lat, lng: lng }));
      } else {
        reject("Invalid coordinates");
      }
    } else {
      reject("No location available yet");
    }
  });
}

/**
 * מפסיק את ה־watchPosition
 */
function stopLocationTracking() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
}


/**
 * מחזירה את המיקום האחרון (או נדחתת אם אין עדיין)
 */


  
  

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.color = "white";
    toast.style.padding = "12px 20px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    toast.style.zIndex = 9999;
    toast.style.fontSize = "14px";
    toast.style.fontWeight = "500";
    toast.style.maxWidth = "300px";
    toast.style.wordWrap = "break-word";
    toast.style.transition = "all 0.3s ease";
    toast.style.transform = "translateY(100%)";
    toast.style.opacity = "0";
    
    // Set colors based on type
    if (type === "success") {
      toast.style.backgroundColor = "#4caf50";
    } else if (type === "error") {
      toast.style.backgroundColor = "#f44336";
    } else if (type === "warning") {
      toast.style.backgroundColor = "#ff9800";
    } else if (type === "info") {
      toast.style.backgroundColor = "#2196f3";
    }
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
      toast.style.transform = "translateY(0)";
      toast.style.opacity = "1";
    }, 10);
    
    // Remove after delay
    setTimeout(() => {
      toast.style.transform = "translateY(100%)";
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function showSuccessToast(message = "💾 Detected and saved!") {
    showToast(message, "success");
  }

  async function saveDetection(canvas, label = "Unknown", retryCount = 0) {
    let geoData;
    let locationNote;
  
    // Try to get current location
    if (_lastCoords && _lastCoords.latitude && _lastCoords.longitude) {
      // Validate coordinates are reasonable
      const lat = parseFloat(_lastCoords.latitude);
      const lng = parseFloat(_lastCoords.longitude);
      
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        geoData = JSON.stringify({ 
          lat: lat, 
          lng: lng 
        });
        locationNote = _lastCoords.source === 'IP' ? "Approximate (IP)" : "GPS";
        console.log(`📍 Using ${locationNote} location for detection save:`, {lat, lng});
      } else {
        console.warn("Invalid coordinates:", {lat, lng});
        geoData = null;
        locationNote = "Invalid coordinates";
      }
    } else {
      // Final attempt to get location if not available
      console.log("No location available, attempting final location fetch...");
      await tryIPLocation();
      
      if (_lastCoords && _lastCoords.latitude && _lastCoords.longitude) {
        const lat = parseFloat(_lastCoords.latitude);
        const lng = parseFloat(_lastCoords.longitude);
        
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          geoData = JSON.stringify({ 
            lat: lat, 
            lng: lng 
          });
          locationNote = "Approximate (IP)";
        } else {
          geoData = null;
          locationNote = "Invalid IP coordinates";
        }
      } else {
        console.warn("No location available for detection save");
        geoData = null;
        locationNote = "Location unavailable";
      }
    }
  
    // Save detection with location data
    canvas.toBlob(async blob => {
      if (!blob) return console.error("❌ Failed to get image blob");
  
      const file = new File([blob], "detection.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);
      
      // Only append geoData if we have valid coordinates
      if (geoData) {
        formData.append("geoData", geoData);
      }
      
      formData.append("hazardTypes", label);
      formData.append("locationNote", locationNote);
      formData.append("timestamp", new Date().toISOString());
  
      try {
        const res = await fetch("/upload-detection", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error("Server error:", errorText);
          throw new Error(errorText);
        }
        
        const result = await res.json();
        console.log("✅ Detection saved:", result.message);
        showSuccessToast(`💾 Detection saved (${locationNote})`);
      } catch (err) {
        console.error("❌ Failed to save detection:", err);
        
        // Retry logic for network errors
        if (retryCount < 2 && (err.message.includes("network") || err.message.includes("timeout"))) {
          console.log(`Retrying save detection... (${retryCount + 1}/2)`);
          showToast(`🔄 Retrying save... (${retryCount + 1}/2)`, "warning");
          setTimeout(() => saveDetection(canvas, label, retryCount + 1), 1000);
          return;
        }
        
        // Try to parse error message for better user feedback
        let errorMessage = "Failed to save detection";
        if (err.message) {
          try {
            const errorObj = JSON.parse(err.message);
            errorMessage = errorObj.error || errorMessage;
          } catch (parseErr) {
            errorMessage = err.message;
          }
        }
        
        showToast(`❌ ${errorMessage}`, "error");
      }
    }, "image/jpeg", 0.9);
  }
  
  
  

  
  // במקום כל import של ort.min.js — מניחים window.ort כבר קיים
  async function loadModel() {
    const ort = window.ort;
    ort.env.wasm.simd = true;               // enable SIMD when supported
    ort.env.wasm.wasmPaths = '/ort/';
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    const EPs = ort.env.webgl?.isSupported ? ['webgl','wasm'] : ['wasm','webgl'];
    session = await ort.InferenceSession.create(
      '/object_detecion_model/road_damage_detection_simplified.onnx',
      { executionProviders: EPs, graphOptimizationLevel: 'all' }
    );
  }

  function computeLetterboxParams() {
    const scale = Math.min(FIXED_SIZE / video.videoWidth, FIXED_SIZE / video.videoHeight);
    const newW = Math.round(video.videoWidth * scale);
    const newH = Math.round(video.videoHeight * scale);
    const offsetX = Math.floor((FIXED_SIZE - newW) / 2);
    const offsetY = Math.floor((FIXED_SIZE - newH) / 2);
    letterboxParams = { scale, newW, newH, offsetX, offsetY };
  }



async function detectLoop() {
  if (!detecting || !session) return;

  // Only resize canvas if video dimensions changed
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  
  // Always draw video frame for smooth preview
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  frameCount++;
  const shouldRunDetection = frameCount % skipFrames === 0;
  if (!shouldRunDetection) {
    // Continue smooth preview without detection
    requestAnimationFrame(detectLoop);
    return;
  }

  const t0 = performance.now();

  if (!letterboxParams) computeLetterboxParams();
  offCtx.fillStyle = 'black';
  offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
  offCtx.filter = 'none'; // Remove contrast/brightness filter for raw input

  // Draw video frame into letterboxed area
  offCtx.drawImage(
    video,
    0, 0, video.videoWidth, video.videoHeight,
    letterboxParams.offsetX, letterboxParams.offsetY,
    letterboxParams.newW, letterboxParams.newH
  );

  // Prepare input for model
  const curr = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);

  if (prevImageData) {
    let sum = 0;
    const d1 = curr.data, d2 = prevImageData.data;
    const step = 16; // Sample every 4th pixel for faster computation
    
    for (let i = 0; i < d1.length; i += step) {
      sum += Math.abs(d1[i] - d2[i]) + Math.abs(d1[i+1] - d2[i+1]) + Math.abs(d1[i+2] - d2[i+2]);
    }
    
    // Adjust threshold for sampling
    const adjustedThreshold = DIFF_THRESHOLD / 4;
    
    // Smart stabilization - check for significant change or lack of movement
    if (sum < adjustedThreshold / 2) {
      // Almost no change → skip
      prevImageData = curr;
      requestAnimationFrame(detectLoop);
      return;
    } else if (sum > adjustedThreshold * 3) {
      // Sharp movement → don't skip frames
      skipFrames = 1;
    } else {
      // Normal movement → return to default
      skipFrames = 2;
    }
  }

  prevImageData = curr;

  // Optimized conversion to float32, normalize to [0,1], and CHW format
  const { data, width, height } = curr;
  const inv255 = 1.0 / 255.0; // Pre-calculate division
  
  // Combined loop for better performance
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * 4;
      const outputIndex = y * width + x;
      
      // Convert RGB to CHW format in one pass
      chwData[outputIndex] = data[pixelIndex] * inv255; // R
      chwData[width * height + outputIndex] = data[pixelIndex + 1] * inv255; // G
      chwData[2 * width * height + outputIndex] = data[pixelIndex + 2] * inv255; // B
    }
  }

  const inputTensor = new ort.Tensor('float32', chwData, [1, 3, height, width]);
  let results;
  try {
    results = await session.run({ images: inputTensor });
  } catch (err) {
    console.error("ONNX inference error:", err);
    inputTensor.dispose?.(); // Clean up tensor
    requestAnimationFrame(detectLoop);
    return;
  }
  const outputData = results[Object.keys(results)[0]].data;
  
  // Clean up tensors to prevent memory leaks
  inputTensor.dispose?.();
  if (results) {
    Object.values(results).forEach(tensor => tensor.dispose?.());
  }

  // --- DEBUG: Log output shape and sample values ---
  // console.log("Model output:", outputData);

  // Parse detections
  const boxes = [];
  const scores = [];
  const classes = [];

  // Optimized detection parsing with early termination
  const threshold = 0.5;
  const maxDetections = 50; // Limit detections for performance
  
  for (let i = 0; i < outputData.length && boxes.length < maxDetections; i += 6) {
    const score = outputData[i + 4];
    if (score >= threshold) {
      boxes.push([outputData[i], outputData[i + 1], outputData[i + 2], outputData[i + 3]]);
      scores.push(score);
      classes.push(outputData[i + 5]);
    }
  }

  // --- DEBUG: Log number of detections ---
  // console.log("Detections:", boxes.length);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Reset frame counters for overlays
  detectedObjectCount = 0;
  const frameHazardTypes = [];

  // Process all detections directly without NMS
  for (let i = 0; i < boxes.length; i++) {
    const [x1, y1, x2, y2] = boxes[i];
    const score = scores[i];
    const cls = classes[i];

    // Undo letterbox scaling - correct coordinate transformation
    const left = (x1 - letterboxParams.offsetX) / letterboxParams.scale;
    const top = (y1 - letterboxParams.offsetY) / letterboxParams.scale;
    const right = (x2 - letterboxParams.offsetX) / letterboxParams.scale;
    const bottom = (y2 - letterboxParams.offsetY) / letterboxParams.scale;
    const w = right - left;
    const h = bottom - top;

    // Ensure coordinates are within bounds
    if (left < 0 || top < 0 || right > video.videoWidth || bottom > video.videoHeight) {
      continue; // Skip invalid detections
    }
    
    detectedObjectCount++;
    const hazardIdx = Math.floor(cls);
    const hazardName = (hazardIdx >= 0 && hazardIdx < classNames.length) ? classNames[hazardIdx] : `Unknown Class ${hazardIdx}`;
    
    // Track unique objects
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const objectKey = findOrCreateTrackedObject(centerX, centerY, hazardName, w * h);
    
    if (hazardName && !frameHazardTypes.includes(hazardName)) {
      frameHazardTypes.push(hazardName);
    }
    if (hazardName && !uniqueHazardTypes.includes(hazardName)) {
      uniqueHazardTypes.push(hazardName);
    }

    const label = `${hazardName} (${(score * 100).toFixed(1)}%)`;
    
    // Ensure positive width and height
    const drawW = Math.max(w, 1);
    const drawH = Math.max(h, 1);
    
    // Draw bounding box
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;
    ctx.strokeRect(Math.max(0, left), Math.max(0, top), drawW, drawH);

    // Draw label background and text
    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 16px Arial';
    const textWidth = ctx.measureText(label).width;
    const labelY = top > 20 ? top - 20 : top + drawH + 20;
    ctx.fillRect(Math.max(0, left), labelY, textWidth + 8, 20);
    ctx.fillStyle = 'black';
    ctx.fillText(label, Math.max(4, left + 4), labelY + 15);

    // Save detection only for new tracked objects
    if (trackedObjects.get(objectKey).isNew) {
      trackedObjects.get(objectKey).isNew = false;
      sessionDetectionCount++;
      await saveDetection(canvas, hazardName);
    }
  }

  // Update FPS counter
  fpsCounter++;
  const now = Date.now();
  if (now - lastFpsTime >= 1000) {
    currentFps = Math.round((fpsCounter * 1000) / (now - lastFpsTime));
    fpsCounter = 0;
    lastFpsTime = now;
  }

  if (objectCountOverlay) {
    objectCountOverlay.textContent = `Frame: ${detectedObjectCount} | Session: ${sessionDetectionCount} | FPS: ${currentFps}`;
  }
  if (hazardTypesOverlay) {
    hazardTypesOverlay.textContent = frameHazardTypes.length > 0
      ? `Hazards: ${frameHazardTypes.join(', ')}`
      : 'Hazards: None';
  }

  const t1 = performance.now();
  const elapsed = t1 - t0;
  frameTimes.push(elapsed);
  if (frameTimes.length > maxHistory) frameTimes.shift();
  const avgTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const idealInterval = 1000 / targetFps;
  // Dynamic frame skipping based on performance
  if (avgTime > idealInterval * 1.5) {
    skipFrames = Math.min(skipFrames + 1, 5);
  } else if (avgTime < idealInterval * 0.8) {
    skipFrames = Math.max(skipFrames - 1, 1);
  }

  // Cleanup old tracked objects periodically
  if (frameCount % 30 === 0) {
    cleanupTrackedObjects();
  }

  // Use requestAnimationFrame for smoother preview
  if (video.requestVideoFrameCallback && detecting) {
    video.requestVideoFrameCallback(() => detectLoop());
  } else {
    requestAnimationFrame(detectLoop);
  }
}



  startBtn.addEventListener("click", async () => {
  // Wait for the initial location to be found.
  const initialCoords = await initLocationTracking();
  if (initialCoords) {
    console.log("📍 Location preloaded:", initialCoords);
  } else {
    console.warn("⚠️ Could not get initial location. Detections may not be saved.");
    // Optionally, alert the user or prevent starting.
  }

  try {
    // בדיקה מחדש של המצלמות בכל התחלה
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = devices.filter((d) => d.kind === "videoinput");

    const selectedDeviceId = videoDevices[currentCamIndex]?.deviceId;
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
        frameRate: { ideal: 30, max: 30 }, // Reduced for better performance
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        facingMode: selectedDeviceId ? undefined : "environment"
      }
    });


    video.srcObject = stream;
    startBtn.style.display = "none";
    stopBtn.style.display = "inline-block";
    switchBtn.style.display = videoDevices.length > 1 ? "inline-block" : "none";

    detectedObjectCount = 0;
    uniqueHazardTypes = [];

    video.addEventListener(
      "loadeddata",
      () => {
        computeLetterboxParams();
        detecting = true;
        detectLoop();
      },
      { once: true }
    );
  } catch (err) {
    console.error("❌ שגיאה בגישה למצלמה:", err);
    alert("⚠️ לא ניתן לגשת למצלמה. יש לבדוק הרשאות בדפדפן.");
  }
});

  
  
switchBtn.addEventListener("click", async () => {
  try {
    if (!videoDevices.length || videoDevices.length < 2) return;

    // עצור את הזרם הנוכחי
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }

    // עבור למצלמה הבאה
    currentCamIndex = (currentCamIndex + 1) % videoDevices.length;
    const newDeviceId = videoDevices[currentCamIndex].deviceId;

    // בקש את המצלמה החדשה
    stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: newDeviceId } },
    });

    // הצמד את הווידאו לזרם החדש
    video.srcObject = stream;
    letterboxParams = null; // כדי לחשב מחדש בפריים הבא

    console.log(`📷 Switched to camera index ${currentCamIndex}`);
  } catch (err) {
    console.error("❌ Failed to switch camera:", err);
    alert("⚠️ לא ניתן להחליף מצלמה. בדוק הרשאות.");
  }
});

  stopBtn.addEventListener("click", () => {
    detecting = false;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.srcObject = null;
    startBtn.style.display = "inline-block";
    stopBtn.style.display = "none";
    switchBtn.style.display = "none";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stopLocationTracking();
    
    // Memory cleanup
    prevImageData = null;
    frameTimes.length = 0;
    detectedObjectCount = 0;
    sessionDetectionCount = 0;
    uniqueHazardTypes = [];
    trackedObjects.clear();
    nextObjectId = 1;
    fpsCounter = 0;
    lastFpsTime = Date.now();
    currentFps = 0;
    
    // Clear overlays
    if (objectCountOverlay) objectCountOverlay.textContent = "Frame: 0 | Session: 0 | FPS: 0";
    if (hazardTypesOverlay) hazardTypesOverlay.textContent = "Hazards: None";
    
    console.log("Camera stopped and memory cleaned");
  });
});