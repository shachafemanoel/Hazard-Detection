// Jest setup file for test environment configuration
import 'jest-canvas-mock';

// Mock ONNX Runtime for tests
global.ort = {
  env: {
    wasm: {
      wasmPaths: '/ort/',
      simd: true,
      numThreads: 4
    },
    webgl: {
      isSupported: true
    }
  },
  InferenceSession: {
    create: jest.fn(),
  },
  Tensor: jest.fn()
};

// Mock Web APIs that are not available in Jest environment
global.MediaDevices = {
  getUserMedia: jest.fn(),
  enumerateDevices: jest.fn()
};

global.navigator = {
  ...global.navigator,
  mediaDevices: global.MediaDevices,
  geolocation: {
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn(),
    clearWatch: jest.fn()
  },
  hardwareConcurrency: 4
};

// Mock HTML5 elements
global.HTMLCanvasElement.prototype.getContext = jest.fn();
global.HTMLVideoElement.prototype.play = jest.fn();
global.HTMLVideoElement.prototype.pause = jest.fn();

// Mock FileReader
global.FileReader = class {
  constructor() {
    this.onload = null;
    this.onerror = null;
  }
  
  readAsDataURL(file) {
    setTimeout(() => {
      if (this.onload) {
        this.onload({
          target: {
            result: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='
          }
        });
      }
    }, 0);
  }
};

// Mock Image constructor
global.Image = class {
  constructor() {
    this.onload = null;
    this.onerror = null;
    this.src = '';
    this.width = 640;
    this.height = 480;
    this.naturalWidth = 640;
    this.naturalHeight = 480;
  }
  
  set src(value) {
    this._src = value;
    setTimeout(() => {
      if (this.onload) {
        this.onload();
      }
    }, 0);
  }
  
  get src() {
    return this._src;
  }
};

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock localStorage and sessionStorage
const createStorage = () => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => { store[key] = value; }),
    removeItem: jest.fn((key) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: jest.fn((index) => Object.keys(store)[index] || null)
  };
};

global.localStorage = createStorage();
global.sessionStorage = createStorage();

// Mock performance API
global.performance = {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn()
};

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => setTimeout(cb, 16));
global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));

// Mock AbortSignal
global.AbortSignal = {
  timeout: jest.fn((delay) => ({
    aborted: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }))
};

// Suppress console warnings in tests unless debugging
const originalWarn = console.warn;
const originalError = console.error;

console.warn = (...args) => {
  if (process.env.DEBUG_TESTS) {
    originalWarn(...args);
  }
};

console.error = (...args) => {
  if (process.env.DEBUG_TESTS) {
    originalError(...args);
  }
};