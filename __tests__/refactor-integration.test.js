import { describe, test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();

describe('Post-Refactor Integration Tests', () => {
  test('camera.html includes required scripts', async () => {
    const htmlPath = path.join(projectRoot, 'public', 'camera.html');
    const html = await fs.promises.readFile(htmlPath, 'utf8');
    assert.ok(html.includes('js/notifications.js'), 'notifications.js script missing');
    assert.ok(html.includes('js/camera_detection.js'), 'camera_detection.js script missing');
  });

  test('object detection model exists', () => {
    const modelPath = path.join(projectRoot, 'public', 'object_detection_model', 'best0608.onnx');
    assert.ok(fs.existsSync(modelPath), 'best0608.onnx model missing');
  });

  test('ONNX runtime assets present', () => {
    const ortPath = path.join(projectRoot, 'public', 'ort', 'ort.wasm.bundle.min.mjs');
    assert.ok(fs.existsSync(ortPath), 'ort.wasm.bundle.min.mjs not found');
  });
});
