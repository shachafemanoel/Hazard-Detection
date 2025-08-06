// Simple Camera Fix - Direct API Integration
// This fixes the stuck loading by using direct Railway URLs

console.log('🔧 Simple Camera Fix loaded');

// Direct API configuration - no complex resolution needed
const DIRECT_API_CONFIG = {
    baseUrl: 'https://hazard-api-production-production.up.railway.app',
    timeout: 10000
};

// Override the API client functions with simplified versions
window.setApiUrl = function(url) {
    console.log('📡 API URL set to:', url);
};

window.checkHealth = async function() {
    try {
        const response = await fetch(`${DIRECT_API_CONFIG.baseUrl}/health`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(DIRECT_API_CONFIG.timeout)
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Health check successful:', data);
            return data;
        }
        
        throw new Error(`Health check failed: ${response.status}`);
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        throw error;
    }
};

window.startSession = async function() {
    try {
        const response = await fetch(`${DIRECT_API_CONFIG.baseUrl}/session/start`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(DIRECT_API_CONFIG.timeout)
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Session started:', data.session_id);
            return data.session_id;
        }
        
        throw new Error(`Session start failed: ${response.status}`);
    } catch (error) {
        console.error('❌ Session start failed:', error.message);
        throw error;
    }
};

window.detectHazards = async function(sessionId, imageBlob) {
    try {
        const formData = new FormData();
        formData.append('file', imageBlob, 'frame.jpg');
        
        const response = await fetch(`${DIRECT_API_CONFIG.baseUrl}/detect/${sessionId}`, {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(DIRECT_API_CONFIG.timeout)
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('🔍 Detection completed:', data.detections?.length || 0, 'detections');
            return data;
        }
        
        throw new Error(`Detection failed: ${response.status}`);
    } catch (error) {
        console.error('❌ Detection failed:', error.message);
        throw error;
    }
};

// Force immediate initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Simple camera fix initialized');
    
    // Override the API URL in the camera detection system
    if (window.setApiUrl) {
        window.setApiUrl(DIRECT_API_CONFIG.baseUrl);
    }
    
    // Test API connection immediately
    window.checkHealth()
        .then(() => {
            console.log('✅ API connection verified');
            // Trigger any loading completion handlers
            const loadingStatus = document.getElementById('loading-status');
            if (loadingStatus) {
                loadingStatus.textContent = 'API Ready - Click Start Camera';
            }
        })
        .catch(error => {
            console.error('❌ API connection failed:', error);
            const loadingStatus = document.getElementById('loading-status');
            if (loadingStatus) {
                loadingStatus.textContent = 'API Error - Check connection';
            }
        });
});

console.log('🎯 Simple camera fix setup complete');