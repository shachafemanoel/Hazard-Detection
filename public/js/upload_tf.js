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
  let _watchId    = null;  let videoDevices = [];
  let currentCamIndex = 0;
  let prevImageData = null;
  const DIFF_THRESHOLD = 100000; // הורדת הערך כדי להגביר רגישות לשינויים
  let skipFrames = 3;                       // ברירת מחדל
  const targetFps = 30;                     // יעד: 15 פריימים לשנייה
  const frameTimes = [];                    // היסטוריית זמנים
  const maxHistory = 5;    
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

function computeIoU(boxA, boxB) {
  const xA = Math.max(boxA[0], boxB[0]);
  const yA = Math.max(boxA[1], boxB[1]);
  const xB = Math.min(boxA[2], boxB[2]);
  const yB = Math.min(boxA[3], boxB[3]);
  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
  const boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);
  return interArea / (boxAArea + boxBArea - interArea);
}

function nonMaxSuppression(boxes, scores, iouThreshold = 0.5) {
  const indices = scores
    .map((score, idx) => ({ idx, score }))
    .sort((a, b) => b.score - a.score)
    .map(obj => obj.idx);

  const keep = [];
  while (indices.length > 0) {
    const current = indices.shift();
    keep.push(current);
    for (let i = indices.length - 1; i >= 0; i--) {
      const iou = computeIoU(boxes[current], boxes[indices[i]]);
      if (iou > iouThreshold) {
        indices.splice(i, 1);
      }
    }
  }
  return keep;
}


async function detectLoop() {
  if (!detecting || !session) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  frameCount++;
  const shouldRunDetection = frameCount % skipFrames === 0;
  if (!shouldRunDetection) {
    requestAnimationFrame(detectLoop);
    return;
  }

  const t0 = performance.now();

  if (!letterboxParams) computeLetterboxParams();
  offCtx.fillStyle = 'black';
  offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
  offCtx.filter = 'contrast(120%) brightness(110%)';
  offCtx.drawImage(
    video,
    letterboxParams.offsetX, letterboxParams.offsetY,
    letterboxParams.newW, letterboxParams.newH
  );

  const curr = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);
  if (prevImageData) {
    let sum = 0;
    const d1 = curr.data, d2 = prevImageData.data;
    for (let i = 0; i < d1.length; i += 4) {
      sum += Math.abs(d1[i] - d2[i]) + Math.abs(d1[i+1] - d2[i+1]) + Math.abs(d1[i+2] - d2[i+2]);
    }
    // ייצוב חכם – בדיקה אם יש שינוי דרסטי או חוסר תזוזה
    if (sum < DIFF_THRESHOLD / 3) {
      // כמעט אין שינוי → דלג
      prevImageData = curr;
      requestAnimationFrame(detectLoop);
      return;
    } else if (sum > DIFF_THRESHOLD * 2) {
      // תנועה חדה → אל תקפוץ פריימים
      skipFrames = 1;
    } else {
      // תנועה רגילה → חזור לברירת מחדל
      skipFrames = 3;
    }
  }

  prevImageData = curr;

  const { data, width, height } = curr;
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    floatData[j]     = data[i]   / 255;
    floatData[j + 1] = data[i+1] / 255;
    floatData[j + 2] = data[i+2] / 255;
  }

  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        chwData[c*width*height + y*width + x] = floatData[y*width*3 + x*3 + c];
      }
    }
  }

  const inputTensor = new ort.Tensor('float32', chwData, [1, 3, height, width]);
  const results = await session.run({ images: inputTensor });
  const outputData = results[Object.keys(results)[0]].data;

  const boxes = [];
  const scores = [];
  const classes = [];

  for (let i = 0; i < outputData.length; i += 6) {
    const [x1, y1, x2, y2, score, cls] = outputData.slice(i, i + 6);
    if (score >= 0.5) {
      boxes.push([x1, y1, x2, y2]);
      scores.push(score);
      classes.push(cls);
    }
  }

  const keep = nonMaxSuppression(boxes, scores, 0.45);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  for (let idx of keep) {
    const [x1, y1, x2, y2] = boxes[idx];
    const score = scores[idx];
    const cls = classes[idx];

    const scaleX = video.videoWidth / FIXED_SIZE;
    const scaleY = video.videoHeight / FIXED_SIZE;
    const w = (x2 - x1) * scaleX;
    const h = (y2 - y1) * scaleY;
    const left = x1 * scaleX;
    const top  = y1 * scaleY;

    detectedObjectCount++;
    const hazardName = classNames[Math.floor(cls)];
    if (hazardName && !uniqueHazardTypes.includes(hazardName)) {
      uniqueHazardTypes.push(hazardName);
    }

    const label = `${hazardName} (${(score * 100).toFixed(1)}%)`;
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;
    ctx.strokeRect(left, top, w, h);

    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 16px Arial';
    const textWidth = ctx.measureText(label).width;
    ctx.fillRect(left, top > 20 ? top - 20 : top, textWidth + 8, 20);
    ctx.fillStyle = 'black';
    ctx.fillText(label, left + 4, top > 20 ? top - 5 : top + 15);

    if (!lastSaveTime || Date.now() - lastSaveTime > 10000) {
      lastSaveTime = Date.now();
      await saveDetection(canvas, label);
    }
  }

  if (objectCountOverlay) {
    objectCountOverlay.textContent = `Objects: ${detectedObjectCount}`;
  }
  if (hazardTypesOverlay) {
    hazardTypesOverlay.textContent = uniqueHazardTypes.length > 0
      ? `Hazards: ${uniqueHazardTypes.join(', ')}`
      : 'Hazards: None';
  }

  const t1 = performance.now();
  const elapsed = t1 - t0;
  frameTimes.push(elapsed);
  if (frameTimes.length > maxHistory) frameTimes.shift();
  const avgTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const idealInterval = 1000 / targetFps;
  skipFrames = Math.max(1, Math.round(avgTime / idealInterval));

  if (video.requestVideoFrameCallback) {
  video.requestVideoFrameCallback(() => detectLoop());
} else {
  requestAnimationFrame(detectLoop);
}

}



  startBtn.addEventListener("click", async () => {
  initLocationTracking();

  try {
    await getLatestLocation();
    console.log("📍 Location preloaded:", _lastCoords);
  } catch (err) {
    console.warn("⚠️ Could not preload location:", err);
  }

  try {
    // בדיקה מחדש של המצלמות בכל התחלה
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = devices.filter((d) => d.kind === "videoinput");

    const selectedDeviceId = videoDevices[currentCamIndex]?.deviceId;
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        frameRate: { ideal: 60, max: 60 },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "environment"
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
    console.log("Camera stopped");
  });
});