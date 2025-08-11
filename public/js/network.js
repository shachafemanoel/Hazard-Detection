// network.js - Consolidated networking utilities for Hazard Detection API
// Provides private-first connectivity with local-dev override

// In the browser, `process` may be undefined. Create a safe alias
// so references to environment variables don't throw errors.
const env = (typeof process !== 'undefined' && process.env) ? process.env : {};

/**
 * Cross-browser compatible timeout utility for fetch requests
 * Replaces AbortSignal.timeout which isn't supported in all browsers
 * @param {number} ms - Timeout in milliseconds
 * @returns {AbortSignal} - AbortSignal that triggers after timeout
 */
function withTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    // Use native implementation if available
    return AbortSignal.timeout(ms);
  }

  // Fallback for older browsers
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Probes a health endpoint to check if it's responsive.
 * @param {string} url The health URL to probe
 * @returns {Promise<boolean>} True if the endpoint is healthy (200-299), false otherwise
 */
async function probeHealth(url) {
  try {
    const res = await fetch(url, { method: 'GET', mode: 'cors' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolves the active base URL by probing endpoints according to configuration.
 * Priority: Proxy → Explicit endpoints → Error
 * @param {Object} options Configuration options
 * @param {string} options.usePrivate Override for private endpoint preference ('auto', 'true', 'false')
 * @returns {Promise<string>} The healthy base URL
 * @throws {Error} If no healthy endpoint is found
 */
async function resolveBaseUrl(options = {}) {
  const candidates = [
    '/api', // proxy first
    // existing explicit HTTPS endpoints if any
    localStorage.getItem('HAZARD_API_URL'),
    typeof process !== 'undefined' && process.env?.API_URL,
  ].filter(Boolean);

  for (const base of candidates) {
    if (await probeHealth(`${base.replace(/\/$/,'')}/health`).catch(() => false)) {
      return base.replace(/\/$/,'');
    }
  }
  throw new Error('No healthy endpoint found');
}

/**
 * Convert HTTP/HTTPS URL to WebSocket URL (for future WebSocket support)
 * @param {string} httpBase HTTP or HTTPS base URL
 * @returns {string} WebSocket URL (ws:// or wss://)
 */
function toWsUrl(httpBase) {
  return httpBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}

// CommonJS exports for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    withTimeout,
    probeHealth,
    resolveBaseUrl,
    toWsUrl,
  };
}

// Browser compatibility - expose as globals or ES6 exports
if (typeof window !== 'undefined') {
  window.withTimeout = withTimeout;
  window.probeHealth = probeHealth;
  window.resolveBaseUrl = resolveBaseUrl;
  window.toWsUrl = toWsUrl;
}

// ES6 module exports (for modern environments)
export { withTimeout, probeHealth, resolveBaseUrl, toWsUrl };
