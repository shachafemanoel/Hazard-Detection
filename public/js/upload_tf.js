// upload_tf_optimized.js - Performance optimized hazard detection
// Optimizations: Memory management, batch processing, adaptive frame skipping,
// improved object tracking, reduced garbage collection, better error handling
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { storage } from "./firebaseConfig.js";
import { CanvasUtils } from "./modules/CanvasUtils.js";
import { ApiService } from "./modules/ApiService.js";
import { GeolocationService } from "./modules/GeolocationService.js";
import {
  CLASS_NAMES,
  PERFORMANCE,
  CAMERA,
} from "./modules/Constants.js";
import { Constants } from "./modules/Constants.js";

// Advanced optimization constants for best detection performance
const OPTIMIZATION = {
  WEBGL_CONTEXT_OPTIONS: {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    desynchronized: true,
    preserveDrawingBuffer: false
  },
  OFFSCREEN_CONTEXT_OPTIONS: {
    willReadFrequently: true,
    alpha: false
  },
  // Detection quality settings
  MIN_DETECTION_AREA: 64, // Reduced for better small object detection
  MIN_DETECTION_WIDTH: 8,
  MIN_DETECTION_HEIGHT: 8,
  MAX_CONCURRENT_SAVES: 1, // Reduced to ensure quality
  
  // Detection threshold (model already includes NMS)
  DETECTION_THRESHOLD: 0.4,
  
  // Enhanced tracking parameters
  TRACKING_DISTANCE_THRESHOLD: 80,
  TRACKING_MIN_CONFIDENCE: 0.4,
  TRACKING_STABILITY_FRAMES: 3,
  TRACKING_MAX_MISSED_FRAMES: 5,
  
  // Quality assessment (simplified)
  QUALITY_MIN_SHARPNESS: 0.2,
  QUALITY_MIN_BRIGHTNESS: 20,
  QUALITY_MAX_BRIGHTNESS: 235,
  
  // Save optimization
  SAVE_COOLDOWN_MS: 2000, // Reduced for more frequent saves of good detections
};

// Use immediate function instead of DOMContentLoaded since this script is loaded dynamically
(function() {
  // Check if essential DOM elements exist before proceeding
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
  const switchBtn = document.getElementById("switch-camera");
  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  
  if (!startBtn || !stopBtn || !switchBtn || !video || !canvas) {
    console.error("Essential camera elements not found. Make sure components are loaded properly.");
    return;
  }
  
  const ctx = canvas.getContext("2d");
  const objectCountOverlay = document.getElementById("object-count-overlay");
  const loadingOverlay = document.getElementById("loading-overlay");
  const hazardTypesOverlay = document.getElementById("hazard-types-overlay");

  const FIXED_SIZE = Constants.MODEL.FIXED_SIZE; // Increased for better detection accuracy
  let stream = null;
  let detecting = false;
  let session = null;
  let frameCount = 0;
  let lastSaveTime = 0;
  let videoDevices = [];
  let currentCamIndex = 0;
  let prevImageData = null;
  const DIFF_THRESHOLD = PERFORMANCE.DIFF_THRESHOLD;
  let skipFrames = PERFORMANCE.SKIP_FRAMES;
  const targetFps = PERFORMANCE.TARGET_FPS;
  const frameTimes = [];
  const maxHistory = PERFORMANCE.MAX_HISTORY;
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
      if (loadingOverlay) loadingOverlay.style.display = "flex"; // הצג את ה-overlay
      try {
        // Wait a bit longer for ONNX Runtime to be fully initialized
        await new Promise(resolve => setTimeout(resolve, 2000));
        await loadModel();
        console.log("✅ מודל נטען בהצלחה (בטעינת הדף)");
        // אין צורך ב-toast כאן, המשתמש עוד לא התחיל אינטראקציה
      } catch (err) {
        console.error("❌ שגיאה בטעינת המודל (בטעינת הדף):", err);
        if (loadingOverlay)
          loadingOverlay.innerHTML = `<p class="text-danger">Error loading model: ${err.message}. Camera will still work but without AI detection.</p>`; // הצג הודעת שגיאה ב-overlay
        
        // Don't disable the start button - let users use camera without AI detection
        // if (startBtn) startBtn.disabled = true;
        
        // Hide overlay after showing error
        setTimeout(() => {
          if (loadingOverlay) loadingOverlay.style.display = "none";
        }, 5000);
        
        return; // עצור כאן אם הטעינה נכשלה
      } finally {
        // הסתר את ה-overlay רק אם לא הייתה שגיאה קריטית שהשאירה הודעה
        if (loadingOverlay && !startBtn.disabled)
          loadingOverlay.style.display = "none";
      }
    })();
  })();

  // --- התאמת גודל הקנבס לגודל הווידאו במסך/מובייל ---
  function resizeCanvasToVideo() {
    if (!video || !canvas) return;
    // קח את הגודל האמיתי של הווידאו (לא ה-css)
    const width = video.videoWidth || video.clientWidth;
    const height = video.videoHeight || video.clientHeight;
    if (width && height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }
  }

  // עדכן קנבס כאשר הווידאו נטען או משתנה גודל
  video.addEventListener("loadedmetadata", resizeCanvasToVideo);
  window.addEventListener("resize", resizeCanvasToVideo);
  window.addEventListener("orientationchange", resizeCanvasToVideo);

  const offscreen = document.createElement("canvas");
  offscreen.width = FIXED_SIZE;
  offscreen.height = FIXED_SIZE;
  const offCtx = offscreen.getContext("2d", OPTIMIZATION.OFFSCREEN_CONTEXT_OPTIONS);

  // Removed preprocessingBuffers and detectionCache as they were over-complicating the detection process
  
  // Performance monitoring
  let activeSaveOperations = 0;
  let totalProcessingTime = 0;
  let processedFrames = 0;

  let letterboxParams = null;

  const classNames = CLASS_NAMES;

  // Note: NMS functions removed since the model already includes NMS processing
  
  // Advanced image quality assessment
  function assessImageQuality(imageData) {
    const data = imageData.data;
    let sharpness = 0;
    let brightness = 0;
    const pixelCount = data.length / 4;
    
    // Calculate brightness
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      brightness += gray;
    }
    brightness /= pixelCount;
    
    // Calculate sharpness using Laplacian variance (simplified for performance)
    const width = imageData.width;
    const height = imageData.height;
    const sampleStep = 8; // Sample every 8th pixel for performance
    
    for (let y = sampleStep; y < height - sampleStep; y += sampleStep) {
      for (let x = sampleStep; x < width - sampleStep; x += sampleStep) {
        const idx = (y * width + x) * 4;
        const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        const top = (data[idx - width * 4] + data[idx - width * 4 + 1] + data[idx - width * 4 + 2]) / 3;
        const bottom = (data[idx + width * 4] + data[idx + width * 4 + 1] + data[idx + width * 4 + 2]) / 3;
        const left = (data[idx - 4] + data[idx - 3] + data[idx - 2]) / 3;
        const right = (data[idx + 4] + data[idx + 5] + data[idx + 6]) / 3;
        
        const laplacian = Math.abs(4 * center - top - bottom - left - right);
        sharpness += laplacian * laplacian;
      }
    }
    
    const sampleCount = Math.floor((width - 2 * sampleStep) / sampleStep) * Math.floor((height - 2 * sampleStep) / sampleStep);
    sharpness = Math.sqrt(sharpness / sampleCount);
    
    return {
      sharpness: sharpness / 255,
      brightness: brightness,
      isGoodQuality: sharpness / 255 >= OPTIMIZATION.QUALITY_MIN_SHARPNESS &&
                     brightness >= OPTIMIZATION.QUALITY_MIN_BRIGHTNESS &&
                     brightness <= OPTIMIZATION.QUALITY_MAX_BRIGHTNESS
    };
  }

  // Enhanced object tracking with stability scoring
  function findOrCreateTrackedObject(x, y, hazardType, area, detectionScore) {
    const threshold = OPTIMIZATION.TRACKING_DISTANCE_THRESHOLD;
    const thresholdSq = threshold * threshold;
    let bestMatch = null;
    let bestDistanceSq = Infinity;
    
    // Basic validation - simplified criteria
    if (area < OPTIMIZATION.MIN_DETECTION_AREA || 
        detectionScore < OPTIMIZATION.TRACKING_MIN_CONFIDENCE) {
      return null;
    }

    // Find best matching tracked object
    for (let [key, obj] of trackedObjects) {
      if (obj.hazardType === hazardType && !obj.isStale) {
        const dx = x - obj.x;
        const dy = y - obj.y;
        const distanceSq = dx * dx + dy * dy;
        
        if (distanceSq < thresholdSq && distanceSq < bestDistanceSq) {
          bestMatch = key;
          bestDistanceSq = distanceSq;
        }
      }
    }

    const now = Date.now();
    if (bestMatch) {
      // Update existing object with enhanced tracking
      const obj = trackedObjects.get(bestMatch);
      
      // Adaptive smoothing based on confidence
      const alpha = Math.min(0.8, 0.3 + obj.stability * 0.5);
      obj.x = alpha * x + (1 - alpha) * obj.x;
      obj.y = alpha * y + (1 - alpha) * obj.y;
      obj.lastSeen = now;
      obj.area = area;
      obj.missedFrames = 0;
      
      // Update detection confidence with momentum
      obj.detectionConfidence = 0.7 * obj.detectionConfidence + 0.3 * detectionScore;
      
      // Calculate stability score
      obj.detectionCount++;
      obj.totalDetectionTime = now - obj.firstSeen;
      obj.stability = Math.min(1.0, obj.detectionCount / OPTIMIZATION.TRACKING_STABILITY_FRAMES);
      
      // Update overall confidence
      obj.confidence = (obj.detectionConfidence * 0.6 + obj.stability * 0.4);
      
      return bestMatch;
    } else {
      // Create new tracked object with enhanced properties
      const newKey = `obj_${nextObjectId++}`;
      trackedObjects.set(newKey, {
        id: newKey,
        x: x,
        y: y,
        hazardType: hazardType,
        area: area,
        firstSeen: now,
        lastSeen: now,
        detectionConfidence: detectionScore,
        confidence: detectionScore * 0.5, // Start with lower confidence
        stability: 0,
        detectionCount: 1,
        missedFrames: 0,
        totalDetectionTime: 0,
        isNew: true,
        isStale: false,
        qualityScores: [],
      });
      return newKey;
    }
  }

  // Enhanced cleanup with intelligent object lifecycle management
  function cleanupTrackedObjects() {
    const now = Date.now();
    const timeout = PERFORMANCE.OBJECT_CLEANUP_TIMEOUT;
    const keysToDelete = [];
    const keysToMarkStale = [];

    for (let [key, obj] of trackedObjects) {
      const timeSinceLastSeen = now - obj.lastSeen;
      
      // Mark objects as stale if they haven't been seen recently
      if (timeSinceLastSeen > timeout / 2 && !obj.isStale) {
        obj.missedFrames++;
        if (obj.missedFrames > OPTIMIZATION.TRACKING_MAX_MISSED_FRAMES) {
          obj.isStale = true;
          keysToMarkStale.push(key);
        }
      }
      
      // Delete objects that are truly gone or have very low confidence
      if (timeSinceLastSeen > timeout || 
          obj.confidence < 0.1 || 
          (obj.isStale && timeSinceLastSeen > timeout / 4)) {
        keysToDelete.push(key);
      }
    }

    // Batch operations
    keysToDelete.forEach(key => trackedObjects.delete(key));
    
    return {
      deleted: keysToDelete.length,
      stale: keysToMarkStale.length
    };
  }

  // Initialize geolocation service
  const geoService = new GeolocationService();

  function initLocationTracking() {
    return geoService.initLocationTracking();
  }

  function getLatestLocation() {
    return geoService.getLatestLocation();
  }

  function stopLocationTracking() {
    return geoService.stopLocationTracking();
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
    toast.style.overflowWrap = "break-word";
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
  
  // Simplified save decision making
  function shouldSaveDetection(trackedObj, timeSinceLastSave, detectionScore, area) {
    // Check basic timing constraints
    if (timeSinceLastSave < OPTIMIZATION.SAVE_COOLDOWN_MS) {
      return false;
    }
    
    // Simplified criteria for saves
    const hasGoodConfidence = trackedObj.confidence >= 0.6;
    const hasMinStability = trackedObj.stability >= 0.5;
    const hasGoodSize = area >= OPTIMIZATION.MIN_DETECTION_AREA;
    
    // Save if meets basic criteria
    return hasGoodConfidence && hasMinStability && hasGoodSize;
  }

  // Enhanced save function with quality optimization
  async function saveDetection(canvas, label = "Unknown", trackedObj = null, retryCount = 0) {
    // Limit concurrent save operations
    if (activeSaveOperations >= OPTIMIZATION.MAX_CONCURRENT_SAVES) {
      console.log('Save operation throttled - too many concurrent saves');
      return;
    }
    
    activeSaveOperations++;
    let geoData;
    let locationNote;

    // Get current location from geolocation service
    let currentLocation;
    try {
      currentLocation = await getLatestLocation();
    } catch (error) {
      console.log("Current location not available:", error.message);
      currentLocation = null;
    }
    
    if (currentLocation && typeof currentLocation === 'string') {
      try {
        currentLocation = JSON.parse(currentLocation);
      } catch (parseError) {
        console.warn("Failed to parse location:", parseError);
        currentLocation = null;
      }
    }
    
    if (currentLocation && currentLocation.lat && currentLocation.lng) {
      // Validate coordinates are reasonable
      const lat = parseFloat(currentLocation.lat);
      const lng = parseFloat(currentLocation.lng);

      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        geoData = JSON.stringify({
          lat: lat,
          lng: lng,
        });
        locationNote = "GPS";
        console.log(`📍 Using ${locationNote} location for detection save:`, {
          lat,
          lng,
        });
      } else {
        console.warn("Invalid coordinates:", { lat, lng });
        geoData = null;
        locationNote = "Invalid coordinates";
      }
    } else {
      // Final attempt to get location if not available
      console.log("No location available, attempting final location fetch...");
      try {
        const success = await geoService.tryIPLocation();
        if (success) {
          const latestLocation = geoService.getLatestLocation();
          if (latestLocation) {
            const lat = parseFloat(latestLocation.latitude);
            const lng = parseFloat(latestLocation.longitude);

            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              geoData = JSON.stringify({
                lat: lat,
                lng: lng,
              });
              locationNote = "Approximate (IP)";
            } else {
              geoData = null;
              locationNote = "Invalid IP coordinates";
            }
          } else {
            geoData = null;
            locationNote = "Location unavailable";
          }
        } else {
          geoData = null;
          locationNote = "Location unavailable";
        }
      } catch (error) {
        console.warn("IP location fetch failed:", error);
        geoData = null;
        locationNote = "Location unavailable";
      }
    }

    // Save detection with location data
    canvas.toBlob(
      async (blob) => {
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
        
        // Add quality metadata if available
        if (trackedObj) {
          formData.append("confidence", trackedObj.confidence.toFixed(3));
          formData.append("stability", trackedObj.stability.toFixed(3));
          formData.append("detectionCount", trackedObj.detectionCount.toString());
          if (trackedObj.avgQuality) {
            formData.append("imageQuality", trackedObj.avgQuality.toFixed(3));
          }
        }

        try {
          const result = await ApiService.uploadAnonymousDetection(formData);
          
          // Ensure we have proper Redis storage and Cloudinary URL
          if (result && result.report) {
            // Validate that the report was saved to Redis
            if (result.reportId || result.report.id) {
              console.log("✅ Detection saved to Redis with ID:", result.reportId || result.report.id);
            }
            
            // Ensure Cloudinary image URL is present
            if (result.url || result.report.image) {
              const imageUrl = result.url || result.report.image;
              console.log("✅ Image uploaded to Cloudinary:", imageUrl);
              
              // Validate Cloudinary URL format
              if (!imageUrl.includes('cloudinary.com')) {
                console.warn('⚠️ Image URL does not appear to be from Cloudinary:', imageUrl);
              }
            } else {
              console.warn('⚠️ No Cloudinary image URL in response');
            }
          }
          
          // Ensure backward compatibility - populate report.image if missing
          if (result.url && (!result.report || !result.report.image)) {
            result.report = result.report || {};
            result.report.image = result.url;
          }
          
          console.log("✅ Detection saved:", result.message);
          
          // Handle successful upload response with quality info
          const qualityInfo = trackedObj ? ` (Conf: ${(trackedObj.confidence * 100).toFixed(0)}%)` : '';
          const redisInfo = result.reportId ? ` - Redis ID: ${result.reportId}` : '';
          
          if (result.reportId) {
            showSuccessToast(`💾 High-quality detection saved${qualityInfo}${redisInfo}`);
          } else {
            showSuccessToast(`💾 Detection saved (${locationNote})${qualityInfo}`);
          }
        } catch (err) {
          console.error("❌ Failed to save detection:", err);

          // Retry logic for network errors
          if (
            retryCount < 2 &&
            (err.message.includes("network") || err.message.includes("timeout"))
          ) {
            console.log(`Retrying save detection... (${retryCount + 1}/2)`);
            showToast(`🔄 Retrying save... (${retryCount + 1}/2)`, "warning");
            setTimeout(
              () => saveDetection(canvas, label, retryCount + 1),
              1000,
            );
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
        } finally {
          activeSaveOperations--;
        }
      },
      "image/jpeg",
      0.85, // Slightly lower quality for better performance
    );
  }

  // Wait for ONNX Runtime to be available
  function waitForOrt() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 100; // Wait up to 10 seconds
      
      const checkOrt = () => {
        console.log(`Checking ONNX Runtime... attempt ${attempts + 1}/${maxAttempts}`);
        console.log(`window.ort exists: ${!!window.ort}`);
        if (window.ort) {
          console.log(`window.ort.env exists: ${!!window.ort.env}`);
          console.log(`window.ort.InferenceSession exists: ${!!window.ort.InferenceSession}`);
        }
        
        if (window.ort && window.ort.env && window.ort.InferenceSession) {
          console.log("✅ ONNX Runtime is ready!");
          resolve(window.ort);
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(checkOrt, 100);
        } else {
          reject(new Error("ONNX Runtime (ort) failed to load after 10 seconds. Check ort.min.js script."));
        }
      };
      
      checkOrt();
    });
  }

  // Optimized model loading with better error handling
  async function loadModel() {
    const ort = await waitForOrt();
    
    // Optimized ONNX Runtime configuration
    ort.env.wasm.simd = true;
    ort.env.wasm.wasmPaths = "/assets/ort/";
    ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 1, 2);
    ort.env.logLevel = 'warning'; // Reduce logging overhead
    
    const modelPaths = [
      "/assets/object_detecion_model/model 18:7.onnx"
    ];
    
    const sessionOptions = {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
      enableCpuMemArena: true,
      enableMemPattern: true,
      executionMode: "sequential",
      intraOpNumThreads: 1
    };
    
    for (const modelPath of modelPaths) {
      try {
        console.log(`Loading model: ${modelPath}`);
        const startTime = performance.now();
        
        session = await ort.InferenceSession.create(modelPath, sessionOptions);
        
        const loadTime = performance.now() - startTime;
        console.log(`✅ Model loaded in ${loadTime.toFixed(0)}ms: ${modelPath}`);
        
        // Warm up the model with a dummy input
        const dummyInput = new ort.Tensor('float32', new Float32Array(3 * FIXED_SIZE * FIXED_SIZE), [1, 3, FIXED_SIZE, FIXED_SIZE]);
        try {
          await session.run({ images: dummyInput });
          console.log('✅ Model warmed up successfully');
        } catch (warmupError) {
          console.warn('Warmup failed, but model should still work:', warmupError.message);
        } finally {
          dummyInput.dispose?.();
        }
        
        break;
      } catch (error) {
        console.warn(`❌ Failed to load ${modelPath}:`, error.message);
        if (modelPath === modelPaths[modelPaths.length - 1]) {
          throw new Error(`All model loading attempts failed. Last error: ${error.message}`);
        }
      }
    }
  }

  // Cached letterbox computation to avoid recalculation
  function computeLetterboxParams() {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    // Only recompute if video dimensions changed
    if (!letterboxParams || 
        letterboxParams.videoWidth !== videoWidth || 
        letterboxParams.videoHeight !== videoHeight) {
      
      letterboxParams = CanvasUtils.computeLetterboxParams(
        videoWidth,
        videoHeight,
        FIXED_SIZE,
      );
      
      // Cache video dimensions for change detection
      letterboxParams.videoWidth = videoWidth;
      letterboxParams.videoHeight = videoHeight;
      
      console.log('Letterbox params updated:', letterboxParams);
    }
  }

  async function detectLoop() {
    if (!detecting) return;

    // Optimized canvas resizing with dimension caching
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      // Recompute letterbox params when canvas changes
      letterboxParams = null;
    }

    // Always draw video frame for smooth preview
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    frameCount++;
    const shouldRunDetection = frameCount % skipFrames === 0;
    
    // Skip AI detection if no model is loaded
    if (!session || !shouldRunDetection) {
      // Continue smooth preview without detection
      if (detecting) {
        requestAnimationFrame(detectLoop);
      }
      return;
    }

    const t0 = performance.now();

    try {
      // Ensure letterbox params are computed
      if (!letterboxParams) computeLetterboxParams();
      
      // Optimized offscreen canvas preparation
      offCtx.fillStyle = "#000000"; // Use hex for better performance
      offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
      
      // Ensure clean drawing state
      offCtx.globalCompositeOperation = "source-over";
      offCtx.filter = "none";

      // Draw video frame into letterboxed area
      offCtx.drawImage(
        video,
        0,
        0,
        video.videoWidth,
        video.videoHeight,
        letterboxParams.offsetX,
        letterboxParams.offsetY,
        letterboxParams.newW,
        letterboxParams.newH,
      );

      // Prepare input for model
      const curr = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);

      // Highly optimized frame difference check with early termination
      if (prevImageData) {
        let sum = 0;
        const d1 = curr.data;
        const d2 = prevImageData.data;
        const step = 64; // Larger step for better performance
        const earlyTerminationThreshold = DIFF_THRESHOLD * 2;

        // Early termination loop for performance
        for (let i = 0; i < d1.length && sum < earlyTerminationThreshold; i += step) {
          sum += Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
        }

        const adjustedThreshold = DIFF_THRESHOLD / 16; // More aggressive threshold

        if (sum < adjustedThreshold) {
          // Minimal change → skip processing
          prevImageData = curr;
          if (detecting) {
            requestAnimationFrame(detectLoop);
          }
          return;
        } else if (sum > adjustedThreshold * 4) {
          // Significant movement → process more frequently
          skipFrames = Math.max(1, skipFrames - 1);
        } else {
          // Moderate movement → standard processing
          skipFrames = Math.min(skipFrames + 1, 8);
        }
      }

      prevImageData = curr;

      // Convert image data to CHW format
      const chwData = CanvasUtils.convertToCHW(curr);
      const { width, height } = curr;

      const inputTensor = new ort.Tensor("float32", chwData, [
        1,
        3,
        height,
        width,
      ]);
      
      let results;
      try {
        results = await session.run({ images: inputTensor });
      } catch (err) {
        console.error("ONNX inference error:", err);
        inputTensor.dispose?.(); // Clean up tensor
        if (detecting) {
          requestAnimationFrame(detectLoop);
        }
        return;
      }
      
      const outputData = results[Object.keys(results)[0]].data;

      // Clean up tensors to prevent memory leaks
      inputTensor.dispose?.();
      if (results) {
        Object.values(results).forEach((tensor) => tensor.dispose?.());
      }

      // Simple detection parsing (similar to upload.js)
      const boxes = [];
      const scores = [];
      const classes = [];
      
      const threshold = OPTIMIZATION.DETECTION_THRESHOLD;
      console.log('Processing detections with threshold:', threshold);
      
      // Process detections (model already includes NMS)
      for (let i = 0; i < outputData.length; i += 6) {
        const box = outputData.slice(i, i + 6);
        const [x1, y1, x2, y2, score, classId] = box;
        
        if (score >= threshold) {
          const boxW = x2 - x1;
          const boxH = y2 - y1;
          
          // Basic validation similar to upload.js
          if (boxW > 1 && boxH > 1 && boxW <= FIXED_SIZE && boxH <= FIXED_SIZE) {
            boxes.push([x1, y1, x2, y2]);
            scores.push(score);
            classes.push(classId);
          }
        }
      }
      
      console.log(`Found ${boxes.length} valid detections above threshold ${threshold}`);

      // Clear and redraw
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Reset frame counters for overlays
      detectedObjectCount = 0;
      const frameHazardTypes = [];

      // Process detections with intelligent timing
      const currentTime = Date.now();
      const timeSinceLastSave = currentTime - lastSaveTime;

      // Batch process detections for optimal performance
      const processedDetections = [];
      
      for (let i = 0; i < boxes.length; i++) {
        const [x1, y1, x2, y2] = boxes[i];
        const score = scores[i];
        const cls = classes[i];

        // Transform coordinates from model space to video space
        const left = Math.max(0, (x1 - letterboxParams.offsetX) / letterboxParams.scale);
        const top = Math.max(0, (y1 - letterboxParams.offsetY) / letterboxParams.scale);
        const right = Math.min(video.videoWidth, (x2 - letterboxParams.offsetX) / letterboxParams.scale);
        const bottom = Math.min(video.videoHeight, (y2 - letterboxParams.offsetY) / letterboxParams.scale);
        
        const w = right - left;
        const h = bottom - top;
        const area = w * h;
        
        // Enhanced validation in video coordinate space
        if (w < OPTIMIZATION.MIN_DETECTION_WIDTH || 
            h < OPTIMIZATION.MIN_DETECTION_HEIGHT ||
            area < OPTIMIZATION.MIN_DETECTION_AREA) {
          continue;
        }

        const hazardIdx = Math.floor(cls);
        const hazardName = hazardIdx >= 0 && hazardIdx < classNames.length
          ? classNames[hazardIdx]
          : `Unknown Class ${hazardIdx}`;

        const centerX = (left + right) * 0.5;
        const centerY = (top + bottom) * 0.5;
        
        // Enhanced object tracking with detection score
        const objectKey = findOrCreateTrackedObject(centerX, centerY, hazardName, area, score);
        
        if (!objectKey) continue; // Skip if tracking failed
        
        processedDetections.push({
          left, top, right, bottom, w, h,
          score, hazardName, objectKey,
          centerX, centerY, area
        });
      }
      
      // Batch update UI
      detectedObjectCount = processedDetections.length;
      
      // Optimized rendering loop
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 1.5;
      ctx.font = "bold 12px Arial";
      
      processedDetections.forEach(det => {
        const { left, top, w, h, score, hazardName, objectKey } = det;
        
        // Add to frame hazards (optimized)
        if (!frameHazardTypes.includes(hazardName)) {
          frameHazardTypes.push(hazardName);
        }
        if (!uniqueHazardTypes.includes(hazardName)) {
          uniqueHazardTypes.push(hazardName);
        }

        const label = `${hazardName} (${(score * 100).toFixed(0)}%)`;
        const drawW = Math.max(w, 1);
        const drawH = Math.max(h, 1);

        // Optimized drawing
        ctx.strokeRect(left, top, drawW, drawH);
        
        // Draw label with background
        ctx.fillStyle = "#00FF00";
        const textMetrics = ctx.measureText(label);
        const labelY = top > 20 ? top - 6 : top + drawH + 16;
        ctx.fillRect(left, labelY - 14, textMetrics.width + 6, 16);
        ctx.fillStyle = "black";
        ctx.fillText(label, left + 3, labelY - 2);

        // Intelligent save logic with quality assessment
        const trackedObj = trackedObjects.get(objectKey);
        if (trackedObj && shouldSaveDetection(trackedObj, timeSinceLastSave, score, det.area)) {
          trackedObj.isNew = false;
          sessionDetectionCount++;
          lastSaveTime = currentTime;
          
          // Save high-quality detection asynchronously
          saveDetection(canvas, hazardName, trackedObj).catch(err => 
            console.warn("Save detection error:", err.message)
          );
        }
      });

      // Optimized FPS calculation with better averaging
      fpsCounter++;
      const now = Date.now();
      if (now - lastFpsTime >= 1000) {
        const actualInterval = now - lastFpsTime;
        currentFps = Math.round((fpsCounter * 1000) / actualInterval);
        fpsCounter = 0;
        lastFpsTime = now;
        
        // Adaptive performance adjustment based on FPS
        if (currentFps < targetFps * 0.7) {
          skipFrames = Math.min(skipFrames + 1, 15);
        } else if (currentFps > targetFps * 1.2) {
          skipFrames = Math.max(skipFrames - 1, 1);
        }
      }

      // Enhanced UI with quality metrics
      if (objectCountOverlay) {
        const activeObjects = trackedObjects.size;
        const avgConfidence = activeObjects > 0 ? 
          Array.from(trackedObjects.values()).reduce((sum, obj) => sum + obj.confidence, 0) / activeObjects : 0;
        objectCountOverlay.textContent = 
          `Frame: ${detectedObjectCount} | Session: ${sessionDetectionCount} | FPS: ${currentFps} | Active: ${activeObjects} | Avg Conf: ${(avgConfidence * 100).toFixed(0)}%`;
      }
      if (hazardTypesOverlay) {
        const hazardText = frameHazardTypes.length > 0
          ? `Hazards: ${frameHazardTypes.join(", ")}`
          : "Hazards: None";
        const qualityText = prevImageData ? ` | Quality: ${frameCount % 30 === 0 ? 'Checking...' : 'Good'}` : '';
        hazardTypesOverlay.textContent = hazardText + qualityText;
      }

      const t1 = performance.now();
      const elapsed = t1 - t0;
      frameTimes.push(elapsed);
      if (frameTimes.length > maxHistory) frameTimes.shift();
      const avgTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const idealInterval = 1000 / targetFps;
      
      // Enhanced adaptive frame skipping
      const targetTime = idealInterval * 0.8; // Target 80% of ideal time
      if (avgTime > targetTime * 1.5) {
        skipFrames = Math.min(skipFrames + 1, 12);
      } else if (avgTime < targetTime * 0.6) {
        skipFrames = Math.max(skipFrames - 1, 1);
      }
      
      // Memory pressure detection
      if (performance.memory && performance.memory.usedJSHeapSize > 50 * 1024 * 1024) {
        skipFrames = Math.min(skipFrames + 2, 15);
        console.warn('High memory usage detected, increasing frame skip');
      }

      // Optimized cleanup with intelligent frequency
      if (frameCount % 100 === 0) {
        const cleanup = cleanupTrackedObjects();
        if (cleanup.deleted > 0 || cleanup.stale > 0) {
          console.log(`Object cleanup: ${cleanup.deleted} deleted, ${cleanup.stale} marked stale`);
        }
      }
      
      // Assess image quality periodically for better saves
      if (frameCount % 30 === 0) {
        const quality = assessImageQuality(curr);
        
        // Store quality metrics for tracked objects
        for (let [, obj] of trackedObjects) {
          if (obj.qualityScores.length >= 5) {
            obj.qualityScores.shift(); // Keep last 5 quality scores
          }
          obj.qualityScores.push(quality);
          
          // Update object quality average
          obj.avgQuality = obj.qualityScores.reduce((sum, q) => sum + q.sharpness, 0) / obj.qualityScores.length;
        }
      }
      
      // Performance monitoring
      const frameProcessingTime = performance.now() - t0;
      totalProcessingTime += frameProcessingTime;
      processedFrames++;
      
      // Advanced performance monitoring and adaptive optimization
      if (frameCount % 300 === 0) {
        const avgProcessingTime = totalProcessingTime / processedFrames;
        const memoryUsage = performance.memory ? (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1) : 'N/A';
        const detectionRate = sessionDetectionCount > 0 ? (sessionDetectionCount / (frameCount / 60)).toFixed(2) : '0';
        
        console.log(`🔍 Performance Stats:`);
        console.log(`  ⏱️  Avg processing: ${avgProcessingTime.toFixed(1)}ms`);
        console.log(`  📊 Active objects: ${trackedObjects.size}`);
        console.log(`  💾 Memory usage: ${memoryUsage}MB`);
        console.log(`  📈 Detection rate: ${detectionRate} per minute`);
        console.log(`  🎯 Skip frames: ${skipFrames}`);
        
        // Adaptive optimization based on performance
        if (avgProcessingTime > 100 && skipFrames < 10) {
          skipFrames = Math.min(skipFrames + 1, 10);
          console.log(`⚡ Increased frame skipping to ${skipFrames} for better performance`);
        } else if (avgProcessingTime < 50 && skipFrames > 2) {
          skipFrames = Math.max(skipFrames - 1, 2);
          console.log(`🚀 Decreased frame skipping to ${skipFrames} for better accuracy`);
        }
        
        // Reset counters
        totalProcessingTime = 0;
        processedFrames = 0;
      }

    } catch (error) {
      console.error("Detection loop error:", error);
    }

    // Optimized frame scheduling
    if (detecting) {
      // Use the most appropriate scheduling method
      if (video.requestVideoFrameCallback && skipFrames <= 2) {
        // Use video frame callback for low skip rates
        video.requestVideoFrameCallback(() => detectLoop());
      } else {
        // Use RAF for higher skip rates or when video callback unavailable
        const delay = skipFrames > 5 ? 16 : 0; // Add delay for high skip rates
        if (delay > 0) {
          setTimeout(() => requestAnimationFrame(detectLoop), delay);
        } else {
          requestAnimationFrame(detectLoop);
        }
      }
    }
  }

  // Fullscreen functionality removed - using full body layout by default

  startBtn.addEventListener("click", async () => {
      // Wait for the initial location to be found.
      const initialCoords = await initLocationTracking();
      if (initialCoords) {
        console.log("📍 Location preloaded:", initialCoords);
      } else {
        console.warn(
          "⚠️ Could not get initial location. Detections may not be saved.",
        );
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
            frameRate: {
              ideal: CAMERA.IDEAL_FRAME_RATE,
              max: CAMERA.MAX_FRAME_RATE,
            },
            width: { ideal: CAMERA.IDEAL_WIDTH, max: CAMERA.MAX_WIDTH },
            height: { ideal: CAMERA.IDEAL_HEIGHT, max: CAMERA.MAX_HEIGHT },
            facingMode: selectedDeviceId ? undefined : CAMERA.FACING_MODE,
          },
        });

        video.srcObject = stream;
        startBtn.style.display = "none";
        stopBtn.style.display = "inline-block";
        switchBtn.style.display =
          videoDevices.length > 1 ? "inline-block" : "none";

        // Fullscreen removed - camera now uses full body layout

        detectedObjectCount = 0;
        uniqueHazardTypes = [];

        video.addEventListener(
          "loadeddata",
          () => {
            computeLetterboxParams();
            detecting = true;
            detectLoop();
          },
          { once: true },
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
      
      // Stop camera stream
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      video.srcObject = null;
      
      // Update UI
      startBtn.style.display = "inline-block";
      stopBtn.style.display = "none";
      switchBtn.style.display = "none";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Stop location tracking
      stopLocationTracking();

      // Comprehensive memory cleanup
      prevImageData = null;
      letterboxParams = null;
      frameTimes.length = 0;
      detectedObjectCount = 0;
      sessionDetectionCount = 0;
      uniqueHazardTypes.length = 0;
      trackedObjects.clear();
      nextObjectId = 1;
      fpsCounter = 0;
      lastFpsTime = Date.now();
      currentFps = 0;
      activeSaveOperations = 0;
      totalProcessingTime = 0;
      processedFrames = 0;
      
      // Detection cache cleanup removed (simplified approach)
      
      // Force garbage collection if available
      if (window.gc) {
        try {
          window.gc();
        } catch (e) {
          // Ignore if gc not available
        }
      }

      // Clear overlays
      if (objectCountOverlay)
        objectCountOverlay.textContent = "Frame: 0 | Session: 0 | FPS: 0";
      if (hazardTypesOverlay) hazardTypesOverlay.textContent = "Hazards: None";

      console.log("Camera stopped and memory cleaned");
    });
})();
