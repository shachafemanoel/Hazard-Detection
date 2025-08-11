import { detectSingleWithRetry, TransportError } from '../../public/js/apiClient.js';

test('apiClient exposes detectSingleWithRetry', () => {
  expect(typeof detectSingleWithRetry).toBe('function');
  expect(typeof TransportError).toBe('function');
});

test('camera_detection exports switchToFallback', async () => {
  global.OffscreenCanvas = class {
    constructor() {}
    getContext() { return null; }
  };
  const mod = await import('../../public/js/camera_detection.js');
  expect(typeof mod.switchToFallback).toBe('function');
});
