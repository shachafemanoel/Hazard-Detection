/**
 * Configuration file for Hazard Detection Application
 * Central configuration following CLAUDE.md specifications
 */

// Model configuration with fallback paths
export const MODEL_PATHS = [
  "/onxx_models/best.onnx",        // Primary model
  "/onxx_models/best_web.onnx",    // Web-optimized fallback  
  "/onxx_models/best0608.onnx"     // Additional fallback
];

export const LABELS_PATH = "/web/labels.json";     // optional
export const ORT_BASE = "/ort";                    // wasm/webgpu bundles

// API configuration
export const API_BASE = "https://hazard-api-production-production.up.railway.app";

// Performance targets (from CLAUDE.md)
export const PERFORMANCE_TARGETS = {
  MOBILE_FPS: 15,           // ≥15 FPS median on mobile
  WORST_CASE_FPS: 10,       // worst 5% ≥10 FPS
  TTFD: 2000,               // < 2s to first annotated frame
  DASHBOARD_FIRST_PAINT: 1500,  // <1.5s dashboard first paint
  INTERACTION_RESPONSE: 100     // <100ms interactions
};

// Default detection parameters
export const DETECTION_CONFIG = {
  CONFIDENCE_THRESHOLD: 0.5,
  IOU_THRESHOLD: 0.45,
  MODEL_INPUT_SIZE: 640,
  CLASS_NAMES: ['crack', 'knocked', 'pothole', 'surface damage'],
  DETECTION_LIFETIME: 2000,    // Detections stay on screen for 2 seconds
  HAZARD_ALERT_COOLDOWN: 5000  // 5 seconds cooldown between alerts
};

// ONNX Runtime configuration
export const ONNX_CONFIG = {
  // Bundle selection based on device capabilities (WebGPU→WASM only)
  bundles: {
    webgpu: '/ort/ort.webgpu.bundle.min.mjs',      // Modern GPUs (400KB)
    wasm: '/ort/ort.wasm.bundle.min.mjs'           // CPU fallback (48KB)
  },
  
  // Performance settings
  wasmPaths: '/ort/',
  numThreads: navigator.hardwareConcurrency || 4,
  logLevel: 'error',
  
  // Memory management
  sessionOptions: {
    executionProviders: [], // Will be determined dynamically
    enableCpuMemArena: true,
    enableMemPattern: true,
    executionMode: 'sequential',
    graphOptimizationLevel: 'all'
  }
};

// Camera configuration  
export const CAMERA_CONFIG = {
  PREFERRED_RESOLUTION: {
    width: { ideal: 1280 },
    height: { ideal: 720 }
  },
  FACING_MODE: "environment",
  AUTO_SAVE_DEBOUNCE: 3000,     // 3 seconds debounce for auto-reports
  MEMORY_CHECK_INTERVAL: 30000   // Check memory usage every 30 seconds
};

// UI Configuration
export const UI_CONFIG = {
  LOADING_TIMEOUT: 30000,       // 30 second timeout for model loading
  NOTIFICATION_DURATION: 3000,  // Auto-dismiss notifications after 3 seconds
  FPS_UPDATE_INTERVAL: 1000,    // Update FPS counter every second
  
  // Hazard detection colors
  HAZARD_COLORS: {
    crack: '#FF8844',
    knocked: '#FFD400', 
    pothole: '#FF4444',
    'surface damage': '#44D7B6'
  }
};

// Feature flags for debugging and testing
export const FEATURE_FLAGS = {
  ENABLE_WEBGPU: true,          // Allow WebGPU backend
  ENABLE_VERBOSE_LOGGING: false, // Detailed console logging
  ENABLE_PERFORMANCE_MONITORING: true, // Track performance metrics
  ENABLE_MEMORY_MONITORING: true,      // Track memory usage
  ENABLE_AUTO_RETRY: true       // Automatically retry failed operations
};

// Export default configuration object
export default {
  MODEL_PATHS,
  LABELS_PATH,
  ORT_BASE,
  API_BASE,
  PERFORMANCE_TARGETS,
  DETECTION_CONFIG,
  ONNX_CONFIG,
  CAMERA_CONFIG,
  UI_CONFIG,
  FEATURE_FLAGS
};