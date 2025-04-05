document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext("2d");

  // אותו גודל שהמודל מצפה (640x640)
  const FIXED_SIZE = 640;
  let stream = null;
  let detecting = false;
  let session = null;
  let frameCount = 0; // מונה הפריימים

  // רשימת המחלקות, כמו בקוד שלך
  const classNames = [
    'AggregateExposure', 'AlligatorCrack', 'AsphaltJoint', 'BrokenPlate',
    'ConcreteJoint', 'Crack', 'LongitudinalCrack', 'ManholeCover',
    'Marking', 'MarkingVague', 'MassiveRepair', 'Pit',
    'StripRepair', 'Tiremark', 'TransverseCrack'
  ];

  // 1) טוענים את המודל ONNX (אותו קובץ שהשתמשת בו לתמונות)
  async function loadModel() {
    try {
      session = await ort.InferenceSession.create("/object_detecion_model/road_damage_detection_last_version.onnx");
      console.log("✅ YOLO model loaded (live camera)!");
    } catch (err) {
      console.error("❌ Failed to load ONNX model:", err);
    }
  }

  // לולאת הזיהוי: משתמשת בדיוק בלוגיקה של Letterbox → HWC→CHW → session.run
  async function detectLoop() {
    if (!detecting || !session) return;
  
    // נגדיל את המונה בכל פריים
    frameCount++;
  
    // אם הפריים הוא אי-זוגי, נדלג על הרצת הזיהוי
    if (frameCount % 2 !== 0) {
      if (detecting) {
        requestAnimationFrame(detectLoop);
      }
      return;
    }
  
    // ----- כאן ממשיכים בדיוק באותה לוגיקה של Letterbox ו-session.run -----
  
    // משרטטים קודם את הווידאו על ה-canvas ביניים וכו'
    const offscreen = document.createElement("canvas");
    offscreen.width = FIXED_SIZE;
    offscreen.height = FIXED_SIZE;
    const offCtx = offscreen.getContext("2d");
  
    const scale = Math.min(
      FIXED_SIZE / video.videoWidth,
      FIXED_SIZE / video.videoHeight
    );
    const newW = Math.round(video.videoWidth * scale);
    const newH = Math.round(video.videoHeight * scale);
    const offsetX = Math.floor((FIXED_SIZE - newW) / 2);
    const offsetY = Math.floor((FIXED_SIZE - newH) / 2);
  
    offCtx.fillStyle = "black";
    offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
    offCtx.drawImage(video, offsetX, offsetY, newW, newH);
  
    const imageData = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);
    const { data, width, height } = imageData;
  
    const numChannels = 3;
    const tensorData = new Float32Array(width * height * numChannels);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      tensorData[j]     = data[i]     / 255;
      tensorData[j + 1] = data[i + 1] / 255;
      tensorData[j + 2] = data[i + 2] / 255;
    }
  
    const chwData = new Float32Array(3 * width * height);
    for (let c = 0; c < 3; c++) {
      for (let h = 0; h < height; h++) {
        for (let w = 0; w < width; w++) {
          chwData[c * width * height + h * width + w] =
            tensorData[h * width * 3 + w * 3 + c];
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
        const box = outputData.slice(i, i + 6);
        boxes.push(box);
      }
  
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
      boxes.forEach(([x1, y1, x2, y2, score, classId], idx) => {
        if (score < 0.5) return;
  
        const scaleX = video.videoWidth  / FIXED_SIZE;
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
    } catch (err) {
      console.error("❌ Error running ONNX model:", err);
    }
  
    // המשך הלולאה
    if (detecting) {
      requestAnimationFrame(detectLoop);
    }
  }

  // לחיצה על START
  startBtn.addEventListener("click", async () => {
    if (!session) {
      await loadModel();
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      startBtn.style.display = "none";
      stopBtn.style.display = "inline-block";

      // ברגע שהמידע מהמצלמה מוכן
      video.addEventListener("loadeddata", () => {
        detecting = true;
        detectLoop();
      }, { once: true });
    } catch (err) {
      alert("לא ניתן לפתוח מצלמה");
      console.error(err);
    }
  });

  // לחיצה על STOP
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
