// upload_tf_fixed.js
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { storage } from "./firebaseConfig.js";

document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
  const switchBtn = document.getElementById("switch-camera");
  const cameraSelect = document.getElementById("camera-select");
  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext("2d");
  const objectCountOverlay = document.getElementById('object-count-overlay');
  // Get reference to the hazard types overlay element
  const loadingOverlay = document.getElementById('loading-overlay'); // הפניה לאלמנט הטעינה
  const hazardTypesOverlay = document.getElementById('hazard-types-overlay');
  
  const FIXED_SIZE = 480; // increased resolution for better accuracy
  let stream = null;
  let detecting = false;
  let session = null;
  let frameCount = 0;
  let lastSaveTime = 0;
  let _lastCoords = null;
  let _watchId    = null;  let videoDevices = [];
  let currentCamIndex = 0;
  let prevImageData = null;
  const DIFF_THRESHOLD = 200000; // הורדת הערך כדי להגביר רגישות לשינויים
  let skipFrames = 3;                       // ברירת מחדל
  const targetFps = 15;                     // יעד: 15 פריימים לשנייה
  const frameTimes = [];                    // היסטוריית זמנים
  const maxHistory = 10;    
  let detectedObjectCount = 0; // Initialize object count
  let uniqueHazardTypes = []; // Initialize array for unique hazard types    
  // ────────────────────────────────────────────────────────────────────────────────
  //  📸  Function to enumerate and populate camera devices
  // ────────────────────────────────────────────────────────────────────────────────
  async function enumerateAndPopulateCameras() {
    try {
      console.log("🔍 Enumerating media devices...");
      const devices = await navigator.mediaDevices.enumerateDevices();
      const allDevices = devices.map(d => ({ 
        kind: d.kind, 
        deviceId: d.deviceId, 
        label: d.label,
        groupId: d.groupId
      }));
      console.log("📱 All media devices:", allDevices);
      
      videoDevices = devices.filter((d) => d.kind === "videoinput");
      
      // מיון מצלמות - העדפת מצלמה אחורית על מובייל
      videoDevices.sort((a, b) => {
        const aLabel = (a.label || '').toLowerCase();
        const bLabel = (b.label || '').toLowerCase();
        
        // מצלמה אחורית לפני קדמית
        const aIsRear = aLabel.includes('back') || aLabel.includes('rear') || aLabel.includes('environment');
        const bIsRear = bLabel.includes('back') || bLabel.includes('rear') || bLabel.includes('environment');
        
        if (aIsRear && !bIsRear) return -1;
        if (!aIsRear && bIsRear) return 1;
        
        return 0;
      });
      
      console.log(`📸 Found ${videoDevices.length} video devices (sorted):`, 
        videoDevices.map((d, i) => ({ 
          index: i, 
          id: d.deviceId, 
          label: d.label, 
          isRear: (d.label || '').toLowerCase().includes('back') || 
                  (d.label || '').toLowerCase().includes('rear') ||
                  (d.label || '').toLowerCase().includes('environment')
        })));
      
      // Populate camera dropdown
      if (cameraSelect && videoDevices.length > 0) {
        console.log("📋 Populating camera dropdown...");
        cameraSelect.innerHTML = ""; // Clear existing options
        videoDevices.forEach((device, index) => {
          const option = document.createElement("option");
          option.value = device.deviceId;
          const label = device.label || `Camera ${index + 1}`;
          const isRear = label.toLowerCase().includes('back') || 
                        label.toLowerCase().includes('rear') || 
                        label.toLowerCase().includes('environment');
          option.textContent = isRear ? `📷 ${label} (Rear)` : `🤳 ${label} (Front)`;
          cameraSelect.appendChild(option);
          console.log(`Added option: ${option.textContent} (${device.deviceId})`);
        });
        console.log(`📋 Dropdown populated with ${cameraSelect.options.length} options`);
      }
      
      // Show switch button and dropdown if multiple cameras
      if (videoDevices.length > 1) {
        console.log("🎛️ Multiple cameras detected, showing controls");
        switchBtn.style.display = "inline-block";
        if (cameraSelect) {
          cameraSelect.style.display = "inline-block";
          cameraSelect.parentElement.style.display = "block"; // Ensure parent is visible
        }
      } else {
        console.log("🎛️ Single camera or no cameras, hiding controls");
        switchBtn.style.display = "none";
        if (cameraSelect) {
          cameraSelect.style.display = "none";
        }
      }
    } catch (err) {
      console.warn("⚠️ Could not enumerate video devices:", err);
    }
  }

  // Initial enumeration (may not have labels without permission)
  (async () => {
    await enumerateAndPopulateCameras();

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

  const classNames = ['crack', 'pothole'];

  

/**
 * מנסה ראשית לקבל פוזיציה אחת מדוייקת (GPS), עם תזמון קצר.
 * אם הצליח – שומר אותה; אם קיבל DENIED – מודיע למשתמש.
 * לאחר מכן מריץ watchPosition כדי לעדכן ברצף את _lastCoords.
 */
function initLocationTracking() {
  return new Promise(resolve => {
    console.log("🌍 Starting location tracking...");
    
    if (!navigator.geolocation) {
      console.warn("⚠️ Geolocation not supported");
      resolve(null);
      return;
    }

    // פונקציית עזר לרישום המיקום הראשון
    let done = false;
    function handleCoords(coords) {
      if (done) return;
      done = true;
      _lastCoords = coords;
      console.log("📍 Location acquired:", coords.latitude, coords.longitude);
      resolve(coords);
    }

    // בדיקה אם כבר יש מיקום שמור
    if (_lastCoords) {
      console.log("📍 Using existing location cache");
      return resolve(_lastCoords);
    }

    // 1️⃣ ניסיון ראשון: High-Accuracy עם timeout קצר
    navigator.geolocation.getCurrentPosition(
      pos => handleCoords(pos.coords),
      err => {
        console.warn("High-Accuracy failed:", err.code, err.message);
        
        // 2️⃣ ניסיון שני: Low-Accuracy עם הגדרות נוחות יותר
        navigator.geolocation.getCurrentPosition(
          pos2 => handleCoords(pos2.coords),
          err2 => {
            console.warn("Low-Accuracy failed:", err2.code, err2.message);
            
            // 3️⃣ אם נדחה לגמרי, עדיין ממשיכים - saveDetection יטפל בזה
            console.log("⚠️ Location access failed, continuing without initial location");
            resolve(null);
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 } // 5 דקות מטמון
        );
      },
      { enableHighAccuracy: true, timeout: 3000, maximumAge: 60000 } // דקה מטמון
    );

    // 4️⃣ watchPosition לעדכונים רציפים (לא בלוקינג)
    try {
      _watchId = navigator.geolocation.watchPosition(
        pos => {
          _lastCoords = pos.coords;
          console.log("📍 Location updated:", pos.coords.latitude, pos.coords.longitude);
        },
        err => {
          console.warn("watchPosition error:", err.code, err.message);
          // לא עוצרים את הזיהוי גם אם watchPosition נכשל
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      );
    } catch (watchErr) {
      console.warn("Failed to start watchPosition:", watchErr);
    }
  });
}

/**
 * מחזיר Promise עם המיקום האחרון (או נדחית אם אין עדיין)
 */
function getLatestLocation() {
  return new Promise((resolve, reject) => {
    if (_lastCoords) {
      resolve(JSON.stringify({ lat: _lastCoords.latitude, lng: _lastCoords.longitude }));
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
 * משתמש בשירות IP-based לצורך מיקום גס
 */
async function fallbackIpLocation() {
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    _lastCoords = {
      latitude:  data.latitude,
      longitude: data.longitude
    };
    console.log("📍 IP-fallback location:", _lastCoords);
  } catch (e) {
    console.warn("IP fallback failed:", e);
  }
}

/**
 * מחזירה את המיקום האחרון (או נדחתת אם אין עדיין)
 */


  
  

  function showSuccessToast(message = "💾 Detected and saved!") {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.backgroundColor = "#4caf50";
    toast.style.color = "white";
    toast.style.padding = "12px 20px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 0 10px rgba(0,0,0,0.2)";
    toast.style.zIndex = 9999;
    toast.style.fontSize = "14px";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function showLocationStatus(message, type = "info") {
    const toast = document.createElement("div");
    const icons = {
      info: "ℹ️",
      success: "✅", 
      warning: "⚠️",
      error: "❌"
    };
    const colors = {
      info: "#2196F3",
      success: "#4CAF50",
      warning: "#FF9800", 
      error: "#F44336"
    };
    
    toast.innerHTML = `${icons[type]} ${message}`;
    toast.style.position = "fixed";
    toast.style.top = "70px"; // מתחת להודעות אחרות
    toast.style.right = "20px";
    toast.style.backgroundColor = colors[type];
    toast.style.color = "white";
    toast.style.padding = "10px 14px";
    toast.style.borderRadius = "6px";
    toast.style.boxShadow = "0 3px 6px rgba(0,0,0,0.2)";
    toast.style.zIndex = "9998";
    toast.style.fontSize = "13px";
    toast.style.maxWidth = "300px";
    
    // מסיר הודעות קודמות מאותו סוג
    const existingToasts = document.querySelectorAll('[data-location-status]');
    existingToasts.forEach(t => t.remove());
    
    toast.setAttribute('data-location-status', 'true');
    document.body.appendChild(toast);
    
    // הסרה אוטומטית
    const duration = type === 'error' ? 8000 : 4000;
    setTimeout(() => toast.remove(), duration);
  }

  async function saveDetection(canvas, label = "Unknown") {
    let geoData;
    let locationNote;
  
    // מנסה לקבל מיקום בכמה דרכים שונות
    console.log("🔍 Attempting to get location for detection save...");
    
    // 1️⃣ נסיון ראשון: המיקום האחרון שנשמר
    if (_lastCoords) {
      geoData = JSON.stringify({ lat: _lastCoords.latitude, lng: _lastCoords.longitude });
      locationNote = "GPS (Cached)";
      console.log("✅ Using cached GPS location");
    } else {
      // 2️⃣ נסיון שני: בקשה חדשה למיקום
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 } // פחות מדויק אבל מהיר יותר
          );
        });
        
        geoData = JSON.stringify({ lat: position.coords.latitude, lng: position.coords.longitude });
        locationNote = "GPS (Fresh)";
        _lastCoords = position.coords; // עדכון המטמון
        console.log("✅ Got fresh GPS location");
        
      } catch (gpsErr) {
        console.warn("GPS failed:", gpsErr);
        
        // 3️⃣ נסיון שלישי: IP fallback
        try {
          const ipRes  = await fetch("https://ipapi.co/json/");
          const ipJson = await ipRes.json();
          geoData = JSON.stringify({ lat: ipJson.latitude, lng: ipJson.longitude });
          locationNote = "Approximate (IP)";
          console.log("✅ Using IP-based location");
        } catch (ipErr) {
          console.error("IP fallback failed:", ipErr);
          
          // 4️⃣ כברירת מחדל אחרונה: שמירה בלי מיקום
          geoData = JSON.stringify({ lat: 32.0853, lng: 34.7818 }); // תל אביב כברירת מחדל
          locationNote = "Default Location";
          console.warn("⚠️ Using default location (Tel Aviv)");
        }
      }
    }
  
    // 3️⃣ אם הצלחנו להשיג מיקום (GPS או IP), נשמור
    canvas.toBlob(async blob => {
      if (!blob) return console.error("❌ Failed to get image blob");
  
      const file = new File([blob], "detection.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("geoData", geoData);
      formData.append("hazardTypes", label);
      formData.append("locationNote", locationNote);  // ⇐ כעת תמיד תישלח
  
      try {
        const res = await fetch("/upload-detection", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) throw new Error(await res.text());
        const response = await res.json();
        console.log("✅ Detection saved:", response.message);
        showSuccessToast(`✅ ${label} detected & saved (${locationNote})`);
      } catch (err) {
        console.error("❌ Failed to save detection:", err);
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
      '/object_detecion_model/last_model_train12052025.onnx',
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
    const t0 = performance.now();
    frameCount++;
    if (frameCount % skipFrames !== 0) {
      return requestAnimationFrame(detectLoop);
    }
    
    // --- draw video frame to offscreen with letterbox ---
    if (!letterboxParams) computeLetterboxParams();
    offCtx.fillStyle = 'black';
    offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
    offCtx.drawImage(
      video,
      letterboxParams.offsetX, letterboxParams.offsetY,
      letterboxParams.newW, letterboxParams.newH
    );

    // --- frame differencing ---
    const curr = offCtx.getImageData(0,0,FIXED_SIZE,FIXED_SIZE);
    if (prevImageData) {
      let sum=0;
      const d1=curr.data, d2=prevImageData.data;
      for (let i=0;i<d1.length;i+=4) {
        sum += Math.abs(d1[i]-d2[i]) + Math.abs(d1[i+1]-d2[i+1]) + Math.abs(d1[i+2]-d2[i+2]);
      }
      if (sum < DIFF_THRESHOLD) {
        prevImageData = curr;
        return requestAnimationFrame(detectLoop);
      }
    }
    prevImageData = curr;

    // --- Pre-processing Stage ---
    let processedImageData = curr; 
    // const currentHour = new Date().getHours();
    // if (currentHour >= 19 || currentHour < 6) { 
    //     adjustBrightness(processedImageData, 30); 
    // }
    // --- prepare ONNX input tensor ---
    const { data, width, height } = processedImageData; // שימוש ב-processedImageData
    for (let i=0,j=0;i<data.length;i+=4,j+=3) {
      floatData[j]   = data[i]   / 255;
      floatData[j+1] = data[i+1] / 255;
      floatData[j+2] = data[i+2] / 255;
    }
    for (let c=0;c<3;c++)
      for (let y=0;y<height;y++)
        for (let x=0;x<width;x++) {
          chwData[c*width*height + y*width + x] = floatData[y*width*3 + x*3 + c];
        }
    const inputTensor = new ort.Tensor('float32', chwData, [1,3,height,width]);

    // --- run inference ---
    const results = await session.run({ images: inputTensor });
    const outputData = results[Object.keys(results)[0]].data;

    // --- draw detections ---
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);

    

    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    for (let i=0;i<outputData.length;i+=6) {
      const [x1,y1,x2,y2,score,cls] = outputData.slice(i,i+6);
      if (score<0.5) continue;
      const scaleX=video.videoWidth/FIXED_SIZE;
      const scaleY=video.videoHeight/FIXED_SIZE;
      const w=(x2-x1)*scaleX, h=(y2-y1)*scaleY;

      detectedObjectCount++; // Increment count for each detected object above threshold
      const left=x1*scaleX, top=y1*scaleY;

      // --- שינוי סגנון התיבות ---
      const color = '#00FF00'; // ירוק בהיר
      ctx.strokeStyle = color;
      ctx.lineWidth = 3; // קו עבה יותר
      ctx.strokeRect(left,top,w,h);

      const label = `${classNames[Math.floor(cls)]} (${(score*100).toFixed(1)}%)`;
      // Add hazard type to the unique list if not already present
      const hazardName = classNames[Math.floor(cls)];
      if (hazardName && !uniqueHazardTypes.includes(hazardName)) {
          uniqueHazardTypes.push(hazardName);
      }

      // --- שינוי סגנון הטקסט והוספת רקע ---
      ctx.fillStyle = color;
      ctx.font='bold 16px Arial'; // פונט מודגש
      const textWidth = ctx.measureText(label).width;
      ctx.fillRect(left, top > 20 ? top - 20 : top, textWidth + 8, 20); // רקע לטקסט
      ctx.fillStyle = 'black'; // צבע טקסט שחור על הרקע הבהיר
      ctx.fillText(label, left + 4, top > 20 ? top - 5 : top + 15);
      // save periodically
      if (!lastSaveTime || Date.now()-lastSaveTime>10000) {
        lastSaveTime=Date.now();
        await saveDetection(canvas,label);
      }
    }

    // Update the overlay elements with the counts and types
    if (objectCountOverlay) {
        objectCountOverlay.textContent = `Objects: ${detectedObjectCount}`;
    }
    if (hazardTypesOverlay) {
        if (uniqueHazardTypes.length > 0) {
            hazardTypesOverlay.textContent = `Hazards: ${uniqueHazardTypes.join(', ')}`;
        } else {
            hazardTypesOverlay.textContent = 'Hazards: None';
        }
    }
    const t1 = performance.now();
    const elapsed = t1 - t0;
    
    // שומרים במערך היסטוריה עגול
    frameTimes.push(elapsed);
    if (frameTimes.length > maxHistory) frameTimes.shift();

    // מחשבים ממוצע זמן עיבוד
    const avgTime = frameTimes.reduce((a,b) => a + b, 0) / frameTimes.length;
    // חישוב כמה פריימים לדלג, כך ש־avgTime * (skipFrames+1) ≈ 1000/targetFps
    const idealInterval = 1000 / targetFps;
    skipFrames = Math.max(1, Math.round((avgTime) / idealInterval));
    requestAnimationFrame(detectLoop);
  }

  startBtn.addEventListener("click", async () => {
    console.log("🚀 Starting camera and location tracking...");
    
    // הצגת הודעת סטטוס למשתמש
    showLocationStatus("Starting location services...", "info");
    
    // ① הפעלת המעקב
    try {
      const locationResult = await initLocationTracking();
      if (locationResult) {
        showLocationStatus("Location tracking active ✓", "success");
        console.log("📍 Location services started successfully");
      } else {
        showLocationStatus("Location failed - using fallback methods", "warning");
        console.log("⚠️ Location services partially failed");
      }
    } catch (err) {
      showLocationStatus("Location unavailable - using default location", "warning");
      console.warn("⚠️ Location tracking failed:", err);
    }
    
    // 2. אחר כך מבקשים הרשאה למצלמה
    try {
      // קודם נבקש הרשאה כללית
      const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
      initialStream.getTracks().forEach(track => track.stop()); // עוצרים זמנית
      
      // Re-enumerate cameras after permission is granted to get proper labels
      await enumerateAndPopulateCameras();
      
      // עכשיו נפתח את המצלמה הנכונה (ראשונה ברשימה = אחורית אם קיימת)
      const preferredDevice = videoDevices.length > 0 ? videoDevices[0] : null;
      const constraints = preferredDevice ? 
        { 
          video: { 
            deviceId: { exact: preferredDevice.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: { ideal: 'environment' } // העדפה למצלמה אחורית
          } 
        } : 
        { 
          video: { 
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        };
      
      console.log("🎥 Starting camera with constraints:", constraints);
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // עדכון האינדקס הנוכחי
      if (preferredDevice) {
        currentCamIndex = 0; // תמיד מתחילים מהראשונה
        if (cameraSelect) {
          cameraSelect.value = preferredDevice.deviceId;
        }
        console.log(`📱 Started with camera: ${preferredDevice.label || 'Unknown'}`);
      }
      
      video.srcObject = stream;
      startBtn.style.display = "none";
      stopBtn.style.display = "inline-block";
      detectedObjectCount = 0; // Initialize object count
      uniqueHazardTypes = []; // Initialize array for unique hazard types 
      
      // Show camera controls only if we have cameras
      if (videoDevices.length > 1) {
        switchBtn.style.display = "inline-block";
        if (cameraSelect) cameraSelect.style.display = "inline-block";
      }
      
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
      return;
    }
  });
  
  
  // Camera selection dropdown handler
  if (cameraSelect) {
    cameraSelect.addEventListener("change", async () => {
      console.log("📋 Camera dropdown changed");
      
      if (!stream) {
        console.warn("⚠️ Cannot change camera - no active stream");
        alert("Please start the camera first before selecting a different one");
        return;
      }
      
      const selectedDeviceId = cameraSelect.value;
      if (!selectedDeviceId) {
        console.warn("No device ID selected");
        return;
      }
      
      console.log(`📱 Selected device ID: ${selectedDeviceId}`);
      
      try {
        // Stop current stream
        console.log("🛑 Stopping current stream via dropdown...");
        stream.getTracks().forEach((track) => {
          console.log(`Stopping track: ${track.kind} - ${track.label}`);
          track.stop();
        });
        
        // Find the selected camera index
        const oldIndex = currentCamIndex;
        currentCamIndex = videoDevices.findIndex(device => device.deviceId === selectedDeviceId);
        if (currentCamIndex === -1) {
          console.warn("Selected device not found in videoDevices, defaulting to 0");
          currentCamIndex = 0;
        }
        
        console.log(`🔄 Switching from camera ${oldIndex} to ${currentCamIndex}`);
        console.log(`📱 Selected camera: ${cameraSelect.options[cameraSelect.selectedIndex].text}`);

              // Request new camera stream with better constraints
      console.log("🎥 Requesting new camera stream via dropdown...");
      const constraints = {
        video: { 
          deviceId: { exact: selectedDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      };
      
      console.log("📋 Using constraints:", constraints);
      stream = await navigator.mediaDevices.getUserMedia(constraints);

        console.log("🎯 Setting new stream to video element via dropdown...");
        video.srcObject = stream;
        letterboxParams = null; // Force recalculation on next frame
        
        // Wait for video to load new stream
        await new Promise((resolve) => {
          const handleLoadedData = () => {
            video.removeEventListener('loadeddata', handleLoadedData);
            resolve();
          };
          video.addEventListener('loadeddata', handleLoadedData);
        });
        
        console.log("✅ Camera switched successfully via dropdown");
        console.log(`📹 New video dimensions: ${video.videoWidth}x${video.videoHeight}`);
        
      } catch (err) {
        console.error("❌ Failed to switch camera via dropdown:", err);
        // Try to fallback to default camera if specific camera fails
        try {
          console.log("🔄 Attempting fallback to default camera from dropdown...");
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          video.srcObject = stream;
          letterboxParams = null;
          console.log("🔄 Fell back to default camera");
        } catch (fallbackErr) {
          console.error("❌ Fallback camera also failed:", fallbackErr);
          alert("⚠️ Failed to switch camera. Please try restarting the camera.");
          // Reset to no stream state
          stream = null;
          video.srcObject = null;
        }
      }
    });
  }

  switchBtn.addEventListener("click", async () => {
    console.log("🎬 Switch camera button clicked");
    console.log("📊 Debug info:", {
      hasStream: !!stream,
      videoDevicesCount: videoDevices.length,
      currentCamIndex,
      videoDevices: videoDevices.map(d => ({ id: d.deviceId, label: d.label }))
    });
    
    try {
      if (!stream) {
        console.warn("⚠️ Cannot switch camera - no active stream");
        alert("Please start the camera first before switching");
        return;
      }
      
      if (videoDevices.length < 2) {
        console.warn("⚠️ Cannot switch camera - insufficient cameras");
        alert("No additional cameras available for switching");
        return;
      }
      
      console.log("🛑 Stopping current stream...");
      // Stop current stream
      stream.getTracks().forEach((track) => {
        console.log(`Stopping track: ${track.kind} - ${track.label}`);
        track.stop();
      });

      // Cycle to next camera
      const oldIndex = currentCamIndex;
      currentCamIndex = (currentCamIndex + 1) % videoDevices.length;
      const newDevice = videoDevices[currentCamIndex];
      const newDeviceId = newDevice.deviceId;
      
      console.log(`🔄 Switching from camera ${oldIndex} to ${currentCamIndex}`);
      console.log(`📱 New device: ${newDevice.label || 'Unknown'} (${newDeviceId})`);
      
      // Update dropdown selection to match
      if (cameraSelect) {
        cameraSelect.value = newDeviceId;
        console.log("📋 Updated dropdown selection");
      }

      // Request new camera stream with better constraints
      console.log("🎥 Requesting new camera stream...");
      const constraints = {
        video: { 
          deviceId: { exact: newDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      };
      
      console.log("🔄 Switch constraints:", constraints);
      stream = await navigator.mediaDevices.getUserMedia(constraints);

      console.log("🎯 Setting new stream to video element...");
      video.srcObject = stream;
      letterboxParams = null; // Force recalculation on next frame
      
      // Wait for video to load new stream
      await new Promise((resolve) => {
        const handleLoadedData = () => {
          video.removeEventListener('loadeddata', handleLoadedData);
          resolve();
        };
        video.addEventListener('loadeddata', handleLoadedData);
      });
      
      console.log("✅ Camera switched successfully");
      console.log(`📹 New video dimensions: ${video.videoWidth}x${video.videoHeight}`);
      
    } catch (err) {
      console.error("❌ Failed to switch camera:", err);
      // Try to fallback to default camera if specific camera fails
      try {
        console.log("🔄 Attempting fallback to default camera...");
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        letterboxParams = null;
        console.log("🔄 Fell back to default camera");
      } catch (fallbackErr) {
        console.error("❌ Fallback camera also failed:", fallbackErr);
        alert("⚠️ Failed to switch camera. Please try restarting the camera.");
        // Reset to no stream state
        stream = null;
        video.srcObject = null;
      }
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
    console.log("Camera stopped");
  });
});