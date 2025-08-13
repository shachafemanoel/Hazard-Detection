document.addEventListener("DOMContentLoaded", async () => {
    // --- DOM Elements ---
    const video = document.getElementById("camera-stream");
    const canvas = document.getElementById("overlay-canvas");
    const ctx = canvas.getContext("2d");
    const loadingOverlay = document.getElementById("loading-overlay");
    const startBtn = document.getElementById("start-camera");
    const stopBtn = document.getElementById("stop-camera");
    const switchBtn = document.getElementById("switch-camera");
    const cameraSelect = document.getElementById("camera-select");
    const brightnessSlider = document.getElementById("brightness-slider");
    const zoomSlider = document.getElementById("zoom-slider");

    const controls = [startBtn, stopBtn, switchBtn, cameraSelect, brightnessSlider, zoomSlider];

    let modelManager = null;
    let detecting = false;
    let currentStream = null;
    let frameCanvas = null; // Reuse canvas to prevent memory leaks

    // --- Utility Functions ---
    const setControlsEnabled = (enabled) => {
        controls.forEach(control => {
            if (control) control.disabled = !enabled;
        });
    };

    const hideLoadingOverlay = () => {
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    };

    const showLoadingOverlay = (message = 'Loading...') => {
        if (loadingOverlay) {
            const loadingText = loadingOverlay.querySelector('p');
            if (loadingText) loadingText.textContent = message;
            loadingOverlay.style.display = 'flex';
        }
    };

    // --- Initial State ---
    setControlsEnabled(false);

    // --- Initialize Model Manager ---
    try {
        showLoadingOverlay('Initializing detection engine...');
        
        // Import the enhanced model manager
        const { default: manager } = await import('./modelManager.js');
        modelManager = manager;
        
        // Initialize the local model proactively
        await modelManager.initializeLocalModel();
        console.log("✅ Model manager initialized for camera.");
        
    } catch (e) {
        console.error("❌ Model manager initialization failed:", e);
        console.warn("⚠️ Camera will use API-only mode");
    } finally {
        hideLoadingOverlay();
        setControlsEnabled(true);
    }

    // --- Enhanced Detection Loop ---
    async function detectLoop() {
        if (!detecting || !video.videoWidth || !video.videoHeight) {
            requestAnimationFrame(detectLoop);
            return;
        }

        if (!modelManager) {
            console.warn("Model manager not available for detection");
            requestAnimationFrame(detectLoop);
            return;
        }

        try {
            // Create or reuse canvas from current video frame (prevent memory leaks)
            if (!frameCanvas) {
                frameCanvas = document.createElement('canvas');
            }
            
            // Only resize if dimensions changed
            if (frameCanvas.width !== video.videoWidth || frameCanvas.height !== video.videoHeight) {
                frameCanvas.width = video.videoWidth;
                frameCanvas.height = video.videoHeight;
            }
            
            const frameCtx = frameCanvas.getContext('2d');
            frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);

            // Use model manager for detection with fallback
            const detections = await modelManager.detectHazards(frameCanvas, {
                confidenceThreshold: 0.5,
                useLocalOnly: false
            });

            drawResults(detections);

        } catch (error) {
            console.warn("Detection failed in camera loop:", error.message);
            
            // Show user feedback for persistent errors
            if (error.message.includes('Model not initialized') || error.message.includes('ONNX Runtime not loaded')) {
                updateDetectionStatus(0);
                console.error("🚨 Critical model error - stopping detection");
                detecting = false;
                return; // Stop the loop
            }
            
            // For network errors, continue but show status
            updateDetectionStatus(0);
        }

        // Schedule next detection
        requestAnimationFrame(detectLoop);
    }


    // --- Enhanced Drawing Function for Real-time Detection ---
    const drawResults = (detections) => {
        if (!ctx || !video) {
            return;
        }

        // Ensure canvas dimensions match video
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        // Clear previous overlay (video feed is handled by HTML video element)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!detections || detections.length === 0) {
            updateDetectionStatus(0);
            return;
        }

        const confidenceThreshold = 0.5; // Could be made configurable
        let validDetections = 0;

        detections.forEach((det, index) => {
            if (det.confidence >= confidenceThreshold) {
                validDetections++;
                const [x1, y1, x2, y2] = det.box;
                const width = x2 - x1;
                const height = y2 - y1;
                const label = `${det.class_name} (${(det.confidence * 100).toFixed(1)}%)`;
                
                // Color coding based on confidence
                let color = '#00FF00'; // Green for high confidence
                if (det.confidence < 0.7) color = '#FFA500'; // Orange for medium
                if (det.confidence < 0.5) color = '#FF0000'; // Red for low
                
                // Draw bounding box with enhanced visibility
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.strokeRect(x1, y1, width, height);
                
                // Draw semi-transparent fill for better visibility
                ctx.fillStyle = color + '20'; // Add transparency
                ctx.fillRect(x1, y1, width, height);
                
                // Draw label with background
                ctx.font = '14px Arial, sans-serif';
                const textMetrics = ctx.measureText(label);
                const textWidth = textMetrics.width + 8;
                const textHeight = 20;
                const labelY = y1 > textHeight ? y1 - 2 : y1 + height + textHeight;
                
                // Label background
                ctx.fillStyle = color;
                ctx.fillRect(x1, labelY - textHeight, textWidth, textHeight);
                
                // Label text
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(label, x1 + 4, labelY - 6);
                
                // Draw corner indicators for better tracking
                const cornerSize = 10;
                ctx.fillStyle = color;
                // Top-left corner
                ctx.fillRect(x1 - 2, y1 - 2, cornerSize, 3);
                ctx.fillRect(x1 - 2, y1 - 2, 3, cornerSize);
                // Top-right corner
                ctx.fillRect(x2 - cornerSize + 2, y1 - 2, cornerSize, 3);
                ctx.fillRect(x2 - 1, y1 - 2, 3, cornerSize);
                // Bottom-left corner
                ctx.fillRect(x1 - 2, y2 - 1, cornerSize, 3);
                ctx.fillRect(x1 - 2, y2 - cornerSize + 2, 3, cornerSize);
                // Bottom-right corner
                ctx.fillRect(x2 - cornerSize + 2, y2 - 1, cornerSize, 3);
                ctx.fillRect(x2 - 1, y2 - cornerSize + 2, 3, cornerSize);
            }
        });

        updateDetectionStatus(validDetections);
        
        // Show hazard notification for real-time alerts
        if (validDetections > 0) {
            showHazardNotification(validDetections, detections);
        }
    };

    // --- Detection Status Updates ---
    const updateDetectionStatus = (count) => {
        const statusOverlay = document.getElementById('object-count-overlay');
        if (statusOverlay) {
            statusOverlay.textContent = count > 0 ? `${count} hazard(s) detected` : '';
            statusOverlay.className = count > 0 ? 'detection-active' : '';
        }
    };

    // --- Hazard Notification System ---
    const showHazardNotification = (count, detections) => {
        // This would integrate with the hazard notification template in camera.html
        const template = document.getElementById('hazard-notification-template');
        if (template) {
            const notification = template.content.cloneNode(true);
            const content = notification.querySelector('.hazard-notification-content p');
            if (content) {
                const hazardTypes = [...new Set(detections.map(d => d.class_name))].join(', ');
                content.textContent = `${count} hazard(s) detected: ${hazardTypes}`;
            }
            
            // Add to page temporarily (implement proper notification system)
            console.log(`🚨 Real-time alert: ${count} hazard(s) detected`);
        }
    };

    // --- Enhanced Camera Controls ---
    startBtn.addEventListener("click", async () => {
        try {
            showLoadingOverlay('Starting camera...');
            
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment' // Prefer back camera on mobile
                }
            };
            
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = currentStream;
            
            video.onloadedmetadata = () => {
                video.play();
                detecting = true;
                detectLoop();
                
                // Update UI state
                startBtn.disabled = true;
                stopBtn.disabled = false;
                
                console.log('✅ Camera started with enhanced detection');
                hideLoadingOverlay();
            };
            
        } catch (error) {
            console.error('❌ Failed to start camera:', error);
            hideLoadingOverlay();
            alert('Failed to access camera. Please check permissions and try again.');
        }
    });

    // Camera stop logic
    stopBtn.addEventListener("click", () => {
        detecting = false;
        
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        
        video.srcObject = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Update UI state
        startBtn.disabled = false;
        stopBtn.disabled = true;
        
        updateDetectionStatus(0);
        console.log('🛑 Camera stopped');
    });

    // Camera switch logic
    switchBtn.addEventListener("click", async () => {
        if (!currentStream) return;
        
        try {
            // Stop current stream
            currentStream.getTracks().forEach(track => track.stop());
            
            // Switch facing mode
            const videoTrack = currentStream.getVideoTracks()[0];
            const currentFacingMode = videoTrack.getSettings().facingMode;
            const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
            
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: newFacingMode
                }
            };
            
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = currentStream;
            
            console.log(`📱 Switched to ${newFacingMode} camera`);
            
        } catch (error) {
            console.error('❌ Failed to switch camera:', error);
            // Try to restart with default settings
            startBtn.click();
        }
    });

    // Initialize button states
    stopBtn.disabled = true;
    
    console.log("✅ Camera interface initialized with enhanced model management");
});

