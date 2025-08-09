import fetch, { Headers, Request, Response } from 'node-fetch';
import { TextDecoder, TextEncoder } from 'util';
import { jest } from '@jest/globals';

// Test setup file for Node.js built-in test runner
// Global test configuration and utilities

global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;
global.Response = Response;
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
// global.Blob = Blob; // Ensure global Blob is from node-fetch

// Mock HTMLCanvasElement for JSDOM environment
global.HTMLCanvasElement.prototype.getContext = function () {
  return {
    clearRect: jest.fn(),
    drawImage: jest.fn(),
    getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(640 * 640 * 4) })),
    putImageData: jest.fn(),
  };
};

global.HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
  // Simulate a blob for testing purposes
  const mockBlob = new Blob(['mock image data'], { type: type || 'image/jpeg' });
  callback(mockBlob);
};

// Global test utilities
global.TEST_CONFIG = {
  SERVER_URL: 'http://localhost:3000',
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