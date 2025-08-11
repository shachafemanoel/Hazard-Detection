// realtime.browser.js - Browser-compatible realtime client for Hazard Detection API
// Uses consolidated network utilities for endpoint resolution

import { resolveBaseUrl, toWsUrl } from './network.js';

class RealtimeClient {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 5,
      backoffMs: config.backoffMs || 500,
      authToken: config.authToken,
      // Enhanced stability settings
      healthCheckInterval: config.healthCheckInterval || 60000, // 60s health checks
      reconnectOnError: config.reconnectOnError !== false, // Auto-reconnect by default
      maxReconnectAttempts: config.maxReconnectAttempts || 3,
      ...config,
    };

    this.baseUrl = null;
    this.sessionId = null;
    this.status = 'disconnected';
    this.retryCount = 0;
    this.hasHadFirstError = false; // Track if we've had first connection error
    
    // Enhanced stability tracking
    this.reconnectAttempts = 0;
    this.lastSuccessfulRequest = Date.now();
    this.healthCheckTimer = null;
    this.connectionQuality = 'unknown'; // 'good', 'poor', 'unstable', 'unknown'

    this.listeners = {
      message: [],
      error: [],
      status: [],
    };

    this._requestInterceptor = this._createRequestInterceptor();
  }

  _createRequestInterceptor() {
    return (method, url, options = {}) => {
      console.log(`🔄 ${method.toUpperCase()} ${url}`, {
        'User-Agent': options.headers?.['User-Agent'],
        'Content-Type': options.headers?.['Content-Type']?.split(';')[0],
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

        const response = await fetch(`${this.baseUrl}/session/start`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(this.config.timeout),
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
        this.retryCount = 0;
        this.hasHadFirstError = false;
        this.reconnectAttempts = 0;
        this.lastSuccessfulRequest = Date.now();
        this.setStatus('connected');
        
        // Start periodic health checks
        this.startHealthChecks();

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

        await fetch(`${this.baseUrl}/session/${this.sessionId}/end`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(5000),
        });

        console.log(`✅ Session ended: ${this.sessionId}`);
      } catch (error) {
        console.warn(`⚠️ Session end warning: ${error.message}`);
      }
    }

    this.sessionId = null;
    this.baseUrl = null;
    this.stopHealthChecks();
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

      // Optimized payload handling with performance considerations
      if (payload instanceof Blob) {
        // Use existing blob directly - most efficient
        formData.append('file', payload, 'frame.jpg');
      } else if (payload instanceof File) {
        formData.append('file', payload);
      } else if (payload.buffer && payload.filename) {
        const blob = new Blob([payload.buffer], {
          type: payload.contentType || 'image/jpeg',
        });
        formData.append('file', blob, payload.filename);
      } else if (payload instanceof HTMLCanvasElement) {
        // Optimized canvas to blob conversion with adaptive quality
        const quality = this.getConnectionQuality() === 'poor' ? 0.7 : 0.85;
        const blob = await new Promise((resolve, reject) => {
          payload.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Failed to convert canvas to blob'));
            },
            'image/jpeg',
            quality
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

      // Adaptive timeout based on connection quality and payload size
      const adaptiveTimeout = this._calculateAdaptiveTimeout(formData);
      
      const response = await fetch(`${this.baseUrl}/detect/${this.sessionId}`, {
        method: 'POST',
        body: formData,
        headers,
        signal: AbortSignal.timeout(adaptiveTimeout),
        // Enable HTTP/2 multiplexing and compression if available
        keepalive: true,
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: `HTTP ${response.status}` }));
        throw new Error(
          `API detection failed: ${errorData.detail || response.statusText}`
        );
      }

      // Optimized response handling
      const result = await response.json();
      const processingTime = Date.now() - startTime;

      // Performance logging with thresholds
      if (processingTime > 2000) {
        console.warn(`⚠️ Slow detection completed in ${processingTime}ms`);
      } else if (processingTime < 100) {
        console.log(`⚡ Fast detection completed in ${processingTime}ms`);
      } else {
        console.debug(`⚡ Detection completed in ${processingTime}ms`);
      }
      
      // Validate API response structure
      if (result.success === false) {
        console.error('❌ API returned error in response:', result.error || result.detail || 'Unknown error');
      }
      
      // Optimized logging - reduced frequency for better performance
      if (Math.random() < 0.1) { // Log 10% of requests
        console.log(`📊 RealtimeClient sample:`, {
          success: result.success,
          detections_count: result.detections?.length || 0,
          processing_time_api: result.processing_time_ms,
          processing_time_client: processingTime
        });
      }

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
      this.lastSuccessfulRequest = Date.now();
      
      // Update connection quality based on response time
      this.updateConnectionQuality(processingTime);
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
  
  /**
   * Start periodic health checks to monitor connection stability
   */
  startHealthChecks() {
    this.stopHealthChecks(); // Clear any existing timer
    
    if (this.config.healthCheckInterval > 0) {
      this.healthCheckTimer = setInterval(() => {
        this.performHealthCheck();
      }, this.config.healthCheckInterval);
      
      console.log(`🏥 Health checks started (interval: ${this.config.healthCheckInterval}ms)`);
    }
  }
  
  /**
   * Stop periodic health checks
   */
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
  
  /**
   * Perform a health check to ensure connection is still alive
   */
  async performHealthCheck() {
    if (this.status !== 'connected' || !this.baseUrl) {
      return;
    }
    
    try {
      const startTime = Date.now();
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Hazard-Detection-Realtime/1.0'
        }
      });
      
      const healthTime = Date.now() - startTime;
      
      if (response.ok) {
        this.lastSuccessfulRequest = Date.now();
        this.updateConnectionQuality(healthTime);
        console.log(`🏥 Health check OK (${healthTime}ms) - ${this.connectionQuality}`);
      } else {
        console.warn(`🏥 Health check failed: ${response.status}`);
        this.handleHealthCheckFailure();
      }
    } catch (error) {
      console.warn(`🏥 Health check error: ${error.message}`);
      this.handleHealthCheckFailure();
    }
  }
  
  /**
   * Handle health check failures with potential reconnection
   */
  async handleHealthCheckFailure() {
    const timeSinceLastSuccess = Date.now() - this.lastSuccessfulRequest;
    
    if (timeSinceLastSuccess > 30000) { // 30 seconds without success
      console.warn('🔄 Connection appears stale, attempting reconnection...');
      
      if (this.config.reconnectOnError && this.reconnectAttempts < this.config.maxReconnectAttempts) {
        this.reconnectAttempts++;
        this.setStatus('reconnecting');
        
        try {
          await this.disconnect();
          await this.connect();
          console.log('✅ Reconnection successful');
        } catch (error) {
          console.error(`❌ Reconnection failed (${this.reconnectAttempts}/${this.config.maxReconnectAttempts}):`, error.message);
          this.emit('error', error);
        }
      }
    }
  }
  
  /**
   * Update connection quality based on response times with smoothing
   * @param {number} responseTime - Response time in milliseconds
   */
  updateConnectionQuality(responseTime) {
    // Use exponential moving average for smoother quality assessment
    if (!this._avgResponseTime) {
      this._avgResponseTime = responseTime;
    } else {
      this._avgResponseTime = 0.8 * this._avgResponseTime + 0.2 * responseTime;
    }
    
    let newQuality = 'good';
    
    if (this._avgResponseTime > 2500) {
      newQuality = 'poor';
    } else if (this._avgResponseTime > 1200) {
      newQuality = 'unstable';
    }
    
    if (this.connectionQuality !== newQuality) {
      this.connectionQuality = newQuality;
      console.log(`📊 Connection quality: ${newQuality} (avg: ${this._avgResponseTime.toFixed(0)}ms, current: ${responseTime}ms)`);
    }
  }
  
  /**
   * Calculate adaptive timeout based on connection quality and payload size
   * @param {FormData} formData - The payload being sent
   * @returns {number} Timeout in milliseconds
   */
  _calculateAdaptiveTimeout(formData) {
    let baseTimeout = this.config.timeout;
    
    // Adjust based on connection quality
    switch (this.connectionQuality) {
      case 'poor':
        baseTimeout *= 1.5;
        break;
      case 'unstable':
        baseTimeout *= 1.2;
        break;
      default:
        break;
    }
    
    // Estimate payload size and adjust timeout
    try {
      const file = formData.get('file');
      if (file && file.size) {
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > 1) {
          baseTimeout += sizeMB * 1000; // Add 1s per MB
        }
      }
    } catch (e) {
      // Ignore size estimation errors
    }
    
    return Math.min(baseTimeout, 15000); // Cap at 15 seconds
  }
  
  /**
   * Get current connection quality
   * @returns {string} Connection quality: 'good', 'unstable', 'poor', 'unknown'
   */
  getConnectionQuality() {
    return this.connectionQuality;
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
