// Complete Hazard Detection Web App Integration
// This file orchestrates the entire application flow

class HazardDetectionApp {
  constructor() {
    this.backendUrl = this.getBackendUrl();
    this.inferenceMode = 'unknown';
    this.isConnected = false;
    this.session = null;
    this.detecting = false;
    
    this.init();
  }

  // Get backend URL based on environment
  getBackendUrl() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('render.com') || hostname.includes('onrender.com')) {
      return 'https://hazard-detection-backend.onrender.com';
    }
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000';
    }
    
    return `${window.location.protocol}//${hostname}:8000`;
  }

  // Initialize the application
  async init() {
    console.log('🚀 Initializing Hazard Detection App...');
    
    try {
      // Check authentication first
      await this.checkAuth();
      
      // Initialize inference system
      await this.initInferenceSystem();
      
      // Setup UI event listeners
      this.setupUI();
      
      // Initialize camera if on camera page
      if (window.location.pathname.includes('camera.html')) {
        await this.initCamera();
      }
      
      console.log('✅ App initialization complete');
    } catch (error) {
      console.error('❌ App initialization failed:', error);
      this.showError('Failed to initialize application');
    }
  }

  // Check user authentication status
  async checkAuth() {
    try {
      const response = await fetch('/api/auth/status');
      if (response.ok) {
        const data = await response.json();
        if (!data.authenticated && !window.location.pathname.includes('login.html')) {
          window.location.href = '/login.html';
        }
      }
    } catch (error) {
      console.warn('Auth check failed:', error);
    }
  }

  // Initialize inference system (backend + frontend fallback)
  async initInferenceSystem() {
    console.log('🔍 Checking backend connection...');
    
    try {
      const response = await fetch(`${this.backendUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'healthy' && data.model_status === 'loaded') {
          this.inferenceMode = 'backend';
          this.isConnected = true;
          console.log('✅ Backend inference ready');
          this.updateStatus('connected', 'Backend AI Ready');
          return;
        }
      }
    } catch (error) {
      console.warn('Backend connection failed:', error.message);
    }

    // Fallback to frontend inference
    console.log('🔄 Loading frontend AI model...');
    try {
      if (typeof window.ort !== 'undefined') {
        await this.loadONNXModel();
        this.inferenceMode = 'frontend';
        this.isConnected = true;
        console.log('✅ Frontend inference ready');
        this.updateStatus('connected', 'Local AI Ready');
      } else {
        throw new Error('ONNX Runtime not available');
      }
    } catch (error) {
      console.error('❌ Frontend model loading failed:', error);
      this.inferenceMode = 'disabled';
      this.updateStatus('disconnected', 'AI Detection Unavailable');
      this.showError('AI detection is currently unavailable. Camera preview only.');
    }
  }

  // Load ONNX model for frontend inference
  async loadONNXModel() {
    const ort = window.ort;
    
    // Configure ONNX Runtime
    ort.env.wasm.simd = true;
    ort.env.wasm.wasmPaths = '/ort/';
    ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 4);

    // Try multiple model paths
    const modelPaths = [
      '/object_detecion_model/model_18_7.onnx',
      './object_detecion_model/model_18_7.onnx'
    ];

    for (const path of modelPaths) {
      try {
        const testResponse = await fetch(path, { method: 'HEAD' });
        if (testResponse.ok) {
          console.log(`📦 Loading model from: ${path}`);
          this.session = await ort.InferenceSession.create(path, {
            executionProviders: ['webgl', 'wasm'],
            graphOptimizationLevel: 'all'
          });
          console.log('✅ ONNX model loaded successfully');
          return;
        }
      } catch (e) {
        console.log(`❌ Model not found at: ${path}`);
      }
    }
    
    throw new Error('No model file found');
  }

  // Setup UI event listeners
  setupUI() {
    // Camera controls
    const startBtn = document.getElementById('start-camera');
    const stopBtn = document.getElementById('stop-camera');
    const switchBtn = document.getElementById('switch-camera');

    if (startBtn) {
      startBtn.addEventListener('click', () => this.startDetection());
    }
    if (stopBtn) {
      stopBtn.addEventListener('click', () => this.stopDetection());
    }
    if (switchBtn) {
      switchBtn.addEventListener('click', () => this.switchCamera());
    }

    // Inference mode toggle (for debugging)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'i') {
        e.preventDefault();
        this.toggleInferenceMode();
      }
    });
  }

  // Initialize camera
  async initCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          facingMode: 'environment' 
        }
      });
      
      const video = document.getElementById('camera-stream');
      if (video) {
        video.srcObject = stream;
        video.play();
        console.log('📹 Camera initialized');
      }
    } catch (error) {
      console.error('❌ Camera initialization failed:', error);
      this.showError('Camera access denied or not available');
    }
  }

  // Start hazard detection
  async startDetection() {
    if (!this.isConnected) {
      this.showError('AI system not ready');
      return;
    }

    this.detecting = true;
    this.updateStatus('processing', 'Detection Active');
    
    const video = document.getElementById('camera-stream');
    const canvas = document.getElementById('overlay-canvas');
    
    if (!video || !canvas) {
      this.showError('Camera elements not found');
      return;
    }

    // Start detection loop
    this.detectLoop(video, canvas);
    console.log('🔍 Detection started');
  }

  // Stop hazard detection
  stopDetection() {
    this.detecting = false;
    this.updateStatus('connected', `${this.inferenceMode.toUpperCase()} AI Ready`);
    console.log('⏹️ Detection stopped');
  }

  // Detection loop
  async detectLoop(video, canvas) {
    if (!this.detecting) return;

    const ctx = canvas.getContext('2d');
    
    // Resize canvas to match video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      let detections = [];

      if (this.inferenceMode === 'backend') {
        // Backend inference
        detections = await this.runBackendInference(canvas);
      } else if (this.inferenceMode === 'frontend') {
        // Frontend inference
        detections = await this.runFrontendInference(canvas);
      }

      // Draw detections
      this.drawDetections(ctx, detections);

    } catch (error) {
      console.error('Detection error:', error);
    }

    // Continue loop
    if (this.detecting) {
      requestAnimationFrame(() => this.detectLoop(video, canvas));
    }
  }

  // Run backend inference
  async runBackendInference(canvas) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    
    const formData = new FormData();
    formData.append('file', blob, 'frame.jpg');

    const response = await fetch(`${this.backendUrl}/detect`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Backend inference failed: ${response.status}`);
    }

    const result = await response.json();
    return result.detections || [];
  }

  // Run frontend inference
  async runFrontendInference(canvas) {
    if (!this.session) return [];

    // Prepare image data
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, 640, 640); // Resize to model input
    
    // Convert to tensor
    const tensor = new ort.Tensor('float32', this.preprocessImage(imageData), [1, 3, 640, 640]);
    
    // Run inference
    const results = await this.session.run({ images: tensor });
    
    // Process results
    return this.postprocessResults(results);
  }

  // Preprocess image for ONNX model
  preprocessImage(imageData) {
    const data = imageData.data;
    const float32Data = new Float32Array(3 * 640 * 640);
    
    for (let i = 0; i < 640 * 640; i++) {
      float32Data[i] = data[i * 4] / 255.0; // R
      float32Data[i + 640 * 640] = data[i * 4 + 1] / 255.0; // G
      float32Data[i + 640 * 640 * 2] = data[i * 4 + 2] / 255.0; // B
    }
    
    return float32Data;
  }

  // Postprocess ONNX results
  postprocessResults(results) {
    // Implementation depends on your specific model output format
    const output = results[Object.keys(results)[0]];
    const detections = [];
    
    // Parse detection results based on your model
    // This is a simplified example
    for (let i = 0; i < output.data.length; i += 6) {
      if (output.data[i + 4] > 0.5) { // Confidence threshold
        detections.push({
          bbox: [output.data[i], output.data[i + 1], output.data[i + 2], output.data[i + 3]],
          confidence: output.data[i + 4],
          class_id: Math.floor(output.data[i + 5]),
          class_name: this.getClassName(Math.floor(output.data[i + 5]))
        });
      }
    }
    
    return detections;
  }

  // Get class name from ID
  getClassName(classId) {
    const classNames = ['crack', 'knocked', 'pothole', 'surface_damage'];
    return classNames[classId] || 'unknown';
  }

  // Draw detections on canvas
  drawDetections(ctx, detections) {
    ctx.strokeStyle = this.inferenceMode === 'backend' ? '#00FFFF' : '#00FF00';
    ctx.lineWidth = 3;
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = this.inferenceMode === 'backend' ? '#00FFFF' : '#00FF00';

    for (const detection of detections) {
      const [x1, y1, x2, y2] = detection.bbox;
      const width = x2 - x1;
      const height = y2 - y1;

      // Draw bounding box
      ctx.strokeRect(x1, y1, width, height);

      // Draw label
      const label = `${detection.class_name} ${(detection.confidence * 100).toFixed(1)}%`;
      const labelY = y1 > 30 ? y1 - 10 : y1 + height + 25;
      
      // Label background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(x1, labelY - 20, ctx.measureText(label).width + 10, 25);
      
      // Label text
      ctx.fillStyle = this.inferenceMode === 'backend' ? '#00FFFF' : '#00FF00';
      ctx.fillText(label, x1 + 5, labelY - 5);
    }
  }

  // Toggle between inference modes
  toggleInferenceMode() {
    if (this.inferenceMode === 'backend') {
      this.inferenceMode = 'frontend';
      this.showNotification('Switched to local AI inference', 'info');
    } else if (this.inferenceMode === 'frontend') {
      // Try to reconnect to backend
      this.initInferenceSystem();
    }
  }

  // Switch camera (front/back)
  async switchCamera() {
    // Implementation for camera switching
    this.showNotification('Camera switching not implemented yet', 'info');
  }

  // Update connection status UI
  updateStatus(status, message) {
    const statusEl = document.getElementById('connection-status');
    const statusText = document.querySelector('.status-text');
    
    if (statusEl && statusText) {
      statusEl.className = `connection-status ${status}`;
      statusText.textContent = message;
    }
  }

  // Show notification
  showNotification(message, type = 'info') {
    console.log(`${type.toUpperCase()}: ${message}`);
    
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      z-index: 10000;
      font-weight: 500;
      background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#198754' : '#0dcaf0'};
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 4000);
  }

  // Show error message
  showError(message) {
    this.showNotification(message, 'error');
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.hazardApp = new HazardDetectionApp();
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HazardDetectionApp;
}