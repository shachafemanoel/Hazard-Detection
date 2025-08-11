/**
 * Optimized ONNX Runtime Loader
 * Provides lazy loading, memory management, and performance optimization
 * for hazard detection models
 */
import { fetchWithTimeout } from './utils/fetchWithTimeout.js';

// ONNX Runtime configuration for optimal performance
const ONNX_CONFIG = {
    // Bundle selection based on device capabilities (WebGPU → WASM only)
    bundles: {
        webgpu: '/ort/ort.webgpu.bundle.min.mjs',      // Modern GPUs (400KB)
        wasm: '/ort/ort.wasm.bundle.min.mjs'           // CPU fallback (48KB)
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
    
    // WebGL detection removed - WebGPU → WASM fallback only
    
    // Mobile detection for performance optimization
    capabilities.isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    deviceCapabilities = capabilities;
    // Device capabilities detected
    return capabilities;
}

/**
 * Select optimal ONNX Runtime bundle based on device capabilities
 * @param {Object} capabilities - Device capabilities
 * @returns {Object} Selected bundle info
 */
async function selectOptimalBundle(capabilities) {
    let selectedBundle = 'wasm'; // Default fallback
    let executionProviders = ['wasm'];
    
    if (capabilities.webgpu && !capabilities.isMobile) {
        // Prefer WebGPU on capable desktop browsers
        selectedBundle = 'webgpu';
        executionProviders = ['webgpu', 'wasm'];
    } else {
        selectedBundle = 'wasm';
        executionProviders = ['wasm'];
    }

    // If WebGPU selected, verify that required WASM/JSEP sidecar modules are available locally
    if (selectedBundle === 'webgpu') {
        try {
            const resp = await fetchWithTimeout('/ort/ort-wasm-simd-threaded.jsep.mjs', { method: 'HEAD', timeout: 3000 });
            if (!resp.ok) {
                // Missing JSEP sidecar, falling back to WASM bundle
                selectedBundle = 'wasm';
                executionProviders = ['wasm'];
            }
        } catch (e) {
            // Unable to verify JSEP sidecar, falling back to WASM bundle
            selectedBundle = 'wasm';
            executionProviders = ['wasm'];
        }
    }
    
    // Adjust threading strategy
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
            // Loading ONNX Runtime...
            const startTime = performance.now();
            
            // Detect device capabilities
            const capabilities = await detectDeviceCapabilities();
            const bundleInfo = await selectOptimalBundle(capabilities);
            
            // Selected ONNX bundle
            
            // Dynamic import of the selected ONNX bundle
            const ortModule = await import(bundleInfo.bundle);
            ortInstance = ortModule.default || ortModule;
            
            // Configure ONNX Runtime environment
            ortInstance.env.wasm.wasmPaths = ONNX_CONFIG.wasmPaths;
            ortInstance.env.wasm.numThreads = bundleInfo.numThreads;
            ortInstance.env.logLevel = ONNX_CONFIG.logLevel;
            
            // WebGL optimizations removed - WebGPU → WASM fallback only
            
            if (ortInstance.env.webgpu) {
                ortInstance.env.webgpu.validateInputContent = false; // Skip validation for performance
            }

            // Configure WASM env: use single-thread unless cross-origin isolated
            try {
                const canMultiThread = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated === true;
                ortInstance.env.wasm.wasmPaths = ONNX_CONFIG.wasmPaths;
                ortInstance.env.wasm.numThreads = canMultiThread ? Math.max(1, Math.min(bundleInfo.numThreads, 4)) : 1;
            } catch (e) {
                // Failed to configure ORT WASM env
            }
            
            const loadTime = performance.now() - startTime;
            // ONNX Runtime loaded successfully
            console.log('ONNX Runtime ready');
            
            // Store execution providers for session creation
            ONNX_CONFIG.sessionOptions.executionProviders = bundleInfo.executionProviders;
            
            return ortInstance;
            
        } catch (error) {
            ortLoadPromise = null; // Reset promise so retry is possible
            
            // Try fallback to basic WASM bundle if initial load failed
            if (bundleInfo.selectedType !== 'wasm') {
                console.log('Retrying with basic WASM bundle...');
                try {
                    const ortModule = await import(ONNX_CONFIG.bundles.wasm);
                    ortInstance = ortModule.default || ortModule;
                    ortInstance.env.wasm.wasmPaths = ONNX_CONFIG.wasmPaths;
                    ortInstance.env.wasm.numThreads = 1;
                    ortInstance.env.logLevel = ONNX_CONFIG.logLevel;
                    ONNX_CONFIG.sessionOptions.executionProviders = ['wasm'];
                    console.log('ONNX Runtime ready (fallback)');
                    return ortInstance;
                } catch (fallbackError) {
                    throw new Error(`ONNX Runtime loading failed: ${fallbackError.message}`);
                }
            }
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
        // Creating inference session
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
        // Inference session created
        
        // Model warmup with dummy data
        await warmupModel(inferenceSession);
        
        return inferenceSession;
        
    } catch (error) {
        throw new Error(`Inference session creation failed: ${error.message}`);
    }
}

/**
 * Warmup model with dummy inference to ensure consistent performance
 * @param {Object} session - ONNX Runtime inference session
 */
async function warmupModel(session) {
    try {
        // Warming up model...
        const startTime = performance.now();
        
        // Get input shape from model
        const inputNames = session.inputNames;
        const outputNames = session.outputNames;
        
        if (inputNames.length === 0) {
            // No input names found, skipping warmup
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
        // Model warmup completed
        
    } catch (error) {
        // Model warmup failed
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
            // Inference session disposed
        } catch (error) {
            // Error disposing inference session
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
            // High memory usage detected
            if (window.gc) {
                window.gc();
                // Manual garbage collection triggered
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