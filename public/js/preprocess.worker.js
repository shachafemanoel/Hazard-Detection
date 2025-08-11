// preprocess.worker.js - Web Worker for ONNX tensor preprocessing
// Handles letterboxing, normalization, and tensor creation for hazard detection

let offscreenCanvas = null;
let offscreenCtx = null;

// Preprocessing constants
const DEFAULT_INPUT_SIZE = 640;
const NORMALIZATION_SCALE = 1.0 / 255.0;

self.onmessage = async function(event) {
  const { id, type, data } = event.data;
  
  try {
    switch (type) {
      case 'process_frame':
        const result = await processFrame(data);
        self.postMessage({ id, type: 'success', result });
        break;
        
      case 'process_for_onnx':
        const onnxResult = await processForONNX(data);
        self.postMessage({ id, type: 'success', result: onnxResult });
        break;
        
      case 'init':
        initializeCanvas(data.size);
        self.postMessage({ id, type: 'success', result: 'initialized' });
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({ 
      id, 
      type: 'error', 
      error: error.message 
    });
  }
};

function initializeCanvas(size = 416) {
  if (!offscreenCanvas || offscreenCanvas.width !== size) {
    offscreenCanvas = new OffscreenCanvas(size, size);
    offscreenCtx = offscreenCanvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    });
  }
}

async function processFrame({ imageBitmap, size = 416, quality = 0.9, outputFormat = 'blob' }) {
  // Initialize canvas if needed
  initializeCanvas(size);
  
  try {
    // Clear and draw the image bitmap to the offscreen canvas
    offscreenCtx.clearRect(0, 0, size, size);
    offscreenCtx.drawImage(imageBitmap, 0, 0, size, size);
    
    if (outputFormat === 'blob') {
      // Convert to JPEG blob for network transmission
      const blob = await offscreenCanvas.convertToBlob({
        type: 'image/jpeg',
        quality: quality
      });
      
      // Transfer the blob back to main thread
      return {
        type: 'blob',
        blob: blob,
        size: blob.size,
        dimensions: { width: size, height: size }
      };
    } else if (outputFormat === 'imagebitmap') {
      // Return transferable ImageBitmap
      const resultBitmap = await createImageBitmap(offscreenCanvas);
      return {
        type: 'imagebitmap',
        imageBitmap: resultBitmap,
        dimensions: { width: size, height: size }
      };
    } else {
      throw new Error(`Unsupported output format: ${outputFormat}`);
    }
    
  } catch (error) {
    throw new Error(`Frame processing failed: ${error.message}`);
  } finally {
    // Clean up input bitmap to free memory
    if (imageBitmap && imageBitmap.close) {
      imageBitmap.close();
    }
  }
}

/**
 * Process image for ONNX inference with letterboxing and tensor conversion
 */
async function processForONNX({ imageData, inputSize = DEFAULT_INPUT_SIZE }) {
  const startTime = performance.now();
  
  try {
    // Create ImageBitmap from ImageData
    const bitmap = await createImageBitmap(imageData);
    
    // Initialize canvas for processing
    initializeCanvas(inputSize);
    
    // Calculate letterbox scaling (maintain aspect ratio)
    const scale = Math.min(inputSize / bitmap.width, inputSize / bitmap.height);
    const scaledWidth = bitmap.width * scale;
    const scaledHeight = bitmap.height * scale;
    const offsetX = (inputSize - scaledWidth) / 2;
    const offsetY = (inputSize - scaledHeight) / 2;

    // Clear canvas with black padding
    offscreenCtx.fillStyle = '#000000';
    offscreenCtx.fillRect(0, 0, inputSize, inputSize);
    
    // Draw letterboxed image
    offscreenCtx.drawImage(bitmap, offsetX, offsetY, scaledWidth, scaledHeight);

    // Get processed image data
    const processedImageData = offscreenCtx.getImageData(0, 0, inputSize, inputSize);
    const pixels = processedImageData.data;

    // Convert RGBA to RGB and normalize to [0,1] in NCHW format
    const tensorData = new Float32Array(3 * inputSize * inputSize);
    let tensorIndex = 0;

    // NCHW format: [batch, channels, height, width]
    for (let c = 0; c < 3; c++) {
      for (let y = 0; y < inputSize; y++) {
        for (let x = 0; x < inputSize; x++) {
          const pixelIndex = (y * inputSize + x) * 4;
          tensorData[tensorIndex++] = pixels[pixelIndex + c] * NORMALIZATION_SCALE;
        }
      }
    }

    const processingTime = performance.now() - startTime;

    // Clean up bitmap
    bitmap.close();

    return {
      tensorData,
      shape: [1, 3, inputSize, inputSize],
      metadata: {
        scale,
        offsetX,
        offsetY,
        originalWidth: bitmap.width,
        originalHeight: bitmap.height,
        scaledWidth,
        scaledHeight,
        inputSize,
        processingTime
      }
    };

  } catch (error) {
    const processingTime = performance.now() - startTime;
    throw new Error(`ONNX preprocessing failed: ${error.message}`);
  }
}

// Handle worker errors
self.onerror = function(error) {
  console.error('🔥 Preprocess worker error:', error);
};

self.onmessageerror = function(error) {
  console.error('🔥 Preprocess worker message error:', error);
};