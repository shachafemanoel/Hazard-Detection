function withTimeout(promise, ms, message = `Timeout after ${ms}ms`) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

module.exports = withTimeout;
