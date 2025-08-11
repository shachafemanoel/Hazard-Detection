import { readFileSync } from 'fs';
import { normalizeDetectResponse } from '../js/adapters.js';

// Helper to load fixtures
function loadFixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
}

describe('normalizeDetectResponse', () => {
  test('should handle object-based detections and normalize to canonical shape', () => {
    const data = loadFixture('success_object.json');
    const res = normalizeDetectResponse(data);

    expect(res.detections).toHaveLength(2);

    // Check first detection
    expect(res.detections[0].box).toEqual([1, 2, 5, 6]);
    expect(res.detections[0].label).toBe('pothole'); // The adapter now correctly maps class_id 1 to 'pothole'
    expect(res.detections[0].score).toBe(0.9);

    // Check second detection
    expect(res.detections[1].box).toEqual([2, 3, 6, 8]);
    expect(res.detections[1].label).toBe('crack'); // The adapter now correctly maps class_id 0 to 'crack'
    expect(res.detections[1].score).toBe(0.8);

    expect(res.processing_time).toBe(200); // "0.2s" should be converted to 200ms
  });

  test('should handle tuple-based detections and normalize keys', () => {
    const data = loadFixture('success_yolo_array.json');
    const res = normalizeDetectResponse(data);

    expect(res.detections).toHaveLength(2);
    expect(res.detections[0].box).toEqual([1, 2, 5, 6]);
    expect(res.detections[0].label).toBe('pothole'); // has class_name
    expect(res.detections[0].score).toBe(0.75); // The fixture has a score of 0.75
  });

  test('should handle empty or missing detections array', () => {
    const data = loadFixture('empty.json');
    const res = normalizeDetectResponse(data);
    expect(res.detections).toHaveLength(0);

    const res2 = normalizeDetectResponse({});
    expect(res2.detections).toHaveLength(0);
  });

  test('should filter out detections with invalid boxes', () => {
    const data = {
      detections: [
        { box: [1, 2, 3, 4], label: 'valid', score: 0.9 },
        { box: [1, 2, 3], label: 'invalid_length', score: 0.9 },
        { box: null, label: 'invalid_null', score: 0.9 },
      ]
    };
    const res = normalizeDetectResponse(data);
    expect(res.detections).toHaveLength(1);
    expect(res.detections[0].label).toBe('valid');
  });

  test('should return zero for image size if not provided', () => {
    const data = { detections: [] };
    const res = normalizeDetectResponse(data);
    expect(res.original_image_size).toEqual({ width: 0, height: 0 });
  });

  test('should parse image size correctly', () => {
    const data = { original_image_size: { width: 640, height: 480 } };
    const res = normalizeDetectResponse(data);
    expect(res.original_image_size).toEqual({ width: 640, height: 480 });
  });
});
