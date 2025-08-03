// realtime-client.js - Universal realtime client for Hazard Detection API
// Supports both Node.js and browser environments with network utilities

// Internal imports
import { resolveBaseUrl, toWsUrl, withTimeout } from '../utils/network.js';

// Dynamic imports for Node.js-specific modules
let axios, FormData;
if (typeof window === 'undefined') {
  // Node.js environment - external packages
  try {
    const axiosModule = await import('axios');
    const formDataModule = await import('form-data');
    axios = axiosModule.default;
    FormData = formDataModule.default;
  } catch (error) {
    console.warn('Node.js modules not available:', error.message);
  }
}

class RealtimeClient {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 5,
      backoffMs: config.backoffMs || 500,
      authToken: config.authToken,
      ...config,
    };

    this.baseUrl = null;
    this.sessionId = null;
    this.status = 'disconnected';
    this.retryCount = 0;
    this.hasHadFirstError = false;

    this.listeners = {
      message: [],
      error: [],
      status: [],
    };

    this._requestInterceptor = this._createRequestInterceptor();
  }

  _createRequestInterceptor() {
    return (method, url, options = {}) => {
      if (process.env.DEBUG_ENV === 'true') {
        console.log(`🔄 ${method.toUpperCase()} ${url}`, {
          'User-Agent': options.headers?.['User-Agent'],
          'Content-Type': options.headers?.['Content-Type']?.split(';')[0],
        });
      }
    };
  }

  setStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      if (process.env.DEBUG_ENV === 'true') {
        console.log(`📊 Status changed: ${newStatus}`);
      }
      this.emit('status', newStatus);
    }
  }

  emit(event, data) {
    this.listeners[event]?.forEach((cb) => {
      try {
        cb(data);
      } catch (error) {
        console.error(`❌ Listener error in ${event}:`, error.message);
      }
    });
  }

  /**
   * Connect to the realtime service with retry-once-on-first-failure logic
   */
  async connect() {
    this.setStatus('connecting');

    let attemptedAlternate = false;

    const tryConnect = async (usePrivate) => {
      try {
        this.baseUrl = await resolveBaseUrl({
          usePrivate: usePrivate ? 'true' : 'false',
        });

        const headers = {
          'User-Agent': 'Hazard-Detection-Realtime/1.0',
          'Content-Type': 'application/json',
        };

        if (this.config.authToken) {
          headers['Authorization'] = `Bearer ${this.config.authToken}`;
        }

        this._requestInterceptor('POST', `${this.baseUrl}/session/start`, {
          headers,
        });

        let response;
        if (typeof window === 'undefined' && axios) {
          // Node.js environment
          response = await axios.post(
            `${this.baseUrl}/session/start`,
            {},
            {
              timeout: this.config.timeout,
              headers,
            }
          );

          this.sessionId = response.data.session_id;
        } else {
          // Browser environment
          response = await fetch(`${this.baseUrl}/session/start`, {
            method: 'POST',
            headers,
            signal: withTimeout(this.config.timeout),
          });

          if (!response.ok) {
            const errorData = await response
              .json()
              .catch(() => ({ detail: `HTTP ${response.status}` }));
            throw new Error(
              `Failed to start session: ${errorData.detail || response.statusText}`
            );
          }

          const data = await response.json();
          this.sessionId = data.session_id;
        }

        this.retryCount = 0;
        this.hasHadFirstError = false;
        this.setStatus('connected');

        const networkType = this.baseUrl.includes('railway.internal')
          ? 'private'
          : 'public';
        console.log(`🎉 CONNECTED via ${networkType}`);
        console.log(`✅ Session started: ${this.sessionId}`);
        return true;
      } catch (error) {
        // If this is the first error and we haven't tried the alternate yet
        if (!this.hasHadFirstError && !attemptedAlternate) {
          this.hasHadFirstError = true;
          attemptedAlternate = true;
          console.log(
            `⚠️ First connection failed, trying alternate endpoint...`
          );
          return await tryConnect(!usePrivate); // Switch to alternate
        }

        throw error;
      }
    };

    try {
      // Start with private-first (auto resolution), then try alternate on first failure
      return await tryConnect(true);
    } catch (error) {
      this.setStatus('disconnected');
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.sessionId && this.baseUrl) {
      try {
        const headers = {
          'User-Agent': 'Hazard-Detection-Realtime/1.0',
        };

        if (this.config.authToken) {
          headers['Authorization'] = `Bearer ${this.config.authToken}`;
        }

        this._requestInterceptor(
          'POST',
          `${this.baseUrl}/session/${this.sessionId}/end`,
          { headers }
        );

        if (typeof window === 'undefined' && axios) {
          // Node.js environment
          await axios.post(
            `${this.baseUrl}/session/${this.sessionId}/end`,
            {},
            {
              timeout: 5000,
              headers,
            }
          );
        } else {
          // Browser environment
          await fetch(`${this.baseUrl}/session/${this.sessionId}/end`, {
            method: 'POST',
            headers,
            signal: withTimeout(5000),
          });
        }

        console.log(`✅ Session ended: ${this.sessionId}`);
      } catch (error) {
        console.warn(`⚠️ Session end warning: ${error.message}`);
      }
    }

    this.sessionId = null;
    this.baseUrl = null;
    this.setStatus('disconnected');
  }

  async send(payload) {
    if (this.status !== 'connected') {
      const error = new Error('Not connected');
      this.emit('error', error);
      return;
    }

    this.setStatus('uploading');
    const startTime = Date.now();

    try {
      let response;

      if (typeof window === 'undefined' && axios && FormData) {
        // Node.js environment
        const formData = new FormData();

        if (payload instanceof Buffer) {
          formData.append('file', payload, {
            filename: 'frame.jpg',
            contentType: 'image/jpeg',
          });
        } else if (payload.buffer && payload.filename) {
          formData.append('file', payload.buffer, {
            filename: payload.filename,
            contentType: payload.contentType || 'image/jpeg',
          });
        } else {
          formData.append('file', payload, 'frame.jpg');
        }

        response = await axios.post(
          `${this.baseUrl}/detect/${this.sessionId}`,
          formData,
          {
            timeout: this.config.timeout,
            headers: {
              ...formData.getHeaders(),
              'User-Agent': 'Hazard-Detection-Realtime/1.0',
              ...(this.config.authToken && {
                Authorization: `Bearer ${this.config.authToken}`,
              }),
            },
          }
        );
      } else {
        // Browser environment
        const formData = new window.FormData();

        if (payload instanceof Blob) {
          formData.append('file', payload, 'frame.jpg');
        } else if (payload instanceof File) {
          formData.append('file', payload);
        } else if (payload.buffer && payload.filename) {
          const blob = new Blob([payload.buffer], {
            type: payload.contentType || 'image/jpeg',
          });
          formData.append('file', blob, payload.filename);
        } else if (payload instanceof HTMLCanvasElement) {
          const blob = await new Promise((resolve, reject) => {
            payload.toBlob(
              (blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Failed to convert canvas to blob'));
              },
              'image/jpeg',
              0.9
            );
          });
          formData.append('file', blob, 'frame.jpg');
        } else {
          formData.append('file', payload, 'frame.jpg');
        }

        const headers = {
          'User-Agent': 'Hazard-Detection-Realtime/1.0',
        };

        if (this.config.authToken) {
          headers['Authorization'] = `Bearer ${this.config.authToken}`;
        }

        this._requestInterceptor(
          'POST',
          `${this.baseUrl}/detect/${this.sessionId}`,
          { headers }
        );

        response = await fetch(`${this.baseUrl}/detect/${this.sessionId}`, {
          method: 'POST',
          body: formData,
          headers,
          signal: withTimeout(this.config.timeout),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ detail: `HTTP ${response.status}` }));
          throw new Error(
            `API detection failed: ${errorData.detail || response.statusText}`
          );
        }

        response = await response.json();
      }

      const result = typeof window === 'undefined' ? response.data : response;
      const processingTime = Date.now() - startTime;

      console.log(`⚡ Detection completed in ${processingTime}ms`);

      this.emit('message', {
        ...result,
        _metadata: {
          processingTime,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString(),
        },
      });

      this.setStatus('connected');
      this.retryCount = 0;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(
        `❌ Detection failed after ${processingTime}ms:`,
        error.message
      );

      // Handle retry logic for recoverable errors
      if (
        this.retryCount < this.config.maxRetries &&
        this.isRetryableError(error)
      ) {
        this.retryCount++;
        const backoffTime =
          this.config.backoffMs * Math.pow(2, this.retryCount - 1);
        console.log(
          `🔄 Retry ${this.retryCount}/${this.config.maxRetries} in ${backoffTime}ms`
        );

        setTimeout(async () => {
          try {
            await this.send(payload);
          } catch (retryError) {
            this.emit('error', retryError);
          }
        }, backoffTime);
      } else {
        this.setStatus('connected');
        this.emit('error', error);
      }
    }
  }

  isRetryableError(error) {
    const retryableErrors = [
      'fetch',
      'network',
      'timeout',
      'ECONNRESET',
      'ETIMEDOUT',
    ];

    return retryableErrors.some((keyword) =>
      error.message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  onMessage(callback) {
    this.listeners.message.push(callback);
  }

  onError(callback) {
    this.listeners.error.push(callback);
  }

  onStatus(callback) {
    this.listeners.status.push(callback);
  }

  isConnected() {
    return this.status === 'connected';
  }

  getStatus() {
    return this.status;
  }

  getSessionId() {
    return this.sessionId;
  }

  getBaseUrl() {
    return this.baseUrl;
  }
}

/**
 * Factory function for easy usage
 */
function createRealtimeClient(config) {
  return new RealtimeClient(config);
}

// CommonJS exports for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createRealtimeClient, RealtimeClient };
}

// Browser compatibility - expose as global
if (typeof window !== 'undefined') {
  window.createRealtimeClient = createRealtimeClient;
  window.RealtimeClient = RealtimeClient;
}

// ES6 module exports
export { createRealtimeClient, RealtimeClient };
