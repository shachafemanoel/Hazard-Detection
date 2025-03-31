document.addEventListener("DOMContentLoaded", async () => {
  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext("2d");
  const openBtn = document.getElementById("open-camera-btn");
  const closeBtn = document.getElementById("close-camera-btn");

  let model = null;
  let stream = null;
  let detecting = false;

  const classNames = [
    'AggregateExposure', 'AlligatorCrack', 'AsphaltJoint', 'BrokenPlate',
    'ConcreteJoint', 'Crack', 'LongitudinalCrack', 'ManholeCover',
    'Marking', 'MarkingVague', 'MassiveRepair', 'Pit',
    'StripRepair', 'Tiremark', 'TransverseCrack'
  ];

  try {
    model = await tf.loadGraphModel("/object_detecion_model/road_damage_detection_last_version_web_model/model.json");
    console.log("✅ TensorFlow.js model loaded!");
  } catch (err) {
    console.error("❌ Failed to load model:", err);
  }

  openBtn.addEventListener("click", async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      openBtn.style.display = "none";
      closeBtn.style.display = "inline-block";

      video.addEventListener("loadeddata", () => {
        // עדכון גודל ה־canvas לפי גודל הווידאו
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        detecting = true;
        detectLoop();
      }, { once: true });

    } catch (err) {
      alert("לא ניתן לגשת למצלמה.");
      console.error(err);
    }
  });

  closeBtn.addEventListener("click", () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    detecting = false;
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    openBtn.style.display = "inline-block";
    closeBtn.style.display = "none";
  });

  async function detectLoop() {
    if (!detecting || !model) return;

    tf.engine().startScope();

    try {
      // יצירת טנסור מהווידאו, שינוי גודל והתאמה למודל
      const input = tf.browser
        .fromPixels(video)
        .resizeBilinear([544, 544]) // ודא שזהו הגודל שהמודל אומן עליו
        .expandDims(0)
        .div(255.0);
      
      // אפשר להדפיס את צורת הקלט לבדיקה:
      // console.log("Input shape:", input.shape);
      
      const predictions = await model.executeAsync(input);
      
      // אם המודל מחזיר מערך, נשתמש באיבר הראשון
      const outputData = Array.isArray(predictions)
        ? predictions[0].arraySync()
        : predictions.arraySync();
      
      // אפשר להדפיס את הפלט לבדיקה:
      // console.log("Model output:", outputData);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < outputData.length; i++) {
        const [x1, y1, x2, y2, score, classId] = outputData[i];

        if (score > 0.5) {
          const left = x1 * canvas.width;
          const top = y1 * canvas.height;
          const width = (x2 - x1) * canvas.width;
          const height = (y2 - y1) * canvas.height;

          const label = classNames[Math.floor(classId)] || `Class ${classId}`;

          ctx.strokeStyle = "red";
          ctx.lineWidth = 2;
          ctx.strokeRect(left, top, width, height);

          ctx.fillStyle = "red";
          ctx.font = "16px Arial";
          ctx.fillText(`${label} (${(score * 100).toFixed(1)}%)`, left, top > 10 ? top - 5 : 10);
        }
      }

      tf.dispose(predictions);
      tf.dispose(input);

    } catch (err) {
      console.error("❌ Error in detectLoop:", err);
    }

    tf.engine().endScope();
    requestAnimationFrame(detectLoop);
  }
});
