document.addEventListener("DOMContentLoaded", async function () {
  const imageUpload = document.getElementById("image-upload");
  const confidenceSlider = document.getElementById("confidence-slider");
  const confValueSpan = document.getElementById("conf-value");
  const canvas = document.getElementById("preview-canvas");
  const ctx = canvas.getContext("2d");

  // המודל (YOLO באון-אן-אקס) מיוצא לגודל 640x640
  const FIXED_SIZE = 640;

  // רשימת המחלקות
  const classNames = [
    'AggregateExposure', 'AlligatorCrack', 'AsphaltJoint', 'BrokenPlate',
    'ConcreteJoint', 'Crack', 'LongitudinalCrack', 'ManholeCover',
    'Marking', 'MarkingVague', 'MassiveRepair', 'Pit',
    'StripRepair', 'Tiremark', 'TransverseCrack'
  ];

  // הטענת המודל (ONNX)
  let session = null;
  try {
    session = await ort.InferenceSession.create(
      "/object_detecion_model/road_damage_detection_last_version.onnx"
    );
    console.log("✅ YOLO model loaded!");
  } catch (err) {
    console.error("❌ Failed to load model:", err);
  }

  // נעקוב אחרי ה-Confidence Threshold (slider)
  let confidenceThreshold = parseFloat(confidenceSlider.value);
  confidenceSlider.addEventListener("input", (e) => {
    confidenceThreshold = parseFloat(e.target.value);
    confValueSpan.textContent = confidenceThreshold;
    // אם יש תמונה כבר, נריץ שוב
    if (currentImage) {
      runInferenceOnImage(currentImage);
    }
  });

  // נשמור את התמונה האחרונה שהעלה המשתמש
  let currentImage = null;

  // נשמור גם את נתוני ה-Letterbox, כדי שנוכל לצייר את התוצאה נכון
  let letterboxParams = {
    offsetX: 0,
    offsetY: 0,
    newW: FIXED_SIZE,
    newH: FIXED_SIZE
  };

  // האזנה להעלאת תמונה ידנית
  if (imageUpload) {
    imageUpload.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = async function() {
          currentImage = img;
          // מכווננים את ה-canvas ל-640x640 (אותו גודל שהמודל צופה)
          canvas.width = FIXED_SIZE;
          canvas.height = FIXED_SIZE;

          // מפעילים את הפונקציה שמריצה את המודל
          await runInferenceOnImage(img);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // פונקציית ההרצה של המודל (עושה Letterbox לפני שליחת התמונה למודל)
  async function runInferenceOnImage(imageElement) {
    if (!session) {
      console.warn("Model not loaded yet.");
      return;
    }

    try {
      // 1) ניצור canvas זמני (offscreen) בגודל 640x640
      const offscreen = document.createElement("canvas");
      offscreen.width = FIXED_SIZE;
      offscreen.height = FIXED_SIZE;
      const offCtx = offscreen.getContext("2d");

      // חישוב Scale ושאר פרמטרי ה-Letterbox
      const imgW = imageElement.width;
      const imgH = imageElement.height;
      const scale = Math.min(FIXED_SIZE / imgW, FIXED_SIZE / imgH);
      const newW = Math.round(imgW * scale);
      const newH = Math.round(imgH * scale);
      const offsetX = Math.floor((FIXED_SIZE - newW) / 2);
      const offsetY = Math.floor((FIXED_SIZE - newH) / 2);

      // שומרים כדי שנוכל להשתמש בציור התוצאות
      letterboxParams = { offsetX, offsetY, newW, newH };

      // 2) ממלאים את הרקע בשחור, ואז מציירים את התמונה הסקיילד במרכז
      offCtx.fillStyle = "black";
      offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
      offCtx.drawImage(imageElement, offsetX, offsetY, newW, newH);

      // 3) נוציא את הפיקסלים מה-offscreen
      const imageData = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);
      const { data, width, height } = imageData;

      // 4) נהפוך ל-Float32Array מנורמל (0..1)
      const numChannels = 3;
      const tensorData = new Float32Array(width * height * numChannels);

      for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
        tensorData[j]     = data[i]     / 255; // R
        tensorData[j + 1] = data[i + 1] / 255; // G
        tensorData[j + 2] = data[i + 2] / 255; // B
      }

      // 5) המרה מ-HWC ל-CHW
      const chwData = new Float32Array(3 * width * height);
      for (let c = 0; c < 3; c++) {
        for (let h = 0; h < height; h++) {
          for (let w = 0; w < width; w++) {
            chwData[c * width * height + h * width + w] =
              tensorData[h * width * 3 + w * 3 + c];
          }
        }
      }

      // 6) צור טנסור ושגר למודל
      const dims = [1, 3, height, width];
      const tensor = new ort.Tensor("float32", chwData, dims);
      const feeds = { images: tensor };

      const results = await session.run(feeds);
      
      // 7) שליפת ה-output
      const outputKey = Object.keys(results)[0];
      const output = results[outputKey];
      const outputData = output.data;

      console.log("Raw outputData:", outputData);
      console.log("Output shape:", output.dims);

      // נניח שהפלט הוא (N,6) (או [1,N,6]) של תיבות
      const boxes = [];
      for (let i = 0; i < outputData.length; i += 6) {
        const box = outputData.slice(i, i + 6);
        boxes.push(box);
      }
      console.log("Parsed boxes (first 5):", boxes.slice(0, 5));

      // 8) לצייר את התוצאות
      drawResults(boxes);
    } catch (err) {
      console.error("Error in inference on image:", err);
    }
  }

  // פונקציה לציור התוצאה (התמונה + תיבות) על ה-canvas הראשי
  function drawResults(boxes) {
    // ניקוי ה-canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // שליפה מה-letterboxParams (כדי לשמור על אותו ציור)
    const { offsetX, offsetY, newW, newH } = letterboxParams;

    // קודם ממלאים שחור, אח"כ מציירים את התמונה באותו אופן כמו ב-offscreen
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
    if (currentImage) {
      ctx.drawImage(currentImage, offsetX, offsetY, newW, newH);
    }

    // עיבוד כל התיבות וחישוב המיקום לציור
    boxes.forEach((box, idx) => {
      let [x1, y1, x2, y2, score, classId] = box;

      // אם המודל מחזיר ערכי פיקסל שכבר כוללים את הפסים השחורים,
      // אין צורך להזיז או לפענח offset. אם זה מנורמל (0..1), נכפיל ב-640:
      // (נניח שזה מנורמל; אם כבר בפיקסלים 0..640, אפשר להשאיר ככה)
      x1 *= FIXED_SIZE;
      y1 *= FIXED_SIZE;
      x2 *= FIXED_SIZE;
      y2 *= FIXED_SIZE;

      if (score >= confidenceThreshold) {
        const boxW = x2 - x1;
        const boxH = y2 - y1;
        const labelName = classNames[Math.floor(classId)] || `Class ${classId}`;
        const scorePerc = (score * 100).toFixed(1);

        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, boxW, boxH);

        ctx.fillStyle = "red";
        ctx.font = "16px Arial";
        const textX = x1;
        const textY = y1 > 10 ? y1 - 5 : 10;
        ctx.fillText(`${labelName} (${scorePerc}%)`, textX, textY);
      }
    });
  }
});
