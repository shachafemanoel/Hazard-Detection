/**
 * Unified Model Management System
 * Handles model loading with robust fallback mechanisms between cloud API and local ONNX models
 */

class ModelManager {
    constructor() {
        this.localSession = null;
        this.isLocalReady = false;
        this.isInitializing = false;
        this.initPromise = null;
        this.apiEndpoints = [
            '/upload-detection',  // Local backend first
            'https://hazard-detection-production-8735.up.railway.app/api/v1/detect'  // External fallback
        ];
        this.modelConfig = {
            modelPath: '/object_detection_model/best-11-8-2025.onnx',
            wasmPaths: '/ort/',
            executionProviders: ['webgl', 'wasm'],
            inputSize: 640,
            classNames: ['hazard', 'pothole', 'crack', 'debris']
        };
        this.retryConfig = {
            maxRetries: 3,
            timeout: 10000,
            retryDelay: 1000
        };
    }

    /**
     * Initialize the local ONNX model with comprehensive error handling
     */
    async initializeLocalModel() {
        if (this.isLocalReady && this.localSession) {
            console.log('♻️ Using existing ONNX session');
            return this.localSession;
        }

        if (this.isInitializing) {
            console.log('⏳ Waiting for existing initialization to complete');
            return this.initPromise;
        }

        this.isInitializing = true;
        this.initPromise = this._performInitialization();

        try {
            const session = await this.initPromise;
            this.isLocalReady = true;
            this.isInitializing = false;
            console.log('✅ Model initialization completed successfully');
            return session;
        } catch (error) {
            this.isLocalReady = false;
            this.isInitializing = false;
            this.localSession = null;
            this.initPromise = null;
            console.error('❌ Model initialization failed:', error.message);
            throw error;
        }
    }

    async _performInitialization() {
        try {
            // Check if ONNX Runtime is available
            if (typeof ort === 'undefined') {
                throw new Error('ONNX Runtime not loaded. Make sure ort.min.js is included.');
            }

            console.log('🚀 Initializing ONNX Runtime...');

            // Configure ONNX Runtime environment
            ort.env.wasm.wasmPaths = this.modelConfig.wasmPaths;
            ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 4);
            ort.env.logLevel = 'warning';

            // Load the model with retry mechanism
            this.localSession = await this._loadModelWithRetry();
            
            console.log('✅ ONNX Runtime initialized successfully');
            console.log(`Model loaded: ${this.modelConfig.modelPath}`);
            console.log(`Execution providers: ${this.modelConfig.executionProviders.join(', ')}`);
            
            return this.localSession;

        } catch (error) {
            console.error('❌ Failed to initialize ONNX Runtime:', error);
            this.localSession = null;
            throw new Error(`Local model initialization failed: ${error.message}`);
        }
    }

    async _loadModelWithRetry() {
        let lastError;
        
        for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                console.log(`Loading model attempt ${attempt}/${this.retryConfig.maxRetries}`);
                
                const session = await ort.InferenceSession.create(
                    this.modelConfig.modelPath,
                    {
                        executionProviders: this.modelConfig.executionProviders,
                        graphOptimizationLevel: 'all',
                        enableCpuMemArena: false,
                        enableMemPattern: false
                    }
                );
                
                console.log(`✅ Model loaded successfully on attempt ${attempt}`);
                return session;
                
            } catch (error) {
                lastError = error;
                console.warn(`❌ Model loading attempt ${attempt} failed:`, error.message);
                
                if (attempt < this.retryConfig.maxRetries) {
                    console.log(`Retrying in ${this.retryConfig.retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryConfig.retryDelay));
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Perform detection with automatic fallback from API to local model
     */
    async detectHazards(input, options = {}) {
        const { useLocalOnly = false, confidenceThreshold = 0.5 } = options;
        
        if (!useLocalOnly) {
            try {
                console.log('🌐 Attempting cloud API detection...');
                const apiDetections = await this._detectWithAPI(input);
                console.log('✅ Cloud API detection successful');
                return this._normalizeDetections(apiDetections, confidenceThreshold);
            } catch (apiError) {
                console.warn('⚠️ API detection failed, falling back to local model:', apiError.message);
            }
        }

        // Fallback to local model
        try {
            console.log('🔄 Using local ONNX model...');
            if (!this.isLocalReady) {
                await this.initializeLocalModel();
            }
            const localDetections = await this._detectWithLocalModel(input);
            console.log('✅ Local model detection successful');
            return this._normalizeDetections(localDetections, confidenceThreshold);
        } catch (localError) {
            console.error('❌ Local model detection failed:', localError.message);
            throw new Error(`Both API and local detection failed. API: ${apiError?.message || 'N/A'}, Local: ${localError.message}`);
        }
    }

    /**
     * Detect using cloud API with multiple endpoint fallback
     */
    async _detectWithAPI(input) {
        const formData = new FormData();
        
        if (input instanceof HTMLCanvasElement) {
            // Convert canvas to blob
            const blob = await new Promise(resolve => input.toBlob(resolve, 'image/jpeg', 0.8));
            formData.append('file', blob, 'frame.jpg');
        } else if (input instanceof File) {
            formData.append('file', input);
        } else {
            throw new Error('Invalid input type for API detection');
        }

        let lastError;

        for (let i = 0; i < this.apiEndpoints.length; i++) {
            const endpoint = this.apiEndpoints[i];
            
            try {
                console.log(`Trying API endpoint ${i + 1}/${this.apiEndpoints.length}: ${endpoint}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.retryConfig.timeout);
                
                const response = await fetch(endpoint, {
                    method: 'POST',
                    body: formData,
                    mode: 'cors',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                const detections = data.detections || data.results || [];
                
                console.log(`✅ API endpoint ${endpoint} succeeded with ${detections.length} detections`);
                return detections;
                
            } catch (error) {
                lastError = error;
                console.warn(`❌ API endpoint ${endpoint} failed:`, error.message);
                
                if (error.name === 'AbortError') {
                    console.warn('Request timed out');
                } else if (error.name === 'TypeError') {
                    console.warn('Network error or CORS issue');
                }
            }
        }
        
        throw new Error(`All API endpoints failed. Last error: ${lastError?.message}`);
    }

    /**
     * Detect using local ONNX model
     */
    async _detectWithLocalModel(input) {
        if (!this.localSession) {
            throw new Error('Local model not initialized');
        }

        try {
            // Preprocess input for ONNX model
            const preprocessedData = await this._preprocessInput(input);
            
            // Run inference
            const results = await this.localSession.run({
                images: preprocessedData
            });
            
            // Postprocess results
            const detections = this._postprocessResults(results, input);
            
            return detections;
            
        } catch (error) {
            throw new Error(`Local inference failed: ${error.message}`);
        }
    }

    /**
     * Preprocess input for ONNX model
     */
    async _preprocessInput(input) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const size = this.modelConfig.inputSize;
        canvas.width = size;
        canvas.height = size;
        
        if (input instanceof HTMLVideoElement) {
            ctx.drawImage(input, 0, 0, size, size);
        } else if (input instanceof HTMLImageElement) {
            ctx.drawImage(input, 0, 0, size, size);
        } else if (input instanceof HTMLCanvasElement) {
            ctx.drawImage(input, 0, 0, size, size);
        } else {
            throw new Error('Unsupported input type for preprocessing');
        }
        
        // Get image data and normalize
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        
        // Convert to float32 tensor [1, 3, 640, 640]
        const tensor = new Float32Array(1 * 3 * size * size);
        
        for (let i = 0; i < size * size; i++) {
            // RGB order, normalized to [0, 1]
            tensor[i] = data[i * 4] / 255.0;           // R
            tensor[size * size + i] = data[i * 4 + 1] / 255.0;  // G
            tensor[size * size * 2 + i] = data[i * 4 + 2] / 255.0; // B
        }
        
        return new ort.Tensor('float32', tensor, [1, 3, size, size]);
    }

    /**
     * Postprocess ONNX model results
     */
    _postprocessResults(results, originalInput) {
        // This is a placeholder for actual YOLO/object detection postprocessing
        // The actual implementation would depend on your specific model's output format
        
        // For now, return empty array as the actual local inference is not fully implemented
        console.log('Local inference postprocessing - placeholder implementation');
        return [];
    }

    /**
     * Normalize detection results to consistent format
     */
    _normalizeDetections(detections, confidenceThreshold) {
        if (!Array.isArray(detections)) {
            return [];
        }

        return detections
            .map(det => ({
                box: det.box || det.bbox || [0, 0, 0, 0],
                confidence: det.confidence || 0,
                class_name: det.class_name || det.label || 'unknown',
                class_id: det.class_id || 0
            }))
            .filter(det => det.confidence >= confidenceThreshold);
    }

    /**
     * Get current model status
     */
    getStatus() {
        return {
            localReady: this.isLocalReady,
            initializing: this.isInitializing,
            sessionActive: !!this.localSession,
            apiEndpoints: this.apiEndpoints.length,
            modelPath: this.modelConfig.modelPath
        };
    }

    /**
     * Force reload of local model
     */
    async reloadLocalModel() {
        this.isLocalReady = false;
        this.localSession = null;
        this.isInitializing = false;
        this.initPromise = null;
        
        return await this.initializeLocalModel();
    }

    /**
     * Cleanup resources
     */
    dispose() {
        if (this.localSession) {
            try {
                this.localSession.dispose();
            } catch (error) {
                console.warn('Error disposing ONNX session:', error);
            }
        }
        
        this.localSession = null;
        this.isLocalReady = false;
        this.isInitializing = false;
        this.initPromise = null;
    }
}

// Create singleton instance
const modelManager = new ModelManager();

export default modelManager;

// Legacy compatibility exports
export async function initializeOnnxRuntime() {
    return await modelManager.initializeLocalModel();
}

export function getOnnxSession() {
    return modelManager.localSession;
}

export function isOnnxReady() {
    return modelManager.isLocalReady;
}

export async function detectHazards(input, options) {
    return await modelManager.detectHazards(input, options);
}