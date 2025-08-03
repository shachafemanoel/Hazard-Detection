// Enhanced apiClient.js with private-first realtime connectivity
// Backwards compatible with existing API while adding new realtime features

const DEFAULT_TIMEOUT = 5000;
let API_URL = "https://hazard-api-production-production.up.railway.app";

// Legacy API functions (maintained for backwards compatibility)
export async function loadApiConfig() {
  try {
    const res = await fetch("/api/config");
    const { apiUrl } = await res.json();
    API_URL = apiUrl.replace(/:8000$/, ""); // Remove port 8000 if present
    console.log("🔧 API configuration loaded:", { apiUrl: API_URL });
  } catch (error) {
    console.warn("⚠️ Failed to load API config, using defaults:", error);
  }
}

export async function testApiConnection() {
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

export async function startApiSession() {
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

export async function detectWithApi(sessionId, blob) {
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

export async function endApiSession(sessionId) {
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
export function getApiUrl() {
  return API_URL;
}

// NEW: Enhanced realtime client factory function
export function createRealtimeClient(config = {}) {
  // Ensure RealtimeClient is available
  if (typeof window.createRealtimeClient === 'function') {
    return window.createRealtimeClient({
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 5,
      backoffMs: config.backoffMs || 500,
      authToken: config.authToken,
      networkPreference: config.networkPreference || 'auto', // auto, private, public
      ...config
    });
  } else {
    console.error('RealtimeClient not available. Include realtimeClient.js first.');
    throw new Error('RealtimeClient not available');
  }
}

// NEW: Smart API client that automatically selects best available method
export class SmartApiClient {
  constructor(config = {}) {
    this.config = config;
    this.realtimeClient = null;
    this.fallbackToLegacy = false;
    this.sessionId = null;
  }

  async initialize() {
    try {
      // Try to create realtime client first
      this.realtimeClient = createRealtimeClient(this.config);
      await this.realtimeClient.connect();
      console.log('🚀 Smart API Client: Using enhanced realtime client');
      return 'realtime';
    } catch (error) {
      console.warn('⚠️ Realtime client failed, falling back to legacy API:', error.message);
      this.fallbackToLegacy = true;
      
      // Fallback to legacy session-based API
      try {
        await loadApiConfig();
        const isHealthy = await testApiConnection();
        if (isHealthy) {
          this.sessionId = await startApiSession();
          console.log('🔄 Smart API Client: Using legacy session API');
          return 'legacy';
        }
      } catch (legacyError) {
        console.error('❌ Legacy API also failed:', legacyError.message);
        throw new Error('No API methods available');
      }
    }
  }

  async detect(payload) {
    if (this.realtimeClient && !this.fallbackToLegacy) {
      // Use realtime client
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Detection timeout'));
        }, this.config.timeout || 30000);

        this.realtimeClient.onMessage((result) => {
          clearTimeout(timeout);
          resolve(result);
        });

        this.realtimeClient.onError((error) => {
          clearTimeout(timeout);
          reject(error);
        });

        this.realtimeClient.send(payload);
      });
    } else if (this.sessionId) {
      // Use legacy API
      return await detectWithApi(this.sessionId, payload);
    } else {
      throw new Error('No active connection available');
    }
  }

  async disconnect() {
    if (this.realtimeClient && !this.fallbackToLegacy) {
      await this.realtimeClient.disconnect();
    } else if (this.sessionId) {
      await endApiSession(this.sessionId);
      this.sessionId = null;
    }
  }

  onMessage(callback) {
    if (this.realtimeClient && !this.fallbackToLegacy) {
      this.realtimeClient.onMessage(callback);
    }
  }

  onError(callback) {
    if (this.realtimeClient && !this.fallbackToLegacy) {
      this.realtimeClient.onError(callback);
    }
  }

  onStatus(callback) {
    if (this.realtimeClient && !this.fallbackToLegacy) {
      this.realtimeClient.onStatus(callback);
    }
  }

  isConnected() {
    if (this.realtimeClient && !this.fallbackToLegacy) {
      return this.realtimeClient.isConnected();
    }
    return !!this.sessionId;
  }

  getStatus() {
    if (this.realtimeClient && !this.fallbackToLegacy) {
      return this.realtimeClient.getStatus();
    }
    return this.sessionId ? 'connected' : 'disconnected';
  }
}

// NEW: Easy-to-use smart client factory
export function createSmartApiClient(config = {}) {
  return new SmartApiClient(config);
}
