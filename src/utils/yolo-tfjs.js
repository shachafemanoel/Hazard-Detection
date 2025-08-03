/**
 * yolo_tfjs.js
 * Modular JavaScript module for object detection using YOLOv5 with ONNX Runtime
 * Hazard Detection - Road Damage Detection Module
 * Following Node.js Integration Guide patterns
 */

/**
 * Load ONNX model from specified path
 * @param {string} modelPath - Path to ONNX model
 * @returns {Promise<ort.InferenceSession>} - Loaded InferenceSession object
 */
export async function loadModel(modelPath) {
  try {
    let session;
    try {
      // Attempt to load with WebGL
      session = await ort.InferenceSession.create(modelPath, { executionProviders: ['webgl'] });
      console.log("✅ YOLO model loaded with WebGL!");
    } catch (err) {
      // Fallback to CPU if WebGL fails
      console.warn("WebGL backend failed, falling back to CPU:", err);
      session = await ort.InferenceSession.create(modelPath);
      console.log("✅ YOLO model loaded with CPU!");
    }
    return session;
  } catch (err) {
    console.error("❌ Failed to load ONNX model:", err);
    throw err;
  }
}

/**
 * Compute letterbox parameters to maintain aspect ratio
 * @param {number} origWidth - Original width
 * @param {number} origHeight - Original height
 * @param {number} targetSize - Target size (default: 640)
 * @returns {Object} - Letterbox parameters object
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
 * Process image to tensor adapted for model input
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} image - Image/video/canvas element
 * @param {number} targetSize - Target size (default: 640)
 * @returns {Object} - Object containing tensor and letterbox parameters
 */
export function preprocessImageToTensor(image, targetSize = 640) {
  // Create temporary canvas
  const offscreen = document.createElement("canvas");
  offscreen.width = targetSize;
  offscreen.height = targetSize;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  // Calculate letterbox parameters
  const imgWidth = image.naturalWidth || image.videoWidth || image.width;
  const imgHeight = image.naturalHeight || image.videoHeight || image.height;
  const letterboxParams = computeLetterboxParams(imgWidth, imgHeight, targetSize);
  const { offsetX, offsetY, newW, newH } = letterboxParams;

  // Fill black and copy image with letterbox
  offCtx.fillStyle = "black";
  offCtx.fillRect(0, 0, targetSize, targetSize);
  offCtx.drawImage(image, offsetX, offsetY, newW, newH);

  // Convert to pixel data
  const imageData = offCtx.getImageData(0, 0, targetSize, targetSize);
  const { data, width, height } = imageData;

  // Normalize data to 0-1
  const tensorData = new Float32Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    tensorData[j] = data[i] / 255;
    tensorData[j + 1] = data[i + 1] / 255;
    tensorData[j + 2] = data[i + 2] / 255;
  }

  // Reorganize to CHW format (Channels, Height, Width)
  const chwData = new Float32Array(3 * width * height);
  for (let c = 0; c < 3; c++) {
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        chwData[c * width * height + h * width + w] = tensorData[h * width * 3 + w * 3 + c];
      }
    }
  }

  // Create ONNX tensor
  const dims = [1, 3, height, width];
  const tensor = new ort.Tensor("float32", chwData, dims);

  return { tensor, letterboxParams };
}

/**
 * Run inference on tensor using given model
 * @param {ort.InferenceSession} session - Loaded model instance
 * @param {ort.Tensor} tensor - Processed input tensor
 * @returns {Promise<Array>} - Array of raw detection boxes
 */
export async function runInference(session, tensor) {
  try {
    // Prepare model input
    const feeds = { images: tensor };
    
    // Run model
    const results = await session.run(feeds);
    
    // Extract output - assumes single output key
    const outputKey = Object.keys(results)[0];
    const outputData = results[outputKey].data;
    
    // Convert to array of arrays [x1, y1, x2, y2, score, classId]
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
 * Parse and filter boxes from model output
 * @param {Array} boxes - Array of raw detection boxes
 * @param {number} confidenceThreshold - Confidence threshold for filtering boxes
 * @returns {Array} - Array of ParsedBox objects
 */
export function parseBoxes(boxes, confidenceThreshold = 0.5) {
  const parsedBoxes = [];
  
  for (const box of boxes) {
    const [x1, y1, x2, y2, score, classId] = box;
    
    // Filter by confidence threshold and reasonable box size
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
 * Draw detections on canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context for drawing
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} image - Source element
 * @param {Array} boxes - Array of ParsedBox objects
 * @param {Array} classNames - Array of class names
 * @param {Object} letterboxParams - Letterbox parameters (optional for camera use)
 */
export function drawDetections(ctx, image, boxes, classNames, letterboxParams = null) {
  // Set canvas dimensions
  const displayWidth = image.naturalWidth || image.videoWidth || image.width;
  const displayHeight = image.naturalHeight || image.videoHeight || image.height;
  
  // Clear canvas and draw background image
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height);
  
  // Calculate scale factors
  let scaleX = ctx.canvas.width / 640;
  let scaleY = ctx.canvas.height / 640;
  
  // If letterbox parameters exist, use them for more accurate calculation
  if (letterboxParams) {
    scaleX = displayWidth / 640;
    scaleY = displayHeight / 640;
  }
  
  // Draw boxes
  for (const box of boxes) {
    const { x1, y1, x2, y2, score, classId } = box;
    
    // Box dimensions adapted to screen
    const boxW = (x2 - x1) * scaleX;
    const boxH = (y2 - y1) * scaleY;
    const left = x1 * scaleX;
    const top = y1 * scaleY;
    
    // Draw box
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, boxW, boxH);
    
    // Draw label
    const label = classNames[classId] || `Class ${classId}`;
    const scorePerc = (score * 100).toFixed(1);
    
    ctx.fillStyle = "red";
    ctx.font = "16px Arial";
    const textY = top > 10 ? top - 5 : 10;
    ctx.fillText(`${label} (${scorePerc}%)`, left, textY);
  }
}