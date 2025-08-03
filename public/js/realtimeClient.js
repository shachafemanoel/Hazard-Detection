// Browser-compatible realtime client for Hazard Detection API
// Provides private-first connectivity with automatic fallback

class RealtimeClient {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 5,
      backoffMs: config.backoffMs || 500,
      authToken: config.authToken,
      ...config
    };

    this.baseUrl = null;
    this.sessionId = null;
    this.status = 'disconnected';
    this.retryCount = 0;
    
    this.listeners = {
      message: [],
      error: [],
      status: [],
    };

    // Private/public endpoints
    this.endpoints = {
      private: 'http://ideal-learning.railway.internal:8080',
      public: 'https://hazard-api-production-production.up.railway.app'
    };

    // Override from environment if available (for server-side usage)
    if (typeof process !== 'undefined' && process.env) {
      this.endpoints.private = process.env.HAZARD_API_URL_PRIVATE || this.endpoints.private;
      this.endpoints.public = process.env.HAZARD_API_URL_PUBLIC || this.endpoints.public;
    }

    this._requestInterceptor = this._createRequestInterceptor();
  }

  _createRequestInterceptor() {
    return (method, url, options = {}) => {
      console.log(`🔄 ${method.toUpperCase()} ${url}`, {
        'User-Agent': options.headers?.['User-Agent'],
        'Content-Type': options.headers?.['Content-Type']?.split(';')[0]
      });
    };
  }

  setStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      console.log(`📊 Status changed: ${newStatus}`);
      this.emit('status', newStatus);
    }
  }

  emit(event, data) {
    this.listeners[event]?.forEach(cb => {
      try {
        cb(data);
      } catch (error) {
        console.error(`❌ Listener error in ${event}:`, error.message);
      }
    });
  }

  async probeHealth(baseUrl, timeout = 2000) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Hazard-Detection-Realtime/1.0'
        }
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async resolveBaseUrl() {
    // Check for configuration override
    const preference = this.config.networkPreference || 'auto';
    
    if (preference === 'private') {
      console.log('🔧 Private network forced via config');
      return this.endpoints.private;
    }
    if (preference === 'public') {
      console.log('🔧 Public network forced via config');
      return this.endpoints.public;
    }

    // Auto-selection: probe private first, then public
    if (await this.probeHealth(this.endpoints.private)) {
      console.log('🔒 Private network selected');
      return this.endpoints.private;
    }
    if (await this.probeHealth(this.endpoints.public)) {
      console.log('🌐 Public network selected');
      return this.endpoints.public;
    }
    
    throw new Error('No healthy endpoint found (private/public)');
  }

  async connect() {
    this.setStatus('connecting');
    try {
      this.baseUrl = await this.resolveBaseUrl();
      
      const headers = {
        'User-Agent': 'Hazard-Detection-Realtime/1.0',
        'Content-Type': 'application/json'
      };

      if (this.config.authToken) {
        headers['Authorization'] = `Bearer ${this.config.authToken}`;
      }

      this._requestInterceptor('POST', `${this.baseUrl}/session/start`, { headers });

      const response = await fetch(`${this.baseUrl}/session/start`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(this.config.timeout)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
        throw new Error(`Failed to start session: ${errorData.detail || response.statusText}`);
      }
      
      const data = await response.json();
      this.sessionId = data.session_id;
      this.retryCount = 0;
      this.setStatus('connected');
      
      console.log(`✅ Session started: ${this.sessionId}`);
      return true;
      
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
          'User-Agent': 'Hazard-Detection-Realtime/1.0'
        };

        if (this.config.authToken) {
          headers['Authorization'] = `Bearer ${this.config.authToken}`;
        }

        this._requestInterceptor('POST', `${this.baseUrl}/session/${this.sessionId}/end`, { headers });

        await fetch(`${this.baseUrl}/session/${this.sessionId}/end`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(5000)
        });
        
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
      const formData = new FormData();
      
      // Handle different payload types
      if (payload instanceof Blob) {
        formData.append('file', payload, 'frame.jpg');
      } else if (payload instanceof File) {
        formData.append('file', payload);
      } else if (payload.buffer && payload.filename) {
        const blob = new Blob([payload.buffer], { type: payload.contentType || 'image/jpeg' });
        formData.append('file', blob, payload.filename);
      } else if (payload instanceof HTMLCanvasElement) {
        // Convert canvas to blob
        const blob = await new Promise((resolve, reject) => {
          payload.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to convert canvas to blob'));
          }, 'image/jpeg', 0.9);
        });
        formData.append('file', blob, 'frame.jpg');
      } else {
        formData.append('file', payload, 'frame.jpg');
      }

      const headers = {
        'User-Agent': 'Hazard-Detection-Realtime/1.0'
      };

      if (this.config.authToken) {
        headers['Authorization'] = `Bearer ${this.config.authToken}`;
      }

      this._requestInterceptor('POST', `${this.baseUrl}/detect/${this.sessionId}`, { headers });

      const response = await fetch(`${this.baseUrl}/detect/${this.sessionId}`, {
        method: 'POST',
        body: formData,
        headers,
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
        throw new Error(`API detection failed: ${errorData.detail || response.statusText}`);
      }

      const result = await response.json();
      const processingTime = Date.now() - startTime;
      
      console.log(`⚡ Detection completed in ${processingTime}ms`);
      
      this.emit('message', {
        ...result,
        _metadata: {
          processingTime,
          sessionId: this.sessionId,
          timestamp: new Date().toISOString()
        }
      });
      
      this.setStatus('connected');
      this.retryCount = 0;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Detection failed after ${processingTime}ms:`, error.message);
      
      // Handle retry logic for recoverable errors
      if (this.retryCount < this.config.maxRetries && this.isRetryableError(error)) {
        this.retryCount++;
        const backoffTime = this.config.backoffMs * Math.pow(2, this.retryCount - 1);
        console.log(`🔄 Retry ${this.retryCount}/${this.config.maxRetries} in ${backoffTime}ms`);
        
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
      'ETIMEDOUT'
    ];
    
    return retryableErrors.some(keyword => 
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

// Factory function for easy usage
function createRealtimeClient(config) {
  return new RealtimeClient(config);
}

// Browser compatibility - expose as global or ES6 module
if (typeof module !== 'undefined' && module.exports) {
  // Node.js/CommonJS
  module.exports = { createRealtimeClient, RealtimeClient };
} else if (typeof window !== 'undefined') {
  // Browser global
  window.createRealtimeClient = createRealtimeClient;
  window.RealtimeClient = RealtimeClient;
}