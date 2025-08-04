// apiClient.js
const DEFAULT_TIMEOUT = 5000;
// Always talk to the backend through the same origin proxy
// exposed by server.js under the /api/v1 prefix
let API_URL = '/api/v1';

export async function loadApiConfig() {
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

export async function startApiSession(token = null) {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}/session/start`, { 
      method: "POST",
      headers,
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

export async function detectWithApi(sessionId, blob, token = null) {
  try {
    const form = new FormData();
    form.append("file", blob, 'frame.jpg');
    
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}/detect/${sessionId}`, {
      method: "POST",
      body: form,
      headers,
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

export async function endApiSession(sessionId, token = null) {
  try {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_URL}/session/${sessionId}/end`, { 
      method: "POST" ,
      headers,
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

// For testing purposes, allow overriding the API_URL
export function setApiUrl(url) {
    API_URL = url;
}

// --- Real-time Streaming Client ---

/**
 * Probes the health of a base URL.
 * @param {string} base - The base URL to probe.
 * @param {number} timeout - The timeout in milliseconds.
 * @returns {Promise<boolean>} - True if healthy, false otherwise.
 */
async function probeHealth(base, timeout = 2000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(`${base.replace(/\/+$/, '')}/health`, {
      signal: controller.signal,
      validateStatus: () => true,
    });
    clearTimeout(id);
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

/**
 * Resolves the base URL for the API, prioritizing the private network.
 * @returns {Promise<string>} - The resolved base URL.
 */
async function resolveBaseUrl() {
  // In a browser context, we can't directly access process.env.
  // These will be populated by the server's /api/config endpoint.
  const configRes = await fetch('/api/config');
  if (!configRes.ok) {
    throw new Error('Could not fetch API configuration from server.');
  }
  const config = await configRes.json();

  const priv = config.HAZARD_API_URL_PRIVATE;
  const pub = config.HAZARD_API_URL_PUBLIC;
  const pref = config.HAZARD_USE_PRIVATE;

  if (pref === 'true') {
    console.log('Private network forced by configuration.');
    return priv;
  }
  if (pref === 'false') {
    console.log('Public network forced by configuration.');
    return pub;
  }

  console.log('Probing private network...');
  if (await probeHealth(priv)) {
    console.log('✅ Private network is healthy. Using private URL.');
    return priv;
  }

  console.log('⚠️ Private network is not reachable. Probing public network...');
  if (await probeHealth(pub)) {
    console.log('✅ Public network is healthy. Using public URL.');
    return pub;
  }

  throw new Error('No healthy endpoint found. Both private and public URLs are unreachable.');
}

/**
 * Creates a real-time streaming client.
 * @param {object} config - The configuration for the client.
 * @returns {object} - The real-time client instance.
 */
export function createRealtimeClient(config = {}) {
  let status = 'disconnected';
  let baseUrl = '';
  let eventSource = null;
  let sessionId = null;
  let clientConfig = {};

  const statusListeners = new Set();
  const errorListeners = new Set();
  const messageListeners = new Set();

  function setStatus(newStatus) {
    if (status === newStatus) return;
    status = newStatus;
    statusListeners.forEach(cb => cb(status));
  }

  async function connect() {
    setStatus('connecting');

    // 1. Fetch configuration
    const configRes = await fetch('/api/config');
    clientConfig = await configRes.json();

    let attempts = 0;
    const maxRetries = clientConfig.REALTIME_MAX_RETRIES || 5;
    const backoff = clientConfig.REALTIME_BACKOFF_MS || 500;

    while (attempts < maxRetries) {
      try {
        // 2. Resolve base URL and start session
        baseUrl = await resolveBaseUrl();
        sessionId = await startApiSession(clientConfig.REALTIME_AUTH_TOKEN);

        // 3. Establish SSE connection
        const eventSourceUrl = `${baseUrl.replace(/\/api\/v1$/, '')}/api/events/stream`;
        eventSource = new EventSource(eventSourceUrl);

        eventSource.onopen = () => {
          setStatus('connected');
          attempts = 0; // Reset on successful connection
        };

        eventSource.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            messageListeners.forEach(cb => cb(message));
          } catch (error) {
            errorListeners.forEach(cb => cb(error));
          }
        };

        eventSource.onerror = (error) => {
          setStatus('reconnecting');
          errorListeners.forEach(cb => cb(error));
        };

        return; // Success, exit loop

      } catch (error) {
        attempts++;
        setStatus('reconnecting');
        errorListeners.forEach(cb => cb(error));
        if (attempts >= maxRetries) {
          setStatus('disconnected');
          throw new Error(`Connection failed after ${maxRetries} attempts.`);
        }
        await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, attempts)));
      }
    }
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (sessionId) {
      endApiSession(sessionId, clientConfig.REALTIME_AUTH_TOKEN);
      sessionId = null;
    }
    setStatus('disconnected');
  }

  async function send(payload) {
    if (status !== 'connected' || !sessionId) {
      throw new Error('Client is not connected.');
    }
    setStatus('uploading');
    try {
      const result = await detectWithApi(sessionId, payload, clientConfig.REALTIME_AUTH_TOKEN);
      setStatus('connected');
      return result;
    } catch (error) {
      setStatus('connected');
      errorListeners.forEach(cb => cb(error));
      throw error;
    }
  }

  function onMessage(cb) {
    messageListeners.add(cb);
  }

  function onError(cb) {
    errorListeners.add(cb);
  }

  function onStatus(cb) {
    statusListeners.add(cb);
  }

  function isConnected() {
    return status === 'connected';
  }

  return {
    connect,
    disconnect,
    send,
    onMessage,
    onError,
    onStatus,
    isConnected,
  };
}