/**
 * Shared constants and configuration values
 */
export const Constants = {
  // Model Configuration
  MODEL: {
    FIXED_SIZE: 640,
    CONFIDENCE_THRESHOLD: 0.5,
    ONNX_MODEL_PATH: "/object_detecion_model/last_model_train12052025.onnx",
    SIMPLIFIED_MODEL_PATH:
      "/object_detecion_model/road_damage_detection_simplified.onnx",
    ONNX_WASM_PATH: "/ort/",
  },

  // Class Names for Object Detection
  CLASS_NAMES: [
    'crack',
    'knocked',
    'pothole',
    'surface_damage'
  ],

  // Hazard Types (same as CLASS_NAMES for consistency)
  HAZARD_TYPES: [
    'crack',
    'knocked',
    'pothole',
    'surface_damage'
  ],

  // Color mapping for hazard types
  HAZARD_COLORS: {
    crack: "#FF0000",
    knocked: "#FF7F00",
    pothole: "#FFFF00",
    surface_damage: "#00FF00",
    default: "#808080",
  },

  // Performance Configuration
  PERFORMANCE: {
    TARGET_FPS: 10,
    SKIP_FRAMES: 3,
    DIFF_THRESHOLD: 30000,
    MAX_HISTORY: 5,
    OBJECT_DISTANCE_THRESHOLD: 100,
    OBJECT_CLEANUP_TIMEOUT: 3000,
  },

  // Camera Configuration
  CAMERA: {
    IDEAL_FRAME_RATE: 30,
    MAX_FRAME_RATE: 30,
    IDEAL_WIDTH: 1280,
    MAX_WIDTH: 1920,
    IDEAL_HEIGHT: 720,
    MAX_HEIGHT: 1080,
    FACING_MODE: "environment",
  },

  // UI Configuration
  UI: {
    TOAST_DURATION: 5000,
    TOAST_FADE_DURATION: 300,
    NOTIFICATION_TIMEOUT: 3000,
    ANIMATION_DURATION: 300,
  },

  // Validation
  VALIDATION: {
    EMAIL_REGEX: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/,
    PASSWORD_REGEX: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/,
    MIN_LATITUDE: -90,
    MAX_LATITUDE: 90,
    MIN_LONGITUDE: -180,
    MAX_LONGITUDE: 180,
  },

  // API Endpoints
  API: {
    UPLOAD_DETECTION: "/api/detections",
    LOGIN: "/login",
    REGISTER: "/register",
    LOGOUT: "/logout",
    FORGOT_PASSWORD: "/forgot-password",
    REPORTS: "/api/reports", // admin reports endpoint
    GOOGLE_MAPS_KEY: "/api/google-maps-key",
    USER_INFO: "/api/user",
  },

  // Detection States
  DETECTION_STATES: {
    IDLE: "idle",
    DETECTING: "detecting",
    PROCESSING: "processing",
    ERROR: "error",
  },

  // Report Status
  REPORT_STATUS: {
    PENDING: "pending",
    IN_PROGRESS: "in_progress",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
  },

  // Storage Keys
  STORAGE_KEYS: {
    DASHBOARD_SETTINGS: "dashboard-settings",
    USER_PREFERENCES: "user-preferences",
    CACHED_LOCATION: "cached-location",
  },

  // Drawing Styles
  DRAWING: {
    BOX_COLOR: "#00FF00",
    BOX_WIDTH: 3,
    FONT: "bold 16px Arial",
    TEXT_BACKGROUND_HEIGHT: 20,
    TEXT_PADDING: 4,
  },

  // Google Maps Configuration
  MAPS: {
    DEFAULT_ZOOM: 12,
    MIN_ZOOM: 3,
    MAX_ZOOM: 21,
    MARKER_CLUSTERING_THRESHOLD: 100,
  },

  // Retry Configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY: 1000,
    BACKOFF_MULTIPLIER: 2,
  },

  // File Upload
  UPLOAD: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp"],
    QUALITY: 0.9,
  },
};

// Export individual constants for convenience
export const {
  CLASS_NAMES,
  HAZARD_TYPES,
  HAZARD_COLORS,
  MODEL,
  PERFORMANCE,
  CAMERA,
  UI,
  VALIDATION,
  API,
  DETECTION_STATES,
  REPORT_STATUS,
  STORAGE_KEYS,
  DRAWING,
  MAPS,
  RETRY,
  UPLOAD,
} = Constants;
