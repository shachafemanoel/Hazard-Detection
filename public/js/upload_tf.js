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
  const loadingOverlay = document.getElementById('loading-overlay');
  const hazardTypesOverlay = document.getElementById('hazard-types-overlay');
  // New brightness, zoom and camera selection controls
  const brightnessSlider = document.getElementById("brightness-slider");
  const zoomSlider = document.getElementById("zoom-slider");
  const cameraSelect = document.getElementById("camera-select");
  
  const FIXED_SIZE = 416;
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
  const DIFF_THRESHOLD = 150000;             // מגביר רגישות לשינויים
  let skipFrames = 2;                        // פחות פריימים לדילוג
  const targetFps = 20;                      // יעד FPS גבוה יותר
  const processingThreshold = 50;            // מקסימום זמן עיבוד לפריים במילישניות
  const frameTimes = [];                    // היסטוריית זמנים
  const maxHistory = 10;    
  let detectedObjectCount = 0; // Initialize object count
  let uniqueHazardTypes = []; // Initialize array for unique hazard types    
  // ────────────────────────────────────────────────────────────────────────────────
  //  📸  Enumerate devices once on load
  // ────────────────────────────────────────────────────────────────────────────────
  (async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter((d) => d.kind === "videoinput");
      // Populate cameraSelect dropdown
      if (cameraSelect) {
        cameraSelect.innerHTML = "";
        videoDevices.forEach((device, index) => {
          const option = document.createElement("option");
          option.value = device.deviceId;
          option.text = device.label || `Camera ${index+1}`;
          cameraSelect.appendChild(option);
        });
      }
      // Display switch button on iOS or if multiple cameras available
      if (videoDevices.length > 1 || /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        switchBtn.style.display = "inline-block";
      } else {
        switchBtn.style.display = "none";
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

  

/**
 * מנסה ראשית לקבל פוזיציה אחת מדוייקת (GPS), עם תזמון קצר.
 * אם הצליח – שומר אותה; אם קיבל DENIED – מודיע למשתמש.
 * לאחר מכן מריץ watchPosition כדי לעדכן ברצף את _lastCoords.
 */
function initLocationTracking() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      alert("מצטערים, הדפדפן שלך לא תומך בגיאולוקציה.");
      return resolve(null);
    }

    // פונקציית עזר לרישום המיקום הראשון
    let done = false;
    function handleCoords(coords) {
      if (done) return;
      done = true;
      _lastCoords = coords;
      console.log("📍 initial location:", coords);
      resolve(coords);
    }

    // 1️⃣ ניסיון High-Accuracy
    navigator.geolocation.getCurrentPosition(
      pos => handleCoords(pos.coords),
      err => {
        console.warn("High-Accuracy failed:", err.code, err.message);
        if (err.code === err.PERMISSION_DENIED) {
          alert("אנא אפשר גישה למיקום כדי להשתמש ב-Live Detection.");
          return resolve(null);
        }
        // 2️⃣ ניסיון Low-Accuracy
        navigator.geolocation.getCurrentPosition(
          pos2 => handleCoords(pos2.coords),
          err2 => {
            console.warn("Low-Accuracy failed:", err2.code, err2.message);
            // 3️⃣ fallback IP
            fetch("https://ipapi.co/json/")
              .then(r => r.json())
              .then(data => handleCoords({ latitude: data.latitude, longitude: data.longitude }))
              .catch(() => resolve(null));
          },
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
        );
      },
      { enableHighAccuracy: true,  timeout: 5000, maximumAge: 0 }
    );

    // 4️⃣ watchPosition לעדכונים רציפים
    _watchId = navigator.geolocation.watchPosition(
      pos => {
        _lastCoords = pos.coords;
      },
      err => {
        console.warn("watchPosition error:", err.code, err.message);
        if (err.code === err.PERMISSION_DENIED) {
          alert("אנא אפשר גישה למיקום כדי להשתמש ב-Live Detection.");
          navigator.geolocation.clearWatch(_watchId);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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

  async function saveDetection(canvas, label = "Unknown") {
    let geoData;
    let locationNote;
  
    // 1️⃣ נסיון ראשון: GPS
    try {
      geoData = await getLatestLocation();
      locationNote = "GPS";
    } catch (gpsErr) {
      console.warn("GPS failed:", gpsErr);
  
      // 2️⃣ נסיון שני: IP fallback
      try {
        const ipRes  = await fetch("https://ipapi.co/json/");
        const ipJson = await ipRes.json();
        geoData = JSON.stringify({ lat: ipJson.latitude, lng: ipJson.longitude });
        locationNote = "Approximate (IP)";
      } catch (ipErr) {
        console.error("IP fallback failed:", ipErr);
        alert("אנא אפשר גישה למיקום כדי לבצע Live Detection.");
        return;  // בלי מיקום – לא שומרים
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
        console.log("✅ Detection saved:", (await res.json()).message);
        showSuccessToast();
      } catch (err) {
        console.error("❌ Failed to save detection:", err);
      }
    }, "image/jpeg", 0.9);
  }
  
  
  

  
  // במקום כל import של ort.min.js — מניחים window.ort כבר קיים
  async function loadModel() {
    const ort = window.ort;
    ort.env.wasm.simd = false;              // ← הוספה כאן
    ort.env.wasm.wasmPaths = '/ort/';
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
    const EPs = ort.env.webgl?.isSupported ? ['webgl','wasm'] : ['wasm','webgl'];
    session = await ort.InferenceSession.create(
      '/object_detecion_model/road_damage_detection_last_version.onnx',
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

  let activeNotifications = [];
  let lastNotificationTime = {};

  function shouldShowNotification(hazardType) {
    const now = Date.now();
    const lastTime = lastNotificationTime[hazardType] || 0;
    // מציג התראה רק אם עברו לפחות 5 שניות מההתראה האחרונה מאותו סוג
    if (now - lastTime > 5000) {
      lastNotificationTime[hazardType] = now;
      return true;
    }
    return false;
  }

  function showHazardNotification(hazardType, confidence) {
    if (!shouldShowNotification(hazardType)) return;
    
    const template = document.getElementById('hazard-notification-template');
    if (!template) return;

    const notification = template.content.cloneNode(true).querySelector('.hazard-notification');
    notification.querySelector('p').textContent = `${hazardType} ${Math.round(confidence * 100)}%`;
    
    const offset = activeNotifications.length * 60; // מרווח קטן יותר בין ההודעות
    notification.style.top = `${15 + offset}px`;
    
    document.body.appendChild(notification);
    activeNotifications.push(notification);

    // הסרה אחרי 2 שניות במקום 3
    setTimeout(() => {
      notification.style.transform = 'translateX(100%) scale(0.8)';
      notification.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(notification);
        activeNotifications = activeNotifications.filter(n => n !== notification);
        // עדכון מיקום שאר ההודעות
        activeNotifications.forEach((n, i) => {
          n.style.top = `${15 + i * 60}px`;
        });
      }, 200);
    }, 2000);
  }

  async function detectLoop() {
    if (!detecting || !session) return;
    const t0 = performance.now();
    
    // מדלג על פריימים רק אם זמן העיבוד חורג מהסף
    if (frameTimes.length > 0) {
      const avgTime = frameTimes.reduce((a,b) => a + b, 0) / frameTimes.length;
      if (avgTime > processingThreshold) {
        frameCount++;
        if (frameCount % skipFrames !== 0) {
          return requestAnimationFrame(detectLoop);
        }
      }
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

    // --- prepare ONNX input tensor ---
    // Ensure ort is defined from window.ort
    const ort = window.ort;
    const { data, width, height } = processedImageData; // שימוש ב-processedImageData
    const floatData = new Float32Array(width*height*3);
    for (let i=0,j=0;i<data.length;i+=4,j+=3) {
      floatData[j]=data[i]/255;
      floatData[j+1]=data[i+1]/255;
      floatData[j+2]=data[i+2]/255;
    }
    const chw = new Float32Array(3*width*height);
    for (let c = 0; c < 3; c++) 
      for (let y = 0; y < height; y++) 
        for (let x = 0; x < width; x++) {
          chw[c*width*height + y*width + x] = floatData[y*width*3 + x*3 + c];
        }
    const inputTensor = new ort.Tensor('float32', chw, [1, 3, height, width]);

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
      const hazardName = classNames[Math.floor(cls)];
      
      // Show notification for new hazards
      if (!uniqueHazardTypes.includes(hazardName)) {
        uniqueHazardTypes.push(hazardName);
        showHazardNotification(hazardName, score);
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
    
    // עדכון דינמי של skipFrames בהתאם לביצועים
    const avgTime = frameTimes.reduce((a,b) => a + b, 0) / frameTimes.length;
    if (avgTime > processingThreshold) {
      skipFrames = Math.min(5, skipFrames + 1);
    } else if (avgTime < processingThreshold / 2 && skipFrames > 1) {
      skipFrames = Math.max(1, skipFrames - 1);
    }
    
    requestAnimationFrame(detectLoop);
  }

  // Event listener for Start Camera button
  startBtn.addEventListener("click", async () => {
    initLocationTracking();
    try {
      await getLatestLocation();
      console.log("📍 Location preloaded:", _lastCoords);
    } catch (err) {
      console.warn("⚠️ Could not preload location:", err);
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      startBtn.style.display = "none";
      stopBtn.style.display = "inline-block";
      detectedObjectCount = 0;
      uniqueHazardTypes = [];
      switchBtn.style.display =
        (videoDevices.length > 1 || /iPhone|iPad|iPod/.test(navigator.userAgent))
          ? "inline-block"
          : "none";

      // Attach brightness and zoom logic after obtaining camera stream
      const videoTrack = stream.getVideoTracks()[0];
      if (brightnessSlider) {
        brightnessSlider.addEventListener("input", () => {
          video.style.filter = `brightness(${brightnessSlider.value}%)`;
        });
      }
      if (zoomSlider) {
        const capabilities = videoTrack.getCapabilities();
        if ("zoom" in capabilities) {
          zoomSlider.min = capabilities.zoom.min;
          zoomSlider.max = capabilities.zoom.max;
          zoomSlider.step = capabilities.zoom.step;
          zoomSlider.value = videoTrack.getSettings().zoom || capabilities.zoom.min;
          zoomSlider.addEventListener("input", () => {
            videoTrack.applyConstraints({ advanced: [{ zoom: Number(zoomSlider.value) }] });
          });
        } else {
          zoomSlider.disabled = true;
        }
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
      console.error("❌ Error accessing camera:", err);
      alert("⚠️ Cannot access the camera. Please check browser permissions.");
      return;
    }
  });

  // Event listener for Switch Camera button
  switchBtn.addEventListener("click", async () => {
    try {
      if (videoDevices.length < 2) return;
      detecting = false; // stop current detection loop
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      currentCamIndex = (currentCamIndex + 1) % videoDevices.length;
      const newDeviceId = videoDevices[currentCamIndex].deviceId;
      stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: newDeviceId } },
        audio: false
      });
      video.srcObject = stream;
      letterboxParams = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      detectedObjectCount = 0;
      uniqueHazardTypes = [];
      if (objectCountOverlay) objectCountOverlay.textContent = "";
      if (hazardTypesOverlay) hazardTypesOverlay.textContent = "";
      await new Promise(resolve => { video.onloadeddata = resolve; });
      computeLetterboxParams();
      detecting = true;
      detectLoop();
    } catch (err) {
      console.error("❌ Failed to switch camera:", err);
      alert("Cannot switch camera. Check permissions or try a different browser.");
    }
  });

  // Event listener for Stop Camera button
  stopBtn.addEventListener("click", () => {
    detecting = false;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
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
  
  // NEW: When user changes camera selection, restart stream with the chosen device
  if (cameraSelect) {
    cameraSelect.addEventListener("change", async () => {
      console.log("Camera selection changed:", cameraSelect.value); // Debug log
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      const selectedDeviceId = cameraSelect.value;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: selectedDeviceId } }
        });
        console.log("Stream restarted with device:", selectedDeviceId); // Debug
        video.srcObject = stream;
        letterboxParams = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        detectedObjectCount = 0;
        uniqueHazardTypes = [];
        await new Promise(resolve => {
          video.onloadeddata = () => {
            console.log("Video loaded after camera change"); // Debug log
            resolve();
          };
        });
        computeLetterboxParams();
        detecting = true;
        detectLoop();

        // Reapply brightness and zoom listeners
        const videoTrack = stream.getVideoTracks()[0];
        if (brightnessSlider) {
          brightnessSlider.addEventListener("input", () => {
            video.style.filter = `brightness(${brightnessSlider.value}%)`;
          });
        }
        if (zoomSlider) {
          const capabilities = videoTrack.getCapabilities();
          if ("zoom" in capabilities) {
            zoomSlider.min = capabilities.zoom.min;
            zoomSlider.max = capabilities.zoom.max;
            zoomSlider.step = capabilities.zoom.step;
            zoomSlider.value = videoTrack.getSettings().zoom || capabilities.zoom.min;
            zoomSlider.addEventListener("input", () => {
              videoTrack.applyConstraints({ advanced: [{ zoom: Number(zoomSlider.value) }] });
            });
          } else {
            zoomSlider.disabled = true;
          }
        }
      } catch (err) {
        console.error("❌ Error switching to selected camera:", err);
        alert("Cannot switch camera. Please check permissions or try a different camera.");
      }
    });
  }

  // ...existing code for detection loop and other functions...
});
// ...existing code...
