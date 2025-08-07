// preprocess.worker.js - Web Worker for fast image preprocessing
// Handles createImageBitmap + OffscreenCanvas operations off the main thread

let offscreenCanvas = null;
let offscreenCtx = null;

self.onmessage = async function(event) {
  const { id, type, data } = event.data;
  
  try {
    switch (type) {
      case 'process_frame':
        const result = await processFrame(data);
        self.postMessage({ id, type: 'success', result });
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

// Handle worker errors
self.onerror = function(error) {
  console.error('🔥 Preprocess worker error:', error);
};

self.onmessageerror = function(error) {
  console.error('🔥 Preprocess worker message error:', error);
};