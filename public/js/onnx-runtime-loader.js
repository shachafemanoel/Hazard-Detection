/**
 * Optimized ONNX Runtime Loader
 * Provides lazy loading, memory management, and performance optimization
 * for hazard detection models
 */

// ONNX Runtime configuration for optimal performance
const ONNX_CONFIG = {
    // Bundle selection based on device capabilities
    bundles: {
        webgpu: '/ort/ort.webgpu.bundle.min.mjs',      // Modern GPUs (1.8MB)
        webgl: '/ort/ort.webgl.min.mjs',               // Legacy GPUs (800KB)  
        wasm: '/ort/ort.wasm.bundle.min.mjs'           // CPU fallback (1.1MB)
    },
    
    // Performance settings
    wasmPaths: '/ort/',
    numThreads: navigator.hardwareConcurrency || 4,
    logLevel: 'error',
    
    // Memory management
    sessionOptions: {
        executionProviders: [], // Will be determined dynamically
        enableCpuMemArena: true,
        enableMemPattern: true,
        executionMode: 'sequential', // or 'parallel' for multi-threading
        graphOptimizationLevel: 'all'
    }
};

// Global ONNX Runtime state
let ortInstance = null;
let ortLoadPromise = null;
let inferenceSession = null;
let deviceCapabilities = null;

/**
 * Detect device capabilities for optimal ONNX Runtime configuration
 * @returns {Object} Device capability information
 */
async function detectDeviceCapabilities() {
    if (deviceCapabilities) {
        return deviceCapabilities;
    }
    
    const capabilities = {
        webgpu: false,
        webgl: false,
        hardwareConcurrency: navigator.hardwareConcurrency || 1,
        memory: navigator.deviceMemory || 4, // GB estimate
        userAgent: navigator.userAgent
    };
    
    // WebGPU detection (experimental)
    try {
        if ('gpu' in navigator) {
            const adapter = await navigator.gpu.requestAdapter();
            capabilities.webgpu = !!adapter;
        }
    } catch (e) {
        // WebGPU not supported
    }
    
    // WebGL detection
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        capabilities.webgl = !!gl;
        if (gl) {
            capabilities.webglRenderer = gl.getParameter(gl.RENDERER);
            capabilities.webglVendor = gl.getParameter(gl.VENDOR);
        }
    } catch (e) {
        // WebGL not supported
    }
    
    // Mobile detection for performance optimization
    capabilities.isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    deviceCapabilities = capabilities;
    console.log('🔍 Device capabilities detected:', capabilities);
    return capabilities;
}

/**
 * Select optimal ONNX Runtime bundle based on device capabilities
 * @param {Object} capabilities - Device capabilities
 * @returns {Object} Selected bundle info
 */
function selectOptimalBundle(capabilities) {
    let selectedBundle = 'wasm'; // Default fallback
    let executionProviders = ['wasm'];
    
    if (capabilities.webgpu && !capabilities.isMobile) {
        // Use WebGPU for modern desktop browsers
        selectedBundle = 'webgpu';
        executionProviders = ['webgpu', 'wasm']; // WebGPU with WASM fallback
    } else if (capabilities.webgl && !capabilities.isMobile) {
        // Use WebGL for desktop browsers with GPU support
        selectedBundle = 'webgl';
        executionProviders = ['webgl', 'wasm']; // WebGL with WASM fallback
    } else {
        // Use WASM for mobile or devices without GPU acceleration
        selectedBundle = 'wasm';
        executionProviders = ['wasm'];
    }
    
    // Adjust threading for mobile devices
    const numThreads = capabilities.isMobile 
        ? Math.min(2, capabilities.hardwareConcurrency) 
        : capabilities.hardwareConcurrency;
    
    return {
        bundle: ONNX_CONFIG.bundles[selectedBundle],
        executionProviders,
        numThreads,
        selectedType: selectedBundle
    };
}

/**
 * Load ONNX Runtime with lazy loading and optimal configuration
 * @returns {Promise<Object>} ONNX Runtime instance
 */
export async function loadONNXRuntime() {
    // Return existing promise if already loading/loaded
    if (ortLoadPromise) {
        return ortLoadPromise;
    }
    
    ortLoadPromise = (async () => {
        try {
            console.log('🚀 Loading ONNX Runtime...');
            const startTime = performance.now();
            
            // Detect device capabilities
            const capabilities = await detectDeviceCapabilities();
            const bundleInfo = selectOptimalBundle(capabilities);
            
            console.log(`📦 Selected ONNX bundle: ${bundleInfo.selectedType} (${bundleInfo.bundle})`);
            
            // Dynamic import of the selected ONNX bundle
            const ortModule = await import(bundleInfo.bundle);
            ortInstance = ortModule.default || ortModule;
            
            // Configure ONNX Runtime environment
            ortInstance.env.wasm.wasmPaths = ONNX_CONFIG.wasmPaths;
            ortInstance.env.wasm.numThreads = bundleInfo.numThreads;
            ortInstance.env.logLevel = ONNX_CONFIG.logLevel;
            
            // Additional performance optimizations
            if (ortInstance.env.webgl) {
                ortInstance.env.webgl.contextId = 'webgl2';
                ortInstance.env.webgl.matmulMaxBatchSize = 16;
                ortInstance.env.webgl.textureCacheMode = 'initializerOnly';
            }
            
            if (ortInstance.env.webgpu) {
                ortInstance.env.webgpu.validateInputContent = false; // Skip validation for performance
            }
            
            const loadTime = performance.now() - startTime;
            console.log(`✅ ONNX Runtime loaded in ${loadTime.toFixed(0)}ms`);
            console.log(`🔧 Execution providers: ${bundleInfo.executionProviders.join(', ')}`);
            
            // Store execution providers for session creation
            ONNX_CONFIG.sessionOptions.executionProviders = bundleInfo.executionProviders;
            
            return ortInstance;
            
        } catch (error) {
            console.error('❌ Failed to load ONNX Runtime:', error);
            ortLoadPromise = null; // Reset promise so retry is possible
            throw new Error(`ONNX Runtime loading failed: ${error.message}`);
        }
    })();
    
    return ortLoadPromise;
}

/**
 * Create optimized inference session with model warmup
 * @param {string} modelPath - Path to ONNX model file
 * @param {Object} options - Additional session options
 * @returns {Promise<Object>} Inference session
 */
export async function createInferenceSession(modelPath, options = {}) {
    try {
        console.log(`🧠 Creating inference session for: ${modelPath}`);
        const startTime = performance.now();
        
        // Ensure ONNX Runtime is loaded
        if (!ortInstance) {
            await loadONNXRuntime();
        }
        
        // Merge session options
        const sessionOptions = {
            ...ONNX_CONFIG.sessionOptions,
            ...options
        };
        
        // Create inference session
        inferenceSession = await ortInstance.InferenceSession.create(modelPath, sessionOptions);
        
        const creationTime = performance.now() - startTime;
        console.log(`✅ Inference session created in ${creationTime.toFixed(0)}ms`);
        
        // Model warmup with dummy data
        await warmupModel(inferenceSession);
        
        return inferenceSession;
        
    } catch (error) {
        console.error('❌ Failed to create inference session:', error);
        throw new Error(`Inference session creation failed: ${error.message}`);
    }
}

/**
 * Warmup model with dummy inference to ensure consistent performance
 * @param {Object} session - ONNX Runtime inference session
 */
async function warmupModel(session) {
    try {
        console.log('🔥 Warming up model...');
        const startTime = performance.now();
        
        // Get input shape from model
        const inputNames = session.inputNames;
        const outputNames = session.outputNames;
        
        if (inputNames.length === 0) {
            console.warn('⚠️ No input names found, skipping warmup');
            return;
        }
        
        // Create dummy input tensor (assuming image input 1x3xHxW)
        const inputName = inputNames[0];
        const inputInfo = session.inputMetadata[inputName];
        const inputShape = inputInfo.dims;
        
        // Handle dynamic dimensions (replace -1 with typical values)
        const actualShape = inputShape.map(dim => dim === -1 ? 320 : dim);
        const inputSize = actualShape.reduce((a, b) => a * b, 1);
        
        const dummyData = new Float32Array(inputSize).fill(0.5); // Neutral input data
        const inputTensor = new ortInstance.Tensor('float32', dummyData, actualShape);
        
        const feeds = { [inputName]: inputTensor };
        
        // Perform warmup inferences (typically 2-3 are enough)
        for (let i = 0; i < 3; i++) {
            await session.run(feeds);
        }
        
        const warmupTime = performance.now() - startTime;
        console.log(`🔥 Model warmup completed in ${warmupTime.toFixed(0)}ms`);
        
    } catch (error) {
        console.warn('⚠️ Model warmup failed:', error);
        // Don't throw error - warmup is optional optimization
    }
}

/**
 * Get current inference session (lazy loading)
 * @param {string} modelPath - Path to model file
 * @returns {Promise<Object>} Inference session
 */
export async function getInferenceSession(modelPath) {
    if (!inferenceSession) {
        inferenceSession = await createInferenceSession(modelPath);
    }
    return inferenceSession;
}

/**
 * Dispose inference session and free memory
 */
export function disposeInferenceSession() {
    if (inferenceSession) {
        try {
            inferenceSession.dispose();
            console.log('🗑️ Inference session disposed');
        } catch (error) {
            console.warn('⚠️ Error disposing inference session:', error);
        }
        inferenceSession = null;
    }
}

/**
 * Create tensor from image data with proper preprocessing
 * @param {Float32Array} data - Preprocessed image data
 * @param {Array} shape - Tensor shape [batch, channels, height, width]
 * @returns {Object} ONNX Runtime tensor
 */
export async function createTensor(data, shape) {
    if (!ortInstance) {
        await loadONNXRuntime();
    }
    return new ortInstance.Tensor('float32', data, shape);
}

/**
 * Memory usage monitoring and garbage collection
 */
export function monitorMemoryUsage() {
    if ('memory' in performance) {
        const memory = performance.memory;
        console.log('📊 Memory usage:', {
            used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`,
            total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB`,
            limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB`
        });
        
        // Trigger GC if memory usage is high (>80% of limit)
        const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
        if (usageRatio > 0.8) {
            console.warn('⚠️ High memory usage detected, consider garbage collection');
            if (window.gc) {
                window.gc();
                console.log('🗑️ Manual garbage collection triggered');
            }
        }
    }
}

/**
 * Performance metrics for ONNX Runtime operations
 */
export class ONNXPerformanceMonitor {
    constructor() {
        this.metrics = {
            inferenceCount: 0,
            totalInferenceTime: 0,
            avgInferenceTime: 0,
            maxInferenceTime: 0,
            minInferenceTime: Infinity
        };
    }
    
    recordInference(duration) {
        this.metrics.inferenceCount++;
        this.metrics.totalInferenceTime += duration;
        this.metrics.avgInferenceTime = this.metrics.totalInferenceTime / this.metrics.inferenceCount;
        this.metrics.maxInferenceTime = Math.max(this.metrics.maxInferenceTime, duration);
        this.metrics.minInferenceTime = Math.min(this.metrics.minInferenceTime, duration);
    }
    
    getMetrics() {
        return { ...this.metrics };
    }
    
    reset() {
        this.metrics = {
            inferenceCount: 0,
            totalInferenceTime: 0,
            avgInferenceTime: 0,
            maxInferenceTime: 0,
            minInferenceTime: Infinity
        };
    }
}

// Export performance monitor instance
export const performanceMonitor = new ONNXPerformanceMonitor();