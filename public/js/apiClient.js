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
