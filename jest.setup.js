// Jest setup file for QA tests
// Global test configuration and utilities

// Increase timeout for E2E tests
jest.setTimeout(30000);

// Global test utilities
global.TEST_CONFIG = {
  SERVER_URL: 'http://localhost:8080',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3
};

// Console log capture for better test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

global.captureConsole = () => {
  const logs = [];
  const errors = [];
  
  console.log = (...args) => {
    logs.push(args.join(' '));
    originalConsoleLog(...args);
  };
  
  console.error = (...args) => {
    errors.push(args.join(' '));
    originalConsoleError(...args);
  };
  
  return {
    getLogs: () => logs,
    getErrors: () => errors,
    restore: () => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
    }
  };
};

// Helper to wait for conditions
global.waitForCondition = async (condition, timeout = 5000, interval = 100) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
};

// Network fetch with retry
global.fetchWithRetry = async (url, options = {}, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};