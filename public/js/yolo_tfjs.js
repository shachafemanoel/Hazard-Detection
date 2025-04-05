/***************************
 * yolo_tfjs.js
 * דוגמה לקוד JavaScript מלא
 ***************************/

// -- הגדרות ברירת מחדל --
const MODEL_PATH = "object_detecion_model/road_damage_detection_last_version_web_model/model.json"; 
const classNames = ['Alligator Crack', 'Block Crack', 'Construction Joint Crack', 'Crosswalk Blur', 'Lane Blur', 'Longitudinal Crack', 'Manhole', 'Patch Repair', 'Pothole', 'Transverse Crack', 'Wheel Mark Crack'];

// גודל הקלט שהמודל דורש (למשל 640 או 544 – בדוק במה אומן)
const FIXED_SIZE = 640; 

// משתנים גלובליים
let yoloModel = null;    // יאחסן את המודל הטעון
let isDetecting = false; // דגל להרצת לולאה
let cameraStream = null; // זרם המצלמה

/***************************************************
 * 1) טעינת המודל – קוראים פעם אחת בתחילת הדרך
 ***************************************************/
async function loadModel() {
  try {
    yoloModel = await tf.loadGraphModel(MODEL_PATH);
    console.log("✅ YOLO TF.js model loaded!");
  } catch (err) {
    console.error("❌ Failed to load TF.js model:", err);
  }
}

/********************************************************
 * 2) פונקציית עזר: הכנת תמונה (canvas) לפורמט המתאים
 *    (כולל Letterbox ל-FIXED_SIZE×FIXED_SIZE, NHWC וכו')
 ********************************************************/
function preprocessImage(source) {
  // ניצור canvas זמני בגודל שהמודל דורש
  const offscreen = document.createElement("canvas");
  offscreen.width = FIXED_SIZE;
  offscreen.height = FIXED_SIZE;
  const offCtx = offscreen.getContext("2d");

  // חישוב scale כדי לשמור על יחס רוחב/גובה (letterbox)
  const scale = Math.min(
    FIXED_SIZE / source.width,
    FIXED_SIZE / source.height
  );
  const newW = Math.round(source.width * scale);
  const newH = Math.round(source.height * scale);
  const offsetX = Math.floor((FIXED_SIZE - newW) / 2);
  const offsetY = Math.floor((FIXED_SIZE - newH) / 2);

  // מילוי שחור + ציור התמונה
  offCtx.fillStyle = "black";
  offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
  offCtx.drawImage(source, offsetX, offsetY, newW, newH);

  // הפיכה ל-Tensor [1, FIXED_SIZE, FIXED_SIZE, 3]
  const input = tf.browser.fromPixels(offscreen)
    .slice([0, 0, 0], [FIXED_SIZE, FIXED_SIZE, 3])
    .div(255.0)
    .expandDims(0);

  return input;
}

/**************************************************************
 * 3) פונקציית עזר: הרצת המודל + פענוח פלט
 *    מניחה שהפלט הוא טנסור יחיד [N, 6] עם מבנה:
 *    [x1, y1, x2, y2, score, classId]  לכל אובייקט
 **************************************************************/
function runInference(model, inputTensor) {
  // משתמשים ב-tf.tidy כדי לשחרר זיכרון אוטומטית לטנזורים זמניים
  const boxesData = tf.tidy(() => {
    const predictions = model.execute(inputTensor); // או executeAsync אם צריך
    const data = predictions.dataSync(); // מחזיר Float32Array
    predictions.dispose();
    return data;
  });

  // הופכים למערך של קופסאות
  const results = [];
  for (let i = 0; i < boxesData.length; i += 6) {
    const box = boxesData.slice(i, i + 6);
    results.push(box);
  }
  return results;
}

/************************************************************
 * 4) ציור תיבות זיהוי על קנבס
 *    results: מערך תיבות [x1, y1, x2, y2, score, classId]
 *    origWidth, origHeight: גודל התמונה/וידאו המקורי
 ************************************************************/
function drawDetections(ctx, results, origWidth, origHeight) {
  // מנקים את הקנבס לפני הציור
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  results.forEach(([x1, y1, x2, y2, score, classId]) => {
    // פילטר סף זיהוי
    if (score < 0.5) return;

    // המרת קואורדינטות מ-FIXED_SIZE חזרה לגודל המקורי
    const scaleX = origWidth  / FIXED_SIZE;
    const scaleY = origHeight / FIXED_SIZE;
    const boxW = (x2 - x1) * scaleX;
    const boxH = (y2 - y1) * scaleY;
    const left = x1 * scaleX;
    const top  = y1 * scaleY;

    // ציור מלבן
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, boxW, boxH);

    // כתיבת תווית
    const label = classNames[Math.floor(classId)] || `Class ${classId}`;
    const scorePerc = (score * 100).toFixed(1);
    ctx.fillStyle = "red";
    ctx.font = "16px Arial";
    const textY = top > 10 ? top - 5 : 10;
    ctx.fillText(`${label} (${scorePerc}%)`, left, textY);
  });
}

/**************************************************************
 * 5) זיהוי בתמונה (Image / HTMLImageElement)
 *    מקבל אלמנט <img>, אלמנט <canvas> ומצייר עליו את הזיהוי
 **************************************************************/
async function detectFromImage(imgElement, canvasElement) {
  if (!yoloModel) {
    console.error("Model not loaded yet!");
    return;
  }

  // מכינים טנסור
  const inputTensor = preprocessImage(imgElement);
  // מריצים המודל
  const results = runInference(yoloModel, inputTensor);
  inputTensor.dispose(); // משחררים את הטנסור של הקלט

  // מציירים
  // תחילה מגדירים את הקנבס לגודל התמונה
  const ctx = canvasElement.getContext("2d");
  canvasElement.width = imgElement.width;
  canvasElement.height = imgElement.height;
  
  // מציירים את התמונה המקורית
  ctx.drawImage(imgElement, 0, 0, imgElement.width, imgElement.height);
  // מציירים תיבות
  drawDetections(ctx, results, imgElement.width, imgElement.height);
}

/************************************************************
 * 6) זיהוי בפריים בודד של וידאו (videoElement.currentTime)
 *    כדי לזמן בלולאה, או באירוע timeupdate/seek
 ************************************************************/
async function detectVideoFrame(videoElement, canvasElement) {
  if (!yoloModel) {
    console.error("Model not loaded yet!");
    return;
  }

  const inputTensor = preprocessImage(videoElement);
  const results = runInference(yoloModel, inputTensor);
  inputTensor.dispose();

  // ציור
  const ctx = canvasElement.getContext("2d");
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;

  // מציירים את הווידאו עצמו (פריים נוכחי)
  ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  drawDetections(ctx, results, canvasElement.width, canvasElement.height);
}

/************************************************************
 * 7) לולאה רציפה לזיהוי על וידאו (בקובץ מקומי) 
 *    או הרצאה בזמן אמת על המצלמה
 ************************************************************/
function startVideoLoop(videoElement, canvasElement) {
  isDetecting = true;
  async function loop() {
    if (!isDetecting) return; 
    await detectVideoFrame(videoElement, canvasElement);
    requestAnimationFrame(loop);
  }
  loop(); // מפעיל לולאה
}

function stopVideoLoop() {
  isDetecting = false;
}

/************************************************************
 * 8) הרצה על מצלמה חיה (Webcam)
 *    מקבלים videoElement, canvasElement ומפעילים getUserMedia.
 ************************************************************/
async function startWebcam(videoElement, canvasElement) {
  if (!yoloModel) {
    await loadModel();
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoElement.srcObject = cameraStream;
    await videoElement.play(); // כדי להמתין שהסטרים יתחיל

    // מפעילים את לולאת הזיהוי
    startVideoLoop(videoElement, canvasElement);
  } catch (err) {
    console.error("Cannot access webcam:", err);
  }
}

function stopWebcam(videoElement) {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  videoElement.pause();
  videoElement.srcObject = null;
  stopVideoLoop();
}


