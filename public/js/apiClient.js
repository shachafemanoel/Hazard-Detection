// apiClient.js
// Handles API requests for object detection

let API_URL = window.API_URL || "https://hazard-api-production-production.up.railway.app";

/**
 * Sets the API URL for all subsequent requests.
 * @param {string} newApiUrl The new API URL.
 */
export function setApiUrl(newApiUrl) {
    API_URL = newApiUrl;
    console.log(`API URL set to: ${API_URL}`);
}

/**
 * Checks the health of the API server.
 * @returns {Promise<boolean>} True if the server is healthy, false otherwise.
 */
export async function checkHealth() {
    try {
        const response = await fetch(`${API_URL}/health`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("API health check failed:", error);
        return { status: 'error', message: error.message };
    }
}

export async function getReportImage(reportId) {
    try {
        const response = await fetch(`${API_URL}/report/image/${reportId}`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        const blob = await response.blob();
        return blob;
    } catch (error) {
        console.error(`Failed to get report image for ${reportId}:`, error);
        return new Blob(); // Return an empty Blob on error
    }
}

export async function getReportPlot(reportId) {
    try {
        const response = await fetch(`${API_URL}/report/plot/${reportId}`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        const blob = await response.blob();
        return blob;
    } catch (error) {
        console.error(`Failed to get report plot for ${reportId}:`, error);
        return new Blob(); // Return an empty Blob on error
    }
}

export async function startSession() {
    try {
        const response = await fetch(`${API_URL}/session/start`, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        const data = await response.json();
        return data.session_id;
    } catch (error) {
        console.error("Failed to start session:", error);
        return null;
    }
}

/**
 * Send a frame to the detection API
 * @param {HTMLCanvasElement} canvas 
 * @returns {Promise<Array>} Array of detections
 */
export async function detectHazards(sessionId, canvas) {
    return detectFrame(sessionId, canvas);
}

/**
 * Detect hazards with retry logic for improved reliability
 * @param {string} sessionId - Session identifier
 * @param {HTMLCanvasElement} canvas - Canvas with current frame
 * @param {number} retryAttempts - Number of retry attempts (default: 3)
 * @returns {Promise<Object>} Detection results
 */
export async function detectSingleWithRetry(sessionId, canvas, retryAttempts = 3) {
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
        try {
            return await detectFrame(sessionId, canvas);
        } catch (error) {
            console.warn(`Detection attempt ${attempt} failed:`, error);
            
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

        const response = await fetch(`${API_URL}/reports/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upload API error: ${response.status} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error uploading detection:", error);
        throw error;
    }
}

/**
 * Get session summary with all detections and statistics
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object>} Session summary data
 */
export async function getSessionSummary(sessionId) {
    try {
        const response = await fetch(`${API_URL}/session/${sessionId}/summary`);
        
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Session not found or expired');
            }
            throw new Error(`API error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error("Error getting session summary:", error);
        throw error;
    }
}

/**
 * Create a formal report from session data
 * @param {Object} reportData - Report creation data
 * @returns {Promise<Object>} Created report with ID
 */
export async function createReport(reportData) {
    try {
        const response = await fetch(`${API_URL}/reports/create`, {
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

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Report creation error: ${response.status} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error creating report:", error);
        throw error;
    }
}

export async function detectFrame(sessionId, canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(async blob => {
            try {
                const formData = new FormData();
                formData.append('file', blob, 'frame.jpg');

                const response = await fetch(`${API_URL}/detect/${sessionId}`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Detection API error: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                if (Array.isArray(data.detections)) {
                    resolve(data);
                } else {
                    resolve({ detections: [] });
                }
            } catch (err) {
                console.error("Error in detectFrame:", err);
                reject(err);
            }
        }, 'image/jpeg', 0.8);
    });
}
