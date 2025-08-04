// Client-side realtime detection using local models
// Supports ONNX Runtime and OpenVINO for inference
// Eliminates dependency on external API services

// Internal imports
import {
  loadModel,
  preprocessImageToTensor,
  runInference,
  parseBoxes,
} from '../utils/yolo-runtime.js';

class RuntimeRealtimeClient {
  constructor(config = {}) {
    this.config = {
      modelPath:
        config.modelPath ||
        '/object_detection_model/road_damage_detection_simplified.onnx',
      confidenceThreshold: config.confidenceThreshold || 0.5,
      inputSize: config.inputSize || 640,
      classNames: config.classNames || [
        'Crack',
        'Pothole',
        'Construction',
        'Obstacle',
        'Debris',
      ],
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      ...config,
    };

    this.model = null;
    this.status = 'disconnected';
    this.sessionId = null;
    this.retryCount = 0;

    this.listeners = {
      message: [],
      error: [],
      status: [],
    };

    // Generate a unique session ID for this client instance
    this.sessionId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  setStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      console.log(`📊 Status changed: ${newStatus}`);
      this.emit('status', newStatus);
    }
  }

  emit(event, data) {
    this.listeners[event]?.forEach((cb) => {
      try {
        cb(data);
      } catch (error) {
        console.error(`❌ Listener error in ${event}:`, error.message);
      }
    });
  }

  async connect() {
    this.setStatus('connecting');
    try {
      console.log(`🧠 Loading ONNX model: ${this.config.modelPath}`);

      // Check if ONNX Runtime is available
      if (typeof ort === 'undefined') {
        throw new Error(
          'ONNX Runtime not loaded. Please include ort.js before this script.'
        );
      }

      // Load the ONNX model
      this.model = await loadModel(this.config.modelPath);

      this.retryCount = 0;
      this.setStatus('connected');

      console.log(
        `✅ Client-side detection ready (Session: ${this.sessionId})`
      );
      console.log(`🎯 Model: ${this.config.modelPath}`);
      console.log(
        `📏 Input size: ${this.config.inputSize}x${this.config.inputSize}`
      );
      console.log(
        `🎚️ Confidence threshold: ${this.config.confidenceThreshold}`
      );

      return true;
    } catch (error) {
      this.setStatus('disconnected');
      console.error('❌ Failed to load ONNX model:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.model) {
        // Dispose of the model to free memory
        await this.model.dispose();
        this.model = null;
        console.log(`✅ Model disposed (Session: ${this.sessionId})`);
      }
    } catch (error) {
      console.warn(`⚠️ Model disposal warning: ${error.message}`);
    }

    this.setStatus('disconnected');
    console.log(`✅ Client-side detection disconnected`);
  }

  async send(payload) {
    if (this.status !== 'connected' || !this.model) {
      const error = new Error('Not connected or model not loaded');
      this.emit('error', error);
      return;
    }

    this.setStatus('uploading');
    const startTime = Date.now();

    try {
      let imageElement;

      // Convert different payload types to an image element
      if (payload instanceof HTMLImageElement) {
        imageElement = payload;
      } else if (payload instanceof HTMLVideoElement) {
        imageElement = payload;
      } else if (payload instanceof HTMLCanvasElement) {
        imageElement = payload;
      } else if (payload instanceof Blob || payload instanceof File) {
        // Convert blob/file to image
        imageElement = await this.blobToImage(payload);
      } else if (typeof payload === 'string') {
        // Assume it's a data URL or image URL
        imageElement = await this.urlToImage(payload);
      } else {
        throw new Error(
          'Unsupported payload type. Expected Image, Video, Canvas, Blob, File, or URL string.'
        );
      }

      // Preprocess image to tensor
      const { tensor, letterboxParams } = preprocessImageToTensor(
        imageElement,
        this.config.inputSize
      );

      // Run inference
      const rawBoxes = await runInference(this.model, tensor);

      // Parse and filter boxes
      const detections = parseBoxes(rawBoxes, this.config.confidenceThreshold);

      // Convert to API-compatible format
      const result = this.formatDetectionResult(detections, letterboxParams);

      const processingTime = Date.now() - startTime;
      console.log(
        `⚡ Client-side detection completed in ${processingTime}ms (${detections.length} detections)`
      );

      this.emit('message', {
        ...result,
        _metadata: {
          processingTime,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
          modelPath: this.config.modelPath,
          detectionCount: detections.length,
        },
      });

      this.setStatus('connected');
      this.retryCount = 0;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(
        `❌ Client-side detection failed after ${processingTime}ms:`,
        error.message
      );

      // Handle retry logic for certain errors
      if (
        this.retryCount < this.config.maxRetries &&
        this.isRetryableError(error)
      ) {
        this.retryCount++;
        const backoffTime = this.config.retryDelay * this.retryCount;
        console.log(
          `🔄 Retry ${this.retryCount}/${this.config.maxRetries} in ${backoffTime}ms`
        );

        setTimeout(async () => {
          try {
            await this.send(payload);
          } catch (retryError) {
            this.emit('error', retryError);
          }
        }, backoffTime);
      } else {
        this.setStatus('connected');
        this.emit('error', error);
      }
    }
  }

  formatDetectionResult(detections, letterboxParams) {
    const objects = detections.map((detection) => ({
      bbox: [detection.x1, detection.y1, detection.x2, detection.y2],
      confidence: detection.score,
      class:
        this.config.classNames[detection.classId] ||
        `Class ${detection.classId}`,
      class_id: detection.classId,
    }));

    return {
      success: true,
      objects,
      detection_count: objects.length,
      image_size: [this.config.inputSize, this.config.inputSize],
      processing_info: {
        model: this.config.modelPath.split('/').pop(),
        confidence_threshold: this.config.confidenceThreshold,
        letterbox_params: letterboxParams,
      },
    };
  }

  async blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve(img);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  async urlToImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.crossOrigin = 'anonymous'; // For CORS
      img.src = url;
    });
  }

  isRetryableError(error) {
    const retryableErrors = [
      'out of memory',
      'resource exhausted',
      'temporary',
      'timeout',
    ];

    return retryableErrors.some((keyword) =>
      error.message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  onMessage(callback) {
    this.listeners.message.push(callback);
  }

  onError(callback) {
    this.listeners.error.push(callback);
  }

  onStatus(callback) {
    this.listeners.status.push(callback);
  }

  isConnected() {
    return this.status === 'connected' && this.model !== null;
  }

  getStatus() {
    return this.status;
  }

  getSessionId() {
    return this.sessionId;
  }

  getBaseUrl() {
    return 'client-side'; // Indicates local processing
  }

  // Additional method to get model info
  getModelInfo() {
    return {
      modelPath: this.config.modelPath,
      inputSize: this.config.inputSize,
      classNames: this.config.classNames,
      confidenceThreshold: this.config.confidenceThreshold,
      isLoaded: this.model !== null,
    };
  }
}

// Factory function for easy usage
function createRuntimeRealtimeClient(config) {
  return new RuntimeRealtimeClient(config);
}

// Browser compatibility - expose as global
if (typeof window !== 'undefined') {
  window.createRuntimeRealtimeClient = createRuntimeRealtimeClient;
  window.RuntimeRealtimeClient = RuntimeRealtimeClient;
}

export { RuntimeRealtimeClient, createRuntimeRealtimeClient };
