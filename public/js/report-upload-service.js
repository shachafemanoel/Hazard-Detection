/**
 * Client-side Report Upload Service
 * Handles report creation, image uploads, and session summary generation
 * Integrates with apiClient.js for consistent API communication
 */

import { uploadDetection, createReport, getSessionSummary } from './apiClient.js';
import { pendingReportsQueue } from './pendingReportsQueue.js';
import { showWarning, showSuccess } from './notifications.js';

/**
 * Upload a single detection with image and metadata
 * @param {Object} options - Upload options
 * @param {HTMLCanvasElement} options.canvas - Canvas with detection overlay
 * @param {string} options.sessionId - Session identifier
 * @param {Array} options.detections - Array of detection objects
 * @param {number} options.confidenceThreshold - Confidence threshold used
 * @param {Object} options.location - Optional location data
 * @returns {Promise<Object>} Upload result with Cloudinary URL
 */
export async function uploadDetectionReport(options) {
    const { canvas, sessionId, detections, confidenceThreshold, location } = options;
    
    if (!canvas || !sessionId) {
        throw new Error('Canvas and sessionId are required for upload');
    }
    
    try {
        // Convert canvas to blob for upload
        const imageBlob = await new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to convert canvas to blob'));
                }
            }, 'image/jpeg', 0.85);
        });
        
        // Prepare detection data
        const detectionData = {
            imageBlob,
            sessionId,
            detections: detections || [],
            timestamp: new Date().toISOString(),
            confidenceThreshold: confidenceThreshold || 0.5,
            location
        };
        
        // Upload via API client
        const uploadResult = await uploadDetection(detectionData);

        console.log('Detection uploaded successfully:', uploadResult);
        showSuccess('Report sent');
        return uploadResult;

    } catch (error) {
        console.error('Failed to upload detection report:', error);
        // Queue for later retry
        pendingReportsQueue.enqueue(detectionData);
        showWarning('Report queued (offline)');
        throw error;
    }
}

/**
 * Create a formal report from session data
 * @param {Object} reportOptions - Report creation options
 * @param {string} reportOptions.sessionId - Session identifier
 * @param {string} reportOptions.title - Report title
 * @param {string} reportOptions.description - Report description
 * @param {Object} reportOptions.location - Location data
 * @param {Array} reportOptions.hazardTypes - Array of hazard types found
 * @param {string} reportOptions.severity - Severity level (low/medium/high)
 * @param {Object} reportOptions.metadata - Additional metadata
 * @returns {Promise<Object>} Created report with ID
 */
export async function createDetectionReport(reportOptions) {
    const {
        sessionId,
        title = 'Road Hazard Detection Report',
        description = '',
        location = null,
        hazardTypes = [],
        severity = 'medium',
        metadata = {}
    } = reportOptions;
    
    if (!sessionId) {
        throw new Error('Session ID is required to create report');
    }
    
    try {
        const reportData = {
            sessionId,
            title,
            description,
            location,
            hazardTypes,
            severity,
            metadata: {
                ...metadata,
                created_by: 'web_client',
                client_version: '1.0.0',
                created_at: new Date().toISOString()
            }
        };
        
        const report = await createReport(reportData);
        console.log('Report created successfully:', report);
        return report;
        
    } catch (error) {
        console.error('Failed to create detection report:', error);
        throw error;
    }
}

/**
 * Get comprehensive session summary for end-of-session reporting
 * @param {string} sessionId - Session identifier  
 * @returns {Promise<Object>} Session summary with statistics and detections
 */
export async function getSessionReportData(sessionId) {
    if (!sessionId) {
        throw new Error('Session ID is required to get report data');
    }
    
    try {
        const summary = await getSessionSummary(sessionId);
        
        // Calculate additional statistics
        const statistics = calculateSessionStatistics(summary);
        
        return {
            ...summary,
            statistics
        };
        
    } catch (error) {
        console.error('Failed to get session report data:', error);
        throw error;
    }
}

/**
 * Calculate session statistics from summary data
 * @param {Object} sessionSummary - Raw session summary from API
 * @returns {Object} Calculated statistics
 */
function calculateSessionStatistics(sessionSummary) {
    const { detections = [], session_info = {} } = sessionSummary;
    
    // Calculate session duration
    const startTime = new Date(session_info.created_at || Date.now());
    const endTime = new Date(session_info.last_activity || Date.now());
    const duration = Math.max(0, endTime - startTime);
    
    // Count hazard types
    const hazardTypeCounts = {};
    const confidences = [];
    const detectionTimes = [];
    
    detections.forEach(detection => {
        // Count hazards by type
        if (detection.hazards) {
            detection.hazards.forEach(hazard => {
                hazardTypeCounts[hazard.class] = (hazardTypeCounts[hazard.class] || 0) + 1;
                confidences.push(hazard.confidence);
            });
        }
        
        // Track detection timing
        if (detection.timestamp) {
            detectionTimes.push(new Date(detection.timestamp));
        }
    });
    
    // Calculate confidence statistics
    const avgConfidence = confidences.length > 0 
        ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length 
        : 0;
    
    const maxConfidence = confidences.length > 0 ? Math.max(...confidences) : 0;
    const minConfidence = confidences.length > 0 ? Math.min(...confidences) : 0;
    
    // Calculate detection frequency
    const detectionFrequency = duration > 0 
        ? (detections.length / (duration / 1000 / 60)) // detections per minute
        : 0;
    
    return {
        session_duration_ms: duration,
        session_duration_formatted: formatDuration(duration),
        total_detections: detections.length,
        unique_hazard_types: Object.keys(hazardTypeCounts).length,
        hazard_type_counts: hazardTypeCounts,
        confidence_stats: {
            average: Number(avgConfidence.toFixed(3)),
            maximum: Number(maxConfidence.toFixed(3)),
            minimum: Number(minConfidence.toFixed(3))
        },
        detection_frequency_per_minute: Number(detectionFrequency.toFixed(2)),
        detection_times: detectionTimes.map(t => t.toISOString())
    };
}

/**
 * Format duration in milliseconds to human-readable string
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(durationMs) {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Generate a summary modal data structure for UI display
 * @param {Object} sessionData - Session report data from getSessionReportData
 * @returns {Object} Modal-ready data structure
 */
export function generateSummaryModalData(sessionData) {
    const { statistics, detections = [], session_info = {} } = sessionData;
    
    const modalData = {
        header: {
            title: 'Detection Session Summary',
            session_id: session_info.session_id || 'unknown',
            ended_at: new Date().toISOString()
        },
        metrics: {
            duration: statistics?.session_duration_formatted || '0s',
            total_detections: statistics?.total_detections || 0,
            unique_hazards: statistics?.unique_hazard_types || 0,
            average_confidence: statistics?.confidence_stats?.average || 0,
            detection_rate: `${statistics?.detection_frequency_per_minute || 0}/min`
        },
        hazard_breakdown: statistics?.hazard_type_counts || {},
        detection_images: detections
            .filter(d => d.image_url) // Only detections with uploaded images
            .map(d => ({
                url: d.image_url,
                thumbnail: d.image_url.replace('/upload/', '/upload/w_200,h_150,c_fill/'),
                timestamp: d.timestamp,
                hazards: d.hazards || []
            })),
        actions: {
            download_report: true,
            share_session: true,
            create_formal_report: true
        }
    };
    
    return modalData;
}

/**
 * Batch upload multiple detections efficiently
 * @param {Array} detectionBatch - Array of detection upload options
 * @param {Object} options - Batch upload options
 * @param {number} options.concurrency - Max concurrent uploads (default: 3)
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<Array>} Array of upload results
 */
export async function batchUploadDetections(detectionBatch, options = {}) {
    const { concurrency = 3, onProgress } = options;
    
    if (!Array.isArray(detectionBatch) || detectionBatch.length === 0) {
        return [];
    }
    
    const results = [];
    const errors = [];
    let completed = 0;
    
    // Process uploads in batches to avoid overwhelming the server
    for (let i = 0; i < detectionBatch.length; i += concurrency) {
        const batch = detectionBatch.slice(i, i + concurrency);
        
        const batchPromises = batch.map(async (detection, index) => {
            try {
                const result = await uploadDetectionReport(detection);
                results[i + index] = result;
                completed++;
                
                if (onProgress) {
                    onProgress(completed, detectionBatch.length, result);
                }
                
                return result;
            } catch (error) {
                console.error(`Failed to upload detection ${i + index}:`, error);
                errors.push({ index: i + index, error });
                completed++;
                
                if (onProgress) {
                    onProgress(completed, detectionBatch.length, null, error);
                }
                
                return null;
            }
        });
        
        await Promise.all(batchPromises);
    }
    
    if (errors.length > 0) {
        console.warn(`${errors.length} uploads failed out of ${detectionBatch.length} total`);
    }
    
    return {
        results: results.filter(r => r !== null),
        errors,
        success_count: results.filter(r => r !== null).length,
        error_count: errors.length
    };
}

/**
 * Upload detection image to Cloudinary via server
 * @param {Blob} imageBlob - Image data as blob
 * @param {Object} meta - Detection metadata
 * @returns {Promise<Object>} Upload result with cloudinaryUrl
 */
export async function uploadToCloudinaryViaServer(imageBlob, meta) {
    return await uploadDetectionReport({
        canvas: null, // imageBlob provided directly
        sessionId: meta.sessionId,
        detections: [{
            className: meta.className,
            confidence: meta.confidence,
            timestamp: meta.ts,
            geo: meta.geo
        }],
        confidenceThreshold: 0.5,
        location: meta.geo
    });
}