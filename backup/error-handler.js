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
    // Check if this toast has already been shown
    if (shownToasts.has(key)) {
        return;
    }
    
    // Mark this toast as shown
    shownToasts.add(key);
    
    // Use the existing notification system if available
    if (window.notifications) {
        window.notifications.show(message, type, options);
    } else {
        // Fallback to a simple toast implementation
        showFallbackToast(message, type);
    }
    
    // Clear the key after a timeout to allow showing again later if needed
    if (options.allowRepeat !== false) {
        setTimeout(() => {
            shownToasts.delete(key);
        }, options.repeatTimeout || 300000); // 5 minutes default
    }
}

/**
 * Fallback toast implementation for when notification system is not available
 * @param {string} message - Message to display
 * @param {string} type - Toast type
 */
function showFallbackToast(message, type) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : type === 'success' ? '#22c55e' : '#3b82f6'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        z-index: 9999;
        max-width: 400px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    
    // Add slide-in animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    if (!document.head.querySelector('style[data-error-handler]')) {
        style.setAttribute('data-error-handler', 'true');
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    // Auto-remove after delay
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.transform = 'translateX(100%)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

/**
 * Reports an error with the specified error code and optional details
 * @param {string} code - Error code from ErrorCodes enum
 * @param {string|Object} detail - Additional error details (optional)
 * @param {Object} options - Additional options for error handling
 */
function reportError(code, detail = null, options = {}) {
    // Validate error code
    if (!ErrorCodes[code]) {
        console.warn(`Invalid error code: ${code}`);
        code = ErrorCodes.UNSUPPORTED;
    }
    
    const severity = ERROR_SEVERITY[code];
    const userMessage = ERROR_MESSAGES[code];
    
    // Log the error with technical details
    const errorData = {
        code,
        severity,
        message: userMessage,
        detail: detail,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
    };
    
    // Console logging based on severity
    const logMethod = severity === 'error' ? 'error' : severity === 'warning' ? 'warn' : 'info';
    console[logMethod](`[${code}] ${userMessage}`, detail ? { detail } : '');
    
    // Show user-friendly notification
    const toastKey = options.allowDuplicates ? `${code}-${Date.now()}` : code;
    toastOnce(toastKey, userMessage, severity, {
        duration: severity === 'error' ? 8000 : 5000,
        allowRepeat: options.allowRepeat,
        ...options.toastOptions
    });
    
    // Optional callback for custom error handling
    if (options.onError && typeof options.onError === 'function') {
        options.onError(errorData);
    }
    
    // Optional error tracking/analytics
    if (window.errorTracking && typeof window.errorTracking.track === 'function') {
        window.errorTracking.track(errorData);
    }
    
    return errorData;
}

/**
 * Wraps a function to catch errors and report them using the centralized system
 * @param {Function} fn - Function to wrap
 * @param {string} errorCode - Error code to use if the function throws
 * @param {Object} options - Additional options
 */
function withErrorHandling(fn, errorCode, options = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            reportError(errorCode, error.message || error, options);
            if (options.rethrow !== false) {
                throw error;
            }
            return options.fallbackValue;
        }
    };
}

/**
 * Clears the toast history (useful for testing or session reset)
 */
function clearToastHistory() {
    shownToasts.clear();
}

// Export the error handling system
window.ErrorHandler = {
    ErrorCodes,
    reportError,
    toastOnce,
    withErrorHandling,
    clearToastHistory
};

// Also export as individual functions for easier imports
window.ErrorCodes = ErrorCodes;
window.reportError = reportError;
window.toastOnce = toastOnce;

// Export for module use if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ErrorCodes,
        reportError,
        toastOnce,
        withErrorHandling,
        clearToastHistory
    };
}