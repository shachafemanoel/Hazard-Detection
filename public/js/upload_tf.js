// upload_tf.js
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { storage } from "./firebaseConfig.js";


document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  const startButton = document.getElementById("start-camera");
  if (!startButton) {
    console.error('Missing element with ID "start-camera"');
    return;
  }

  const stopButton = document.getElementById("stop-camera");
  if (!stopButton) {
    console.error('Missing element with ID "stop-camera"');
    return;
  }

  const loadingIndicator = document.getElementById("loading-overlay");
  if (!loadingIndicator) {
    console.error('Missing element with ID "loading-overlay"');
    return;
  }

  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext("2d");

  const FIXED_SIZE = 320;
  let stream = null;
  let detecting = false;
  let session = null;
  let frameCount = 0;
  const pendingDetections = [];

  const offscreen = document.createElement("canvas");
  offscreen.width = FIXED_SIZE;
  offscreen.height = FIXED_SIZE;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  let letterboxParams = null;

  const classNames = ['Alligator Crack', 'Block Crack', 'Construction Joint Crack', 'Crosswalk Blur', 'Lane Blur', 'Longitudinal Crack', 'Manhole', 'Patch Repair', 'Pothole', 'Transverse Crack', 'Wheel Mark Crack'];

  async function loadModel() {
    try {
      const modelPaths = [
        '/object_detection_model/last_model_train12052025.onnx',
        '/object_detection_model/yolov8n.onnx'
      ];

      let loaded = false;
      for (const path of modelPaths) {
        console.log(`🔍 Attempting to load model from: ${path}`);
        try {
          let headResp;
          try {
            headResp = await fetch(path, { method: 'HEAD' });
            const contentLength = headResp.headers.get('Content-Length');
            if (headResp.ok) {
              console.log(`📡 Model reachable (status: ${headResp.status}, size: ${contentLength || 'unknown'})`);
            } else {
              console.error(`❌ Model not reachable (status: ${headResp.status})`);
              continue;
            }
          } catch (networkErr) {
            console.error(`❌ Network error checking model at ${path}:`, networkErr);
            continue;
          }

          if (typeof ov !== 'undefined' && ov.InferenceSession) {
            session = await ov.InferenceSession.create(path);
          } else {
            if (typeof ort === 'undefined' || !ort.InferenceSession) {
              console.error('❌ ONNX Runtime (ort) is not available');
              throw new Error('ONNX Runtime (ort) is not available');
            }
            try {
              session = await ort.InferenceSession.create(path, { executionProviders: ['webgl'] });
            } catch (err) {
              console.warn(`WebGL backend failed for ${path}, falling back:`, err);
              session = await ort.InferenceSession.create(path);
            }
          }
          loaded = true;
          console.log('✅ Model file reachable, proceeding with session creation');
          break;
        } catch (err2) {
          console.warn(`❌ Failed to load model at ${path}:`, err2);
        }
      }

      if (!loaded) {
        throw new Error('No model loaded');
      }

      const runtimeName = typeof ov !== 'undefined' && ov.InferenceSession ? 'OpenVINO' : 'ONNX';
      console.log(`✅ YOLO model loaded (${runtimeName} runtime)!`);
    } catch (err) {
      console.error("❌ Failed to load model:", err);
    }
  } finally {
    // Hide loading indicator after a short delay to show status
    setTimeout(() => {
      loadingIndicator.style.display = "none";
    }, 1500);
  }
}

// --- Camera Controls ---
async function startCamera() {
  if (isDetecting || !session) {
    if (!session) {
      console.warn("Detection started before model was ready.");
      if (typeof notify === "function")
        notify("Model not loaded. Cannot start detection.", "warning");
    }
    return;
  }
  isDetecting = true;
  startButton.style.display = "none";
  stopButton.style.display = "block";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    videoElement.srcObject = stream;
    videoElement.onloadedmetadata = () => {
      videoElement.play();
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      lastFrameTime = performance.now();
      detectionLoop();
    };
  } catch (err) {
    console.error("Error accessing camera:", err);
    if (typeof notify === "function") {
      notify(
        "Could not access camera. Please grant permission and ensure a camera is available.",
        "error",
      );
    }
    isDetecting = false;
    startButton.style.display = "block";
    stopButton.style.display = "none";
  }
}

function stopCamera() {
  if (!isDetecting) return;
  isDetecting = false;
  startButton.style.display = "block";
  stopButton.style.display = "none";

  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  const ctx = canvasElement.getContext("2d");
  ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  // Reset UI
  if (detectionCountBadge) detectionCountBadge.textContent = "0 hazards";
  if (hazardTypesDisplay) hazardTypesDisplay.style.display = "none";
  if (hazardTypesList) hazardTypesList.textContent = "No hazards";
  if (fpsBadge) fpsBadge.textContent = "0 FPS";
}

// --- Detection Loop ---
async function detectionLoop() {
  if (!isDetecting) return;

  const frame = await captureFrame();
  if (frame) {
    try {
      const tensor = preprocess(frame, model_dim);
      const feeds = { images: tensor };
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

        console.log("📦 Detected object:", label, scorePerc + "%");

        if (frameCount % 60 === 0) {
          const snap = document.createElement('canvas');
          snap.width = video.videoWidth;
          snap.height = video.videoHeight;
          const snapCtx = snap.getContext('2d');
          // Draw the video frame and overlay
          snapCtx.drawImage(video, 0, 0, snap.width, snap.height);
          snapCtx.drawImage(canvas, 0, 0, snap.width, snap.height);
          saveDetection(snap, label, score).catch((e) => console.error(e));
        }
      }
    } catch (err) {
      console.error("❌ Error running ONNX model:", err);
    }

    requestAnimationFrame(() => detectLoop());
  }

  startButton.addEventListener("click", async () => {
    if (!session) await loadModel();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
      video.srcObject = stream;
      startButton.style.display = "none";
      stopButton.style.display = "inline-block";
      video.addEventListener("loadeddata", () => {
        computeLetterboxParams();
        detecting = true;
        detectLoop();
      }, { once: true });
    } catch (err) {
      alert("לא ניתן לפתוח מצלמה");
      console.error(err);
    }
  });

  stopButton.addEventListener("click", async () => {
    detecting = false;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.srcObject = null;
    startButton.style.display = "inline-block";
    stopButton.style.display = "none";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    console.log("Camera stopped");

    if (pendingDetections.length > 0) {
      console.log(`📨 Sending ${pendingDetections.length} detections to server...`);
      for (const detection of pendingDetections) {
        try {
          const res = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(detection)
          });
          const result = await res.json();
          console.log("✅ Detection saved:", result);
        } catch (e) {
          console.error("🔥 Failed to send detection:", e);
        }
      }
    }
  });
}
