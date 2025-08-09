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
 * Calls exactly GET ${base}/health (no /api/v1 prefix)
 * @param {string} base The base URL to probe (will be cleaned of trailing slashes)
 * @param {number} timeoutMs Milliseconds to wait for a response (default: 2000)
 * @returns {Promise<boolean>} True if the endpoint is healthy (200-299), false otherwise
 */
async function probeHealth(base, timeoutMs = 2000) {
  try {
    // Clean base URL of trailing slashes and ensure /health endpoint
    const cleanBase = base.replace(/\/+$/, '');
    const healthUrl = `${cleanBase}/health`;

    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: withTimeout(timeoutMs),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Hazard-Detection-Client/1.0',
      },
    });

    // Return true for 200-299 status codes
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    // Log probe failures for debugging
    if (env.DEBUG_ENV === 'true') {
      console.warn(`⚠️ Health probe failed for ${base}:`, error.message);
    }
    return false;
  }
}

/**
 * Resolves the active base URL by probing endpoints according to configuration.
 * Priority: Local-Dev → Private-First → Public → Error
 * @param {Object} options Configuration options
 * @param {string} options.usePrivate Override for private endpoint preference ('auto', 'true', 'false')
 * @returns {Promise<string>} The healthy base URL
 * @throws {Error} If no healthy endpoint is found
 */
async function resolveBaseUrl(options = {}) {
  if (env.DEBUG_ENV === 'true') {
    console.log('🔎 Resolving API endpoint...');
  }

  // Environment variables with defaults
  const privateUrl =
    env.HAZARD_API_URL_PRIVATE ||
    'http://ideal-learning.railway.internal:8080';
  const publicUrl =
    env.HAZARD_API_URL_PUBLIC ||
    'https://hazard-api-production-production.up.railway.app';
  const localUrl = env.HAZARD_API_URL_LOCAL || 'http://localhost:8080';

  // Local-Dev Override - highest priority
  // Check if running on localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('🔧 Local development detected → skipping private network');
    
    // For local development, go straight to public API
    if (await probeHealth(publicUrl, 3000)) {
      console.log(`🌐 Local dev using public API: ${publicUrl}`);
      return publicUrl;
    }
    
    // If public API fails, try local API server
    if (await probeHealth(localUrl, 1000)) {
      console.log(`🔒 Local dev using local API: ${localUrl}`);
      return localUrl;
    }
    
    throw new Error('No API endpoint available for local development');
  }

  // Get preference from options or environment
  const usePrivate =
    options.usePrivate || env.HAZARD_USE_PRIVATE || 'auto';

  // Direct private override
  if (usePrivate === 'true') {
    if (env.DEBUG_ENV === 'true') {
      console.log(`🔒 Private network selected: ${privateUrl}`);
    }
    return privateUrl;
  }

  // Direct public override
  if (usePrivate === 'false') {
    if (env.DEBUG_ENV === 'true') {
      console.log(`🌐 Public network selected: ${publicUrl}`);
    }
    return publicUrl;
  }

  // Auto-selection: Private-First → Public → Error
  if (usePrivate === 'auto') {
    // Try private first with 2s timeout
    if (await probeHealth(privateUrl, 2000)) {
      if (env.DEBUG_ENV === 'true') {
        console.log(`🔒 Private network selected: ${privateUrl}`);
      }
      return privateUrl;
    }

    // Fallback to public
    if (await probeHealth(publicUrl, 2000)) {
      if (env.DEBUG_ENV === 'true') {
        console.log(`🌐 Public network selected: ${publicUrl}`);
      }
      return publicUrl;
    }

    // Both failed
    throw new Error('No healthy endpoint found');
  }

  throw new Error(
    `Invalid HAZARD_USE_PRIVATE value: ${usePrivate}. Must be 'auto', 'true', or 'false'`
  );
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
