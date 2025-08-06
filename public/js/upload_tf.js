// upload_tf.js
document.addEventListener("DOMContentLoaded", async () => {
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById('loading-overlay');
  const statusTxt = document.getElementById('loading-status');
  const badgeCnt = document.getElementById('detection-count-badge');
  const badgeFPS = document.getElementById('fps-badge');
  const badgeType = document.getElementById('hazard-types-display');
  const listType = document.getElementById('hazard-types-list');

  const FIXED_SIZE = 480;
  let stream = null;
  let detecting = false;
  let session = null;
  let frameCount = 0;
  let lastFpsTick = performance.now();

  const offscreen = document.createElement("canvas");
  offscreen.width = FIXED_SIZE;
  offscreen.height = FIXED_SIZE;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  let letterboxParams = null;

  const classNames = ['Alligator Crack', 'Block Crack', 'Construction Joint Crack', 'Crosswalk Blur', 'Lane Blur', 'Longitudinal Crack', 'Manhole', 'Patch Repair', 'Pothole', 'Transverse Crack', 'Wheel Mark Crack'];

  async function loadModel() {
    statusTxt.textContent = 'Loading model…';
    try {
      const modelPaths = [
        './object_detection_model/best0408.onnx',
        './object_detection_model/yolov8n.onnx', // Fallback or alternative
        './object_detection_model/last_model_train12052025.onnx'
      ];

      let loaded = false;
      for (const path of modelPaths) {
        try {
          if (typeof ov !== 'undefined' && ov.InferenceSession) {
            session = await ov.InferenceSession.create(path);
          } else {
            session = await ort.InferenceSession.create(path, { executionProviders: ['wasm'] });
          }
          loaded = true;
          break;
        } catch (err2) {
          console.warn(`❌ Failed to load model at ${path}:`, err2);
        }
      }

      if (!loaded) {
        throw new Error('No model loaded');
      }

      const runtimeName = typeof ov !== 'undefined' && ov.InferenceSession ? 'OpenVINO' : 'ONNX';
      statusTxt.textContent = 'Model loaded';
      overlay.hidden = true;
      startBtn.disabled = false;
      console.log(`✅ YOLO model loaded (${runtimeName} runtime)!`);
    } catch (err) {
      console.error("❌ Failed to load model:", err);
      statusTxt.textContent = 'Failed to load model';
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

    // FPS calculation
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTick > 1000) {
      badgeFPS.textContent = `${frameCount} FPS`;
      frameCount = 0;
      lastFpsTick = now;
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

      let detectedHazards = [];
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

        detectedHazards.push(label);
      }

      badgeCnt.textContent = `${detectedHazards.length} hazard${detectedHazards.length === 1 ? '' : 's'}`;
      if (detectedHazards.length) {
        const unique = [...new Set(detectedHazards)];
        badgeType.hidden = false;
        listType.textContent = unique.join(', ');
      } else {
        badgeType.hidden = true;
      }

    } catch (err) {
      console.error("❌ Error running ONNX model:", err);
    }

    requestAnimationFrame(() => detectLoop());
  }

  startBtn.addEventListener("click", async () => {
    if (!session) await loadModel();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
      video.srcObject = stream;
      startBtn.hidden = true;
      stopBtn.hidden = false;
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

  stopBtn.addEventListener("click", () => {
    detecting = false;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.srcObject = null;
    startBtn.hidden = false;
    stopBtn.hidden = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    badgeCnt.textContent = '0 hazards';
    badgeFPS.textContent = '0 FPS';
    badgeType.hidden = true;
    listType.textContent = '';
    console.log("Camera stopped");
  });

  await loadModel();
});