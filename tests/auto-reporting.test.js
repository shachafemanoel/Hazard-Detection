/**
 * Unit tests for Auto-Reporting Service
 * Tests report creation from live detection events with deduplication
 */

import { jest } from '@jest/globals';

// Mock dependencies before importing the service
const mockStoreReport = jest.fn();
const mockUpdateSyncStatus = jest.fn();
const mockUploadDetection = jest.fn();
const mockCalculateIoU = jest.fn();

jest.mock('../public/js/reports-store.js', () => ({
  storeReport: mockStoreReport,
  updateSyncStatus: mockUpdateSyncStatus
}));

jest.mock('../public/js/apiClient.js', () => ({
  uploadDetection: mockUploadDetection
}));

jest.mock('../public/js/utils/coordsMap.js', () => ({
  calculateIoU: mockCalculateIoU
}));

jest.mock('../public/js/config.js', () => ({
  DETECTION_CONFIG: {
    CLASS_NAMES: ['crack', 'knocked', 'pothole', 'surface damage']
  },
  CAMERA_CONFIG: {}
}));

// Import the service after mocking
import {
  initializeAutoReporting,
  processDetectionForAutoReporting,
  setAutoReportingEnabled,
  setAutoReportingThreshold,
  getAutoReportingStats,
  clearAutoReportingSession,
  autoReportingState,
  AUTO_REPORTING_CONFIG
} from '../public/js/auto-reporting-service.js';

// Mock global objects
global.navigator = {
  geolocation: {
    getCurrentPosition: jest.fn(),
    clearWatch: jest.fn()
  }
};

global.window = {
  cameraState: { sessionId: 'test-session-123' }
};

// Mock video element
const createMockVideoElement = () => ({
  videoWidth: 1280,
  videoHeight: 720,
  width: 640,
  height: 360
});

// Mock image blob
const createMockImageBlob = () => new Blob(['fake-image'], { type: 'image/jpeg' });

// Test data
const mockDetections = [
  {
    classId: 0, // crack
    score: 0.8,
    x1: 100,
    y1: 100,
    x2: 200,
    y2: 200
  },
  {
    classId: 2, // pothole
    score: 0.75,
    x1: 300,
    y1: 150,
    x2: 400,
    y2: 250
  }
];

const mockLocation = {
  latitude: 37.7749,
  longitude: -122.4194,
  accuracy: 10
};

describe('Auto-Reporting Service', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset service state
    clearAutoReportingSession();
    setAutoReportingEnabled(true);
    
    // Mock successful store operations
    mockStoreReport.mockResolvedValue('report-123');
    mockUpdateSyncStatus.mockResolvedValue();
    mockUploadDetection.mockResolvedValue({ id: 'server-123', url: 'https://example.com/report' });
    mockCalculateIoU.mockReturnValue(0.1); // Low IoU by default
    
    // Mock geolocation
    global.navigator.geolocation.getCurrentPosition.mockImplementation((success) => {
      success({
        coords: mockLocation
      });
    });
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', async () => {
      const enabled = await initializeAutoReporting();
      
      expect(enabled).toBe(true);
      expect(autoReportingState.enabled).toBe(true);
    });

    test('should respect custom configuration', async () => {
      const customConfig = {
        enabled: false,
        minConfidence: 0.9
      };
      
      const enabled = await initializeAutoReporting(customConfig);
      
      expect(enabled).toBe(false);
      expect(AUTO_REPORTING_CONFIG.MIN_CONFIDENCE).toBe(0.9);
    });
  });

  describe('Configuration Management', () => {
    test('should enable/disable auto-reporting', () => {
      setAutoReportingEnabled(false);
      expect(autoReportingState.enabled).toBe(false);
      
      setAutoReportingEnabled(true);
      expect(autoReportingState.enabled).toBe(true);
    });

    test('should update confidence threshold', () => {
      setAutoReportingThreshold(0.85);
      expect(AUTO_REPORTING_CONFIG.MIN_CONFIDENCE).toBe(0.85);
      
      // Should clamp to valid range
      setAutoReportingThreshold(1.5);
      expect(AUTO_REPORTING_CONFIG.MIN_CONFIDENCE).toBe(1.0);
      
      setAutoReportingThreshold(-0.1);
      expect(AUTO_REPORTING_CONFIG.MIN_CONFIDENCE).toBe(0.1);
    });
  });

  describe('Detection Processing', () => {
    test('should reject low confidence detections', async () => {
      const lowConfidenceDetections = [
        { ...mockDetections[0], score: 0.3 }
      ];
      
      const result = await processDetectionForAutoReporting(
        lowConfidenceDetections,
        createMockVideoElement()
      );
      
      expect(result.processed).toBe(false);
      expect(result.reason).toBe('low_confidence');
    });

    test('should process high confidence detections through consecutive frame buffer', async () => {
      const video = createMockVideoElement();
      
      // Process same detection across multiple frames to build up consecutive count
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        const result = await processDetectionForAutoReporting(mockDetections, video);
        
        if (i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES) {
          expect(result.processed).toBe(false);
          expect(result.reason).toBe('insufficient_consecutive_frames');
        } else {
          expect(result.processed).toBe(true);
          expect(result.reportsCreated).toBeGreaterThan(0);
        }
      }
    });

    test('should create reports and store in IndexedDB', async () => {
      // Mock canvas for image capture
      const mockCanvas = document.createElement('canvas');
      mockCanvas.toBlob = jest.fn((callback) => {
        callback(createMockImageBlob());
      });
      
      global.document = {
        createElement: jest.fn(() => mockCanvas)
      };
      
      // Process enough frames to trigger report creation
      const video = createMockVideoElement();
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        await processDetectionForAutoReporting(mockDetections, video);
      }
      
      // Verify IndexedDB storage was called
      expect(mockStoreReport).toHaveBeenCalled();
      
      const storeCall = mockStoreReport.mock.calls[0][0];
      expect(storeCall.source).toBe('live');
      expect(storeCall.engine).toBe('local-onnx');
      expect(storeCall.detections).toHaveLength(2);
      expect(storeCall.metadata.autoGenerated).toBe(true);
    });

    test('should handle server upload failures gracefully', async () => {
      // Mock server upload failure
      mockUploadDetection.mockRejectedValue(new Error('Network error'));
      
      const video = createMockVideoElement();
      
      // Process frames to trigger report creation
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        await processDetectionForAutoReporting(mockDetections, video);
      }
      
      // Should still store in IndexedDB
      expect(mockStoreReport).toHaveBeenCalled();
      
      // Should mark as unsynced
      expect(mockUpdateSyncStatus).toHaveBeenCalledWith('report-123', false);
    });
  });

  describe('Burst Deduplication', () => {
    test('should deduplicate based on IoU overlap', async () => {
      // Mock high IoU overlap
      mockCalculateIoU.mockReturnValue(0.8);
      
      const video = createMockVideoElement();
      
      // First detection should create report
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        await processDetectionForAutoReporting(mockDetections, video);
      }
      
      expect(mockStoreReport).toHaveBeenCalledTimes(2); // One for each hazard type
      
      // Reset mock call count
      mockStoreReport.mockClear();
      
      // Second detection with high IoU should be deduplicated
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        const result = await processDetectionForAutoReporting(mockDetections, video);
        if (result.processed) {
          expect(result.reportsCreated).toBe(0); // Should be deduplicated
        }
      }
      
      expect(mockStoreReport).not.toHaveBeenCalled();
    });

    test('should deduplicate based on time windows', async () => {
      const video = createMockVideoElement();
      
      // First detection creates report
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        await processDetectionForAutoReporting(mockDetections, video);
      }
      
      const firstCallCount = mockStoreReport.mock.calls.length;
      mockStoreReport.mockClear();
      
      // Immediate second detection should be deduplicated by time window
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        const result = await processDetectionForAutoReporting(mockDetections, video);
        if (result.processed) {
          expect(result.reportsCreated).toBe(0);
        }
      }
      
      expect(mockStoreReport).not.toHaveBeenCalled();
    });

    test('should respect geographic deduplication radius', async () => {
      const video = createMockVideoElement();
      
      // Process first detection at location 1
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        await processDetectionForAutoReporting(mockDetections, video);
      }
      
      expect(mockStoreReport).toHaveBeenCalled();
      mockStoreReport.mockClear();
      
      // Mock nearby location (within radius)
      global.navigator.geolocation.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: {
            latitude: mockLocation.latitude + 0.00001, // Very close
            longitude: mockLocation.longitude + 0.00001,
            accuracy: 10
          }
        });
      });
      
      // Second detection at nearby location should be deduplicated
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        const result = await processDetectionForAutoReporting(mockDetections, video);
        if (result.processed) {
          expect(result.reportsCreated).toBe(0);
        }
      }
      
      expect(mockStoreReport).not.toHaveBeenCalled();
    });
  });

  describe('Report Schema and Metadata', () => {
    test('should include proper live detection metadata', async () => {
      const video = createMockVideoElement();
      
      // Process frames to create report
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        await processDetectionForAutoReporting(mockDetections, video);
      }
      
      expect(mockStoreReport).toHaveBeenCalled();
      
      const reportData = mockStoreReport.mock.calls[0][0];
      
      // Verify required schema fields
      expect(reportData.source).toBe('live');
      expect(reportData.engine).toBe('local-onnx');
      expect(reportData.detections).toBeDefined();
      expect(reportData.metadata).toBeDefined();
      
      // Verify live detection specific metadata
      expect(reportData.metadata.autoGenerated).toBe(true);
      expect(reportData.metadata.sessionId).toBe('test-session-123');
      expect(reportData.metadata.location).toEqual(mockLocation);
      expect(reportData.metadata.frameTimestamp).toBeDefined();
      expect(reportData.metadata.consecutiveFramesTotal).toBeGreaterThan(0);
    });

    test('should include detection-specific metadata', async () => {
      const video = createMockVideoElement();
      
      // Process frames to create report
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        await processDetectionForAutoReporting(mockDetections, video);
      }
      
      const reportData = mockStoreReport.mock.calls[0][0];
      const detection = reportData.detections[0];
      
      expect(detection.bbox).toEqual([100, 100, 200, 200]);
      expect(detection.class).toBe('crack');
      expect(detection.score).toBe(0.8);
      expect(detection.consecutiveFrames).toBeGreaterThan(0);
    });
  });

  describe('Statistics and Performance', () => {
    test('should track comprehensive statistics', async () => {
      const video = createMockVideoElement();
      
      // Process multiple detection cycles
      for (let cycle = 0; cycle < 2; cycle++) {
        for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
          await processDetectionForAutoReporting(mockDetections, video);
        }
        
        // Add delay between cycles to avoid time-based deduplication
        await new Promise(resolve => setTimeout(resolve, AUTO_REPORTING_CONFIG.TIME_WINDOW_MS + 100));
      }
      
      const stats = getAutoReportingStats();
      
      expect(stats.stats.totalDetections).toBeGreaterThan(0);
      expect(stats.stats.reportsCreated).toBeGreaterThan(0);
      expect(stats.sessionReportCount).toBeGreaterThan(0);
    });

    test('should respect session report limits', async () => {
      // Set low session limit for testing
      AUTO_REPORTING_CONFIG.MAX_REPORTS_PER_SESSION = 1;
      
      const video = createMockVideoElement();
      
      // First report should succeed
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        await processDetectionForAutoReporting(mockDetections, video);
      }
      
      // Reset mocks and try another report
      mockStoreReport.mockClear();
      clearAutoReportingSession(); // Reset session count
      
      // This should hit the session limit quickly
      autoReportingState.sessionReportCount = AUTO_REPORTING_CONFIG.MAX_REPORTS_PER_SESSION;
      
      const result = await processDetectionForAutoReporting(mockDetections, video);
      
      expect(result.processed).toBe(false);
      expect(result.reason).toBe('session_limit_reached');
    });
  });

  describe('Session Management', () => {
    test('should clear session state properly', () => {
      // Add some test data to state
      autoReportingState.sessionReportCount = 5;
      autoReportingState.stats.reportsCreated = 10;
      autoReportingState.reportHistory.set('test', { data: 'test' });
      autoReportingState.detectionFrameBuffer.set('test', { data: 'test' });
      
      clearAutoReportingSession();
      
      expect(autoReportingState.sessionReportCount).toBe(0);
      expect(autoReportingState.stats.reportsCreated).toBe(0);
      expect(autoReportingState.reportHistory.size).toBe(0);
      expect(autoReportingState.detectionFrameBuffer.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle IndexedDB storage failures', async () => {
      // Mock storage failure
      mockStoreReport.mockRejectedValue(new Error('IndexedDB error'));
      
      const video = createMockVideoElement();
      
      // Process frames - should handle storage failure gracefully
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        const result = await processDetectionForAutoReporting(mockDetections, video);
        
        if (result.processed !== false) {
          expect(result.processed).toBe(false);
          expect(result.reason).toBe('error');
        }
      }
      
      const stats = getAutoReportingStats();
      expect(stats.stats.reportsFailed).toBeGreaterThan(0);
    });

    test('should handle missing geolocation gracefully', async () => {
      // Mock geolocation failure
      global.navigator.geolocation.getCurrentPosition.mockImplementation((success, error) => {
        error(new Error('Location unavailable'));
      });
      
      const video = createMockVideoElement();
      
      // Should still process detections without location
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        await processDetectionForAutoReporting(mockDetections, video);
      }
      
      // Should still create reports (without location data)
      expect(mockStoreReport).toHaveBeenCalled();
      
      const reportData = mockStoreReport.mock.calls[0][0];
      expect(reportData.metadata.location).toBeNull();
    });
  });

  describe('Performance Requirements', () => {
    test('should process detections within performance targets', async () => {
      const video = createMockVideoElement();
      
      const startTime = performance.now();
      
      // Process a batch of detections
      for (let i = 0; i < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES + 1; i++) {
        await processDetectionForAutoReporting(mockDetections, video);
      }
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      // Should process quickly (under 100ms for test data)
      expect(processingTime).toBeLessThan(100);
    });

    test('should demonstrate report count increase during live detection run', async () => {
      const video = createMockVideoElement();
      const initialStats = getAutoReportingStats();
      const initialReportCount = initialStats.stats.reportsCreated;
      
      // Simulate live detection run
      for (let frame = 0; frame < AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES * 2; frame++) {
        await processDetectionForAutoReporting(mockDetections, video);
        
        // Add small delay to simulate real frame timing
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const finalStats = getAutoReportingStats();
      const finalReportCount = finalStats.stats.reportsCreated;
      
      // Verify report count increased during live detection run
      expect(finalReportCount).toBeGreaterThan(initialReportCount);
    });
  });
});