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
  const hazardTypesOverlay = document.getElementById('hazard-types-overlay');
  
  const FIXED_SIZE = 416;
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
  let skipFrames = 4;                       // ברירת מחדל
  const targetFps = 10;                     // יעד: 15 פריימים לשנייה
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
      if (videoDevices.length > 1) {
        switchBtn.style.display = "inline-block";
      }
    } catch (err) {
      console.warn("⚠️ Could not enumerate video devices:", err);
    }
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

    // --- prepare ONNX input tensor ---
    const { data, width, height } = curr;
    const floatData = new Float32Array(width*height*3);
    for (let i=0,j=0;i<data.length;i+=4,j+=3) {
      floatData[j]=data[i]/255;
      floatData[j+1]=data[i+1]/255;
      floatData[j+2]=data[i+2]/255;
    }
    const chw = new Float32Array(3*width*height);
    for (let c=0;c<3;c++) for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
      chw[c*width*height + y*width + x] = floatData[y*width*3 + x*3 + c];
    }
    const inputTensor = new ort.Tensor('float32', chw, [1,3,height,width]);

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
      ctx.strokeStyle='red'; ctx.lineWidth=2;
      ctx.strokeRect(left,top,w,h);
      const label = `${classNames[Math.floor(cls)]} (${(score*100).toFixed(1)}%)`;
      // Add hazard type to the unique list if not already present
      const hazardName = classNames[Math.floor(cls)];
      if (hazardName && !uniqueHazardTypes.includes(hazardName)) {
          uniqueHazardTypes.push(hazardName);
      }
      ctx.fillStyle='red'; ctx.font='16px Arial';
      ctx.fillText(label,left, top>10?top-5:10);
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
    initLocationTracking();               // ① הפעלת המעקב
    try {
      await loadModel();
      console.log("✅ מודל נטען בהצלחה");
      showSuccessToast("✅ מודל נטען בהצלחה");
    } catch (err) {
      console.error("❌ שגיאה בטעינת המודל:", err);
      alert("⚠️ שגיאה בטעינת המודל, בדוק את הקונסול לפרטים");
      return;  // לא ממשיכים אם המודל לא נטען
    }
    try {
         await getLatestLocation();
         console.log("📍 Location preloaded:", _lastCoords);
       } catch (err) {
         console.warn("⚠️ Could not preload location:", err);
       }
    
    // 2. אחר כך מבקשים הרשאה למצלמה
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      startBtn.style.display = "none";
      stopBtn.style.display = "inline-block";
      switchBtn.style.display = videoDevices.length > 1 ? "inline-block" : "none";
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
  
  
  switchBtn.addEventListener("click", async () => {
    try {
      if (!stream || videoDevices.length < 2) return;
      stream.getTracks().forEach((t) => t.stop());

      currentCamIndex = (currentCamIndex + 1) % videoDevices.length;
      const newDeviceId = videoDevices[currentCamIndex].deviceId;

      stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: newDeviceId } },
      });

      video.srcObject = stream;
      letterboxParams = null; // יגרום לחישוב מחדש בפריים הבא
    } catch (err) {
      console.error("❌ Failed to switch camera:", err);
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
