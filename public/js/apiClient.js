// apiClient.js
// Handles API requests for object detection

import { BASE_API_URL } from './config.js';
import { fetchWithTimeout } from './utils/fetchWithTimeout.js';
import { ensureOk, getJsonOrThrow } from './utils/http.js';
import { normalizeApiResult } from './result_normalizer.js';

const metaApiBase = document.querySelector('meta[name="api-base"]')?.content;
let API_URL = '';
const FALLBACK_BASES = [window.__API_BASE__, metaApiBase, BASE_API_URL].filter(Boolean);

async function apiFetch(path, options = {}) {
    const bases = [API_URL || '', ...FALLBACK_BASES].filter(Boolean);
    let lastError;
    
    console.log(`[api] Attempting API call: ${path}`);
    
    for (const base of bases) {
        const url = `${base}${path}`;
        try {
            console.log(`[api] Trying base: ${base}`);
            const res = await fetchWithTimeout(url, {
                timeout: options.timeout || 8000,
                ...options
            });
            
            if (!API_URL || API_URL !== base) {
                API_URL = base; // cache working base
                console.log(`[api] Cached working base: ${base}`);
            }
            
            return res;
        } catch (err) {
            console.warn(`[api] Failed with base ${base}: ${err.message}`);
            lastError = err;
        }
    }
    
    console.error(`[api] All bases failed for ${path}`);
    throw lastError;
}

/**
 * Sets the API URL for all subsequent requests.
 * @param {string} newApiUrl The new API URL.
 */
export function setApiUrl(newApiUrl) {
    API_URL = newApiUrl || '';
}

let currentSessionId = sessionStorage.getItem('hazard_session_id') || null;

export function getStoredSessionId() {
    return currentSessionId;
}

export async function endSession() {
    if (!currentSessionId) return;
    try {
        await apiFetch(`/session/${currentSessionId}/end`, { method: 'POST' });
    } catch (e) {
        console.warn('Failed to end session', e);
    }
    sessionStorage.removeItem('hazard_session_id');
    currentSessionId = null;
}

/**
 * Checks the health of the API server.
 * @returns {Promise<boolean>} True if the server is healthy, false otherwise.
 */
export async function checkHealth() {
    try {
        const response = await apiFetch(`/health`, { timeout: 5000 });
        ensureOk(response);
        return await getJsonOrThrow(response);
    } catch (error) {
        return { status: 'error', message: error.message };
    }
}

export async function getReportImage(reportId) {
    try {
        const response = await apiFetch(`/report/image/${reportId}`);
        ensureOk(response);
        return await response.blob();
    } catch (error) {
        throw new Error(`Failed to get report image: ${error.message}`);
    }
}

export async function getReportPlot(reportId) {
    try {
        const response = await apiFetch(`/report/plot/${reportId}`);
        ensureOk(response);
        return await response.blob();
    } catch (error) {
        throw new Error(`Failed to get report plot: ${error.message}`);
    }
}

export async function startSession() {
    try {
        const response = await apiFetch(`/session/start`, { method: 'POST' });
        ensureOk(response);
        const data = await getJsonOrThrow(response);
        currentSessionId = data.session_id;
        sessionStorage.setItem('hazard_session_id', currentSessionId);
        return currentSessionId;
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
                console.warn(`[api] Detection attempt ${attempt} failed: ${error.message}, retrying...`);
                // Wait before retry with exponential backoff
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
            }
        }
    }
    
    throw new Error(`Detection failed after ${retryAttempts} attempts: ${error.message}`);
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

        const response = await apiFetch(`/reports/upload`, {
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
        const response = await apiFetch(`/session/${sessionId}/summary`);
        
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
        const response = await apiFetch(`/reports/create`, {
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
    sessionId = sessionId || currentSessionId;
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

    const path = sessionId ? `/detect/${sessionId}` : `/detect`;
    let attemptDelay = 300;
    // Exponential backoff for rate limiting
    while (true) {
        const response = await apiFetch(path, {
            method: 'POST',
            body: formData
        });

        if (response.status === 429 || response.status === 503) {
            console.log(`[api] Rate limited (${response.status}), backing off for ${attemptDelay}ms`);
            window.dispatchEvent(new CustomEvent('api-status', { detail: 'Rate-limited, retrying…' }));
            await new Promise(res => setTimeout(res, attemptDelay + Math.random() * 100));
            attemptDelay = Math.min(attemptDelay * 2, 5000);
            continue;
        }

        ensureOk(response);
        const json = await getJsonOrThrow(response);
        const norm = normalizeApiResult(json);
        if (norm.session_id) {
            currentSessionId = norm.session_id;
            sessionStorage.setItem('hazard_session_id', currentSessionId);
        }

        if (window.DEBUG_CLIENT) {
            const counts = {};
            norm.detections.forEach(d => {
                counts[d.class_name] = (counts[d.class_name] || 0) + 1;
            });
            const classesStr = Object.entries(counts).map(([k, v]) => `${k}(${v})`).join(', ');
            console.log(`Detections: ${norm.detections.length} | time: ${norm.processing_time_ms || 0} | classes: ${classesStr}`);
        }

        return norm;
    }
}
