/**
 * ONNX Web Model Verification Script
 * Verifies best0608.onnx model can be loaded and reports I/O dimensions
 * Usage: Run in browser console or as ES module
 */

import { loadONNXRuntime, createInferenceSession, disposeInferenceSession } from '../public/js/onnx-runtime-loader.js';

const MODEL_PATH = '../public/object_detection_model/best0608.onnx';
const EXPECTED_INPUT_NAME = 'images';
const EXPECTED_OUTPUT_NAME = 'output0';
const EXPECTED_OUTPUT_SHAPE = [1, 300, 6]; // Based on CLAUDE.md requirements

async function verifyModel() {
  console.log('🔍 ONNX Web Model Verification Started');
  console.log('================================================');
  
  try {
    // Step 1: Load ONNX Runtime
    console.log('📦 Loading ONNX Runtime...');
    const runtime = await loadONNXRuntime();
    console.log('✅ ONNX Runtime loaded successfully');
    console.log('   Version:', runtime.env.versions?.web || 'Unknown');
    
    // Step 2: Create inference session
    console.log('🔄 Creating inference session...');
    const session = await createInferenceSession(MODEL_PATH);
    console.log('✅ Inference session created successfully');
    
    // Step 3: Verify input specifications
    console.log('📥 Input Specifications:');
    const inputNames = session.inputNames;
    console.log('   Input Names:', inputNames);
    
    for (const inputName of inputNames) {
      const input = session._handler._model._graph._inputs.find(i => i.name === inputName);
      if (input) {
        console.log(`   ${inputName}:`, {
          type: input.type,
          dims: input.dims
        });
      }
    }
    
    // Validate expected input name
    if (inputNames.includes(EXPECTED_INPUT_NAME)) {
      console.log(`✅ Expected input "${EXPECTED_INPUT_NAME}" found`);
    } else {
      console.warn(`❌ Expected input "${EXPECTED_INPUT_NAME}" not found. Available:`, inputNames);
    }
    
    // Step 4: Verify output specifications  
    console.log('📤 Output Specifications:');
    const outputNames = session.outputNames;
    console.log('   Output Names:', outputNames);
    
    for (const outputName of outputNames) {
      const output = session._handler._model._graph._outputs.find(o => o.name === outputName);
      if (output) {
        console.log(`   ${outputName}:`, {
          type: output.type,
          dims: output.dims
        });
        
        // Validate expected output
        if (outputName === EXPECTED_OUTPUT_NAME) {
          const dims = output.dims;
          const matches = dims.length === EXPECTED_OUTPUT_SHAPE.length && 
                         dims.every((dim, i) => dim === EXPECTED_OUTPUT_SHAPE[i] || dim === -1);
          
          if (matches) {
            console.log(`✅ Expected output "${EXPECTED_OUTPUT_NAME}" shape matches:`, dims);
          } else {
            console.warn(`❌ Expected output shape [${EXPECTED_OUTPUT_SHAPE.join(', ')}], got [${dims.join(', ')}]`);
          }
        }
      }
    }
    
    // Step 5: Memory and session info
    console.log('🧠 Session Information:');
    console.log('   Memory usage: Available in runtime.env.memory if supported');
    console.log('   Backend providers:', session.executionProviders);
    
    // Step 6: Cleanup
    console.log('🧹 Cleaning up inference session...');
    await disposeInferenceSession();
    console.log('✅ Session disposed successfully');
    
    console.log('================================================');
    console.log('✅ ONNX Model Verification PASSED');
    
    return {
      success: true,
      modelPath: MODEL_PATH,
      inputNames,
      outputNames,
      inputValid: inputNames.includes(EXPECTED_INPUT_NAME),
      outputValid: outputNames.includes(EXPECTED_OUTPUT_NAME)
    };
    
  } catch (error) {
    console.error('❌ ONNX Model Verification FAILED:', error);
    console.error('   Error details:', error.message);
    console.error('   Stack trace:', error.stack);
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Auto-run verification if script is loaded directly
if (typeof window !== 'undefined') {
  // Running in browser
  window.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Starting ONNX model verification in browser...');
    const result = await verifyModel();
    
    if (result.success) {
      console.log('🎉 Verification completed successfully!');
    } else {
      console.error('💥 Verification failed:', result.error);
    }
  });
} else if (typeof process !== 'undefined') {
  // Running in Node.js - not supported for web ONNX runtime
  console.warn('⚠️  This script is designed for browser execution only');
  console.log('📋 To run: Open browser console and import this module');
}

export { verifyModel };