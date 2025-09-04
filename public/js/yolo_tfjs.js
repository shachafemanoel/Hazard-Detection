/**
 * yolo_tfjs.js
 * מודול JavaScript מודולרי לזיהוי אובייקטים באמצעות YOLOv5 עם ONNX Runtime
 * Optimized for performance with session caching and warmup
 */

// Global session cache and optimization state
let sessionCache = new Map();
let warmupTensor = null;
let isWarmedUp = false;

/**
 * Gets or creates an optimized ONNX session with caching
 * @param {string} modelPath - נתיב למודל ONNX
 * @returns {Promise<ort.InferenceSession>} - אובייקט InferenceSession טעון ומאופטם
 */
export async function getOnnxSession(modelPath) {
  // Check cache first
  if (sessionCache.has(modelPath)) {
    console.log("✅ Using cached ONNX session");
    return sessionCache.get(modelPath);
  }

  try {
    let session;
    const executionProviders = [];
    
    // Optimize execution provider selection
    if (ort.env.webgl?.isSupported) {
      executionProviders.push('webgl');
    }
    if (ort.env.webgpu?.isSupported) {
      executionProviders.push('webgpu');
    }
    executionProviders.push('wasm', 'cpu');
    
    const sessionOptions = {
      executionProviders,
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
      enableMemPattern: true,
      logSeverityLevel: 2, // Warning level
      logVerbosityLevel: 0
    };

    try {
      // Try preferred execution providers first
      session = await ort.InferenceSession.create(modelPath, sessionOptions);
      console.log(`✅ YOLO model loaded with ${sessionOptions.executionProviders[0]}!`);
    } catch (err) {
      // Fallback to basic CPU
      console.warn("Advanced providers failed, falling back to CPU:", err);
      session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
      console.log("✅ YOLO model loaded with CPU!");
    }
    
    // Cache the session
    sessionCache.set(modelPath, session);
    return session;
  } catch (err) {
    // Use centralized error handling
    if (typeof reportError === 'function') {
      reportError(ErrorCodes.MODEL_LOAD, err.message || err);
    } else {
      console.error("❌ Failed to load ONNX model:", err);
    }
    throw err;
  }
}

/**
 * Alias for backward compatibility
 */
export const loadModel = getOnnxSession;
export const createInferenceSession = getOnnxSession;
export const getSession = getOnnxSession;

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

// Pre-allocated buffers for optimization
let reusableCanvas = null;
let reusableCtx = null;
let tensorDataBuffer = null;
let chwDataBuffer = null;

/**
 * Initialize reusable buffers to avoid memory allocation on each frame
 * @param {number} targetSize - גודל היעד
 */
function initializeBuffers(targetSize = 640) {
  if (!reusableCanvas) {
    reusableCanvas = document.createElement("canvas");
    reusableCanvas.width = targetSize;
    reusableCanvas.height = targetSize;
    reusableCtx = reusableCanvas.getContext("2d", { 
      willReadFrequently: true,
      alpha: false,
      desynchronized: true
    });
  }
  
  if (!tensorDataBuffer) {
    tensorDataBuffer = new Float32Array(targetSize * targetSize * 3);
  }
  
  if (!chwDataBuffer) {
    chwDataBuffer = new Float32Array(3 * targetSize * targetSize);
  }
}

/**
 * Optimized preprocessing function with memory reuse
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} image - אלמנט תמונה/וידאו/קנבס
 * @param {number} targetSize - גודל היעד (ברירת מחדל: 640)
 * @returns {Object} - אובייקט המכיל את הטנסור ופרמטרי letterbox
 */
export function preprocessFrameToTensor(image, targetSize = 640) {
  // Initialize buffers if needed
  initializeBuffers(targetSize);

  // חישוב פרמטרי letterbox
  const imgWidth = image.naturalWidth || image.videoWidth || image.width;
  const imgHeight = image.naturalHeight || image.videoHeight || image.height;
  const letterboxParams = computeLetterboxParams(imgWidth, imgHeight, targetSize);
  const { offsetX, offsetY, newW, newH } = letterboxParams;

  // מילוי שחור והעתקת התמונה עם letterbox (using reusable canvas)
  reusableCtx.fillStyle = "black";
  reusableCtx.fillRect(0, 0, targetSize, targetSize);
  reusableCtx.drawImage(image, offsetX, offsetY, newW, newH);

  // המרה לנתוני פיקסלים
  const imageData = reusableCtx.getImageData(0, 0, targetSize, targetSize);
  const { data } = imageData;

  // Optimized pixel processing with pre-allocated buffers
  const tensorData = tensorDataBuffer;
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    tensorData[j] = data[i] * 0.003921569; // Faster than /255
    tensorData[j + 1] = data[i + 1] * 0.003921569;
    tensorData[j + 2] = data[i + 2] * 0.003921569;
  }

  // Optimized channel reordering to CHW format
  const chwData = chwDataBuffer;
  const channelSize = targetSize * targetSize;
  
  for (let i = 0; i < channelSize; i++) {
    const rgbIndex = i * 3;
    chwData[i] = tensorData[rgbIndex];           // R channel
    chwData[i + channelSize] = tensorData[rgbIndex + 1];     // G channel
    chwData[i + 2 * channelSize] = tensorData[rgbIndex + 2]; // B channel
  }

  // יצירת טנסור ONNX with reused buffer
  const dims = [1, 3, targetSize, targetSize];
  const tensor = new ort.Tensor("float32", new Float32Array(chwData), dims);

  return { tensor, letterboxParams };
}

/**
 * Alias for backward compatibility
 */
export const preprocessImageToTensor = preprocessFrameToTensor;
export const toTensor = preprocessFrameToTensor;

/**
 * Warm up the ONNX session with a dummy inference
 * @param {ort.InferenceSession} session - מופע המודל הטעון
 * @param {number} targetSize - גודל היעד (ברירת מחדל: 640)
 */
export async function warmupOnnx(session, targetSize = 640) {
  if (isWarmedUp) {
    console.log("✅ Session already warmed up");
    return;
  }
  
  try {
    console.log("🔥 Warming up ONNX session...");
    
    // Create warmup tensor if not exists
    if (!warmupTensor) {
      const warmupData = new Float32Array(3 * targetSize * targetSize).fill(0.5);
      warmupTensor = new ort.Tensor("float32", warmupData, [1, 3, targetSize, targetSize]);
    }
    
    // Run warmup inference
    const feeds = { images: warmupTensor };
    const startTime = performance.now();
    await session.run(feeds);
    const warmupTime = performance.now() - startTime;
    
    isWarmedUp = true;
    console.log(`✅ Session warmed up in ${warmupTime.toFixed(1)}ms`);
  } catch (err) {
    console.warn("⚠️ Warmup failed:", err);
  }
}

/**
 * Alias for warmup function
 */
export const warmup = warmupOnnx;

/**
 * Optimized model inference with performance tracking
 * @param {ort.InferenceSession} session - מופע המודל הטעון
 * @param {ort.Tensor} tensor - טנסור קלט מעובד
 * @returns {Promise<Array>} - מערך של תיבות זיהוי גולמיות
 */
export async function runModel(session, tensor) {
  try {
    // Ensure session is warmed up
    if (!isWarmedUp) {
      await warmupOnnx(session);
    }
    
    // הכנת קלט למודל
    const feeds = { images: tensor };
    
    // הרצת המודל עם מדידת ביצועים
    const startTime = performance.now();
    const results = await session.run(feeds);
    const inferenceTime = performance.now() - startTime;
    
    // חילוץ פלט - מניח שיש מפתח פלט אחד
    const outputKey = Object.keys(results)[0];
    const outputData = results[outputKey].data;
    
    // Optimized box parsing without array creation overhead
    const boxes = [];
    const dataLength = outputData.length;
    for (let i = 0; i < dataLength; i += 6) {
      // Direct array creation is faster than Array.from for small arrays
      boxes.push([
        outputData[i],     // x1
        outputData[i + 1], // y1
        outputData[i + 2], // x2
        outputData[i + 3], // y2
        outputData[i + 4], // score
        outputData[i + 5]  // classId
      ]);
    }
    
    // Log performance occasionally
    if (Math.random() < 0.1) { // 10% of the time
      console.log(`🚀 Inference: ${inferenceTime.toFixed(1)}ms, Detections: ${boxes.length}`);
    }
    
    return boxes;
  } catch (err) {
    // Use centralized error handling
    if (typeof reportError === 'function') {
      reportError(ErrorCodes.INFERENCE, err.message || err);
    } else {
      console.error("❌ Error running ONNX model:", err);
    }
    throw err;
  }
}

/**
 * Alias for backward compatibility
 */
export const runInference = runModel;

/**
 * Optimized Non-Maximum Suppression (NMS) implementation
 * @param {Array} boxes - מערך של תיבות זיהוי גולמיות
 * @param {number} iouThreshold - סף חפיפה (ברירת מחדל: 0.5)
 * @returns {Array} - מערך של אינדקסים של תיבות שנשארו
 */
function nmsOptimized(boxes, iouThreshold = 0.5) {
  if (boxes.length === 0) return [];
  
  // Sort by confidence score (descending)
  const indices = boxes.map((_, i) => i).sort((a, b) => boxes[b][4] - boxes[a][4]);
  const keep = [];
  
  while (indices.length > 0) {
    const current = indices.shift();
    keep.push(current);
    
    const currentBox = boxes[current];
    const [x1a, y1a, x2a, y2a] = currentBox;
    const areaA = (x2a - x1a) * (y2a - y1a);
    
    // Filter remaining boxes
    for (let i = indices.length - 1; i >= 0; i--) {
      const compareBox = boxes[indices[i]];
      const [x1b, y1b, x2b, y2b] = compareBox;
      
      // Calculate intersection
      const x1 = Math.max(x1a, x1b);
      const y1 = Math.max(y1a, y1b);
      const x2 = Math.min(x2a, x2b);
      const y2 = Math.min(y2a, y2b);
      
      if (x1 < x2 && y1 < y2) {
        const intersection = (x2 - x1) * (y2 - y1);
        const areaB = (x2b - x1b) * (y2b - y1b);
        const union = areaA + areaB - intersection;
        const iou = intersection / union;
        
        if (iou > iouThreshold) {
          indices.splice(i, 1);
        }
      }
    }
  }
  
  return keep;
}

/**
 * Optimized box parsing and filtering with NMS
 * @param {Array} rawBoxes - מערך של תיבות זיהוי גולמיות
 * @param {number} confidenceThreshold - סף ביטחון לסינון תיבות
 * @param {number} iouThreshold - סף NMS (ברירת מחדל: 0.5)
 * @returns {Array} - מערך של אובייקטים ParsedBox מסוננים
 */
export function postprocessDetections(rawBoxes, confidenceThreshold = 0.5, iouThreshold = 0.5) {
  // Pre-filter by confidence
  const validBoxes = [];
  for (let i = 0; i < rawBoxes.length; i++) {
    const box = rawBoxes[i];
    const score = box[4];
    if (score < confidenceThreshold) continue;
    const boxW = box[2] - box[0];
    const boxH = box[3] - box[1];
    if (boxW <= 1 || boxH <= 1) continue;
    validBoxes.push(box);
  }
  
  if (validBoxes.length === 0) return [];
  
  // Apply NMS
  const keepIndices = nmsOptimized(validBoxes, iouThreshold);
  
  // Build final results
  const finalBoxes = [];
  for (const idx of keepIndices) {
    const [x1, y1, x2, y2, score, classId] = validBoxes[idx];
    finalBoxes.push({ x1, y1, x2, y2, score, classId: Math.floor(classId) });
  }
  
  return finalBoxes;
}

/**
 * Alias for backward compatibility
 */
export const parseBoxes = postprocessDetections;
export const nms = nmsOptimized;

/**
 * מצייר זיהויים על קנבס, מותאם גם לתמונות וגם לוידאו
 * @param {CanvasRenderingContext2D} ctx - הקשר הקנבס לציור
 * @param {HTMLImageElement|HTMLVideoElement} sourceElement - אלמנט המקור (תמונה או וידאו)
 * @param {Array} boxes - מערך של אובייקטי ParsedBox
 * @param {Array} classNames - מערך שמות המחלקות
 * @param {Object} letterboxParams - פרמטרי letterbox (נדרש עבור תמונות שעברו עיבוד)
 */
export function drawDetections(ctx, sourceElement, boxes, classNames, letterboxParams = null) {
  const canvas = ctx.canvas;
  const isVideo = sourceElement.tagName === 'VIDEO';

  // In video mode, canvas size matches video display size
  // In image mode, canvas is fixed at 640x640
  if (isVideo) {
      canvas.width = sourceElement.videoWidth;
      canvas.height = sourceElement.videoHeight;
  } else {
      canvas.width = 640;
      canvas.height = 640;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw the source image or video frame
  // For images, we use the letterbox params to draw it correctly inside the 640x640 canvas
  if (isVideo) {
      ctx.drawImage(sourceElement, 0, 0, canvas.width, canvas.height);
  } else if (letterboxParams) {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 640, 640);
      ctx.drawImage(sourceElement, letterboxParams.offsetX, letterboxParams.offsetY, letterboxParams.newW, letterboxParams.newH);
  }

  // Calculate scaling factors
  const scaleX = isVideo ? canvas.width / 640 : 1;
  const scaleY = isVideo ? canvas.height / 640 : 1;

  boxes.forEach(box => {
    const { x1, y1, x2, y2, score, classId } = box;

    // Scale box coordinates to canvas size
    const left = x1 * scaleX;
    const top = y1 * scaleY;
    const width = (x2 - x1) * scaleX;
    const height = (y2 - y1) * scaleY;

    const labelName = classNames[Math.floor(classId)] || `Class ${classId}`;
    const scorePerc = (score * 100).toFixed(1);

    const colors = { 'crack': '#ff6b6b', 'pothole': '#ffa726', 'default': '#4ecdc4' };
    const color = colors[labelName.toLowerCase()] || colors.default;

    // Draw main bounding box with glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(left, top, width, height);
    ctx.shadowBlur = 0;

    // Draw label
    const labelText = `${labelName} (${scorePerc}%)`;
    ctx.font = 'bold 14px Arial';
    const textMetrics = ctx.measureText(labelText);
    const textWidth = textMetrics.width;
    const textHeight = 18;
    const padding = 6;

    let labelX = left;
    let labelY = top - (textHeight / 2) - padding;
    if (labelY < 0) labelY = top + height + padding + textHeight;

    ctx.fillStyle = color;
    ctx.fillRect(labelX - (padding/2), labelY - (textHeight/2) - (padding/2), textWidth + padding, textHeight + padding);
    
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, labelX, labelY);
  });
}


/**
 * Class names mapping for hazard detection
 */
export const labelsMap = {
  0: 'crack',
  1: 'pothole'
};

export const classNames = ['crack', 'pothole'];

/**
 * Main detection loop for camera feed
 * @param {HTMLVideoElement} video - אלמנט הוידאו של המצלמה
 * @param {ort.InferenceSession} session - מופע המודל הטעון
 * @param {CanvasRenderingContext2D} ctx - הקשר הקנבס לציור
 * @param {number} confidenceThreshold - סף ביטחון
 * @param {Function} onDetections - קולבק שיופעל עם תוצאות הזיהוי
 * @returns {Function} - פונקציה לעצירת הלולאה
 */
export function startDetectionLoop(video, session, ctx, confidenceThreshold, onDetections) {
  let isRunning = true;
  let animationFrameId = null;

  async function renderLoop() {
    if (!isRunning) return;

    try {
      // Preprocessing
      const { tensor, letterboxParams } = preprocessFrameToTensor(video);

      // Inference
      const rawBoxes = await runModel(session, tensor);

      // Postprocessing
      const processedBoxes = postprocessDetections(rawBoxes, confidenceThreshold);

      // Draw detections using the centralized function
      drawDetections(ctx, video, processedBoxes, classNames);

      // Callback with results
      if (onDetections) {
        onDetections(processedBoxes);
      }
    } catch (err) {
      isRunning = false; // Stop the loop on any error
      console.error("🛑 Critical error in detection loop, stopping.", err);
      // Use centralized error reporting
      if (typeof reportError === "function") {
        reportError(ErrorCodes.INFERENCE, err.message || err, {
          toastOptions: { duration: 8000 },
        });
      }
    }

    // Continue the loop only if it's still running
    if (isRunning) {
      animationFrameId = requestAnimationFrame(renderLoop);
    }
  }

  // Start the loop
  renderLoop();

  // Return a function to stop the loop
  return () => {
    isRunning = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    console.log("⏹️ Detection loop stopped");
  };
}

/**
 * Alias for backward compatibility
 */
export const startRenderLoop = startDetectionLoop;

/**
 * Function to stop the detection loop
 * @param {Function} stopFunction - הפונקציה שהוחזרה מ-startDetectionLoop
 */
export function stopDetectionLoop(stopFunction) {
  if (typeof stopFunction === 'function') {
    stopFunction();
  }
}

/**
 * Alias for backward compatibility
 */
export const stopRenderLoop = stopDetectionLoop;

// Expose for testing
export const __test__ = {
  nmsOptimized,
  computeLetterboxParams
};