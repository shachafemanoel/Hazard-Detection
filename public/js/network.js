// Shared network utilities for Browser and Node.js
(function(exports) {
  'use strict';

  /**
   * Probes a health endpoint to see if a service is available.
   * @param {string} base The base URL of the service.
   * @param {number} ms The timeout in milliseconds.
   * @returns {Promise<boolean>} A promise that resolves to true if healthy, false otherwise.
   */
  async function probeHealth(base, ms = 2000) {
    // Node.js's fetch needs a full URL, so handle proxy paths for browser clients
    const url = (typeof window !== 'undefined' && base.startsWith('/'))
      ? `${window.location.origin}${base}`
      : base;

    const healthUrl = `${url.replace(/\/+$/, '')}/health`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ms);

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Hazard-Detection-Health-Probe/1.0'
        }
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Resolves the base URL for the API, with a private-first strategy.
   * It probes the private URL first and falls back to the public one.
   * @param {string} [pref='auto'] - Network preference: 'auto', 'private', or 'public'.
   * @returns {Promise<string>} A promise that resolves to the best available base URL.
   * @throws {Error} If no healthy endpoint is found.
   */
  async function resolveBaseUrl(pref = 'auto') {
    // In a Node.js environment, use process.env. In browser, it will be undefined.
    const env = (typeof process !== 'undefined' && process.env) ? process.env : {};

    const privateUrl = env.HAZARD_API_URL_PRIVATE || 'http://ideal-learning.railway.internal:8080';
    const publicUrl = env.HAZARD_API_URL_PUBLIC || 'https://hazard-api-production-production.up.railway.app';

    if (pref === 'private') {
      console.log('🔧 Private network forced via config');
      return privateUrl;
    }
    if (pref === 'public') {
      console.log('🔧 Public network forced via config');
      return publicUrl;
    }

    // Auto-selection: probe private first, then public
    if (await probeHealth(privateUrl)) {
      console.log('🔒 Private network selected');
      return privateUrl;
    }
    console.warn(`⚠️ Private endpoint probe failed or timed out. Trying public.`);
    if (await probeHealth(publicUrl)) {
      console.log('🌐 Public network selected');
      return publicUrl;
    }

    throw new Error('No healthy API endpoint found. Both private and public URLs failed.');
  }

  /**
   * Converts an HTTP/HTTPS base URL to a WebSocket (WS/WSS) URL.
   * @param {string} httpBase The HTTP/HTTPS base URL.
   * @returns {string} The corresponding WS/WSS URL.
   */
  function toWsUrl(httpBase) {
    return httpBase.replace(/^http/, 'ws');
  }

  // Export for CommonJS (Node.js) or attach to a global object (Browser)
  exports.probeHealth = probeHealth;
  exports.resolveBaseUrl = resolveBaseUrl;
  exports.toWsUrl = toWsUrl;

})(typeof exports === 'undefined' ? (this.HazardNetUtils = {}) : exports);
