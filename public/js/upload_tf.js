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

  const FIXED_SIZE = 320;
  let stream = null;
  let detecting = false;
  let session = null;
  let frameCount = 0;
  let lastSaveTime = 0;
  let currentLocation = "Unknown";
  let videoDevices = [];
  let currentCamIndex = 0;

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

  // קבלת המיקום של המשתמש
  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject("Geolocation not supported by this browser");
      }
  
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          console.log("📍 Location received:", { latitude, longitude, accuracy });
  
          if (accuracy > 50) {
            console.warn(`⚠️ Low location accuracy: ${accuracy}m`);
          }
  
          const geoData = JSON.stringify({ lat: latitude, lng: longitude });
          currentLocation = geoData; // ניתן גם לשמור כאובייקט אם עדיף
          resolve(geoData);
        },
        (err) => {
          console.error("❌ Failed to get location:", err.message);
          reject(`Location error: ${err.message}`);
        },
      );
    });
  }
  

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
    // אם המיקום לא נמצא, לא נשמור את הדימוי
    if (currentLocation === "Unknown") {
      console.warn("⚠️ No location detected. Detection not saved.");
      return;
    }
  
    try {
      const geoData = await getLocation(); 
      // המיקום בפורמט JSON
      canvas.toBlob(async (blob) => {
        if (!blob) return console.error("❌ Failed to get image blob");
  
        const file = new File([blob], "detection.jpg", { type: "image/jpeg" });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("geoData", geoData); // כאן נשמור את הכתובת
        formData.append("hazardTypes", label);
  
        try {
          const res = await fetch("/upload-detection", {
            method: "POST",
            body: formData,
            credentials: "include",
          });
  
          const result = await res.json();
          console.log("✅ Detection saved to server:", result.message);
          showSuccessToast();
        } catch (err) {
          console.error("❌ Failed to save detection:", err);
        }
      }, "image/jpeg", 0.9);
    } catch (error) {
      console.error("Error converting coordinates to address:", error);
    }
  }
  

  async function loadModel() {
    const modelUrl = "/object_detecion_model/road_damage_detection_last_version.onnx";
    
    // ראשית — ננסה WebGL, ואם Safari יחרוג או WebGL לא נתמך — ניפול ל-WASM
    const EPs = [];
    if (ort.env.webgl?.isSupported) {
      EPs.push("webgl");
    }
    EPs.push("wasm");               // בטוח תמיד יעבוד
    console.log("🔄 Trying to load ONNX model with EPs:", EPs);
  
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: EPs,
      graphOptimizationLevel: "all",
    });
  
    console.log("✅ Model loaded using", EPs[0], "fallback:", EPs.slice(1));
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

    frameCount++;
    if (frameCount % 4 !== 0) {
      requestAnimationFrame(() => detectLoop());
      return;
    }

    if (!letterboxParams) computeLetterboxParams();

    offCtx.fillStyle = "black";
    offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
    offCtx.drawImage(video, letterboxParams.offsetX, letterboxParams.offsetY, letterboxParams.newW, letterboxParams.newH);

    const imageData = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);
    const { data, width, height } = imageData;
    const tensorData = new Float32Array(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      tensorData[j] = data[i] / 255;
      tensorData[j + 1] = data[i + 1] / 255;
      tensorData[j + 2] = data[i + 2] / 255;
    }

    const chwData = new Float32Array(3 * width * height);
    for (let c = 0; c < 3; c++) {
      for (let h = 0; h < height; h++) {
        for (let w = 0; w < width; w++) {
          chwData[c * width * height + h * width + w] = tensorData[h * width * 3 + w * 3 + c];
        }
      }
    }

    const dims = [1, 3, height, width];
    const tensor = new ort.Tensor("float32", chwData, dims);
    const feeds = { images: tensor };

    try {
      const results = await session.run(feeds);
      const outputKey = Object.keys(results)[0];
      const output = results[outputKey];
      const outputData = output.data;
      const boxes = [];
      for (let i = 0; i < outputData.length; i += 6) {
        boxes.push(outputData.slice(i, i + 6));
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      for (const [x1, y1, x2, y2, score, classId] of boxes) {
        if (score < 0.5) continue;
        const scaleX = video.videoWidth / FIXED_SIZE;
        const scaleY = video.videoHeight / FIXED_SIZE;
        const boxW = (x2 - x1) * scaleX;
        const boxH = (y2 - y1) * scaleY;
        const left = x1 * scaleX;
        const top = y1 * scaleY;
        if (boxW < 1 || boxH < 1) continue;

        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.strokeRect(left, top, boxW, boxH);

        const label = classNames[Math.floor(classId)] || `Class ${classId}`;
        const scorePerc = (score * 100).toFixed(1);
        ctx.fillStyle = "red";
        ctx.font = "16px Arial";
        const textY = top > 10 ? top - 5 : 10;
        ctx.fillText(`${label} (${scorePerc}%)`, left, textY);

        const now = Date.now();
        if (!lastSaveTime || now - lastSaveTime > 10000) {
          lastSaveTime = now;
          await saveDetection(canvas, label);
        }
      }
    } catch (err) {
      console.error("❌ Error running ONNX model:", err);
    }

    requestAnimationFrame(() => detectLoop());
  }

  startBtn.addEventListener("click", async () => {
    try {
      await getLocation();
    } catch (_) {}

    try {
      if (!session) await loadModel();

      // אם לא הצלחנו לזהות מצלמות קודם – ננסה שוב עכשיו
      if (videoDevices.length === 0) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = devices.filter((d) => d.kind === "videoinput");
      }

      const deviceId = videoDevices[currentCamIndex]?.deviceId;
      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      });

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
      alert("⚠️ Could not access camera. Please check permissions.");
      console.error(err);
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
    console.log("Camera stopped");
  });
});
