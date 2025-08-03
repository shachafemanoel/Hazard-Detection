// apiClient.js - Hazard Detection API Client
// Based on Node.js Integration Guide patterns
const DEFAULT_TIMEOUT = 30000; // 30 seconds for image processing
// Use local server proxy to avoid CORS issues
let API_URL = '/api/v1';

// Initialize API failure tracking
let apiFailureCount = 0;
const maxRetries = 3;
const retryDelay = 1000; // 1 second

async function loadApiConfig() {
  // API configuration for Hazard Detection service
  // Following integration guide patterns - always use proxy endpoint
  try {
    console.log('🔧 API configuration loaded via proxy:', API_URL);
    return { baseURL: API_URL, timeout: DEFAULT_TIMEOUT };
  } catch (error) {
    console.warn('⚠️ Failed to load API config, using proxy defaults:', error);
    return { baseURL: API_URL, timeout: DEFAULT_TIMEOUT };
  }
}

// Health check - following integration guide patterns
async function checkHealth() {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const res = await fetch(`${API_URL}/health`, { 
      signal: controller.signal,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    clearTimeout(id);
    
    if (!res.ok) {
      throw new Error(`Health check failed: ${res.status}`);
    }
    
    const data = await res.json();
    console.log("✅ API service health:", data);
    return data;
  } catch (error) {
    clearTimeout(id);
    console.error("❌ Health check failed:", error.message);
    throw new Error(`Health check failed: ${error.message}`);
  }
}

// Test API connection (backward compatibility)
async function testApiConnection() {
  try {
    const health = await checkHealth();
    
    // Check service and model status
    if (health.status === 'healthy') {
      if (health.model_status && health.model_status.includes('error')) {
        console.warn("⚠️ Backend model has issues:", health.model_status);
        return false;
      }
      console.log("✅ API service and model ready");
      return true;
    }
    return false;
  } catch (error) {
    if (error.message.includes('timed out') || error.name === 'AbortError') {
      console.log("🔄 API health check timed out");
    } else {
      console.log("🏠 API service not accessible");
    }
    return false;
  }
}

// Start session - following integration guide patterns
async function startSession() {
  try {
    const res = await fetch(`${API_URL}/session/start`, { 
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Hazard-Detection-Web/1.0'
      }
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(`Failed to start session: ${errorData.detail || res.statusText}`);
    }
    
    const data = await res.json();
    console.log("✅ API session started:", data.session_id);
    return data.session_id;
  } catch (error) {
    console.error("❌ Failed to start session:", error.message);
    throw new Error(`Failed to start session: ${error.message}`);
  }
}

// Backward compatibility alias
async function startApiSession() {
  return await startSession();
}

// Detect hazards with session - following integration guide patterns
async function detectHazards(sessionId, imageBlob) {
  try {
    if (!sessionId) {
      throw new Error('Session ID is required for detection');
    }
    
    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Valid image blob is required');
    }
    
    const formData = new FormData();
    formData.append('file', imageBlob, 'frame.jpg');
    
    const res = await fetch(`${API_URL}/detect/${sessionId}`, {
      method: "POST",
      body: formData,
      headers: {
        'User-Agent': 'Hazard-Detection-Web/1.0'
      }
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(`Detection failed: ${errorData.detail || res.statusText}`);
    }
    
    const result = await res.json();
    
    // Validate response structure
    if (!Array.isArray(result.detections)) {
      console.warn("⚠️ Unexpected API response format:", result);
      return { detections: [], new_reports: [] };
    }
    
    // Reset failure count on successful detection
    apiFailureCount = 0;
    
    console.log(`🔍 Detection completed: ${result.detections.length} detections found`);
    return result;
  } catch (error) {
    apiFailureCount++;
    console.error("❌ Detection failed:", error.message);
    throw new Error(`Detection failed: ${error.message}`);
  }
}

// Backward compatibility alias
async function detectWithApi(sessionId, blob) {
  return await detectHazards(sessionId, blob);
}

// Legacy single detection (without session) - following integration guide patterns
async function detectSingle(imageBlob) {
  try {
    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Valid image blob is required');
    }
    
    const formData = new FormData();
    formData.append('file', imageBlob, 'frame.jpg');

    const res = await fetch(`${API_URL}/detect`, {
      method: "POST",
      body: formData,
      headers: {
        'User-Agent': 'Hazard-Detection-Web/1.0'
      }
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(`Single detection failed: ${errorData.detail || res.statusText}`);
    }

    const result = await res.json();
    console.log(`🔍 Single detection completed: ${result.detections?.length || 0} detections found`);
    return result;
  } catch (error) {
    console.error("❌ Single detection failed:", error.message);
    throw new Error(`Single detection failed: ${error.message}`);
  }
}

// Batch detection - following integration guide patterns
async function detectBatch(imageBlobs) {
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

    const res = await fetch(`${API_URL}/detect-batch`, {
      method: "POST",
      body: formData,
      headers: {
        'User-Agent': 'Hazard-Detection-Web/1.0'
      }
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(`Batch detection failed: ${errorData.detail || res.statusText}`);
    }

    const result = await res.json();
    console.log(`🔍 Batch detection completed: ${result.results?.length || 0} results`);
    return result;
  } catch (error) {
    console.error("❌ Batch detection failed:", error.message);
    throw new Error(`Batch detection failed: ${error.message}`);
  }
}

// Get session summary - following integration guide patterns
async function getSessionSummary(sessionId) {
  try {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    const res = await fetch(`${API_URL}/session/${sessionId}/summary`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Hazard-Detection-Web/1.0'
      }
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(`Failed to get session summary: ${errorData.detail || res.statusText}`);
    }
    
    const data = await res.json();
    console.log('📊 Session summary retrieved:', data);
    return data;
  } catch (error) {
    console.error("❌ Failed to get session summary:", error.message);
    throw new Error(`Failed to get session summary: ${error.message}`);
  }
}

// End session - following integration guide patterns
async function endSession(sessionId) {
  try {
    if (!sessionId) {
      return { message: "No active session" };
    }
    
    const res = await fetch(`${API_URL}/session/${sessionId}/end`, { 
      method: "POST",
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Hazard-Detection-Web/1.0'
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log("✅ Session ended successfully:", data);
      return data;
    } else {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      console.warn("⚠️ Session end warning:", errorData.detail);
      return { message: "Session ended with warning" };
    }
  } catch (error) {
    console.error("❌ Failed to end session:", error.message);
    return { message: "Session ended with error" };
  }
}

// Backward compatibility alias
async function endApiSession(sessionId) {
  return await endSession(sessionId);
}

// Confirm report - following integration guide patterns
async function confirmReport(sessionId, reportId) {
  try {
    if (!sessionId || !reportId) {
      throw new Error('Session ID and Report ID are required');
    }
    
    const res = await fetch(`${API_URL}/session/${sessionId}/report/${reportId}/confirm`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Hazard-Detection-Web/1.0'
      }
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(`Failed to confirm report: ${errorData.detail || res.statusText}`);
    }
    
    const data = await res.json();
    console.log('✅ Report confirmed:', data);
    return data;
  } catch (error) {
    console.error("❌ Failed to confirm report:", error.message);
    throw new Error(`Failed to confirm report: ${error.message}`);
  }
}

// Dismiss report - following integration guide patterns
async function dismissReport(sessionId, reportId) {
  try {
    if (!sessionId || !reportId) {
      throw new Error('Session ID and Report ID are required');
    }
    
    const res = await fetch(`${API_URL}/session/${sessionId}/report/${reportId}/dismiss`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Hazard-Detection-Web/1.0'
      }
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(`Failed to dismiss report: ${errorData.detail || res.statusText}`);
    }
    
    const data = await res.json();
    console.log('✅ Report dismissed:', data);
    return data;
  } catch (error) {
    console.error("❌ Failed to dismiss report:", error.message);
    throw new Error(`Failed to dismiss report: ${error.message}`);
  }
}

// Retry wrapper for operations - following integration guide patterns
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

      console.log(`⚠️ Attempt ${attempt} failed, retrying in ${retryDelay * attempt}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }
  
  throw lastError;
}

// Enhanced detection with retry - following integration guide patterns
async function detectHazardsWithRetry(sessionId, imageBlob) {
  return withRetry(() => detectHazards(sessionId, imageBlob));
}

// Enhanced single detection with retry - following integration guide patterns
async function detectSingleWithRetry(imageBlob) {
  return withRetry(() => detectSingle(imageBlob));
}

// Safe detection wrapper - following integration guide patterns
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
      timestamp: new Date().toISOString()
    });
    
    // Return error in consistent format
    return {
      success: false,
      error: error.message,
      detections: []
    };
  }
}

// Check if API is available - following integration guide patterns
async function isApiAvailable() {
  try {
    const health = await checkHealth();
    return health.status === 'healthy';
  } catch (error) {
    return false;
  }
}

// Export API_URL for debugging purposes
function getApiUrl() {
  return API_URL;
}

// Make functions globally available - following integration guide patterns
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
  
  // Utility functions
  window.withRetry = withRetry;
  window.getApiUrl = getApiUrl;
  
  // Expose failure tracking for debugging
  window.getApiFailureCount = () => apiFailureCount;
  window.resetApiFailureCount = () => { apiFailureCount = 0; };
}