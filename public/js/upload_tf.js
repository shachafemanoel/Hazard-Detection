document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext("2d");

  const FIXED_SIZE = 320;
  const numPixels = FIXED_SIZE * FIXED_SIZE;
  const numElements = numPixels * 3;
  
  // הקצאה מראש של מערכים לנתוני הפיקסלים והמרה ל-CHW
  const tensorData = new Float32Array(numElements);
  const chwData = new Float32Array(numElements);
  
  // מחשבים את מפת ההמרה מ-HWC ל-CHW פעם אחת
  const mapping = new Uint32Array(numElements);
  for (let c = 0; c < 3; c++) {
    for (let h = 0; h < FIXED_SIZE; h++) {
      for (let w = 0; w < FIXED_SIZE; w++) {
        const dstIndex = c * numPixels + h * FIXED_SIZE + w;
        const srcIndex = h * FIXED_SIZE * 3 + w * 3 + c;
        mapping[dstIndex] = srcIndex;
      }
    }
  }
  
  let stream = null;
  let detecting = false;
  let session = null;
  let frameCount = 0;
  
  // מערך לשמירת הרשומות של הפריימים עם מיקום GPS
  const detections = [];

  // צור offscreen canvas פעם אחת עם willReadFrequently
  const offscreen = document.createElement("canvas");
  offscreen.width = FIXED_SIZE;
  offscreen.height = FIXED_SIZE;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  // פרמטרי letterbox יחושבו פעם אחת לאחר טעינת הווידאו
  let letterboxParams = null;

  const classNames = ['Alligator Crack', 'Block Crack', 'Construction Joint Crack', 'Crosswalk Blur', 'Lane Blur', 'Longitudinal Crack', 'Manhole', 'Patch Repair', 'Pothole', 'Transverse Crack', 'Wheel Mark Crack'];

  // פונקציה לשמירת זיהוי עם תמונה ומיקום GPS
  function saveDetection() {
    // מקבל תמונת snapshot מה-canvas הראשי
    const imageDataURL = canvas.toDataURL("image/png");
    // בקשת מיקום GPS
    navigator.geolocation.getCurrentPosition((position) => {
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      const record = {
        image: imageDataURL,
        gps: coords,
        timestamp: new Date().toISOString()
      };
      detections.push(record);
      console.log("Detection saved:", record);
    }, (err) => {
      console.error("Error getting geolocation", err);
    });
  }

  // טוען את המודל עם ניסיון להשתמש ב-WebGL כ-backend
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

  // מחשב את פרמטרי ה-letterbox פעם אחת, כאשר הווידאו מוכן
  function computeLetterboxParams() {
    const scale = Math.min(FIXED_SIZE / video.videoWidth, FIXED_SIZE / video.videoHeight);
    const newW = Math.round(video.videoWidth * scale);
    const newH = Math.round(video.videoHeight * scale);
    const offsetX = Math.floor((FIXED_SIZE - newW) / 2);
    const offsetY = Math.floor((FIXED_SIZE - newH) / 2);
    letterboxParams = { scale, newW, newH, offsetX, offsetY };
  }

  // לולאת זיהוי – מעבדת כל 4 פריימים
  async function detectLoop() {
    if (!detecting || !session) return;

    frameCount++;
    if (frameCount % 4 !== 0) {
      requestAnimationFrame(detectLoop);
      return;
    }

    if (!letterboxParams) computeLetterboxParams();

    // ציור על offscreen canvas עם פרמטרי letterbox
    offCtx.fillStyle = "black";
    offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
    offCtx.drawImage(video, letterboxParams.offsetX, letterboxParams.offsetY, letterboxParams.newW, letterboxParams.newH);

    const imageData = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);
    const { data } = imageData;
    const numChannels = 3;
    
    // עדכון מערך tensorData שהוקצה מראש
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      tensorData[j]     = data[i] / 255;
      tensorData[j + 1] = data[i + 1] / 255;
      tensorData[j + 2] = data[i + 2] / 255;
    }

    // המרת נתונים מ-HWC ל-CHW באמצעות המיפוי שחושב מראש
    for (let i = 0; i < mapping.length; i++) {
      chwData[i] = tensorData[mapping[i]];
    }

    const dims = [1, 3, FIXED_SIZE, FIXED_SIZE];
    const tensor = new ort.Tensor("float32", chwData, dims);
    const feeds = { images: tensor };

    let detectionFound = false;
    try {
      const results = await session.run(feeds);
      const outputKey = Object.keys(results)[0];
      const output = results[outputKey];
      const outputData = output.data;
      const boxes = [];
      for (let i = 0; i < outputData.length; i += 6) {
        const box = outputData.slice(i, i + 6);
        boxes.push(box);
      }

      // ציור התוצאה על הקנבס הראשי
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      boxes.forEach(([x1, y1, x2, y2, score, classId]) => {
        if (score < 0.5) return;
        detectionFound = true;
        const scaleX = video.videoWidth / FIXED_SIZE;
        const scaleY = video.videoHeight / FIXED_SIZE;
        const boxW = (x2 - x1) * scaleX;
        const boxH = (y2 - y1) * scaleY;
        const left = x1 * scaleX;
        const top  = y1 * scaleY;
        if (boxW < 1 || boxH < 1) return;
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.strokeRect(left, top, boxW, boxH);
        const label = classNames[Math.floor(classId)] || `Class ${classId}`;
        const scorePerc = (score * 100).toFixed(1);
        ctx.fillStyle = "red";
        ctx.font = "16px Arial";
        const textY = top > 10 ? top - 5 : 10;
        ctx.fillText(`${label} (${scorePerc}%)`, left, textY);
      });
      
      // אם זיהינו לפחות אובייקט, שמור את הפריים עם ה-GPS
      if (detectionFound) {
        saveDetection();
      }
      
    } catch (err) {
      console.error("❌ Error running ONNX model:", err);
    }

    requestAnimationFrame(detectLoop);
  }

  // הפעלת המצלמה והזיהוי
  startBtn.addEventListener("click", async () => {
    if (!session) await loadModel();
    try {
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
      alert("לא ניתן לפתוח מצלמה");
      console.error(err);
    }
  });

  // עצירת המצלמה והזיהוי
  stopBtn.addEventListener("click", () => {
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
