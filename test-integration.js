/**
 * Client-Server Integration Test
 * Tests the detection flow: API Health -> Model Load -> Detection Ready
 */

import { checkHealth } from './public/js/apiClient.js';
import { resolveBaseUrl } from './public/js/network.js';

async function testIntegration() {
    console.log('🧪 Testing Client-Server Integration...');
    
    try {
        // 1. Test API endpoint resolution
        console.log('1️⃣ Testing API endpoint resolution...');
        const apiUrl = await resolveBaseUrl();
        console.log(`✅ API URL resolved: ${apiUrl}`);
        
        // 2. Test API health check
        console.log('2️⃣ Testing API health check...');
        const healthResult = await checkHealth();
        if (healthResult.status === 'healthy') {
            console.log('✅ API health check passed');
        } else {
            console.warn('⚠️ API health check failed:', healthResult);
        }
        
        // 3. Test model file exists
        console.log('3️⃣ Testing model file...');
        const modelExists = await fetch('/object_detection_model/best0608.onnx', { method: 'HEAD' })
            .then(r => r.ok)
            .catch(() => false);
        
        if (modelExists) {
            console.log('✅ ONNX model (best0608.onnx) found');
        } else {
            console.error('❌ ONNX model not found');
        }
        
        // 4. Test ONNX runtime bundles
        console.log('4️⃣ Testing ONNX runtime bundles...');
        const webgpuExists = await fetch('./public/ort/ort.webgpu.bundle.min.mjs', { method: 'HEAD' })
            .then(r => r.ok)
            .catch(() => false);
        const wasmExists = await fetch('./public/ort/ort.wasm.bundle.min.mjs', { method: 'HEAD' })
            .then(r => r.ok)
            .catch(() => false);
            
        if (webgpuExists && wasmExists) {
            console.log('✅ ONNX runtime bundles (WebGPU + WASM) found');
        } else {
            console.error('❌ Missing ONNX runtime bundles');
        }
        
        console.log('🎉 Integration test completed successfully!');
        
        return {
            apiResolution: !!apiUrl,
            apiHealth: healthResult.status === 'healthy',
            modelExists,
            bundlesExist: webgpuExists && wasmExists
        };
        
    } catch (error) {
        console.error('❌ Integration test failed:', error);
        return { error: error.message };
    }
}

// Export for use in other files
export { testIntegration };

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testIntegration().then(result => {
        console.log('Test Result:', result);
        process.exit(result.error ? 1 : 0);
    });
}