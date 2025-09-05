/**
 * Centralized Error Handling System
 * Provides unified error reporting with specific error codes and toast notifications
 */

// ErrorCodes enum - defines all possible error types in the application
const ErrorCodes = Object.freeze({
  CAMERA_PERMISSION: 'CAMERA_PERMISSION',
  CAMERA_INACTIVE: 'CAMERA_INACTIVE',
  CAMERA_SWITCH: 'CAMERA_SWITCH',
  MODEL_LOAD: 'MODEL_LOAD',
  MODEL_WARMUP: 'MODEL_WARMUP',
  INFERENCE: 'INFERENCE',
  DRAW: 'DRAW',
  FILE_READ: 'FILE_READ',
  UNSUPPORTED: 'UNSUPPORTED'
});

// Error code to user-friendly message mapping
const ERROR_MESSAGES = Object.freeze({
  [ErrorCodes.CAMERA_PERMISSION]: 'Camera access denied. Please grant camera permissions and try again.',
  [ErrorCodes.CAMERA_INACTIVE]: 'Camera is not active. Please start the camera first.',
  [ErrorCodes.CAMERA_SWITCH]: 'Failed to switch camera. Please try again or restart the camera.',
  [ErrorCodes.MODEL_LOAD]: 'Failed to load AI model. Please check your connection and try again.',
  [ErrorCodes.MODEL_WARMUP]: 'AI model initialization failed. Please refresh the page.',
  [ErrorCodes.INFERENCE]: 'AI processing failed. Please try again with a different image.',
  [ErrorCodes.DRAW]: 'Failed to display detection results. Please try again.',
  [ErrorCodes.FILE_READ]: 'Failed to read file. Please check the file format and try again.',
  [ErrorCodes.UNSUPPORTED]: 'This feature is not supported on your device or browser.'
});

// Error code to severity mapping
const ERROR_SEVERITY = Object.freeze({
  [ErrorCodes.CAMERA_PERMISSION]: 'error',
  [ErrorCodes.CAMERA_INACTIVE]: 'warning',
  [ErrorCodes.CAMERA_SWITCH]: 'error',
  [ErrorCodes.MODEL_LOAD]: 'error',
  [ErrorCodes.MODEL_WARMUP]: 'error',
  [ErrorCodes.INFERENCE]: 'warning',
  [ErrorCodes.DRAW]: 'warning',
  [ErrorCodes.FILE_READ]: 'error',
  [ErrorCodes.UNSUPPORTED]: 'error'
});

// Set to track shown toast messages to prevent duplicates
const shownToasts = new Set();

/**
 * Shows a toast notification once per session to prevent spam
 * @param {string} key - Unique key for the toast message
 * @param {string} message - Message to display
 * @param {string} type - Toast type (success, error, warning, info)
 * @param {Object} options - Additional options
 */
function toastOnce(key, message, type = 'info', options = {}) {
  // Prevent duplicate toasts
  if (shownToasts.has(key)) return;
  shownToasts.add(key);

  // Use the existing notification system if available
  if (window.notifications) {
    window.notifications.show(message, type, options);
  } else {
    // Minimal inline fallback
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 9999;
      background: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : type === 'success' ? '#22c55e' : '#3b82f6'};
      color: #fff; padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.2);
      font: 14px system-ui, -apple-system, sans-serif; max-width: 380px;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), options.duration || 5000);
  }

  // Allow repeats after a delay unless explicitly disabled
  if (options.allowRepeat !== false) {
    setTimeout(() => shownToasts.delete(key), options.repeatTimeout || 300000);
  }
}

/**
 * Reports an error with the specified error code and optional details
 * @param {string} code - Error code from ErrorCodes enum
 * @param {string|Object} detail - Additional error details (optional)
 * @param {Object} options - Additional options for error handling
 */
function reportError(code, detail = null, options = {}) {
  if (!ErrorCodes[code]) {
    console.warn(`Invalid error code: ${code}`);
    code = ErrorCodes.UNSUPPORTED;
  }

  const severity = ERROR_SEVERITY[code];
  const userMessage = ERROR_MESSAGES[code];

  const errorData = {
    code,
    severity,
    message: userMessage,
    detail,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  const logMethod = severity === 'error' ? 'error' : severity === 'warning' ? 'warn' : 'info';
  console[logMethod](`[${code}] ${userMessage}`, detail ? { detail } : '');

  const toastKey = options.allowDuplicates ? `${code}-${Date.now()}` : code;
  toastOnce(toastKey, userMessage, severity, {
    duration: severity === 'error' ? 8000 : 5000,
    allowRepeat: options.allowRepeat,
    ...(options.toastOptions || {})
  });

  if (options.onError && typeof options.onError === 'function') {
    options.onError(errorData);
  }

  if (window.errorTracking && typeof window.errorTracking.track === 'function') {
    window.errorTracking.track(errorData);
  }

  return errorData;
}

/** Wrap a function to capture and report errors */
function withErrorHandling(fn, errorCode, options = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      reportError(errorCode, error?.message || error, options);
      if (options.rethrow !== false) throw error;
      return options.fallbackValue;
    }
  };
}

function clearToastHistory() { shownToasts.clear(); }

// Export to window
window.ErrorHandler = { ErrorCodes, reportError, toastOnce, withErrorHandling, clearToastHistory };
window.ErrorCodes = ErrorCodes;
window.reportError = reportError;
window.toastOnce = toastOnce;

