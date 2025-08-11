/**
 * @fileoverview Inference worker for handling ONNX model loading and execution.
 * This script is designed to run in a Web Worker to offload ML tasks from the main thread.
 * It implements a robust backend initialization strategy, first attempting WebGPU
 * and falling back to WASM if WebGPU is unavailable or fails.
 *
 * v2: Adds explicit path configuration for ONNX Runtime WASM assets.
 */

import ort from '/ort/ort.wasm.bundle.min.mjs';

let session;
let modelOptions;

/**
 * Handles messages from the main thread.
 */
self.onmessage = async (event) => {
    const { type, payload } = event.data;

    if (type === 'test') {
        self.postMessage('worker_ready');
        return;
    }

    if (type === 'init') {
        try {
            modelOptions = payload.opts;
            const initResult = await initializeModel(payload);
            session = initResult.session;

            self.postMessage({
                type: 'init_success',
                payload: {
                    backend: initResult.backend,
                    modelPath: initResult.modelPath,
                    initTime: initResult.initTime,
                    warmupTime: initResult.warmupTime,
                    inputSize: modelOptions.inputSize
                }
            });

        } catch (error) {
            console.error("Worker Initialization Error:", error);
            self.postMessage({
                type: 'init_error',
                payload: { message: `Failed to load ONNX model with any available backend. Last error: [${error.backend}] ${error.message}` }
            });
        }
    }

    if (type === 'run_image_bitmap') {
        try {
            if (!session) {
                throw new Error('Model not initialized');
            }

            const { bitmap, opts } = payload;
            const result = await runInference(bitmap, opts);
            
            self.postMessage({
                type: 'inference_result',
                payload: result
            });

        } catch (error) {
            console.error("Inference Error:", error);
            self.postMessage({
                type: 'run_error',
                payload: { message: error.message }
            });
        }
    }
};

/**
 * Creates an ONNX Runtime inference session with a robust fallback mechanism.
 */
async function initializeModel({ modelUrl, opts }) {
    const accessibleModels = [
        '/object_detection_model/best0608.onnx',
        '/onxx_models/best.onnx', 
        '/onxx_models/best_web.onnx'
    ];
    const selectedModel = modelUrl || accessibleModels[0];

    // --- NEW FIX: Set the path for WASM assets ---
    // This tells ONNX Runtime where to find files like 'ort-wasm-simd-threaded.mjs'
    // The path should be the directory where you store the ONNX 'ort-wasm-*.wasm' files.
    ort.env.wasm.wasmPaths = '/ort/';
    // ---------------------------------------------

    // 1. Attempt to initialize with 'webgpu'
    try {
        const result = await createSession(selectedModel, 'webgpu');
        console.log('✅ WebGPU backend initialized successfully.');
        return { ...result, modelPath: selectedModel };
    } catch (webgpuError) {
        console.warn(`WebGPU initialization failed. Reason: ${webgpuError.message}. Falling back to WASM.`);

        // 2. Fall back to 'wasm'
        try {
            const result = await createSession(selectedModel, 'wasm');
            console.log('✅ WASM backend initialized successfully.');
            return { ...result, modelPath: selectedModel };
        } catch (wasmError) {
            // Add backend info to the error for better debugging
            wasmError.backend = 'wasm';
            throw wasmError;
        }
    }
}

/**
 * Helper function to create and warm up an inference session.
 */
async function createSession(modelPath, backend) {
    const startTime = performance.now();
    const sessionOptions = {
        executionProviders: [backend],
        graphOptimizationLevel: 'all',
    };
    
    const newSession = await ort.InferenceSession.create(modelPath, sessionOptions);
    const initTime = performance.now() - startTime;

    const warmupStart = performance.now();
    const inputSize = modelOptions.inputSize || 640;
    const warmupInput = new ort.Tensor('float32', new Float32Array(3 * inputSize * inputSize).fill(0), [1, 3, inputSize, inputSize]);
    await newSession.run({ [newSession.inputNames[0]]: warmupInput });
    const warmupTime = performance.now() - warmupStart;
    
    self.postMessage({ type: 'engine_info', payload: { backend, inputSize } });

    return { session: newSession, backend, initTime, warmupTime };
}

/**
 * Runs inference on an ImageBitmap and returns detection results
 */
async function runInference(bitmap, opts) {
    const startTime = performance.now();
    
    // Use options or defaults
    const inputSize = opts.inputSize || modelOptions.inputSize || 640;
    const threshold = opts.threshold || 0.5;
    const iouThreshold = opts.iou || 0.45;
    
    // Preprocessing
    const preprocessStart = performance.now();
    const inputTensor = await preprocessImage(bitmap, inputSize);
    const preprocessTime = performance.now() - preprocessStart;
    
    // Inference
    const inferStart = performance.now();
    const results = await session.run({ [session.inputNames[0]]: inputTensor });
    const inferTime = performance.now() - inferStart;
    
    // Postprocessing
    const postprocessStart = performance.now();
    const detections = postprocessYOLO(results, threshold, iouThreshold, inputSize);
    const postprocessTime = performance.now() - postprocessStart;
    
    const totalTime = performance.now() - startTime;
    
    return {
        detections,
        timings: {
            preprocess_ms: Math.round(preprocessTime),
            infer_ms: Math.round(inferTime),
            postprocess_ms: Math.round(postprocessTime),
            total_ms: Math.round(totalTime)
        },
        backend: session._sessionOptions?.executionProviders?.[0] || 'unknown'
    };
}

/**
 * Preprocesses ImageBitmap for YOLO model input
 */
async function preprocessImage(bitmap, inputSize) {
    // Create offscreen canvas for image preprocessing
    const canvas = new OffscreenCanvas(inputSize, inputSize);
    const ctx = canvas.getContext('2d');
    
    // Draw and resize image to model input size
    ctx.drawImage(bitmap, 0, 0, inputSize, inputSize);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, inputSize, inputSize);
    const { data } = imageData;
    
    // Convert to RGB float32 tensor [1, 3, H, W] normalized to [0, 1]
    const tensorData = new Float32Array(3 * inputSize * inputSize);
    
    for (let i = 0; i < inputSize * inputSize; i++) {
        const pixelIndex = i * 4;
        const tensorIndex = i;
        
        // Normalize from [0, 255] to [0, 1] and arrange in CHW format
        tensorData[tensorIndex] = data[pixelIndex] / 255.0; // R
        tensorData[inputSize * inputSize + tensorIndex] = data[pixelIndex + 1] / 255.0; // G
        tensorData[2 * inputSize * inputSize + tensorIndex] = data[pixelIndex + 2] / 255.0; // B
    }
    
    return new ort.Tensor('float32', tensorData, [1, 3, inputSize, inputSize]);
}

/**
 * Postprocesses YOLO model output to extract bounding boxes
 */
function postprocessYOLO(results, threshold, iouThreshold, inputSize) {
    // Get the output tensor (assuming YOLOv8 format)
    const output = Object.values(results)[0];
    const outputData = output.data;
    const outputShape = output.dims; // Expected: [1, 84, 8400] for YOLOv8
    
    if (outputShape.length !== 3) {
        console.warn('Unexpected output shape:', outputShape);
        return [];
    }
    
    const numClasses = 4; // crack, knocked, pothole, surface damage
    const numDetections = outputShape[2]; // 8400 for YOLOv8
    const boxDataSize = outputShape[1]; // 84 for YOLOv8 (4 box coords + 80 classes, but we only use first 4 classes)
    
    const detections = [];
    
    // Process each detection
    for (let i = 0; i < numDetections; i++) {
        // Extract box coordinates (center x, center y, width, height)
        const cx = outputData[i];
        const cy = outputData[numDetections + i];
        const w = outputData[2 * numDetections + i];
        const h = outputData[3 * numDetections + i];
        
        // Find best class and confidence
        let bestClass = 0;
        let bestScore = outputData[4 * numDetections + i]; // First class score
        
        for (let c = 1; c < numClasses; c++) {
            const score = outputData[(4 + c) * numDetections + i];
            if (score > bestScore) {
                bestScore = score;
                bestClass = c;
            }
        }
        
        // Filter by confidence threshold
        if (bestScore < threshold) continue;
        
        // Convert center format to corner format
        const x1 = (cx - w / 2) * inputSize;
        const y1 = (cy - h / 2) * inputSize;
        const x2 = (cx + w / 2) * inputSize;
        const y2 = (cy + h / 2) * inputSize;
        
        // Clamp to input size bounds
        detections.push({
            x1: Math.max(0, Math.min(inputSize, x1)),
            y1: Math.max(0, Math.min(inputSize, y1)),
            x2: Math.max(0, Math.min(inputSize, x2)),
            y2: Math.max(0, Math.min(inputSize, y2)),
            score: bestScore,
            classId: bestClass
        });
    }
    
    // Apply Non-Maximum Suppression (basic implementation)
    return applyNMS(detections, iouThreshold);
}

/**
 * Applies Non-Maximum Suppression to remove overlapping detections
 */
function applyNMS(detections, iouThreshold) {
    if (detections.length === 0) return [];
    
    // Sort by confidence (descending)
    detections.sort((a, b) => b.score - a.score);
    
    const kept = [];
    const suppressed = new Set();
    
    for (let i = 0; i < detections.length; i++) {
        if (suppressed.has(i)) continue;
        
        const det1 = detections[i];
        kept.push(det1);
        
        // Suppress overlapping detections
        for (let j = i + 1; j < detections.length; j++) {
            if (suppressed.has(j)) continue;
            
            const det2 = detections[j];
            
            // Only suppress if same class and high overlap
            if (det1.classId === det2.classId && calculateIoU(det1, det2) > iouThreshold) {
                suppressed.add(j);
            }
        }
    }
    
    return kept;
}

/**
 * Calculates Intersection over Union (IoU) between two bounding boxes
 */
function calculateIoU(box1, box2) {
    const xLeft = Math.max(box1.x1, box2.x1);
    const yTop = Math.max(box1.y1, box2.y1);
    const xRight = Math.min(box1.x2, box2.x2);
    const yBottom = Math.min(box1.y2, box2.y2);
    
    if (xRight <= xLeft || yBottom <= yTop) {
        return 0; // No intersection
    }
    
    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
    const box1Area = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
    const box2Area = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);
    const unionArea = box1Area + box2Area - intersectionArea;
    
    return intersectionArea / unionArea;
}