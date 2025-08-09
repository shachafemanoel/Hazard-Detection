// apiClient.js
// Handles API requests for object detection

import { BASE_API_URL } from './config.js';
import { fetchWithTimeout } from './utils/fetchWithTimeout.js';
import { ensureOk, getJsonOrThrow } from './utils/http.js';

let API_URL = window.API_URL || BASE_API_URL;

/**
 * Sets the API URL for all subsequent requests.
 * @param {string} newApiUrl The new API URL.
 */
export function setApiUrl(newApiUrl) {
    API_URL = newApiUrl;
}

/**
 * Checks the health of the API server.
 * @returns {Promise<boolean>} True if the server is healthy, false otherwise.
 */
export async function checkHealth() {
    try {
        const response = await fetchWithTimeout(`${API_URL}/health`, { timeout: 5000 });
        ensureOk(response);
        return await getJsonOrThrow(response);
    } catch (error) {
        return { status: 'error', message: error.message };
    }
}

export async function getReportImage(reportId) {
    try {
        const response = await fetchWithTimeout(`${API_URL}/report/image/${reportId}`);
        ensureOk(response);
        return await response.blob();
    } catch (error) {
        throw new Error(`Failed to get report image: ${error.message}`);
    }
}

export async function getReportPlot(reportId) {
    try {
        const response = await fetchWithTimeout(`${API_URL}/report/plot/${reportId}`);
        ensureOk(response);
        return await response.blob();
    } catch (error) {
        throw new Error(`Failed to get report plot: ${error.message}`);
    }
}

export async function startSession() {
    try {
        const response = await fetchWithTimeout(`${API_URL}/session/start`, { method: 'POST' });
        ensureOk(response);
        const data = await getJsonOrThrow(response);
        return data.session_id;
    } catch (error) {
        throw new Error(`Failed to start session: ${error.message}`);
    }
}

/**
 * Send a frame to the detection API
 * @param {HTMLCanvasElement} canvas 
 * @returns {Promise<Array>} Array of detections
 */
export async function detectHazards(sessionId, payload) {
    // Accepts either a Blob/File or an HTMLCanvasElement
    return detectFrame(sessionId, payload);
}

/**
 * Detect hazards with retry logic for improved reliability
 * @param {string} sessionId - Session identifier
 * @param {HTMLCanvasElement} canvas - Canvas with current frame
 * @param {number} retryAttempts - Number of retry attempts (default: 3)
 * @returns {Promise<Object>} Detection results
 */
export async function detectSingleWithRetry(sessionId, payload, retryAttempts = 3) {
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
        try {
            return await detectFrame(sessionId, payload);
        } catch (error) {
            if (attempt < retryAttempts) {
            
            if (attempt === retryAttempts) {
                throw new Error(`Detection failed after ${retryAttempts} attempts: ${error.message}`);
            }
            
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
        }
    }
}

/**
 * Upload detection data to create a permanent report
 * @param {Object} detectionData - Detection data including image and metadata
 * @returns {Promise<Object>} Upload result with Cloudinary URL
 */
export async function uploadDetection(detectionData) {
    try {
        const formData = new FormData();
        
        // Add image blob
        if (detectionData.imageBlob) {
            formData.append('file', detectionData.imageBlob, 'detection.jpg');
        }
        
        // Add metadata
        formData.append('metadata', JSON.stringify({
            session_id: detectionData.sessionId,
            detections: detectionData.detections || [],
            timestamp: detectionData.timestamp || new Date().toISOString(),
            confidence_threshold: detectionData.confidenceThreshold || 0.5,
            location: detectionData.location || null
        }));

        const response = await fetchWithTimeout(`${API_URL}/reports/upload`, {
            method: 'POST',
            body: formData
        });

        ensureOk(response);
        return await getJsonOrThrow(response);
    } catch (error) {
        throw new Error(`Error uploading detection: ${error.message}`);
    }
}

/**
 * Get session summary with all detections and statistics
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} Session summary data
 */
export async function getSessionSummary(sessionId) {
    try {
        const response = await fetchWithTimeout(`${API_URL}/session/${sessionId}/summary`);
        
        if (response.status === 404) {
            throw new Error('Session not found or expired');
        }
        ensureOk(response);
        
        return await getJsonOrThrow(response);
    } catch (error) {
        throw new Error(`Error getting session summary: ${error.message}`);
    }
}

/**
 * Create a formal report from session data
 * @param {Object} reportData - Report creation data
 * @returns {Promise<Object>} Created report with ID
 */
export async function createReport(reportData) {
    try {
        const response = await fetchWithTimeout(`${API_URL}/reports/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: reportData.sessionId,
                title: reportData.title || 'Hazard Detection Report',
                description: reportData.description || '',
                location: reportData.location || null,
                hazard_types: reportData.hazardTypes || [],
                severity: reportData.severity || 'medium',
                metadata: reportData.metadata || {}
            })
        });

        ensureOk(response);
        return await getJsonOrThrow(response);
    } catch (error) {
        throw new Error(`Error creating report: ${error.message}`);
    }
}

export async function detectFrame(sessionId, payload) {
    // Normalize payload to a Blob
    const toBlob = () => new Promise((resolve, reject) => {
        try {
            if (payload instanceof Blob || payload instanceof File) {
                return resolve(payload);
            }
            if (payload && typeof HTMLCanvasElement !== 'undefined' && payload instanceof HTMLCanvasElement) {
                payload.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Failed to convert canvas to blob')), 'image/jpeg', 0.85);
                return;
            }
            reject(new Error('Unsupported payload type for detectFrame'));
        } catch (e) {
            reject(e);
        }
    });

    const blob = await toBlob();

    const formData = new FormData();
    formData.append('file', blob, 'frame.jpg');

    const response = await fetchWithTimeout(`${API_URL}/detect/${sessionId}`, {
        method: 'POST',
        body: formData
    });

    ensureOk(response);
    const data = await getJsonOrThrow(response);

    if (Array.isArray(data.detections)) {
        return data;
    } else {
        return { detections: [], ...data };
    }
}
