const axios = require('axios');
const FormData = require('form-data');

// Configure axios with request interceptor for debugging
axios.interceptors.request.use(request => {
  const { method, url, headers } = request;
  console.log(`🔄 ${method?.toUpperCase()} ${url}`, { 
    'User-Agent': headers?.['User-Agent'],
    'Content-Type': headers?.['Content-Type']?.split(';')[0] // Don't log boundary
  });
  return request;
});

/**
 * Probe health endpoint with timeout
 */
async function probeHealth(base, timeout = 2000) {
  try {
    const res = await axios.get(base.replace(/\/+$/, '') + '/health', {
      timeout,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Hazard-Detection-Realtime/1.0'
      }
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

/**
 * Resolve base URL with private-first connectivity
 */
async function resolveBaseUrl() {
  const priv = process.env.HAZARD_API_URL_PRIVATE || 'http://ideal-learning.railway.internal:8080';
  const pub = process.env.HAZARD_API_URL_PUBLIC || 'https://hazard-api-production-production.up.railway.app';
  const pref = process.env.HAZARD_USE_PRIVATE || 'auto';

  if (pref === 'true') {
    console.log('🔧 Private network forced via config');
    return priv;
  }
  if (pref === 'false') {
    console.log('🔧 Public network forced via config');
    return pub;
  }

  // Auto-selection: probe private first, then public
  if (await probeHealth(priv)) {
    console.log('🔒 Private network selected');
    return priv;
  }
  if (await probeHealth(pub)) {
    console.log('🌐 Public network selected');
    return pub;
  }
  throw new Error('No healthy endpoint found (private/public)');
}

/**
 * Convert HTTP URL to WebSocket URL (for future WebSocket support)
 */
function toWsUrl(httpBase) {
  return httpBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}

/**
 * Create a realtime client for hazard detection
 */
function createRealtimeClient(config) {
  const {
    authToken,
    timeout = parseInt(process.env.REALTIME_TIMEOUT_MS) || 30000,
    maxRetries = parseInt(process.env.REALTIME_MAX_RETRIES) || 5,
    backoffMs = parseInt(process.env.REALTIME_BACKOFF_MS) || 500,
    heartbeatMs = parseInt(process.env.REALTIME_HEARTBEAT_MS) || 0,
  } = config || {};

  let baseUrl;
  let sessionId;
  let status = 'disconnected';
  let retryCount = 0;
  let listeners = {
    message: [],
    error: [],
    status: [],
  };

  function setStatus(newStatus) {
    if (status !== newStatus) {
      status = newStatus;
      console.log(`📊 Status changed: ${newStatus}`);
      listeners.status.forEach(cb => cb(status));
    }
  }

  function emit(event, data) {
    listeners[event]?.forEach(cb => {
      try {
        cb(data);
      } catch (error) {
        console.error(`❌ Listener error in ${event}:`, error.message);
      }
    });
  }

  async function connect() {
    setStatus('connecting');
    try {
      baseUrl = await resolveBaseUrl();
      
      const response = await axios.post(`${baseUrl}/session/start`, {}, {
        timeout,
        headers: {
          'User-Agent': 'Hazard-Detection-Realtime/1.0',
          'Content-Type': 'application/json',
          ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        }
      });
      
      sessionId = response.data.session_id;
      retryCount = 0;
      setStatus('connected');
      
      console.log(`✅ Session started: ${sessionId}`);
      
    } catch (error) {
      setStatus('disconnected');
      emit('error', error);
      throw error;
    }
  }

  async function disconnect() {
    if (sessionId && baseUrl) {
      try {
        await axios.post(`${baseUrl}/session/${sessionId}/end`, {}, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Hazard-Detection-Realtime/1.0',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` })
          }
        });
        console.log(`✅ Session ended: ${sessionId}`);
      } catch (error) {
        console.warn(`⚠️ Session end warning: ${error.message}`);
      }
    }
    sessionId = null;
    baseUrl = null;
    setStatus('disconnected');
  }

  async function send(payload) {
    if (status !== 'connected') {
      const error = new Error('Not connected');
      emit('error', error);
      return;
    }

    setStatus('uploading');
    const startTime = Date.now();
    
    try {
      const formData = new FormData();
      
      // Handle different payload types
      if (payload instanceof Buffer) {
        formData.append('file', payload, {
          filename: 'frame.jpg',
          contentType: 'image/jpeg'
        });
      } else if (payload.buffer && payload.filename) {
        formData.append('file', payload.buffer, {
          filename: payload.filename,
          contentType: payload.contentType || 'image/jpeg'
        });
      } else {
        formData.append('file', payload, 'frame.jpg');
      }

      const response = await axios.post(
        `${baseUrl}/detect/${sessionId}`,
        formData,
        {
          timeout,
          headers: {
            ...formData.getHeaders(),
            'User-Agent': 'Hazard-Detection-Realtime/1.0',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` })
          }
        }
      );

      const processingTime = Date.now() - startTime;
      console.log(`⚡ Detection completed in ${processingTime}ms`);
      
      emit('message', {
        ...response.data,
        _metadata: {
          processingTime,
          sessionId,
          timestamp: new Date().toISOString()
        }
      });
      
      setStatus('connected');
      retryCount = 0;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Detection failed after ${processingTime}ms:`, error.message);
      
      // Handle retry logic
      if (retryCount < maxRetries && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
        retryCount++;
        console.log(`🔄 Retry ${retryCount}/${maxRetries} in ${backoffMs}ms`);
        
        setTimeout(async () => {
          try {
            await send(payload);
          } catch (retryError) {
            emit('error', retryError);
          }
        }, backoffMs * retryCount);
        
      } else {
        setStatus('connected');
        emit('error', error);
      }
    }
  }

  function onMessage(cb) {
    listeners.message.push(cb);
  }

  function onError(cb) {
    listeners.error.push(cb);
  }

  function onStatus(cb) {
    listeners.status.push(cb);
  }

  function isConnected() {
    return status === 'connected';
  }

  function getStatus() {
    return status;
  }

  function getSessionId() {
    return sessionId;
  }

  function getBaseUrl() {
    return baseUrl;
  }

  return {
    connect,
    disconnect,
    send,
    onMessage,
    onError,
    onStatus,
    isConnected,
    getStatus,
    getSessionId,
    getBaseUrl,
  };
}

module.exports = {
  createRealtimeClient,
  resolveBaseUrl,
  toWsUrl,
  probeHealth
};