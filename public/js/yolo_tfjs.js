/**
 * yolo_tfjs.js
 * מודול JavaScript מודולרי לזיהוי אובייקטים באמצעות YOLOv5 עם ONNX Runtime
 */

/**
 * טוען מודל ONNX מהנתיב המצוין
 * @param {string} modelPath - נתיב למודל ONNX
 * @returns {Promise<ort.InferenceSession>} - אובייקט InferenceSession טעון
 */
export async function loadModel(modelPath) {
  try {
    // Set WASM paths consistently
    if (typeof ort !== 'undefined') {
      ort.env.wasm.wasmPaths = '/ort/';
    }
    
    let session;
    try {
      // ניסיון לטעון עם WebGL + WASM fallback
      session = await ort.InferenceSession.create(modelPath, { executionProviders: ['webgl', 'wasm'] });
      console.log("✅ YOLO model loaded with WebGL!");
    } catch (err) {
      // נסיגה למעבד אם WebGL נכשל
      console.warn("WebGL backend failed, falling back to WASM:", err);
      session = await ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] });
      console.log("✅ YOLO model loaded with WASM!");
    }
    return session;
  } catch (err) {
    console.error("❌ Failed to load ONNX model:", err);
    throw err;
  }
}

/**
 * מחשב פרמטרים של letterbox לשמירה על יחס גובה-רוחב
 * @param {number} origWidth - רוחב המקור
 * @param {number} origHeight - גובה המקור
 * @param {number} targetSize - גודל היעד (ברירת מחדל: 640)
 * @returns {Object} - אובייקט פרמטרים של letterbox
 */
export function computeLetterboxParams(origWidth, origHeight, targetSize = 640) {
  const scale = Math.min(targetSize / origWidth, targetSize / origHeight);
  const newW = Math.round(origWidth * scale);
  const newH = Math.round(origHeight * scale);
  const offsetX = Math.floor((targetSize - newW) / 2);
  const offsetY = Math.floor((targetSize - newH) / 2);
  
  return { scale, newW, newH, offsetX, offsetY };
}

/**
 * מעבד תמונה לטנסור מותאם לקלט המודל
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} image - אלמנט תמונה/וידאו/קנבס
 * @param {number} targetSize - גודל היעד (ברירת מחדל: 640)
 * @returns {Object} - אובייקט המכיל את הטנסור ופרמטרי letterbox
 */
export function preprocessImageToTensor(image, targetSize = 640) {
  // יצירת קנווס זמני
  const offscreen = document.createElement("canvas");
  offscreen.width = targetSize;
  offscreen.height = targetSize;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  // חישוב פרמטרי letterbox
  const imgWidth = image.naturalWidth || image.videoWidth || image.width;
  const imgHeight = image.naturalHeight || image.videoHeight || image.height;
  const letterboxParams = computeLetterboxParams(imgWidth, imgHeight, targetSize);
  const { offsetX, offsetY, newW, newH } = letterboxParams;

  // מילוי שחור והעתקת התמונה עם letterbox
  offCtx.fillStyle = "black";
  offCtx.fillRect(0, 0, targetSize, targetSize);
  offCtx.drawImage(image, offsetX, offsetY, newW, newH);

  // המרה לנתוני פיקסלים
  const imageData = offCtx.getImageData(0, 0, targetSize, targetSize);
  const { data, width, height } = imageData;

  // נרמול הנתונים ל-0-1
  const tensorData = new Float32Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    tensorData[j] = data[i] / 255;
    tensorData[j + 1] = data[i + 1] / 255;
    tensorData[j + 2] = data[i + 2] / 255;
  }

  // ארגון מחדש למבנה CHW (Channels, Height, Width)
  const chwData = new Float32Array(3 * width * height);
  for (let c = 0; c < 3; c++) {
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        chwData[c * width * height + h * width + w] = tensorData[h * width * 3 + w * 3 + c];
      }
    }
  }

  // יצירת טנסור ONNX
  const dims = [1, 3, height, width];
  const tensor = new ort.Tensor("float32", chwData, dims);

  return { tensor, letterboxParams };
}

/**
 * מריץ היסק על טנסור באמצעות מודל נתון
 * @param {ort.InferenceSession} session - מופע המודל הטעון
 * @param {ort.Tensor} tensor - טנסור קלט מעובד
 * @returns {Promise<Array>} - מערך של תיבות זיהוי גולמיות
 */
export async function runInference(session, tensor) {
  try {
    // הכנת קלט למודל
    const feeds = { images: tensor };
    
    // הרצת המודל
    const results = await session.run(feeds);
    
    // חילוץ פלט - מניח שיש מפתח פלט אחד
    const outputKey = Object.keys(results)[0];
    const outputData = results[outputKey].data;
    
    // המרה למערך של מערכים [x1, y1, x2, y2, score, classId]
    const boxes = [];
    for (let i = 0; i < outputData.length; i += 6) {
      boxes.push(Array.from(outputData.slice(i, i + 6)));
    }
    
    return boxes;
  } catch (err) {
    console.error("❌ Error running ONNX model:", err);
    throw err;
  }
}

/**
 * מפענח ומסנן את הקופסאות מפלט המודל
 * @param {Array} boxes - מערך של תיבות זיהוי גולמיות
 * @param {number} confidenceThreshold - סף ביטחון לסינון תיבות
 * @returns {Array} - מערך של אובייקטים ParsedBox
 */
export function parseBoxes(boxes, confidenceThreshold = 0.5) {
  const parsedBoxes = [];
  
  for (const box of boxes) {
    const [x1, y1, x2, y2, score, classId] = box;
    
    // סינון לפי סף ביטחון וגודל תיבה הגיוני
    if (score < confidenceThreshold) continue;
    const boxW = x2 - x1;
    const boxH = y2 - y1;
    if (boxW <= 1 || boxH <= 1) continue;
    
    parsedBoxes.push({
      x1, y1, x2, y2,
      score,
      classId: Math.floor(classId)
    });
  }
  
  return parsedBoxes;
}

/**
 * מצייר זיהויים על קנבס
 * @param {CanvasRenderingContext2D} ctx - הקשר הקנבס לציור
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} image - אלמנט המקור
 * @param {Array} boxes - מערך של אובייקטי ParsedBox
 * @param {Array} classNames - מערך שמות המחלקות
 * @param {Object} letterboxParams - פרמטרי letterbox (אופציונלי עבור שימוש במצלמה)
 */
export function drawDetections(ctx, image, boxes, classNames, letterboxParams = null) {
  // הגדרת ממדי קנבס
  const displayWidth = image.naturalWidth || image.videoWidth || image.width;
  const displayHeight = image.naturalHeight || image.videoHeight || image.height;
  
  // ניקוי קנבס וציור תמונת הרקע
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height);
  
  // חישוב פקטורי קנה מידה
  let scaleX = ctx.canvas.width / 640;
  let scaleY = ctx.canvas.height / 640;
  
  // אם יש פרמטרי letterbox, השתמש בהם לחישוב מדויק יותר
  if (letterboxParams) {
    scaleX = displayWidth / 640;
    scaleY = displayHeight / 640;
  }
  
  // ציור תיבות
  for (const box of boxes) {
    const { x1, y1, x2, y2, score, classId } = box;
    
    // ממדי תיבה מותאמים למסך
    const boxW = (x2 - x1) * scaleX;
    const boxH = (y2 - y1) * scaleY;
    const left = x1 * scaleX;
    const top = y1 * scaleY;
    
    // ציור תיבה
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, boxW, boxH);
    
    // ציור תווית
    const label = classNames[classId] || `Class ${classId}`;
    const scorePerc = (score * 100).toFixed(1);
    
    ctx.fillStyle = "red";
    ctx.font = "16px Arial";
    const textY = top > 10 ? top - 5 : 10;
    ctx.fillText(`${label} (${scorePerc}%)`, left, textY);
  }
}