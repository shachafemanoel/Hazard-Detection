// apiClient.js - Resilient Hazard Detection API Client
// Uses consolidated network utilities for endpoint resolution

// Internal imports (adjusted path for public directory)
import { resolveBaseUrl, withTimeout } from './network.js';
import { createRealtimeClient } from './realtime-client.js';

const DEFAULT_TIMEOUT = 30000; // 30 seconds for image processing

let baseUrl = ''; // This will be resolved dynamically
let hasInitialized = false;

// Initialize API failure tracking
let apiFailureCount = 0;
const maxRetries = 3;
const retryDelay = 1000; // 1 second

// withTimeout is now imported from network utils

/**
 * Initialize the API client with endpoint resolution
 * @param {Object} options Configuration options
 * @returns {Promise<Object>} API configuration object
 */
async function loadApiConfig(options = {}) {
  try {
    baseUrl = await resolveBaseUrl(options);
    hasInitialized = true;
    console.log('🔧 API configuration loaded with base URL:', baseUrl);
    return { baseURL: baseUrl, timeout: DEFAULT_TIMEOUT };
  } catch (error) {
    console.error('❌ Failed to load API config:', error.message);
    // Re-throw to prevent the application from starting with a broken API client
    throw error;
  }
}

/**
 * Ensure API is initialized before making requests
 */
async function ensureInitialized() {
  if (!hasInitialized) {
    await loadApiConfig();
  }
}

/**
 * Manually set the API base URL (useful for testing)
 * @param {string} url The base URL to use for API calls
 */
function setApiUrl(url) {
  baseUrl = url;
  hasInitialized = true;
}

/**
 * Health check - calls exactly /health endpoint
 */
async function checkHealth(timeoutMs = 10000) {
  await ensureInitialized();

  try {
    const res = await fetch(`${baseUrl}/health`, {
      // Use shorter timeout for quicker availability checks
      signal: withTimeout(timeoutMs),
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Hazard-Detection-API/1.0',
      },
    });

    if (!res.ok) {
      throw new Error(`Health check failed: ${res.status}`);
    }

    const data = await res.json();
    console.log('✅ API service health:', data);
    return data;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    throw new Error(`Health check failed: ${error.message}`);
  }
}

/**
 * Test API connection (backward compatibility)
 */
async function testApiConnection() {
  try {
    const health = await checkHealth();

    // Check service and model status
    if (health.status === 'healthy') {
      if (health.model_status && health.model_status.includes('error')) {
        console.warn('⚠️ Backend model has issues:', health.model_status);
        return false;
      }
      console.log('✅ API service and model ready');
      return true;
    }
    return false;
  } catch (error) {
    if (error.message.includes('timed out') || error.name === 'AbortError') {
      console.log('🔄 API health check timed out');
    } else {
      console.log('🏠 API service not accessible');
    }
    return false;
  }
}

/**
 * Start session
 */
async function startSession() {
  await ensureInitialized();

  try {
    const res = await fetch(`${baseUrl}/session/start`, {
      method: 'POST',
      headers: {
        // aligned with spec: POST /session/start has no body
        Accept: 'application/json',
        'User-Agent': 'Hazard-Detection-API/1.0',
      },
      signal: withTimeout(DEFAULT_TIMEOUT),
    });

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(
        `Failed to start session: ${errorData.detail || res.statusText}`
      );
    }

    const data = await res.json();
    if (!data.session_id) {
      throw new Error('Failed to start session: missing session_id');
    }
    console.log('✅ API session started:', data.session_id);
    return data.session_id;
  } catch (error) {
    console.error('❌ Failed to start session:', error.message);
    throw new Error(`Failed to start session: ${error.message}`);
  }
}

/**
 * Backward compatibility alias
 */
async function startApiSession() {
  return await startSession();
}

/**
 * Detect hazards with session
 */
async function detectHazards(sessionId, imageBlob) {
  await ensureInitialized();

  try {
    if (!sessionId) {
      throw new Error('Session ID is required for detection');
    }

    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Valid image blob is required');
    }

    const formData = new FormData();
    formData.append('file', imageBlob, 'frame.jpg');

    const res = await fetch(`${baseUrl}/detect/${sessionId}`, {
      method: 'POST',
      body: formData,
      headers: {
        // aligned with spec: POST /detect/{session_id}, multipart/form-data, field name "file"
        'User-Agent': 'Hazard-Detection-API/1.0',
      },
      signal: withTimeout(DEFAULT_TIMEOUT),
    });

    if (res.status === 400) {
      throw new Error('Bad Request – check file upload');
    }
    if (res.status === 404) {
      throw new Error('Endpoint Not Found');
    }
    if (res.status === 405) {
      throw new Error('Method Not Allowed');
    }
    if (!res.ok) {
      const bodyText = await res.text();
      throw new Error(`Detection failed: ${res.status} ${bodyText}`);
    }

    const result = await res.json();

    // Validate response structure
    if (!Array.isArray(result.detections)) {
      console.warn('⚠️ Unexpected API response format:', result);
      return { detections: [], new_reports: [] };
    }

    // Reset failure count on successful detection
    apiFailureCount = 0;

    console.log(
      `🔍 Detection completed: ${result.detections.length} detections found`
    );
    return result;
  } catch (error) {
    apiFailureCount++;
    console.error('❌ Detection failed:', error.message);
    throw new Error(`Detection failed: ${error.message}`);
  }
}

/**
 * Backward compatibility alias
 */
async function detectWithApi(sessionId, blob) {
  return await detectHazards(sessionId, blob);
}

/**
 * Legacy single detection (without session)
 */
async function detectSingle(imageBlob) {
  await ensureInitialized();

  try {
    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Valid image blob is required');
    }

    const formData = new FormData();
    formData.append('file', imageBlob, 'frame.jpg');

    const res = await fetch(`${baseUrl}/detect`, {
      method: 'POST',
      body: formData,
      headers: {
        'User-Agent': 'Hazard-Detection-API/1.0',
      },
      signal: withTimeout(DEFAULT_TIMEOUT),
    });

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(
        `Single detection failed: ${errorData.detail || res.statusText}`
      );
    }

    const result = await res.json();
    console.log(
      `🔍 Single detection completed: ${result.detections?.length || 0} detections found`
    );
    return result;
  } catch (error) {
    console.error('❌ Single detection failed:', error.message);
    throw new Error(`Single detection failed: ${error.message}`);
  }
}

/**
 * Batch detection
 */
async function detectBatch(imageBlobs) {
  await ensureInitialized();

  try {
    if (!Array.isArray(imageBlobs) || imageBlobs.length === 0) {
      throw new Error('Array of image blobs is required for batch detection');
    }

    const formData = new FormData();

    imageBlobs.forEach((blob, index) => {
      if (blob && blob.size > 0) {
        formData.append('files', blob, `frame_${index}.jpg`);
      }
    });

    const res = await fetch(`${baseUrl}/detect-batch`, {
      method: 'POST',
      body: formData,
      headers: {
        'User-Agent': 'Hazard-Detection-API/1.0',
      },
      signal: withTimeout(DEFAULT_TIMEOUT),
    });

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(
        `Batch detection failed: ${errorData.detail || res.statusText}`
      );
    }

    const result = await res.json();
    console.log(
      `🔍 Batch detection completed: ${result.results?.length || 0} results`
    );
    return result;
  } catch (error) {
    console.error('❌ Batch detection failed:', error.message);
    throw new Error(`Batch detection failed: ${error.message}`);
  }
}

/**
 * Save a client-side detection report to the server.
 * This function is intended for reports generated by a client-side model.
 * @param {Object} reportData The report data to save.
 * @param {string} reportData.timestamp ISO timestamp.
 * @param {Array} reportData.detections Array of detection objects.
 * @param {Blob} reportData.imageBlob The image blob of the detection.
 * @param {string} reportData.imageName The name of the image file.
 * @param {number|null} reportData.latitude
 * @param {number|null} reportData.longitude
 */
async function saveReport(reportData) {
  await ensureInitialized();

  try {
    const formData = new FormData();
    formData.append('image', reportData.imageBlob, reportData.imageName);
    formData.append('timestamp', reportData.timestamp);
    formData.append('detections', JSON.stringify(reportData.detections));
    if (reportData.latitude) formData.append('latitude', reportData.latitude);
    if (reportData.longitude) formData.append('longitude', reportData.longitude);

    const res = await fetch(`${baseUrl}/report/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'User-Agent': 'Hazard-Detection-Client/1.0',
      },
      signal: withTimeout(DEFAULT_TIMEOUT),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(`Failed to save report: ${errorData.detail || res.statusText}`);
    }

    const result = await res.json();
    console.log('✅ Report saved successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to save report:', error.message);
    throw error;
  }
}

/**
 * Get session summary
 */
async function getSessionSummary(sessionId) {
  await ensureInitialized();

  try {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const res = await fetch(`${baseUrl}/session/${sessionId}/summary`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Hazard-Detection-API/1.0',
      },
      signal: withTimeout(DEFAULT_TIMEOUT),
    });

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(
        `Failed to get session summary: ${errorData.detail || res.statusText}`
      );
    }

    const data = await res.json();
    console.log('📊 Session summary retrieved:', data);
    return data;
  } catch (error) {
    console.error('❌ Failed to get session summary:', error.message);
    throw new Error(`Failed to get session summary: ${error.message}`);
  }
}

/**
 * End session
 */
async function endSession(sessionId) {
  await ensureInitialized();

  try {
    if (!sessionId) {
      return { message: 'No active session' };
    }

    const res = await fetch(`${baseUrl}/session/${sessionId}/end`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Hazard-Detection-API/1.0',
      },
      signal: withTimeout(DEFAULT_TIMEOUT),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('✅ Session ended successfully:', data);
      return data;
    } else {
      const errorData = await res
        .json()
        .catch(() => ({ detail: `HTTP ${res.status}` }));
      console.warn('⚠️ Session end warning:', errorData.detail);
      return { message: 'Session ended with warning' };
    }
  } catch (error) {
    console.error('❌ Failed to end session:', error.message);
    return { message: 'Session ended with error' };
  }
}

/**
 * Backward compatibility alias
 */
async function endApiSession(sessionId) {
  return await endSession(sessionId);
}

/**
 * Confirm report
 */
async function confirmReport(sessionId, reportId) {
  await ensureInitialized();

  try {
    if (!sessionId || !reportId) {
      throw new Error('Session ID and Report ID are required');
    }

    const res = await fetch(
      `${baseUrl}/session/${sessionId}/report/${reportId}/confirm`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Hazard-Detection-API/1.0',
        },
        signal: withTimeout(DEFAULT_TIMEOUT),
      }
    );

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(
        `Failed to confirm report: ${errorData.detail || res.statusText}`
      );
    }

    const data = await res.json();
    console.log('✅ Report confirmed:', data);
    return data;
  } catch (error) {
    console.error('❌ Failed to confirm report:', error.message);
    throw new Error(`Failed to confirm report: ${error.message}`);
  }
}

/**
 * Dismiss report
 */
async function dismissReport(sessionId, reportId) {
  await ensureInitialized();

  try {
    if (!sessionId || !reportId) {
      throw new Error('Session ID and Report ID are required');
    }

    const res = await fetch(
      `${baseUrl}/session/${sessionId}/report/${reportId}/dismiss`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Hazard-Detection-API/1.0',
        },
        signal: withTimeout(DEFAULT_TIMEOUT),
      }
    );

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(
        `Failed to dismiss report: ${errorData.detail || res.statusText}`
      );
    }

    const data = await res.json();
    console.log('✅ Report dismissed:', data);
    return data;
  } catch (error) {
    console.error('❌ Failed to dismiss report:', error.message);
    throw new Error(`Failed to dismiss report: ${error.message}`);
  }
}

/**
 * Get original report image
 * aligned with spec: GET /session/{session_id}/report/{report_id}/image returns JPEG
 */
async function getReportImage(sessionId, reportId) {
  await ensureInitialized();

  try {
    if (!sessionId || !reportId) {
      throw new Error('Session ID and Report ID are required');
    }

    const res = await fetch(
      `${baseUrl}/session/${sessionId}/report/${reportId}/image`,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Hazard-Detection-API/1.0',
        },
        signal: withTimeout(DEFAULT_TIMEOUT),
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch report image: ${res.status}`);
    }

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('image/jpeg')) {
      throw new Error(`Unexpected content type: ${contentType}`);
    }

    return await res.arrayBuffer();
  } catch (error) {
    console.error('❌ Failed to fetch report image:', error.message);
    throw new Error(`Failed to fetch report image: ${error.message}`);
  }
}

/**
 * Get annotated model response plot
 * aligned with spec: GET /session/{session_id}/report/{report_id}/plot returns JPEG
 */
async function getReportPlot(sessionId, reportId) {
  await ensureInitialized();

  try {
    if (!sessionId || !reportId) {
      throw new Error('Session ID and Report ID are required');
    }

    const res = await fetch(
      `${baseUrl}/session/${sessionId}/report/${reportId}/plot`,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Hazard-Detection-API/1.0',
        },
        signal: withTimeout(DEFAULT_TIMEOUT),
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch report plot: ${res.status}`);
    }

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('image/jpeg')) {
      throw new Error(`Unexpected content type: ${contentType}`);
    }

    return await res.arrayBuffer();
  } catch (error) {
    console.error('❌ Failed to fetch report plot:', error.message);
    throw new Error(`Failed to fetch report plot: ${error.message}`);
  }
}

/**
 * Retry wrapper for operations
 */
async function withRetry(operation, maxRetriesToUse = maxRetries) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetriesToUse; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on client errors (4xx)
      if (error.message.includes('HTTP 4')) {
        throw error;
      }

      if (attempt === maxRetriesToUse) {
        break;
      }

      console.log(
        `⚠️ Attempt ${attempt} failed, retrying in ${retryDelay * attempt}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
    }
  }

  throw lastError;
}

/**
 * Enhanced detection with retry
 */
async function detectHazardsWithRetry(sessionId, imageBlob) {
  return withRetry(() => detectHazards(sessionId, imageBlob));
}

/**
 * Enhanced single detection with retry
 */
async function detectSingleWithRetry(imageBlob) {
  return withRetry(() => detectSingle(imageBlob));
}

/**
 * Safe detection wrapper
 */
async function safeDetection(imageBlob, useSession = true) {
  try {
    // Validate blob
    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Valid image blob is required');
    }

    // Check service health first
    const health = await checkHealth();
    if (health.status !== 'healthy') {
      throw new Error(`Service not ready: ${health.status}`);
    }

    if (useSession) {
      const sessionId = await startSession();
      const result = await detectHazardsWithRetry(sessionId, imageBlob);
      await endSession(sessionId);
      return result;
    } else {
      return await detectSingleWithRetry(imageBlob);
    }
  } catch (error) {
    console.error('🚨 Safe detection failed:', {
      error: error.message,
      timestamp: new Date().toISOString(),
    });

    // Return error in consistent format
    return {
      success: false,
      error: error.message,
      detections: [],
    };
  }
}

/**
 * Check if API is available
 */
async function isApiAvailable() {
  try {
    const health = await checkHealth();
    return health.status === 'healthy';
  } catch (error) {
    return false;
  }
}

/**
 * Export API_URL for debugging purposes
 */
function getApiUrl() {
  return baseUrl;
}

// CommonJS exports for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Core API functions
    loadApiConfig,
    checkHealth,
    testApiConnection,
    isApiAvailable,

    // Session management
    startSession,
    startApiSession, // backward compatibility
    endSession,
    endApiSession, // backward compatibility
    getSessionSummary,

    // Detection functions
    detectHazards,
    detectWithApi, // backward compatibility
    detectSingle,
    detectBatch,
    detectHazardsWithRetry,
    detectSingleWithRetry,
    safeDetection,

    // Report management
    confirmReport,
    dismissReport,

    // Utility functions
    withRetry,
    getApiUrl,
    setApiUrl,
    createRealtimeClient,

    // Failure tracking for debugging
    getApiFailureCount: () => apiFailureCount,
    resetApiFailureCount: () => {
      apiFailureCount = 0;
    },
  };
}

// Browser compatibility - expose as globals
if (typeof window !== 'undefined') {
  // Core API functions
  window.loadApiConfig = loadApiConfig;
  window.checkHealth = checkHealth;
  window.testApiConnection = testApiConnection;
  window.isApiAvailable = isApiAvailable;

  // Session management
  window.startSession = startSession;
  window.startApiSession = startApiSession; // backward compatibility
  window.endSession = endSession;
  window.endApiSession = endApiSession; // backward compatibility
  window.getSessionSummary = getSessionSummary;

  // Detection functions
  window.detectHazards = detectHazards;
  window.detectWithApi = detectWithApi; // backward compatibility
  window.detectSingle = detectSingle;
  window.detectBatch = detectBatch;
  window.detectHazardsWithRetry = detectHazardsWithRetry;
  window.detectSingleWithRetry = detectSingleWithRetry;
  window.safeDetection = safeDetection;

  // Report management
  window.confirmReport = confirmReport;
  window.dismissReport = dismissReport;
  window.getReportImage = getReportImage;
  window.getReportPlot = getReportPlot;

  // Utility functions
  window.withRetry = withRetry;
  window.getApiUrl = getApiUrl;
  window.setApiUrl = setApiUrl;
  window.createRealtimeClient = createRealtimeClient;

  // Expose failure tracking for debugging
  window.getApiFailureCount = () => apiFailureCount;
  window.resetApiFailureCount = () => {
    apiFailureCount = 0;
  };
}

// ES6 module exports
export {
  // Core API functions
  loadApiConfig,
  checkHealth,
  testApiConnection,
  isApiAvailable,

  // Session management
  startSession,
  startApiSession,
  endSession,
  endApiSession,
  getSessionSummary,

  // Detection functions
  detectHazards,
  detectWithApi,
  detectSingle,
  detectBatch,
  detectHazardsWithRetry,
  detectSingleWithRetry,
  safeDetection,

    // Report management
    confirmReport,
    dismissReport,
    getReportImage,
    getReportPlot,
    saveReport,

  // Utility functions
  withRetry,
  getApiUrl,
  setApiUrl,
  createRealtimeClient,
};
