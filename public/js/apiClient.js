// apiClient.js
const DEFAULT_TIMEOUT = 5000;
// Always talk to the backend through the same origin proxy
// exposed by server.js under the /api/v1 prefix
let API_URL = '/api/v1';

async function loadApiConfig() {
  // Previously this function fetched remote configuration and adjusted
  // the API base URL to an external service. The server now proxies all
  // requests, so we simply ensure the base URL points to the proxy.
  try {
    await fetch('/api/config');
    console.log('🔧 API configuration loaded via proxy:', API_URL);
  } catch (error) {
    console.warn('⚠️ Failed to load API config, using proxy defaults:', error);
  }
}

async function testApiConnection() {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const res = await fetch(`${API_URL}/health`, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Hazard-Detection-Web/1.0'
      }
    });
    clearTimeout(id);
    
    if (res.ok) {
      const data = await res.json();
      console.log("✅ API service is available:", data);
      
      // Check if model is ready
      if (data.status === 'healthy') {
        if (data.model_status && data.model_status.includes('error')) {
          console.warn("⚠️ Backend model has issues:", data.model_status);
          return false;
        }
        return true;
      }
    }
    return false;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      console.log("🔄 API health check timed out");
    } else {
      console.log("🏠 API service not accessible");
    }
    return false;
  }
}

async function startApiSession() {
  try {
    const res = await fetch(`${API_URL}/session/start`, { 
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(`Failed to start session: ${errorData.detail || res.statusText}`);
    }
    
    const { session_id } = await res.json();
    console.log("✅ API session started:", session_id);
    return session_id;
  } catch (error) {
    console.error("❌ Failed to start API session:", error);
    throw error;
  }
}

async function detectWithApi(sessionId, blob) {
  try {
    const form = new FormData();
    form.append("file", blob, 'frame.jpg');
    
    const res = await fetch(`${API_URL}/detect/${sessionId}`, {
      method: "POST",
      body: form
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(`API detection failed: ${errorData.detail || res.statusText}`);
    }
    
    const result = await res.json();
    
    // Validate response structure
    if (!Array.isArray(result.detections)) {
      console.warn("⚠️ Unexpected API response format:", result);
      return { detections: [] };
    }
    
    return result;
  } catch (error) {
    console.warn("API detection failed:", error.message);
    throw error;
  }
}

async function endApiSession(sessionId) {
  try {
    const res = await fetch(`${API_URL}/session/${sessionId}/end`, { 
      method: "POST" 
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log("✅ API session ended:", data);
      return data;
    } else {
      const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      console.warn("⚠️ Session end warning:", errorData.detail);
      return { message: "Session ended with warning" };
    }
  } catch (error) {
    console.error("❌ Failed to end API session:", error);
    return { message: "Session ended with error" };
  }
}

// Export API_URL for debugging purposes
function getApiUrl() {
  return API_URL;
}

// Make functions globally available
if (typeof window !== 'undefined') {
  window.loadApiConfig = loadApiConfig;
  window.testApiConnection = testApiConnection;
  window.startApiSession = startApiSession;
  window.detectWithApi = detectWithApi;
  window.endApiSession = endApiSession;
  window.getApiUrl = getApiUrl;
}