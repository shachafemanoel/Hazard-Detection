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

    let localSession = null;
    let currentImage = null;
    const API_URL = 'https://hazard-detection-production-8735.up.railway.app/api/v1/detect';

    // --- Initialize Local Fallback Engine ---
    try {
        ort.env.wasm.wasmPaths = '/ort/';
        localSession = await ort.InferenceSession.create('/object_detecion_model/best-11-8-2025.onnx');
        console.log("✅ Local fallback engine initialized for uploads.");
    } catch (e) {
        console.error("❌ Local fallback engine failed to load.", e);
        showToast("Warning: Local detection unavailable.", "error");
    }

    // --- Main image processing function ---
    const processImage = async (file) => {
        try {
            showToast("🔍 Using fast server analysis...", "info");
            const detections = await getDetectionsFromAPI(file);
            drawResults(detections);
        } catch (apiError) {
            console.warn("API detection failed. Attempting local fallback.", apiError);
            if (localSession) {
                showToast("⚠️ Server unavailable. Using local browser detection.", "warning");
                const detections = await runInferenceLocally(currentImage);
                drawResults(detections);
            } else {
                showToast("❌ Both server and local detection are unavailable.", "error");
            }
        }
    };

    // --- API Fetcher ---
    const getDetectionsFromAPI = async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(API_URL, { 
            method: 'POST', 
            body: formData,
            mode: 'cors'
        });
        if (!response.ok) throw new Error(`API Error: ${response.status} ${response.statusText}`);
        const data = await response.json();
        // Handle both new /api/v1/detect format and legacy format
        const detections = data.detections || data.results || [];
        return detections.map(det => ({
            ...det,
            box: det.box || det.bbox, // Handle both 'box' and 'bbox' formats
            confidence: det.confidence,
            class_name: det.class_name
        }));
    };

    // --- Local Inference Fallback ---
    const runInferenceLocally = async (image) => {
        if (!image) return [];
        console.log("Running local inference for upload...");
        // Placeholder for actual ONNX.js inference logic
        return [];
    };

    // --- Universal Drawing Function ---
    const drawResults = (detections) => {
        if (!ctx || !currentImage || !detections) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
        detections.forEach(det => {
            if (det.confidence >= parseFloat(confidenceSlider.value)) {
                const [x1, y1, x2, y2] = det.box;
                const label = `${det.class_name} (${(det.confidence * 100).toFixed(1)}%)`;
                ctx.strokeStyle = '#00FF00';
                ctx.lineWidth = 2;
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                ctx.fillStyle = '#00FF00';
                ctx.font = '14px sans-serif';
                ctx.fillText(label, x1, y1 > 10 ? y1 - 5 : 10);
            }
        });
    };

    // --- Updated Event Listener ---
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
});

