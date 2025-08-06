// Camera Detection Hotfix - Fixes stuck loading issue
// This script runs after DOM loads and fixes the initialization

(function() {
    'use strict';
    
    console.log('🔧 Camera hotfix loading...');
    
    // Direct API URL configuration
    const API_URL = 'https://hazard-api-production-production.up.railway.app';
    
    // Wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', function() {
        console.log('📱 Camera hotfix initializing...');
        
        // Override the complex network resolution with direct URL
        if (window.setApiUrl) {
            window.setApiUrl(API_URL);
            console.log('✅ API URL set directly:', API_URL);
        }
        
        // Fix loading status immediately
        const loadingStatus = document.getElementById('loading-status');
        const loadingOverlay = document.getElementById('loading-overlay');
        
        if (loadingStatus) {
            loadingStatus.textContent = 'Connecting to API...';
        }
        
        // Test API connection and fix loading state
        setTimeout(async function() {
            try {
                console.log('🔍 Testing API connection...');
                const response = await fetch(`${API_URL}/health`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    },
                    signal: AbortSignal.timeout(5000)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('✅ API connection successful:', data);
                    
                    // Update UI to show ready state
                    if (loadingStatus) {
                        loadingStatus.textContent = 'Ready - Click Start Camera';
                    }
                    if (loadingOverlay) {
                        loadingOverlay.style.display = 'none';
                    }
                    
                    // Enable start button
                    const startButton = document.getElementById('start-camera');
                    if (startButton) {
                        startButton.disabled = false;
                        startButton.style.opacity = '1';
                    }
                    
                    // Update detection mode info
                    const modeInfo = document.getElementById('detection-mode-info');
                    if (modeInfo) {
                        modeInfo.textContent = 'Cloud AI Ready';
                    }
                    
                } else {
                    throw new Error(`API returned ${response.status}`);
                }
                
            } catch (error) {
                console.warn('⚠️ API connection failed, enabling local mode:', error.message);
                
                // Fallback to local mode
                if (loadingStatus) {
                    loadingStatus.textContent = 'Local Mode - Click Start Camera';
                }
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'none';
                }
                
                // Enable start button for local mode
                const startButton = document.getElementById('start-camera');
                if (startButton) {
                    startButton.disabled = false;
                    startButton.style.opacity = '1';
                }
                
                // Update detection mode info
                const modeInfo = document.getElementById('detection-mode-info');
                if (modeInfo) {
                    modeInfo.textContent = 'Local ONNX Model';
                }
            }
        }, 1000);
        
        console.log('🎯 Camera hotfix applied successfully');
    });
    
})();