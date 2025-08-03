/**
 * Async handler wrapper for Express routes
 * Automatically catches async errors and passes them to Express error handler
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// CommonJS exports for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { asyncHandler };
}

// ES6 module exports
export { asyncHandler };