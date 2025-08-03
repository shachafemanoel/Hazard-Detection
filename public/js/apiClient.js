const axios = require('axios');
const WebSocket = require('ws');

axios.interceptors.request.use(request => {
  console.log('Starting Request', JSON.stringify(request, null, 2))
  return request
})

async function probeHealth(base, timeout = 2000) {
  try {
    const res = await axios.get(base.replace(/\/+$/, '') + '/health', {
      timeout,
      validateStatus: () => true
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

async function resolveBaseUrl() {
  const priv = process.env.HAZARD_API_URL_PRIVATE || 'http://ideal-learning.railway.internal:8080';
  const pub = process.env.HAZARD_API_URL_PUBLIC || 'https://hazard-api-production-production.up.railway.app';
  const pref = process.env.HAZARD_USE_PRIVATE || 'auto';

  if (pref === 'true') return priv;
  if (pref === 'false') return pub;

  if (await probeHealth(priv)) {
    console.log('Private network selected');
    return priv;
  }
  if (await probeHealth(pub)) {
    console.log('Public network selected');
    return pub;
  }
  throw new Error('No healthy endpoint found (private/public)');
}

function toWsUrl(httpBase) {
  return httpBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}

function createRealtimeClient(config) {
  const {
    authToken,
    timeout = 30000,
    maxRetries = 5,
    backoffMs = 500,
    heartbeatMs = 0,
  } = config || {};

  let baseUrl;
  let sessionId;
  let status = 'disconnected';
  let listeners = {
    message: [],
    error: [],
    status: [],
  };

  function setStatus(newStatus) {
    status = newStatus;
    listeners.status.forEach(cb => cb(status));
  }

  async function connect() {
    setStatus('connecting');
    try {
      baseUrl = await resolveBaseUrl();
      const response = await axios.post(`${baseUrl}/session/start`);
      sessionId = response.data.session_id;
      setStatus('connected');
    } catch (error) {
      setStatus('disconnected');
      listeners.error.forEach(cb => cb(error));
    }
  }

  async function disconnect() {
    if (sessionId) {
      try {
        await axios.post(`${baseUrl}/session/${sessionId}/end`);
      } catch (error) {
        // Ignore errors on disconnect
      }
    }
    setStatus('disconnected');
  }

  async function send(payload) {
    if (status !== 'connected') {
      const error = new Error('Not connected');
      listeners.error.forEach(cb => cb(error));
      return;
    }

    setStatus('uploading');
    try {
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('file', payload);

      const response = await axios.post(
        `${baseUrl}/detect/${sessionId}`,
        formData,
        {
          headers: {
            ...formData.getHeaders()
          }
        }
      );

      listeners.message.forEach(cb => cb(response.data));
      setStatus('connected');
    } catch (error) {
      setStatus('connected');
      listeners.error.forEach(cb => cb(error));
      // Implement retry logic here
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

module.exports = {
  createRealtimeClient,
  resolveBaseUrl,
  toWsUrl
};
