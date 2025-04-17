// upload_tf.js
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { storage } from "./firebaseConfig.js";

document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
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

  const offscreen = document.createElement("canvas");
  offscreen.width = FIXED_SIZE;
  offscreen.height = FIXED_SIZE;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  let letterboxParams = null;

  const classNames = ['Alligator Crack', 'Block Crack', 'Construction Joint Crack', 'Crosswalk Blur', 'Lane Blur', 'Longitudinal Crack', 'Manhole', 'Patch Repair', 'Pothole', 'Transverse Crack', 'Wheel Mark Crack'];

  // קבלת המיקום של המשתמש
  function getLocation() {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          currentLocation = `${latitude}, ${longitude}`;
          console.log("Location received:", currentLocation);  // הדפסת המיקום
          resolve(currentLocation);
        }, (err) => {
          console.warn("⚠️ Location not available:", err.message);
          reject("Location not available");
        });
      } else {
        reject("Geolocation not supported");
      }
    });
  }

  function getAddressFromCoordinates(lat, lon) {
    return new Promise((resolve, reject) => {
      if (!lat || !lon) {
        reject("Invalid coordinates");
      }
  
      // Google Maps Geocoding API
      const apiKey = "AIzaSyAXxZ7niDaxuyPEzt4j9P9U0kFzKHO9pZk"; // הכנס כאן את המפתח API שלך
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}`;
  
      fetch(url)
        .then(response => response.json())
        .then(data => {
          if (data.status === "OK") {
            const address = data.results[0].formatted_address;
            resolve(address);
          } else {
            reject("Unable to retrieve address");
          }
        })
        .catch(err => {
          reject(err);
        });
    });
  }


  function showSuccessToast(message = "💾 זוהה ונשמר בהצלחה!") {
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
  
    const [latitude, longitude] = currentLocation.split(',').map(coord => parseFloat(coord));
  
    try {
      // המרת הקואורדינטות לכתובת
      const address = await getAddressFromCoordinates(latitude, longitude);
      
      // עכשיו נשמור את הדימוי עם הכתובת
      canvas.toBlob(async (blob) => {
        if (!blob) return console.error("❌ Failed to get image blob");
  
        const file = new File([blob], "detection.jpg", { type: "image/jpeg" });
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", label);
        formData.append("location", address); // כאן נשמור את הכתובת
        formData.append("time", new Date().toISOString());
        formData.append("status", "unreviewed");
        formData.append("reportedBy", "anonymous");
  
        try {
          const res = await fetch("/upload-detection", {
            method: "POST",
            body: formData,
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
    try {
      try {
        session = await ort.InferenceSession.create("/object_detecion_model/road_damage_detection_last_version.onnx", { executionProviders: ['webgl'] });
      } catch (err) {
        console.warn("WebGL backend failed, falling back:", err);
        session = await ort.InferenceSession.create("/object_detecion_model/road_damage_detection_last_version.onnx");
      }
      console.log("✅ YOLO model loaded (live camera)!");
    } catch (err) {
      console.error("❌ Failed to load ONNX model:", err);
    }
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
      await getLocation(); // Try to get location
    } catch (err) {
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  
      const errorBox = document.createElement("div");
      errorBox.style.color = "red";
      errorBox.style.marginTop = "15px";
      errorBox.style.padding = "10px";
      errorBox.style.border = "1px solid red";
      errorBox.style.borderRadius = "8px";
      errorBox.style.backgroundColor = "#ffe6e6";
      errorBox.innerHTML = `
        ❌ Location is required to start the camera.<br><br>
        <strong>Please enable location services on your ${isMobile ? "device" : "browser"}.</strong><br><br>
        <button id="enable-location-btn">How to enable location?</button>
      `;
      document.body.appendChild(errorBox);
  
      document.getElementById("enable-location-btn").addEventListener("click", () => {
        if (isMobile) {
          alert(
            "To enable location on mobile:\n\n" +
            "📍 Android:\n1. Open Settings > Location\n2. Make sure location is turned ON\n3. In Chrome: Menu > Site settings > Location > Allow\n\n" +
            "📍 iPhone:\n1. Go to Settings > Privacy > Location Services\n2. Enable location for Safari or Chrome\n\n" +
            "Then reload this page."
          );
        } else {
          alert(
            "To enable location in your browser:\n\n" +
            "1. Click the lock icon next to the URL\n" +
            "2. Go to 'Site settings'\n" +
            "3. Set 'Location' permission to 'Allow'\n\n" +
            "🔄 Then refresh the page."
          );
        }
      });
  
      return; // Stop - location is required
    }
  
    // Continue as normal if location is available
    try {
      if (!session) await loadModel();
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
      video.srcObject = stream;
      startBtn.style.display = "none";
      stopBtn.style.display = "inline-block";
      video.addEventListener("loadeddata", () => {
        computeLetterboxParams();
        detecting = true;
        detectLoop();
      }, { once: true });
    } catch (err) {
      alert("⚠️ Could not access camera. Please check permissions.");
      console.error(err);
    }
  });
  

  stopBtn.addEventListener("click", async () => {
    detecting = false;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.srcObject = null;
    startBtn.style.display = "inline-block";
    stopBtn.style.display = "none";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    console.log("Camera stopped");
  });
});
