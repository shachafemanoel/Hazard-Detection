/**
 * Integration tests for Auto-Reporting System
 * Tests the complete flow from detection events to IndexedDB storage
 */

import { jest } from '@jest/globals';

// Mock browser APIs
global.indexedDB = {
  open: jest.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: {
      transaction: jest.fn(() => ({
        objectStore: jest.fn(() => ({
          add: jest.fn(() => ({ onsuccess: null, onerror: null })),
          get: jest.fn(() => ({ onsuccess: null, onerror: null })),
          put: jest.fn(() => ({ onsuccess: null, onerror: null }))
        }))
      }))
    }
  }))
};

global.navigator = {
  geolocation: {
    getCurrentPosition: jest.fn((success) => {
      success({
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 10
        }
      });
    }),
    watchPosition: jest.fn(),
    clearWatch: jest.fn()
  }
};

global.window = {
  cameraState: { sessionId: 'integration-test-session' },
  devicePixelRatio: 2
};

global.localStorage = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn()
};

global.performance = {
  now: jest.fn(() => Date.now())
};

// Mock successful API responses
const mockApiClient = {
  uploadDetection: jest.fn().mockResolvedValue({
    id: 'server-report-123',
    url: 'https://api.example.com/reports/123'
  })
};

jest.mock('../public/js/apiClient.js', () => mockApiClient);

// Create a more complete config mock
jest.mock('../public/js/config.js', () => ({
  DETECTION_CONFIG: {
    CLASS_NAMES: ['crack', 'knocked', 'pothole', 'surface damage'],
    MODEL_INPUT_SIZE: 640,
    CONFIDENCE_THRESHOLD: 0.5
  },
  CAMERA_CONFIG: {
    AUTO_SAVE_DEBOUNCE: 1000
  }
}));

// Import after mocking
import {
  initializeAutoReporting,
  processDetectionForAutoReporting,
  getAutoReportingStats,
  clearAutoReportingSession,
  AUTO_REPORTING_CONFIG
} from '../public/js/auto-reporting-service.js';

import { initReportsStore, getStorageStats } from '../public/js/reports-store.js';

describe('Auto-Reporting Integration Tests', () => {
  let mockVideoElement;
  
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock video element
    mockVideoElement = {
      videoWidth: 1280,
      videoHeight: 720,
      width: 640,
      height: 360
    };
    
    // Mock canvas for image capture
    const mockCanvas = {
      getContext: jest.fn(() => ({
        drawImage: jest.fn(),
        clearRect: jest.fn()
      })),
      toBlob: jest.fn((callback) => {
        const mockBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
        callback(mockBlob);
      }),
      width: 640,
      height: 360
    };
    
    global.document = {
      createElement: jest.fn(() => mockCanvas)
    };
    
    // Initialize services
    await initializeAutoReporting({
      enabled: true,
      minConfidence: 0.7
    });
    
    clearAutoReportingSession();
  });

  describe('End-to-End Detection Processing', () => {
    test('should process complete detection flow from event to storage', async () => {
      // Mock detection data representing real ONNX output
      const detectionEvents = [
        {
          classId: 0, // crack
          score: 0.85,
          x1: 120,
          y1: 150,
          x2: 220,
          y2: 250
        },
        {
          classId: 2, // pothole  
          score: 0.78,
          x1: 350,
          y1: 200,
          x2: 450,
          y2: 300
        }
      ];

      let reportCount = 0;
      
      // Simulate consecutive frame detections (required for stability)
      for (let frame = 0; frame < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 2; frame++) {
        const result = await processDetectionForAutoReporting(
          detectionEvents,
          mockVideoElement
        );
        
        if (result.processed) {
          reportCount += result.reportsCreated;
          
          // Verify result structure
          expect(result).toMatchObject({
            processed: true,
            reportsCreated: expect.any(Number),
            detectionCount: expect.any(Number),
            consecutiveFrames: expect.any(Number),
            location: expect.any(String)
          });
          
          expect(result.reportsCreated).toBeGreaterThan(0);
        }
        
        // Small delay to simulate frame timing
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Verify reports were created
      expect(reportCount).toBeGreaterThan(0);
      
      // Verify API was called
      expect(mockApiClient.uploadDetection).toHaveBeenCalled();
      
      const uploadCall = mockApiClient.uploadDetection.mock.calls[0][0];
      expect(uploadCall).toMatchObject({
        sessionId: 'integration-test-session',
        imageBlob: expect.any(Blob),
        detections: expect.arrayContaining([
          expect.objectContaining({
            bbox: expect.any(Array),
            class: expect.any(String),
            score: expect.any(Number)
          })
        ]),
        location: expect.objectContaining({
          latitude: expect.any(Number),
          longitude: expect.any(Number)
        }),
        metadata: expect.objectContaining({
          autoGenerated: true,
          detectionCount: expect.any(Number),
          sessionId: 'integration-test-session'
        })
      });
    });

    test('should handle IoU-based deduplication correctly', async () => {
      const overlappingDetections = [
        {
          classId: 0,
          score: 0.8,
          x1: 100,
          y1: 100,
          x2: 200,
          y2: 200
        },
        {
          classId: 0, // Same class
          score: 0.82,
          x1: 120, // Overlapping
          y1: 120,
          x2: 220,
          y2: 220
        }
      ];

      let totalReports = 0;
      
      // First set of detections
      for (let frame = 0; frame < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; frame++) {
        const result = await processDetectionForAutoReporting(
          [overlappingDetections[0]],
          mockVideoElement
        );
        if (result.processed) {
          totalReports += result.reportsCreated;
        }
      }
      
      // Wait to avoid time-based deduplication
      await new Promise(resolve => setTimeout(resolve, AUTO_REPORTING_CONFIG.TIME_WINDOW_MS + 100));
      
      // Second set with overlapping detection should be deduplicated by IoU
      for (let frame = 0; frame < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; frame++) {
        const result = await processDetectionForAutoReporting(
          [overlappingDetections[1]],
          mockVideoElement
        );
        if (result.processed) {
          totalReports += result.reportsCreated;
        }
      }
      
      // Should create only one report due to IoU deduplication
      expect(totalReports).toBe(1);
    });

    test('should work offline when server upload fails', async () => {
      // Mock server failure
      mockApiClient.uploadDetection.mockRejectedValueOnce(new Error('Network error'));
      
      const detectionEvents = [{
        classId: 1,
        score: 0.85,
        x1: 100,
        y1: 100,  
        x2: 200,
        y2: 200
      }];

      let offlineReportCreated = false;
      
      // Process detections
      for (let frame = 0; frame < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; frame++) {
        const result = await processDetectionForAutoReporting(
          detectionEvents,
          mockVideoElement
        );
        
        if (result.processed && result.reportsCreated > 0) {
          offlineReportCreated = true;
        }
      }
      
      // Should still create report locally even when server fails
      expect(offlineReportCreated).toBe(true);
      
      // Should still attempt server upload
      expect(mockApiClient.uploadDetection).toHaveBeenCalled();
    });
  });

  describe('Performance and Resource Management', () => {
    test('should maintain performance under high detection load', async () => {
      const highVolumeDetections = Array.from({ length: 10 }, (_, i) => ({
        classId: i % 4,
        score: 0.7 + (i * 0.01),
        x1: i * 30,
        y1: i * 30,
        x2: (i * 30) + 100,
        y2: (i * 30) + 100
      }));

      const startTime = performance.now();
      const iterations = 20;
      
      for (let i = 0; i < iterations; i++) {
        await processDetectionForAutoReporting(
          highVolumeDetections,
          mockVideoElement
        );
        
        // Brief pause to simulate real frame rate
        await new Promise(resolve => setTimeout(resolve, 16)); // ~60fps
      }
      
      const endTime = performance.now();
      const avgProcessingTime = (endTime - startTime) / iterations;
      
      // Should process efficiently (under 50ms per frame on average)
      expect(avgProcessingTime).toBeLessThan(50);
      
      // Memory management - buffers should be cleaned up
      const stats = getAutoReportingStats();
      expect(stats.stats.frameBufferSize).toBeLessThan(100); // Reasonable buffer size
    });

    test('should demonstrate report count increase during continuous detection', async () => {
      const continuousDetections = [{
        classId: 0,
        score: 0.8,
        x1: 100,
        y1: 100,
        x2: 200,
        y2: 200
      }];

      const initialStats = getAutoReportingStats();
      const initialCount = initialStats.stats.reportsCreated;
      
      // Simulate continuous detection over time with location changes
      const locations = [
        { lat: 37.7749, lon: -122.4194 },
        { lat: 37.7849, lon: -122.4094 }, // Different location
        { lat: 37.7949, lon: -122.3994 }  // Another location
      ];
      
      for (const location of locations) {
        // Mock location change
        global.navigator.geolocation.getCurrentPosition.mockImplementationOnce((success) => {
          success({
            coords: {
              latitude: location.lat,
              longitude: location.lon,
              accuracy: 10
            }
          });
        });
        
        // Process consecutive frames for each location
        for (let frame = 0; frame < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; frame++) {
          await processDetectionForAutoReporting(
            continuousDetections,
            mockVideoElement
          );
          
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Wait between location changes to avoid time-based deduplication
        await new Promise(resolve => setTimeout(resolve, AUTO_REPORTING_CONFIG.TIME_WINDOW_MS + 100));
      }
      
      const finalStats = getAutoReportingStats();
      const finalCount = finalStats.stats.reportsCreated;
      
      // Verify report count increased during live detection run
      expect(finalCount).toBeGreaterThan(initialCount);
      expect(finalCount - initialCount).toBeGreaterThanOrEqual(3); // One for each location
    });
  });

  describe('Configuration Integration', () => {
    test('should respect all configuration parameters', async () => {
      // Test with custom configuration
      const customConfig = {
        enabled: true,
        minConfidence: 0.9,
        consecutiveFrames: 5,
        iouThreshold: 0.5,
        timeWindowMs: 5000
      };
      
      // Apply custom config
      Object.assign(AUTO_REPORTING_CONFIG, customConfig);
      
      const detectionEvents = [{
        classId: 0,
        score: 0.95, // Meets high confidence threshold
        x1: 100,
        y1: 100,
        x2: 200,
        y2: 200
      }];

      let reportCreated = false;
      
      // Should require more consecutive frames now
      for (let frame = 0; frame < customConfig.consecutiveFrames + 1; frame++) {
        const result = await processDetectionForAutoReporting(
          detectionEvents,
          mockVideoElement
        );
        
        if (frame < customConfig.consecutiveFrames) {
          expect(result.reason).toBe('insufficient_consecutive_frames');
        } else if (result.processed) {
          reportCreated = true;
          expect(result.reportsCreated).toBeGreaterThan(0);
        }
      }
      
      expect(reportCreated).toBe(true);
    });

    test('should integrate with IndexedDB schema requirements', async () => {
      const detectionEvents = [{
        classId: 2,
        score: 0.8,
        x1: 150,
        y1: 150,
        x2: 250,
        y2: 250
      }];

      // Process detections
      for (let frame = 0; frame < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; frame++) {
        await processDetectionForAutoReporting(
          detectionEvents,
          mockVideoElement
        );
      }
      
      // Verify API call included all required schema fields
      expect(mockApiClient.uploadDetection).toHaveBeenCalled();
      
      const reportData = mockApiClient.uploadDetection.mock.calls[0][0];
      
      // Check schema compliance
      expect(reportData).toMatchObject({
        sessionId: expect.any(String),
        imageBlob: expect.any(Blob),
        detections: expect.arrayContaining([
          expect.objectContaining({
            bbox: expect.any(Array),
            class: expect.any(String),
            score: expect.any(Number)
          })
        ]),
        timestamp: expect.any(String),
        confidenceThreshold: expect.any(Number),
        location: expect.objectContaining({
          latitude: expect.any(Number),
          longitude: expect.any(Number),
          accuracy: expect.any(Number)
        }),
        metadata: expect.objectContaining({
          autoGenerated: true,
          sessionId: expect.any(String),
          location: expect.any(Object),
          hazardType: expect.any(String),
          confidence: expect.any(Number),
          frameTimestamp: expect.any(Number),
          detectionCount: expect.any(Number),
          boundingBoxes: expect.any(Array),
          consecutiveFramesTotal: expect.any(Number)
        })
      });
    });
  });
});