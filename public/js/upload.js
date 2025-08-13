document.addEventListener("DOMContentLoaded", async () => {
    // --- DOM Elements ---
    const imageUpload = document.getElementById("image-upload");
    const canvas = document.getElementById("preview-canvas");
    const ctx = canvas.getContext("2d");
    const confidenceSlider = document.getElementById("confidence-slider");

    const toastElement = document.getElementById('toast-notification');
    const toastBody = document.getElementById('toast-body');

    function showToast(message, type = 'success') {
        if (!toastElement || !toastBody) return;
        toastBody.textContent = message;
        toastElement.classList.remove('bg-success', 'bg-danger', 'bg-warning');
        if (type === 'success') {
            toastElement.classList.add('bg-success');
        } else if (type === 'warning') {
            toastElement.classList.add('bg-warning');
        } else if (type === 'error') {
            toastElement.classList.add('bg-danger');
        }
        toastElement.style.display = 'block';
        setTimeout(() => {
            toastElement.style.display = 'none';
        }, 5000);
    }

    let currentImage = null;
    let modelManager = null;
    let currentDetections = [];
    
    // --- Initialize Model Manager ---
    try {
        // Import the enhanced model manager
        const { default: manager } = await import('./modelManager.js');
        modelManager = manager;
        
        // Initialize the local model proactively
        showToast("🚀 Initializing detection engine...", "info");
        await modelManager.initializeLocalModel();
        console.log("✅ Model manager initialized for uploads.");
        showToast("✅ Detection engine ready!", "success");
    } catch (e) {
        console.error("❌ Model manager initialization failed:", e);
        showToast("⚠️ Local detection may be limited. API fallback available.", "warning");
    }

    // --- Main image processing function ---
    const processImage = async (file) => {
        if (!modelManager) {
            showToast("❌ Detection engine not available", "error");
            return;
        }

        try {
            showToast("🔍 Analyzing image...", "info");
            
            const confidenceThreshold = parseFloat(confidenceSlider.value);
            const detections = await modelManager.detectHazards(file, {
                confidenceThreshold,
                useLocalOnly: false
            });
            
            enhancedDrawResults(detections);
            
            if (detections.length === 0) {
                showToast("No hazards detected in the image", "info");
            } else {
                showToast(`Found ${detections.length} potential hazard(s)`, "success");
            }
            
        } catch (error) {
            console.error("Detection failed:", error);
            showToast(`❌ Detection failed: ${error.message}`, "error");
            
            // Fallback: try to show the image anyway
            if (currentImage) {
                enhancedDrawResults([]);
            }
        }
    };


    // --- Enhanced Drawing Function ---
    const drawResults = (detections) => {
        if (!ctx || !currentImage) {
            console.warn("Cannot draw results: missing context or image");
            return;
        }
        
        // Clear and redraw the base image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
        
        if (!detections || detections.length === 0) {
            return;
        }

        const confidenceThreshold = parseFloat(confidenceSlider.value);
        
        detections.forEach((det, index) => {
            if (det.confidence >= confidenceThreshold) {
                const [x1, y1, x2, y2] = det.box;
                const width = x2 - x1;
                const height = y2 - y1;
                const label = `${det.class_name} (${(det.confidence * 100).toFixed(1)}%)`;
                
                // Color coding based on confidence
                let color = '#00FF00'; // Green for high confidence
                if (det.confidence < 0.7) color = '#FFA500'; // Orange for medium
                if (det.confidence < 0.5) color = '#FF0000'; // Red for low
                
                // Draw bounding box
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.strokeRect(x1, y1, width, height);
                
                // Draw label background
                ctx.font = '14px Arial, sans-serif';
                const textMetrics = ctx.measureText(label);
                const textWidth = textMetrics.width + 8;
                const textHeight = 20;
                const labelY = y1 > textHeight ? y1 - 2 : y1 + height + textHeight;
                
                ctx.fillStyle = color;
                ctx.fillRect(x1, labelY - textHeight, textWidth, textHeight);
                
                // Draw label text
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(label, x1 + 4, labelY - 6);
                
                // Draw corner indicators for better visibility
                const cornerSize = 8;
                ctx.fillStyle = color;
                // Top-left corner
                ctx.fillRect(x1 - 2, y1 - 2, cornerSize, 2);
                ctx.fillRect(x1 - 2, y1 - 2, 2, cornerSize);
                // Top-right corner
                ctx.fillRect(x2 - cornerSize + 2, y1 - 2, cornerSize, 2);
                ctx.fillRect(x2, y1 - 2, 2, cornerSize);
                // Bottom-left corner
                ctx.fillRect(x1 - 2, y2, cornerSize, 2);
                ctx.fillRect(x1 - 2, y2 - cornerSize + 2, 2, cornerSize);
                // Bottom-right corner
                ctx.fillRect(x2 - cornerSize + 2, y2, cornerSize, 2);
                ctx.fillRect(x2, y2 - cornerSize + 2, 2, cornerSize);
            }
        });
        
        // Update save button state
        updateSaveButtonState(detections.length > 0);
    };
    
    // --- Save Button State Management ---
    const updateSaveButtonState = (hasDetections) => {
        const saveBtn = document.getElementById('save-detection');
        if (saveBtn) {
            saveBtn.disabled = !hasDetections;
            if (hasDetections) {
                saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    };

    // Enhanced drawing function that stores detections
    const enhancedDrawResults = (detections) => {
        currentDetections = detections || [];
        drawResults(detections);
    };

    // --- Event Listeners ---
    imageUpload.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                currentImage = img;
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                processImage(file);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    // Confidence threshold slider
    confidenceSlider.addEventListener("input", (e) => {
        const confValue = document.getElementById("conf-value");
        if (confValue) {
            confValue.textContent = e.target.value;
        }
        
        // Redraw with new threshold
        if (currentDetections.length > 0) {
            drawResults(currentDetections);
        }
    });

    // Initialize save button state
    updateSaveButtonState(false);
    
    console.log("✅ Upload interface initialized with enhanced model management");
});

