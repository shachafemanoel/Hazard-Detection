/**
 * Session Manager
 * Handles detection session lifecycle, persistence, and reporting
 * Integrates with Redis backend and Cloudinary for image storage
 */

import { 
    startSession, 
    getSessionSummary, 
    detectSingleWithRetry 
} from './apiClient.js';
import { 
    uploadDetectionReport, 
    getSessionReportData, 
    generateSummaryModalData,
    createDetectionReport 
} from './report-upload-service.js';

// Session state management
let currentSession = {
    id: null,
    startTime: null,
    detections: [],
    totalFrames: 0,
    detectionCount: 0,
    uniqueHazardTypes: new Set(),
    confidenceSum: 0,
    lastUploadTime: 0,
    uploadedCount: 0,
    isActive: false
};

// Upload configuration
const UPLOAD_CONFIG = {
    batchSize: 5,           // Upload every 5 detections
    batchTimeMs: 30000,     // Or every 30 seconds
    minConfidence: 0.6,     // Only upload high-confidence detections
    maxPendingUploads: 20   // Limit memory usage
};

let pendingUploads = [];

/**
 * Start a new detection session
 * @param {Object} options - Session configuration
 * @returns {Promise<string>} Session ID
 */
export async function startDetectionSession(options = {}) {
    try {
        console.log('🚀 Starting new detection session...');
        
        // Create session via API
        const sessionId = await startSession();
        
        if (!sessionId) {
            throw new Error('Failed to create session - no session ID returned');
        }
        
        // Initialize session state
        currentSession = {
            id: sessionId,
            startTime: Date.now(),
            detections: [],
            totalFrames: 0,
            detectionCount: 0,
            uniqueHazardTypes: new Set(),
            confidenceSum: 0,
            lastUploadTime: Date.now(),
            uploadedCount: 0,
            isActive: true,
            config: {
                confidenceThreshold: options.confidenceThreshold || 0.5,
                source: options.source || 'web_camera',
                userId: options.userId || null,
                location: options.location || null
            }
        };
        
        console.log(`✅ Session started: ${sessionId}`);
        return sessionId;
        
    } catch (error) {
        console.error('❌ Failed to start detection session:', error);
        throw error;
    }
}

/**
 * Add detection result to current session
 * @param {Object} detection - Detection result with hazards
 * @param {HTMLCanvasElement} canvas - Canvas for image upload (optional)
 */
export function addDetectionToSession(detection, canvas = null) {
    if (!currentSession.isActive) {
        console.warn('⚠️ No active session - detection ignored');
        return;
    }
    
    const timestamp = Date.now();
    const sessionDetection = {
        id: `${currentSession.id}_${currentSession.detectionCount}`,
        timestamp,
        sessionId: currentSession.id,
        hazards: detection.hazards || [],
        confidence: detection.confidence || 0,
        frameNumber: currentSession.totalFrames,
        canvas: canvas // Store canvas reference for potential upload
    };
    
    // Update session statistics
    currentSession.detections.push(sessionDetection);
    currentSession.detectionCount++;
    
    if (detection.hazards) {
        detection.hazards.forEach(hazard => {
            currentSession.uniqueHazardTypes.add(hazard.class);
            currentSession.confidenceSum += hazard.confidence;
        });
    }
    
    // Check if we should upload this detection
    scheduleDetectionUpload(sessionDetection);
    
    console.log(`📝 Detection added to session: ${sessionDetection.id}`);
}

/**
 * Record frame processing (even if no detections found)
 */
export function recordFrameProcessed() {
    if (currentSession.isActive) {
        currentSession.totalFrames++;
    }
}

/**
 * Schedule detection upload based on batch configuration
 * @param {Object} detection - Detection to potentially upload
 */
function scheduleDetectionUpload(detection) {
    const now = Date.now();
    const timeSinceLastUpload = now - currentSession.lastUploadTime;
    
    // Only upload high-confidence detections
    const maxConfidence = detection.hazards.reduce((max, hazard) => 
        Math.max(max, hazard.confidence), 0);
    
    if (maxConfidence < UPLOAD_CONFIG.minConfidence) {
        return;
    }
    
    // Add to pending uploads
    pendingUploads.push(detection);
    
    // Check if we should trigger batch upload
    const shouldUpload = 
        pendingUploads.length >= UPLOAD_CONFIG.batchSize ||
        timeSinceLastUpload >= UPLOAD_CONFIG.batchTimeMs ||
        pendingUploads.length >= UPLOAD_CONFIG.maxPendingUploads;
    
    if (shouldUpload) {
        processPendingUploads();
    }
}

/**
 * Process pending uploads in background
 */
async function processPendingUploads() {
    if (pendingUploads.length === 0) {
        return;
    }
    
    const uploadsToProcess = pendingUploads.splice(0, UPLOAD_CONFIG.batchSize);
    currentSession.lastUploadTime = Date.now();
    
    console.log(`☁️ Processing ${uploadsToProcess.length} pending uploads...`);
    
    for (const detection of uploadsToProcess) {
        try {
            if (detection.canvas) {
                await uploadDetectionReport({
                    canvas: detection.canvas,
                    sessionId: detection.sessionId,
                    detections: detection.hazards,
                    confidenceThreshold: currentSession.config.confidenceThreshold,
                    location: currentSession.config.location
                });
                
                currentSession.uploadedCount++;
                console.log(`✅ Uploaded detection ${detection.id}`);
            }
        } catch (error) {
            console.error(`❌ Failed to upload detection ${detection.id}:`, error);
            // Don't re-queue failed uploads to avoid infinite loops
        }
    }
    
    console.log(`📊 Upload batch complete: ${currentSession.uploadedCount}/${currentSession.detectionCount} uploaded`);
}

/**
 * End current session and generate summary
 * @returns {Promise<Object>} Session summary data
 */
export async function endDetectionSession() {
    if (!currentSession.isActive) {
        console.warn('⚠️ No active session to end');
        return null;
    }
    
    try {
        console.log('🏁 Ending detection session...');
        
        // Process any remaining pending uploads
        await processPendingUploads();
        
        // Calculate session statistics
        const endTime = Date.now();
        const duration = endTime - currentSession.startTime;
        
        const sessionStats = {
            sessionId: currentSession.id,
            duration,
            durationFormatted: formatDuration(duration),
            totalDetections: currentSession.detectionCount,
            totalFrames: currentSession.totalFrames,
            uniqueHazardTypes: Array.from(currentSession.uniqueHazardTypes),
            averageConfidence: currentSession.confidenceSum > 0 
                ? (currentSession.confidenceSum / currentSession.detectionCount).toFixed(3)
                : 0,
            uploadedCount: currentSession.uploadedCount,
            detectionRate: duration > 0 ? (currentSession.detectionCount / (duration / 1000 / 60)).toFixed(2) : 0,
            startTime: new Date(currentSession.startTime).toISOString(),
            endTime: new Date(endTime).toISOString()
        };
        
        // Try to get server-side session summary
        let serverSummary = null;
        try {
            serverSummary = await getSessionReportData(currentSession.id);
        } catch (error) {
            console.warn('⚠️ Could not fetch server session summary:', error);
        }
        
        // Mark session as inactive
        currentSession.isActive = false;
        
        console.log('✅ Session ended:', sessionStats);
        
        return {
            local: sessionStats,
            server: serverSummary,
            detections: currentSession.detections.slice() // Copy array
        };
        
    } catch (error) {
        console.error('❌ Error ending session:', error);
        currentSession.isActive = false;
        throw error;
    }
}

/**
 * Get current session status
 * @returns {Object} Current session information
 */
export function getCurrentSessionStatus() {
    if (!currentSession.isActive) {
        return null;
    }
    
    const now = Date.now();
    const duration = now - currentSession.startTime;
    
    return {
        sessionId: currentSession.id,
        isActive: currentSession.isActive,
        duration,
        durationFormatted: formatDuration(duration),
        detectionCount: currentSession.detectionCount,
        totalFrames: currentSession.totalFrames,
        uniqueHazardTypes: Array.from(currentSession.uniqueHazardTypes),
        uploadedCount: currentSession.uploadedCount,
        pendingUploads: pendingUploads.length
    };
}

/**
 * Update session summary modal with current data
 */
export function updateSessionSummaryModal() {
    const status = getCurrentSessionStatus();
    if (!status) return;
    
    // Update summary statistics
    document.getElementById('session-total-detections').textContent = status.detectionCount;
    document.getElementById('session-duration').textContent = status.durationFormatted;
    document.getElementById('session-unique-hazards').textContent = status.uniqueHazardTypes.length;
    
    const avgConfidence = currentSession.confidenceSum > 0 
        ? (currentSession.confidenceSum / currentSession.detectionCount * 100).toFixed(1)
        : 0;
    document.getElementById('session-avg-confidence').textContent = `${avgConfidence}%`;
    
    // Update recent detections list
    updateRecentDetectionsList();
    
    // Enable/disable save button
    const saveButton = document.getElementById('save-session-report');
    saveButton.disabled = status.detectionCount === 0;
}

/**
 * Update recent detections list in modal
 */
function updateRecentDetectionsList() {
    const listContainer = document.getElementById('recent-detections-list');
    
    if (currentSession.detections.length === 0) {
        listContainer.innerHTML = '<p class="text-muted">No detections recorded yet.</p>';
        return;
    }
    
    // Show last 10 detections
    const recentDetections = currentSession.detections.slice(-10).reverse();
    
    const listHTML = recentDetections.map(detection => {
        const timeAgo = formatTimeAgo(detection.timestamp);
        const hazardLabels = detection.hazards.map(h => 
            `<span class="badge bg-warning me-1">${h.class} (${(h.confidence * 100).toFixed(0)}%)</span>`
        ).join('');
        
        return `
            <div class="border-bottom pb-2 mb-2">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <small class="text-muted">${timeAgo}</small>
                        <div>${hazardLabels || '<span class="text-muted">No hazards detected</span>'}</div>
                    </div>
                    <small class="text-muted">Frame ${detection.frameNumber}</small>
                </div>
            </div>
        `;
    }).join('');
    
    listContainer.innerHTML = listHTML;
}

/**
 * Create formal report from current session
 */
export async function createSessionReport() {
    const status = getCurrentSessionStatus();
    if (!status) {
        throw new Error('No active session to create report from');
    }
    
    try {
        const reportData = {
            sessionId: status.sessionId,
            title: `Hazard Detection Report - ${new Date().toLocaleDateString()}`,
            description: `Detection session summary: ${status.detectionCount} detections over ${status.durationFormatted}`,
            hazardTypes: Array.from(currentSession.uniqueHazardTypes),
            severity: determineSeverity(status),
            metadata: {
                total_frames: status.totalFrames,
                detection_rate: (status.detectionCount / status.totalFrames * 100).toFixed(2) + '%',
                uploaded_count: status.uploadedCount,
                session_duration_ms: status.duration
            }
        };
        
        const report = await createDetectionReport(reportData);
        console.log('✅ Formal report created:', report);
        return report;
        
    } catch (error) {
        console.error('❌ Failed to create session report:', error);
        throw error;
    }
}

/**
 * Determine severity based on session statistics
 * @param {Object} status - Session status
 * @returns {string} Severity level
 */
function determineSeverity(status) {
    if (status.uniqueHazardTypes.includes('pothole') || status.detectionCount > 50) {
        return 'high';
    } else if (status.detectionCount > 10) {
        return 'medium';
    } else {
        return 'low';
    }
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
        return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
}

/**
 * Format timestamp to "time ago" string
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Time ago string
 */
function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    
    if (diffMinutes < 1) {
        return 'Just now';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} min ago`;
    } else {
        const diffHours = Math.floor(diffMinutes / 60);
        return `${diffHours}h ${diffMinutes % 60}m ago`;
    }
}

// Auto-update modal every 5 seconds if visible
setInterval(() => {
    const modal = document.getElementById('detection-summary-modal');
    if (modal && modal.classList.contains('show')) {
        updateSessionSummaryModal();
    }
}, 5000);