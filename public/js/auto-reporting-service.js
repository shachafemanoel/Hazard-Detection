/**
 * Auto-Reporting Service
 * Automatically creates reports from live camera detections with intelligent deduplication
 * Integrates with the existing reports API and geolocation services
 */

import { DETECTION_CONFIG, CAMERA_CONFIG } from './config.js';
import { uploadDetection } from './apiClient.js';
import { calculateIoU } from './utils/coordsMap.js';
import { storeReport, updateSyncStatus } from './reports-store.js';

// Auto-reporting configuration
export const AUTO_REPORTING_CONFIG = {
  ENABLED: true,                           // Default enabled state
  MIN_CONFIDENCE: 0.7,                     // Only auto-report high confidence detections
  CONSECUTIVE_FRAMES: 3,                   // Require N consecutive frames before reporting
  DEDUPLICATION_RADIUS_METERS: 10,         // Don't create reports for hazards within 10m
  DEDUPLICATION_TIME_MINUTES: 5,           // Don't create reports for same area within 5 minutes
  IOU_THRESHOLD: 0.3,                      // IoU threshold for duplicate detection
  TIME_WINDOW_MS: 2000,                    // Time window for burst deduplication
  MAX_REPORTS_PER_SESSION: 50,             // Limit reports per session to prevent spam
  BATCH_SIZE: 3,                           // Process detections in small batches
  LOCATION_TIMEOUT_MS: 5000,               // Timeout for GPS acquisition
  IMAGE_QUALITY: 0.8,                      // JPEG quality for captured images
  RETRY_ATTEMPTS: 2,                       // Number of retry attempts for failed uploads
  DEBOUNCE_MS: 2000                        // Debounce rapid detections
};

// Global state for auto-reporting
let autoReportingState = {
  enabled: AUTO_REPORTING_CONFIG.ENABLED,
  currentLocation: null,
  lastLocationUpdate: 0,
  reportHistory: new Map(),                // Track reports by location/type
  detectionFrameBuffer: new Map(),         // Buffer for consecutive frame detection
  pendingReports: [],
  sessionReportCount: 0,
  lastReportTime: 0,
  isProcessing: false,
  stats: {
    totalDetections: 0,
    reportsCreated: 0,
    reportsDeduplicated: 0,
    reportsQueued: 0,
    reportsFailed: 0,
    frameBufferSize: 0,
    consecutiveDetections: 0
  }
};

// Geolocation cache and permissions
let geolocationWatcher = null;
let locationPermissionGranted = false;

/**
 * Initialize auto-reporting service
 * @param {Object} options - Configuration options
 */
export async function initializeAutoReporting(options = {}) {
  console.log('🚀 Initializing auto-reporting service...');
  
  // Merge user options with defaults
  Object.assign(AUTO_REPORTING_CONFIG, options);
  autoReportingState.enabled = AUTO_REPORTING_CONFIG.ENABLED;
  
  // Initialize geolocation if available
  await initializeGeolocation();
  
  // Load user preferences from localStorage
  loadUserPreferences();
  
  console.log('✅ Auto-reporting service initialized', {
    enabled: autoReportingState.enabled,
    locationAvailable: !!autoReportingState.currentLocation,
    minConfidence: AUTO_REPORTING_CONFIG.MIN_CONFIDENCE
  });
  
  return autoReportingState.enabled;
}

/**
 * Initialize geolocation services
 */
async function initializeGeolocation() {
  if (!navigator.geolocation) {
    console.warn('⚠️ Geolocation not supported');
    return false;
  }
  
  try {
    // Request permission and get initial position
    const position = await getCurrentLocationPromise();
    autoReportingState.currentLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: Date.now()
    };
    autoReportingState.lastLocationUpdate = Date.now();
    locationPermissionGranted = true;
    
    // Start watching location changes
    startLocationWatcher();
    
    console.log('📍 Geolocation initialized:', {
      lat: autoReportingState.currentLocation.latitude.toFixed(6),
      lon: autoReportingState.currentLocation.longitude.toFixed(6),
      accuracy: Math.round(autoReportingState.currentLocation.accuracy)
    });
    
    return true;
  } catch (error) {
    console.warn('⚠️ Geolocation permission denied or unavailable:', error.message);
    return false;
  }
}

/**
 * Start watching location changes for better accuracy
 */
function startLocationWatcher() {
  if (geolocationWatcher) {
    navigator.geolocation.clearWatch(geolocationWatcher);
  }
  
  geolocationWatcher = navigator.geolocation.watchPosition(
    (position) => {
      const newLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: Date.now()
      };
      
      // Only update if accuracy is better or location has changed significantly
      if (!autoReportingState.currentLocation || 
          newLocation.accuracy < autoReportingState.currentLocation.accuracy ||
          calculateDistance(autoReportingState.currentLocation, newLocation) > 5) {
        autoReportingState.currentLocation = newLocation;
        autoReportingState.lastLocationUpdate = Date.now();
        console.log('📍 Location updated:', {
          lat: newLocation.latitude.toFixed(6),
          lon: newLocation.longitude.toFixed(6),
          accuracy: Math.round(newLocation.accuracy)
        });
      }
    },
    (error) => {
      console.warn('⚠️ Location watch error:', error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

/**
 * Process detection for potential auto-reporting with enhanced burst deduplication
 * @param {Array} detections - Array of detection objects from ONNX model
 * @param {HTMLVideoElement} videoElement - Video element for image capture
 * @returns {Promise<Object>} Processing results
 */
export async function processDetectionForAutoReporting(detections, videoElement) {
  if (!autoReportingState.enabled || autoReportingState.isProcessing) {
    return { processed: false, reason: 'disabled_or_busy' };
  }
  
  // Update statistics
  autoReportingState.stats.totalDetections++;
  
  // Filter high-confidence detections
  const highConfidenceDetections = detections.filter(det => 
    det.score >= AUTO_REPORTING_CONFIG.MIN_CONFIDENCE
  );
  
  if (highConfidenceDetections.length === 0) {
    // Clean up frame buffer for detections that didn't meet confidence threshold
    cleanupFrameBuffer();
    return { processed: false, reason: 'low_confidence' };
  }
  
  // Check session limits
  if (autoReportingState.sessionReportCount >= AUTO_REPORTING_CONFIG.MAX_REPORTS_PER_SESSION) {
    return { processed: false, reason: 'session_limit_reached' };
  }
  
  const now = Date.now();
  
  try {
    autoReportingState.isProcessing = true;
    
    // Get current location (with timeout)
    const currentLocation = await getCurrentLocationWithTimeout();
    if (!currentLocation) {
      console.warn('⚠️ Auto-reporting: Location unavailable');
    }
    
    // Process detections through consecutive frame buffer and IoU deduplication
    const qualifyingDetections = await processConsecutiveFrameDetection(
      highConfidenceDetections, 
      currentLocation,
      now
    );
    
    if (qualifyingDetections.length === 0) {
      return { processed: false, reason: 'insufficient_consecutive_frames' };
    }
    
    // Apply burst deduplication using time windows and IoU overlap
    const deduplicatedDetections = await applyBurstDeduplication(
      qualifyingDetections, 
      currentLocation, 
      now
    );
    
    autoReportingState.stats.reportsDeduplicated += (qualifyingDetections.length - deduplicatedDetections.length);
    
    if (deduplicatedDetections.length === 0) {
      return { processed: false, reason: 'all_duplicates_after_deduplication' };
    }
    
    // Capture image from video stream
    const capturedImage = await captureDetectionImage(videoElement, detections);
    
    // Create auto-reports and store in IndexedDB
    const reports = await createAutoReportsWithStorage(deduplicatedDetections, capturedImage, currentLocation);
    
    autoReportingState.lastReportTime = now;
    autoReportingState.sessionReportCount += reports.length;
    autoReportingState.stats.reportsCreated += reports.length;
    
    return {
      processed: true,
      reportsCreated: reports.length,
      detectionCount: deduplicatedDetections.length,
      consecutiveFrames: autoReportingState.stats.consecutiveDetections,
      location: currentLocation ? `${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}` : 'unavailable'
    };
    
  } catch (error) {
    console.error('❌ Auto-reporting processing error:', error);
    autoReportingState.stats.reportsFailed++;
    return { processed: false, reason: 'error', error: error.message };
  } finally {
    autoReportingState.isProcessing = false;
  }
}

/**
 * Process consecutive frame detection to ensure stability
 * @param {Array} detections - High confidence detections
 * @param {Object} location - Current location
 * @param {number} timestamp - Current timestamp
 * @returns {Promise<Array>} Qualifying detections after consecutive frame analysis
 */
async function processConsecutiveFrameDetection(detections, location, timestamp) {
  const qualifyingDetections = [];
  
  // Clean up old entries from frame buffer (older than time window)
  const cutoffTime = timestamp - AUTO_REPORTING_CONFIG.TIME_WINDOW_MS;
  for (const [key, frameData] of autoReportingState.detectionFrameBuffer) {
    if (frameData.timestamps[0] < cutoffTime) {
      autoReportingState.detectionFrameBuffer.delete(key);
    }
  }
  
  // Process each detection
  for (const detection of detections) {
    const hazardType = getHazardTypeFromClassId(detection.classId);
    const detectionKey = generateDetectionKey(detection, hazardType, location);
    
    // Get or create frame data for this detection
    let frameData = autoReportingState.detectionFrameBuffer.get(detectionKey);
    if (!frameData) {
      frameData = {
        hazardType,
        detections: [],
        timestamps: [],
        locations: [],
        averageConfidence: 0,
        bbox: convertDetectionToBbox(detection)
      };
      autoReportingState.detectionFrameBuffer.set(detectionKey, frameData);
    }
    
    // Add current detection to frame buffer
    frameData.detections.push(detection);
    frameData.timestamps.push(timestamp);
    frameData.locations.push(location);
    
    // Calculate average confidence
    frameData.averageConfidence = frameData.detections.reduce((sum, d) => sum + d.score, 0) / frameData.detections.length;
    
    // Update bounding box (use most recent detection bbox)
    frameData.bbox = convertDetectionToBbox(detection);
    
    // Keep only recent frames within time window
    while (frameData.timestamps.length > 0 && frameData.timestamps[0] < cutoffTime) {
      frameData.detections.shift();
      frameData.timestamps.shift();
      frameData.locations.shift();
    }
    
    // Check if we have enough consecutive frames
    if (frameData.detections.length >= AUTO_REPORTING_CONFIG.CONSECUTIVE_FRAMES) {
      // Clone the detection with enhanced metadata
      const qualifyingDetection = {
        ...detection,
        consecutiveFrames: frameData.detections.length,
        averageConfidence: frameData.averageConfidence,
        timeSpan: frameData.timestamps[frameData.timestamps.length - 1] - frameData.timestamps[0],
        stableDetection: true
      };
      
      qualifyingDetections.push(qualifyingDetection);
      console.log(`✅ Qualifying detection: ${hazardType} detected in ${frameData.detections.length} consecutive frames (${frameData.averageConfidence.toFixed(2)} avg confidence)`);
      
      // Remove from buffer to prevent duplicate reporting
      autoReportingState.detectionFrameBuffer.delete(detectionKey);
    }
  }
  
  // Update statistics
  autoReportingState.stats.frameBufferSize = autoReportingState.detectionFrameBuffer.size;
  autoReportingState.stats.consecutiveDetections = qualifyingDetections.length;
  
  return qualifyingDetections;
}

/**
 * Apply burst deduplication using time windows and IoU analysis
 * @param {Array} detections - Qualifying detections from consecutive frame analysis
 * @param {Object} location - Current location
 * @param {number} timestamp - Current timestamp
 * @returns {Promise<Array>} Deduplicated detections
 */
async function applyBurstDeduplication(detections, location, timestamp) {
  const deduplicatedDetections = [];
  const deduplicationTimeMs = AUTO_REPORTING_CONFIG.DEDUPLICATION_TIME_MINUTES * 60 * 1000;
  
  for (const detection of detections) {
    const hazardType = getHazardTypeFromClassId(detection.classId);
    let isDuplicate = false;
    
    // Check against recent reports in history
    for (const [key, report] of autoReportingState.reportHistory) {
      // Skip old reports
      if (timestamp - report.timestamp > deduplicationTimeMs) {
        autoReportingState.reportHistory.delete(key);
        continue;
      }
      
      // Skip different hazard types
      if (report.hazardType !== hazardType) {
        continue;
      }
      
      // Check IoU overlap for geometric deduplication
      if (report.bbox && detection) {
        const currentBbox = convertDetectionToBbox(detection);
        const iouOverlap = calculateIoU(currentBbox, report.bbox);
        
        if (iouOverlap > AUTO_REPORTING_CONFIG.IOU_THRESHOLD) {
          console.log(`🔄 IoU-based duplicate suppressed: ${hazardType} with IoU ${iouOverlap.toFixed(2)} > threshold ${AUTO_REPORTING_CONFIG.IOU_THRESHOLD}`);
          isDuplicate = true;
          break;
        }
      }
      
      // Check geographic proximity (if location available)
      if (location && report.location) {
        const distance = calculateDistance(location, report.location);
        if (distance <= AUTO_REPORTING_CONFIG.DEDUPLICATION_RADIUS_METERS) {
          console.log(`🔄 Location-based duplicate suppressed: ${hazardType} within ${Math.round(distance)}m of previous report`);
          isDuplicate = true;
          break;
        }
      }
      
      // Time-based deduplication as fallback
      const timeDiff = timestamp - report.timestamp;
      if (timeDiff < AUTO_REPORTING_CONFIG.TIME_WINDOW_MS) {
        console.log(`🔄 Time-based duplicate suppressed: ${hazardType} within ${Math.round(timeDiff/1000)}s of previous report`);
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      deduplicatedDetections.push(detection);
      
      // Record in history for future deduplication
      recordDetectionInHistory(hazardType, location, detection);
    }
  }
  
  return deduplicatedDetections;
}

/**
 * Create auto-reports with IndexedDB storage integration
 * @param {Array} detections - Deduplicated detections
 * @param {Blob} imageBlob - Captured image
 * @param {Object} location - Current location
 * @returns {Promise<Array>} Created reports with storage IDs
 */
async function createAutoReportsWithStorage(detections, imageBlob, location) {
  const reports = [];
  
  // Group detections by type for batch processing
  const detectionsByType = new Map();
  detections.forEach(detection => {
    const hazardType = getHazardTypeFromClassId(detection.classId);
    if (!detectionsByType.has(hazardType)) {
      detectionsByType.set(hazardType, []);
    }
    detectionsByType.get(hazardType).push(detection);
  });
  
  // Create reports for each hazard type
  for (const [hazardType, typeDetections] of detectionsByType) {
    try {
      const report = await createSingleAutoReportWithStorage(hazardType, typeDetections, imageBlob, location);
      reports.push(report);
      
      // Show user notification
      showAutoReportNotification(hazardType, typeDetections.length, location);
      
    } catch (error) {
      console.error(`❌ Failed to create auto-report for ${hazardType}:`, error);
      autoReportingState.stats.reportsFailed++;
    }
  }
  
  return reports;
}

/**
 * Create a single auto-report with both server upload and IndexedDB storage
 * @param {string} hazardType - Type of hazard
 * @param {Array} detections - Detections of this type
 * @param {Blob} imageBlob - Captured image
 * @param {Object} location - Current location
 * @returns {Promise<Object>} Created report with storage metadata
 */
async function createSingleAutoReportWithStorage(hazardType, detections, imageBlob, location) {
  // Calculate average confidence and bounding box
  const avgConfidence = detections.reduce((sum, d) => sum + d.score, 0) / detections.length;
  const boundingBoxes = detections.map(d => [d.x1, d.y1, d.x2, d.y2]);
  
  // Prepare report data for IndexedDB
  const reportData = {
    mediaRef: {
      blob: imageBlob,
      url: null, // Will be set after server upload
      thumbnail: null
    },
    detections: detections.map(d => ({
      bbox: [d.x1, d.y1, d.x2, d.y2],
      class: hazardType,
      score: d.score,
      consecutiveFrames: d.consecutiveFrames || 1,
      timeSpan: d.timeSpan || 0
    })),
    source: 'live',
    engine: 'local-onnx',
    metadata: {
      sessionId: getCurrentSessionId(),
      location: location,
      hazardType: hazardType,
      confidence: avgConfidence,
      frameTimestamp: Date.now(),
      autoGenerated: true,
      detectionCount: detections.length,
      averageConfidence: avgConfidence,
      boundingBoxes: boundingBoxes,
      processingTime: Date.now(),
      consecutiveFramesTotal: detections.reduce((sum, d) => sum + (d.consecutiveFrames || 1), 0),
      maxTimeSpan: Math.max(...detections.map(d => d.timeSpan || 0))
    }
  };
  
  // Store in IndexedDB first (offline-first approach)
  let reportId;
  try {
    reportId = await storeReport(reportData);
    console.log(`📝 Auto-report stored in IndexedDB: ${reportId} (${hazardType})`);
  } catch (storageError) {
    console.error('❌ Failed to store report in IndexedDB:', storageError);
    throw new Error(`IndexedDB storage failed: ${storageError.message}`);
  }
  
  // Attempt server upload (with graceful failure)
  let serverUploadResult = null;
  try {
    // Prepare data for server API
    const serverReportData = {
      sessionId: getCurrentSessionId(),
      imageBlob: imageBlob,
      detections: detections.map(d => ({
        bbox: [d.x1, d.y1, d.x2, d.y2],
        class: hazardType,
        score: d.score
      })),
      timestamp: new Date().toISOString(),
      confidenceThreshold: AUTO_REPORTING_CONFIG.MIN_CONFIDENCE,
      location: location,
      metadata: reportData.metadata
    };
    
    serverUploadResult = await uploadDetection(serverReportData);
    
    // Update IndexedDB with server sync status
    await updateSyncStatus(reportId, true, serverUploadResult.url || serverUploadResult.id);
    
    console.log(`✅ Auto-report synced to server: ${hazardType} (${detections.length} detections, ${(avgConfidence * 100).toFixed(1)}% confidence)`);
    
  } catch (uploadError) {
    console.warn(`⚠️ Server upload failed, report saved offline: ${uploadError.message}`);
    
    // Mark as unsynced but don't fail the entire operation
    await updateSyncStatus(reportId, false).catch(err => 
      console.error('Failed to update sync status:', err)
    );
    
    serverUploadResult = { offline: true, error: uploadError.message };
  }
  
  return {
    id: reportId,
    hazardType,
    detectionCount: detections.length,
    avgConfidence,
    location,
    serverResult: serverUploadResult,
    storedOffline: !serverUploadResult || serverUploadResult.offline
  };
}

/**
 * Generate a unique key for frame buffer detection tracking
 * @param {Object} detection - Detection object
 * @param {string} hazardType - Hazard type
 * @param {Object} location - Location object
 * @returns {string} Unique detection key
 */
function generateDetectionKey(detection, hazardType, location) {
  // Create a spatial key based on detection location and type
  const spatialKey = `${hazardType}_${Math.round(detection.x1 / 50)}_${Math.round(detection.y1 / 50)}`;
  
  // Add location component if available
  const locationKey = location 
    ? `_${Math.round(location.latitude * 1000)}_${Math.round(location.longitude * 1000)}`
    : '';
  
  return spatialKey + locationKey;
}

/**
 * Convert detection object to standard bbox format for IoU calculation
 * @param {Object} detection - Detection with x1, y1, x2, y2 coordinates
 * @returns {Object} Bounding box in {x, y, width, height} format
 */
function convertDetectionToBbox(detection) {
  return {
    x: detection.x1,
    y: detection.y1,
    width: detection.x2 - detection.x1,
    height: detection.y2 - detection.y1
  };
}

/**
 * Clean up frame buffer to prevent memory leaks
 */
function cleanupFrameBuffer() {
  const now = Date.now();
  const cutoffTime = now - AUTO_REPORTING_CONFIG.TIME_WINDOW_MS * 2; // Keep buffer longer for stability
  
  for (const [key, frameData] of autoReportingState.detectionFrameBuffer) {
    if (frameData.timestamps.length > 0 && frameData.timestamps[frameData.timestamps.length - 1] < cutoffTime) {
      autoReportingState.detectionFrameBuffer.delete(key);
    }
  }
  
  autoReportingState.stats.frameBufferSize = autoReportingState.detectionFrameBuffer.size;
}

/**
 * Check for duplicate detections based on location and time
 * @param {Array} detections - New detections to check
 * @param {Object} location - Current location
 * @returns {Object} Results with new and duplicate detections
 */
function checkForDuplicates(detections, location) {
  const newDetections = [];
  let duplicateCount = 0;
  
  for (const detection of detections) {
    const hazardType = getHazardTypeFromClassId(detection.classId);
    const isDuplicate = checkIfDuplicate(hazardType, location, detection);
    
    if (!isDuplicate) {
      newDetections.push(detection);
      // Record this detection in history
      recordDetectionInHistory(hazardType, location, detection);
    } else {
      duplicateCount++;
    }
  }
  
  return { newDetections, duplicateCount };
}

/**
 * Check if a detection is a duplicate based on location and time
 * @param {string} hazardType - Type of hazard
 * @param {Object} location - Current location
 * @param {Object} detection - Detection to check
 * @returns {boolean} True if duplicate
 */
function checkIfDuplicate(hazardType, location, detection) {
  const now = Date.now();
  const deduplicationTimeMs = AUTO_REPORTING_CONFIG.DEDUPLICATION_TIME_MINUTES * 60 * 1000;
  
  // Check existing reports
  for (const [key, report] of autoReportingState.reportHistory) {
    // Skip old reports
    if (now - report.timestamp > deduplicationTimeMs) {
      autoReportingState.reportHistory.delete(key);
      continue;
    }
    
    // Check if same hazard type
    if (report.hazardType !== hazardType) {
      continue;
    }
    
    // Check if within geographic radius (if location available)
    if (location && report.location) {
      const distance = calculateDistance(location, report.location);
      if (distance <= AUTO_REPORTING_CONFIG.DEDUPLICATION_RADIUS_METERS) {
        console.log(`🔄 Duplicate detection suppressed: ${hazardType} within ${Math.round(distance)}m of previous report`);
        return true;
      }
    } else if (!location && !report.location) {
      // If no location data available, use time-based deduplication only
      const timeDiff = now - report.timestamp;
      if (timeDiff < deduplicationTimeMs) {
        console.log(`🔄 Duplicate detection suppressed: ${hazardType} within ${Math.round(timeDiff/1000)}s of previous report`);
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Record detection in history for deduplication
 * @param {string} hazardType - Type of hazard
 * @param {Object} location - Location of detection
 * @param {Object} detection - Detection details
 */
function recordDetectionInHistory(hazardType, location, detection) {
  const key = `${hazardType}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  
  autoReportingState.reportHistory.set(key, {
    hazardType,
    location,
    timestamp: Date.now(),
    confidence: detection.score,
    bbox: [detection.x1, detection.y1, detection.x2, detection.y2]
  });
  
  // Cleanup old entries to prevent memory bloat
  if (autoReportingState.reportHistory.size > 100) {
    const oldestKeys = Array.from(autoReportingState.reportHistory.keys()).slice(0, 20);
    oldestKeys.forEach(key => autoReportingState.reportHistory.delete(key));
  }
}

/**
 * Create auto-reports for new detections
 * @param {Array} detections - New detections to report
 * @param {Blob} imageBlob - Captured image
 * @param {Object} location - Current location
 * @returns {Promise<Array>} Created reports
 */
async function createAutoReports(detections, imageBlob, location) {
  const reports = [];
  
  // Group detections by type for batch processing
  const detectionsByType = new Map();
  detections.forEach(detection => {
    const hazardType = getHazardTypeFromClassId(detection.classId);
    if (!detectionsByType.has(hazardType)) {
      detectionsByType.set(hazardType, []);
    }
    detectionsByType.get(hazardType).push(detection);
  });
  
  // Create reports for each hazard type
  for (const [hazardType, typeDetections] of detectionsByType) {
    try {
      const report = await createSingleAutoReport(hazardType, typeDetections, imageBlob, location);
      reports.push(report);
      
      // Show user notification
      showAutoReportNotification(hazardType, typeDetections.length, location);
      
    } catch (error) {
      console.error(`❌ Failed to create auto-report for ${hazardType}:`, error);
      autoReportingState.stats.reportsFailed++;
    }
  }
  
  return reports;
}

/**
 * Create a single auto-report
 * @param {string} hazardType - Type of hazard
 * @param {Array} detections - Detections of this type
 * @param {Blob} imageBlob - Captured image
 * @param {Object} location - Current location
 * @returns {Promise<Object>} Created report
 */
async function createSingleAutoReport(hazardType, detections, imageBlob, location) {
  // Calculate average confidence and bounding box
  const avgConfidence = detections.reduce((sum, d) => sum + d.score, 0) / detections.length;
  const boundingBoxes = detections.map(d => [d.x1, d.y1, d.x2, d.y2]);
  
  // Prepare report data matching existing API format
  const reportData = {
    sessionId: getCurrentSessionId(),
    imageBlob: imageBlob,
    detections: detections.map(d => ({
      bbox: [d.x1, d.y1, d.x2, d.y2],
      class: hazardType,
      score: d.score
    })),
    timestamp: new Date().toISOString(),
    confidenceThreshold: AUTO_REPORTING_CONFIG.MIN_CONFIDENCE,
    location: location,
    metadata: {
      autoGenerated: true,
      detectionCount: detections.length,
      averageConfidence: avgConfidence,
      hazardType: hazardType,
      boundingBoxes: boundingBoxes,
      processingTime: Date.now()
    }
  };
  
  // Upload using existing API
  const result = await uploadDetection(reportData);
  
  console.log(`✅ Auto-report created: ${hazardType} (${detections.length} detections, ${(avgConfidence * 100).toFixed(1)}% confidence)`);
  
  return result;
}

/**
 * Capture image from video element with detection overlay
 * @param {HTMLVideoElement} videoElement - Video element
 * @param {Array} detections - Detections to overlay
 * @returns {Promise<Blob>} Captured image blob
 */
async function captureDetectionImage(videoElement, detections) {
  // Create canvas for image capture
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');
  
  // Draw video frame
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  
  // Draw detection overlays
  drawDetectionOverlays(ctx, detections, canvas.width, canvas.height);
  
  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create image blob'));
        }
      },
      'image/jpeg',
      AUTO_REPORTING_CONFIG.IMAGE_QUALITY
    );
  });
}

/**
 * Draw detection overlays on canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} detections - Detections to draw
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 */
function drawDetectionOverlays(ctx, detections, canvasWidth, canvasHeight) {
  const colors = {
    crack: '#FF8844',
    knocked: '#FFD400', 
    pothole: '#FF4444',
    'surface damage': '#44D7B6'
  };
  
  detections.forEach((detection, index) => {
    const hazardType = getHazardTypeFromClassId(detection.classId);
    const color = colors[hazardType] || '#00FF00';
    
    // Scale coordinates to canvas size
    const x1 = (detection.x1 / DETECTION_CONFIG.MODEL_INPUT_SIZE) * canvasWidth;
    const y1 = (detection.y1 / DETECTION_CONFIG.MODEL_INPUT_SIZE) * canvasHeight;
    const x2 = (detection.x2 / DETECTION_CONFIG.MODEL_INPUT_SIZE) * canvasWidth;
    const y2 = (detection.y2 / DETECTION_CONFIG.MODEL_INPUT_SIZE) * canvasHeight;
    
    const width = x2 - x1;
    const height = y2 - y1;
    
    // Draw bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, width, height);
    
    // Draw label with background
    const label = `${hazardType} ${(detection.score * 100).toFixed(0)}%`;
    ctx.font = '16px Arial';
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = 20;
    
    // Background
    ctx.fillStyle = color;
    ctx.fillRect(x1, y1 - textHeight - 4, textWidth + 8, textHeight + 4);
    
    // Text
    ctx.fillStyle = '#000000';
    ctx.fillText(label, x1 + 4, y1 - 8);
  });
}

/**
 * Show notification for auto-generated report
 * @param {string} hazardType - Type of hazard
 * @param {number} detectionCount - Number of detections
 * @param {Object} location - Location of detection
 */
function showAutoReportNotification(hazardType, detectionCount, location) {
  const locationStr = location 
    ? `at ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
    : 'location unknown';
  
  const message = `Auto-report created: ${detectionCount} ${hazardType}${detectionCount > 1 ? 's' : ''} detected ${locationStr}`;
  
  // Use existing notification system if available
  if (typeof notify === 'function') {
    notify(message, 'info', { 
      duration: 4000,
      icon: '🚨'
    });
  } else {
    console.log(`🚨 ${message}`);
  }
}

/**
 * Get hazard type from class ID
 * @param {number} classId - ONNX model class ID
 * @returns {string} Hazard type name
 */
function getHazardTypeFromClassId(classId) {
  return DETECTION_CONFIG.CLASS_NAMES[classId] || `Class ${classId}`;
}

/**
 * Get current location with timeout
 * @returns {Promise<Object|null>} Current location or null
 */
async function getCurrentLocationWithTimeout() {
  // Use cached location if recent enough
  const now = Date.now();
  if (autoReportingState.currentLocation && 
      (now - autoReportingState.lastLocationUpdate) < 60000) {
    return autoReportingState.currentLocation;
  }
  
  try {
    const position = await Promise.race([
      getCurrentLocationPromise(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Location timeout')), AUTO_REPORTING_CONFIG.LOCATION_TIMEOUT_MS)
      )
    ]);
    
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: now
    };
    
    autoReportingState.currentLocation = location;
    autoReportingState.lastLocationUpdate = now;
    return location;
    
  } catch (error) {
    console.warn('⚠️ Failed to get current location:', error.message);
    return autoReportingState.currentLocation; // Return cached location if available
  }
}

/**
 * Promisify geolocation.getCurrentPosition
 * @returns {Promise<Position>} Location position
 */
function getCurrentLocationPromise() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,
        timeout: AUTO_REPORTING_CONFIG.LOCATION_TIMEOUT_MS,
        maximumAge: 60000
      }
    );
  });
}

/**
 * Calculate distance between two coordinates in meters
 * @param {Object} coord1 - First coordinate {latitude, longitude}
 * @param {Object} coord2 - Second coordinate {latitude, longitude}
 * @returns {number} Distance in meters
 */
function calculateDistance(coord1, coord2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = coord1.latitude * Math.PI/180;
  const φ2 = coord2.latitude * Math.PI/180;
  const Δφ = (coord2.latitude-coord1.latitude) * Math.PI/180;
  const Δλ = (coord2.longitude-coord1.longitude) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

/**
 * Get current session ID from camera detection
 * @returns {string|null} Current session ID
 */
function getCurrentSessionId() {
  // This will be set by the camera detection system
  return window.cameraState?.sessionId || null;
}

/**
 * Enable/disable auto-reporting
 * @param {boolean} enabled - Whether to enable auto-reporting
 */
export function setAutoReportingEnabled(enabled) {
  autoReportingState.enabled = enabled;
  saveUserPreferences();
  
  console.log(`🔧 Auto-reporting ${enabled ? 'enabled' : 'disabled'}`);
  
  if (typeof notify === 'function') {
    notify(`Auto-reporting ${enabled ? 'enabled' : 'disabled'}`, 'info');
  }
}

/**
 * Set minimum confidence threshold for auto-reporting
 * @param {number} threshold - Confidence threshold (0-1)
 */
export function setAutoReportingThreshold(threshold) {
  AUTO_REPORTING_CONFIG.MIN_CONFIDENCE = Math.max(0.1, Math.min(1.0, threshold));
  saveUserPreferences();
  
  console.log(`🔧 Auto-reporting threshold set to ${(AUTO_REPORTING_CONFIG.MIN_CONFIDENCE * 100).toFixed(0)}%`);
}

/**
 * Get auto-reporting statistics
 * @returns {Object} Statistics object
 */
export function getAutoReportingStats() {
  return {
    enabled: autoReportingState.enabled,
    currentLocation: autoReportingState.currentLocation,
    sessionReportCount: autoReportingState.sessionReportCount,
    reportHistorySize: autoReportingState.reportHistory.size,
    pendingReports: autoReportingState.pendingReports.length,
    stats: { ...autoReportingState.stats },
    config: { ...AUTO_REPORTING_CONFIG }
  };
}

/**
 * Clear session state (call when starting new session)
 */
export function clearAutoReportingSession() {
  autoReportingState.sessionReportCount = 0;
  autoReportingState.reportHistory.clear();
  autoReportingState.detectionFrameBuffer.clear();
  autoReportingState.pendingReports = [];
  autoReportingState.lastReportTime = 0;
  autoReportingState.stats.totalDetections = 0;
  autoReportingState.stats.reportsCreated = 0;
  autoReportingState.stats.reportsDeduplicated = 0;
  autoReportingState.stats.reportsQueued = 0;
  autoReportingState.stats.reportsFailed = 0;
  autoReportingState.stats.frameBufferSize = 0;
  autoReportingState.stats.consecutiveDetections = 0;
  
  console.log('🗑️ Auto-reporting session state cleared');
}

/**
 * Load user preferences from localStorage
 */
function loadUserPreferences() {
  try {
    const preferences = JSON.parse(localStorage.getItem('autoReportingPreferences') || '{}');
    
    if (typeof preferences.enabled === 'boolean') {
      autoReportingState.enabled = preferences.enabled;
    }
    
    if (typeof preferences.minConfidence === 'number') {
      AUTO_REPORTING_CONFIG.MIN_CONFIDENCE = preferences.minConfidence;
    }
    
    console.log('📋 Auto-reporting preferences loaded:', preferences);
  } catch (error) {
    console.warn('⚠️ Failed to load auto-reporting preferences:', error);
  }
}

/**
 * Save user preferences to localStorage
 */
function saveUserPreferences() {
  try {
    const preferences = {
      enabled: autoReportingState.enabled,
      minConfidence: AUTO_REPORTING_CONFIG.MIN_CONFIDENCE
    };
    
    localStorage.setItem('autoReportingPreferences', JSON.stringify(preferences));
  } catch (error) {
    console.warn('⚠️ Failed to save auto-reporting preferences:', error);
  }
}

/**
 * Cleanup function - call when shutting down
 */
export function cleanupAutoReporting() {
  if (geolocationWatcher) {
    navigator.geolocation.clearWatch(geolocationWatcher);
    geolocationWatcher = null;
  }
  
  autoReportingState.reportHistory.clear();
  autoReportingState.detectionFrameBuffer.clear();
  autoReportingState.pendingReports = [];
  
  console.log('🧹 Auto-reporting service cleaned up');
}

// Export state for debugging
export { autoReportingState };