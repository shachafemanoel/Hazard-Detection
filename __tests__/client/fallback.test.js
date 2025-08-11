import { jest } from '@jest/globals';

test('switchToFallback sets global flag', async () => {
  global.OffscreenCanvas = class {
    constructor() {}
    getContext() { return null; }
  };
  const { switchToFallback } = await import('../../public/js/camera_detection.js');
  window.showWarning = jest.fn();
  window.HAZARD_FALLBACK = false;
  switchToFallback('test');
  expect(window.HAZARD_FALLBACK).toBe(true);
});
