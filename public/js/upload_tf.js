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

    let localSession = null;
    let detecting = false;
    const API_URL = 'http://localhost:8000/api/v1/detect';

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

    // --- Initial State ---
    setControlsEnabled(false);

    // --- 1. Initialize Local Fallback Engine ---
    try {
        ort.env.wasm.wasmPaths = '/ort/';
        localSession = await ort.InferenceSession.create('/object_detecion_model/best-11-8-2025.onnx');
        console.log("✅ Local fallback engine initialized for camera.");
    } catch (e) {
        console.error("❌ Camera fallback engine failed to load.", e);
    } finally {
        hideLoadingOverlay();
        setControlsEnabled(true);
    }

    // --- 2. Main Detection Loop ---
    async function detectLoop() {
        if (!detecting) return;

        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = video.videoWidth;
        frameCanvas.height = video.videoHeight;
        const frameCtx = frameCanvas.getContext('2d');
        frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);

        try {
            const detections = await getDetectionsFromAPI(frameCanvas);
            drawResults(detections);
        } catch (apiError) {
            console.warn("API detection failed, using local fallback.", apiError.message);
            if (localSession) {
                const detections = await runInferenceLocally(video);
                drawResults(detections);
            }
        }

        requestAnimationFrame(detectLoop);
    }

    // --- 3. API Fetcher for Camera Frame ---
    const getDetectionsFromAPI = (canvasElement) => {
        return new Promise((resolve, reject) => {
            canvasElement.toBlob(async (blob) => {
                if (!blob) {
                    return reject(new Error("Canvas to Blob conversion failed."));
                }
                const formData = new FormData();
                formData.append("file", blob, "frame.jpg");
                try {
                    const response = await fetch(API_URL, { method: 'POST', body: formData });
                    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
                    const data = await response.json();
                    resolve(data.detections);
                } catch (error) {
                    reject(error);
                }
            }, 'image/jpeg');
        });
    };

    // --- 4. Local Inference Fallback ---
    const runInferenceLocally = async (videoElement) => {
        if (!videoElement) return [];
        console.log("Running local inference for camera...");
        // Placeholder for actual ONNX.js inference logic
        return [];
    };

    // --- 5. Universal Drawing Function ---
    const drawResults = (detections) => {
        if (!ctx || !video || !detections) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        detections.forEach(det => {
            const [x1, y1, x2, y2] = det.box;
            const label = `${det.class_name} (${(det.confidence * 100).toFixed(1)}%)`;
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2;
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            ctx.fillStyle = '#00FF00';
            ctx.font = '14px sans-serif';
            ctx.fillText(label, x1, y1 > 10 ? y1 - 5 : 10);
        });
    };

    // --- Camera start button logic ---
    startBtn.addEventListener("click", () => {
        navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();
                detecting = true;
                detectLoop();
            };
        });
    });
});

