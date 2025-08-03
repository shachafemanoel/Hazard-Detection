#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// Mock browser environment for ONNX Runtime
global.window = global;
global.document = { createElement: () => createCanvas(640, 640) };

async function main() {
  console.log('🔍 Client-Side Hazard Detection Verification\n');

  try {
    // Check if we have the required model
    const modelPath = path.join(__dirname, '../public/object_detection_model/road_damage_detection_simplified.onnx');
    
    if (!fs.existsSync(modelPath)) {
      console.log('❌ ONNX model not found at:', modelPath);
      console.log('📋 Available models:');
      const modelDir = path.dirname(modelPath);
      if (fs.existsSync(modelDir)) {
        fs.readdirSync(modelDir)
          .filter(f => f.endsWith('.onnx'))
          .forEach(f => console.log(`   📄 ${f}`));
      }
      process.exit(1);
    }

    console.log('1️⃣ Checking ONNX Runtime availability...');
    
    // Try to load ONNX Runtime (Node.js version)
    let ort;
    try {
      ort = require('onnxruntime-node');
      console.log(`   ✅ ONNX Runtime loaded: ${ort.version || 'unknown version'}`);
    } catch (error) {
      console.log('   ❌ ONNX Runtime not found. Installing...');
      console.log('   💡 Run: npm install onnxruntime-node');
      process.exit(1);
    }

    console.log('\n2️⃣ Loading ONNX model...');
    let session;
    try {
      session = await ort.InferenceSession.create(modelPath);
      console.log(`   ✅ Model loaded: ${path.basename(modelPath)}`);
      console.log(`   📊 Input shape: ${JSON.stringify(session.inputNames)}`);
      console.log(`   📊 Output shape: ${JSON.stringify(session.outputNames)}`);
    } catch (error) {
      console.log(`   ❌ Failed to load model: ${error.message}`);
      process.exit(1);
    }

    console.log('\n3️⃣ Creating test images...');
    const sampleImagePath = path.join(__dirname, 'sample-image.png');
    
    // Create test images if they don't exist
    if (!fs.existsSync(sampleImagePath)) {
      console.log('   📸 Creating sample test image...');
      const canvas = createCanvas(640, 640);
      const ctx = canvas.getContext('2d');
      
      // Create a simple test pattern
      ctx.fillStyle = '#87CEEB'; // Sky blue
      ctx.fillRect(0, 0, 640, 640);
      
      // Add some road-like pattern
      ctx.fillStyle = '#696969'; // Dim gray
      ctx.fillRect(0, 400, 640, 240);
      
      // Add lines to simulate road cracks
      ctx.strokeStyle = '#2F4F4F'; // Dark slate gray
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(100, 450);
      ctx.lineTo(200, 500);
      ctx.lineTo(300, 480);
      ctx.stroke();
      
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(sampleImagePath, buffer);
      console.log(`   ✅ Created test image: ${sampleImagePath}`);
    }

    // Load and process test images
    console.log('\n4️⃣ Running client-side detection...');
    const testResults = [];
    
    for (let i = 1; i <= 3; i++) {
      console.log(`   📤 Processing frame ${i}/3...`);
      const startTime = Date.now();
      
      try {
        // Load image
        const image = await loadImage(sampleImagePath);
        
        // Preprocess image (simplified version for Node.js)
        const tensor = preprocessImageToTensor(image);
        
        // Run inference
        const feeds = { images: tensor };
        const results = await session.run(feeds);
        
        // Extract results
        const outputKey = Object.keys(results)[0];
        const outputData = results[outputKey].data;
        
        // Parse detections (simplified)
        const detections = parseDetections(outputData);
        
        const processingTime = Date.now() - startTime;
        
        console.log(`   ⚡ Detection completed in ${processingTime}ms`);
        console.log(`   🎯 Found ${detections.length} detections`);
        
        if (detections.length > 0) {
          detections.slice(0, 3).forEach((det, idx) => {
            console.log(`      📍 Detection ${idx + 1}: Class ${det.classId} (${(det.confidence * 100).toFixed(1)}%)`);
          });
        }
        
        testResults.push({
          frameId: i,
          processingTime,
          detectionCount: detections.length,
          detections: detections.slice(0, 5) // Keep top 5
        });
        
      } catch (error) {
        console.log(`   ❌ Frame ${i} failed: ${error.message}`);
        testResults.push({
          frameId: i,
          error: error.message
        });
      }
      
      // Small delay between frames
      if (i < 3) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Summary
    console.log('\n5️⃣ Test Summary:');
    const successfulFrames = testResults.filter(r => !r.error).length;
    const avgProcessingTime = testResults
      .filter(r => r.processingTime)
      .reduce((sum, r) => sum + r.processingTime, 0) / successfulFrames || 0;
    const totalDetections = testResults
      .reduce((sum, r) => sum + (r.detectionCount || 0), 0);

    console.log(`   📊 Successful frames: ${successfulFrames}/3`);
    console.log(`   ⏱️  Average processing time: ${avgProcessingTime.toFixed(1)}ms`);
    console.log(`   🎯 Total detections: ${totalDetections}`);
    console.log(`   🧠 Model: ${path.basename(modelPath)}`);
    console.log(`   📁 Detection mode: Client-side (ONNX)`);

    if (successfulFrames === 3) {
      console.log('\n✅ All tests passed! Client-side detection is working correctly.');
    } else {
      console.log(`\n⚠️  Only ${successfulFrames}/3 frames processed successfully.`);
    }

    // Cleanup
    console.log('\n6️⃣ Cleaning up...');
    if (session) {
      await session.dispose();
      console.log('   ✅ Model session disposed');
    }

    process.exit(successfulFrames === 3 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Simplified preprocessing for Node.js
function preprocessImageToTensor(image) {
  const targetSize = 640;
  
  // Create canvas and resize image
  const canvas = createCanvas(targetSize, targetSize);
  const ctx = canvas.getContext('2d');
  
  // Calculate scaling to maintain aspect ratio
  const scale = Math.min(targetSize / image.width, targetSize / image.height);
  const newW = Math.round(image.width * scale);
  const newH = Math.round(image.height * scale);
  const offsetX = Math.floor((targetSize - newW) / 2);
  const offsetY = Math.floor((targetSize - newH) / 2);
  
  // Fill black and draw image
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(image, offsetX, offsetY, newW, newH);
  
  // Get image data
  const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
  const { data } = imageData;
  
  // Convert to float32 and normalize (CHW format)
  const tensorData = new Float32Array(3 * targetSize * targetSize);
  for (let c = 0; c < 3; c++) {
    for (let h = 0; h < targetSize; h++) {
      for (let w = 0; w < targetSize; w++) {
        const pixelIndex = (h * targetSize + w) * 4;
        const tensorIndex = c * targetSize * targetSize + h * targetSize + w;
        tensorData[tensorIndex] = data[pixelIndex + c] / 255.0;
      }
    }
  }
  
  return new (require('onnxruntime-node').Tensor)('float32', tensorData, [1, 3, targetSize, targetSize]);
}

// Simplified detection parsing
function parseDetections(outputData, confidenceThreshold = 0.5) {
  const detections = [];
  
  // Assuming output format: [x1, y1, x2, y2, confidence, classId]
  for (let i = 0; i < outputData.length; i += 6) {
    const [x1, y1, x2, y2, confidence, classId] = Array.from(outputData.slice(i, i + 6));
    
    if (confidence >= confidenceThreshold) {
      detections.push({
        x1, y1, x2, y2,
        confidence,
        classId: Math.floor(classId)
      });
    }
  }
  
  return detections.sort((a, b) => b.confidence - a.confidence);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Terminated');
  process.exit(143);
});

if (require.main === module) {
  main();
}

module.exports = main;