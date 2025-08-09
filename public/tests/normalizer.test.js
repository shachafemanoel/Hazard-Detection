import { readFileSync } from 'fs';
import { normalizeApiResult, filterDetections } from '../js/result_normalizer.js';

function loadFixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
}

test('parses object-based detections', () => {
  const data = loadFixture('success_object.json');
  const res = normalizeApiResult(data);
  expect(res.ok).toBe(true);
  expect(res.detections).toHaveLength(2);
  expect(res.detections[0].box).toEqual({ x:1, y:2, w:4, h:4 });
});

test('parses tuple-based detections', () => {
  const data = loadFixture('success_yolo_array.json');
  const res = normalizeApiResult(data);
  expect(res.detections[0].box).toEqual({ x:1, y:2, w:4, h:4 });
  expect(res.detections[0].class_id).toBe(1);
});

test('infers success when flag missing', () => {
  const res = normalizeApiResult({ detections: [] });
  expect(res.ok).toBe(true);
});

test('parses processing_time strings and seconds', () => {
  const res1 = normalizeApiResult({ processing_time: '123ms', detections: [] });
  expect(res1.processing_time_ms).toBe(123);
  const res2 = normalizeApiResult({ processing_time: 0.5, detections: [] });
  expect(res2.processing_time_ms).toBe(500);
});

test('handles empty detections', () => {
  const data = loadFixture('empty.json');
  const res = normalizeApiResult(data);
  expect(res.detections).toHaveLength(0);
});

test('drops invalid boxes', () => {
  const res = normalizeApiResult({ detections: [{ box: [0,0,0,0], confidence:0.9 }] });
  expect(res.detections).toHaveLength(0);
});

test('applies global and per-class thresholds', () => {
  const data = loadFixture('success_object.json');
  const res = normalizeApiResult(data);
  const filtered = filterDetections(res.detections, 0.85, { pothole: 0.95 });
  expect(filtered).toHaveLength(1);
});
