#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createRealtimeClient, resolveBaseUrl } = require('hazard-detection/realtime');

async function main() {
  console.log('🔍 Hazard Detection Realtime Client Verification\n');

  try {
    // Step 1: Resolve endpoint
    console.log('1️⃣ Resolving endpoint...');
    const baseUrl = await resolveBaseUrl();
    console.log(`   ✅ Resolved: ${baseUrl}\n`);

    // Step 2: Create client
    console.log('2️⃣ Creating realtime client...');
    const client = createRealtimeClient({
      timeout: 15000,
      maxRetries: 3
    });

    // Step 3: Set up listeners
    let messageCount = 0;
    const results = [];

    client.onMessage((data) => {
      messageCount++;
      results.push(data);
      console.log(`   📨 Message ${messageCount}: ${data.detections?.length || 0} detections`);
      
      if (data.detections && data.detections.length > 0) {
        data.detections.forEach((det, i) => {
          console.log(`      🎯 Detection ${i + 1}: ${det.class_name} (${(det.confidence * 100).toFixed(1)}%)`);
        });
      }
    });

    client.onError((error) => {
      console.error(`   ❌ Error: ${error.message}`);
    });

    client.onStatus((status) => {
      console.log(`   📊 Status: ${status}`);
    });

    // Step 4: Connect
    console.log('3️⃣ Connecting to service...');
    await client.connect();
    
    const network = baseUrl.includes('railway.internal') ? 'private' : 'public';
    console.log(`   🎉 CONNECTED via ${network} network\n`);

    // Step 5: Send sample frames
    console.log('4️⃣ Sending sample frames...');
    const sampleImagePath = path.join(__dirname, 'sample-image.png');
    
    // Create a simple test image if it doesn't exist
    if (!fs.existsSync(sampleImagePath)) {
      console.log('   📸 Creating sample test image...');
      // Create a minimal PNG (1x1 pixel)
      const minimalPng = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x5C, 0xC2, 0x8A, 0xDB, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);
      fs.writeFileSync(sampleImagePath, minimalPng);
    }

    const sampleImage = fs.readFileSync(sampleImagePath);
    
    // Send 3 test frames
    for (let i = 1; i <= 3; i++) {
      console.log(`   📤 Sending frame ${i}/3...`);
      await client.send({
        buffer: sampleImage,
        filename: `test-frame-${i}.png`,
        contentType: 'image/png'
      });
      
      // Wait a bit between sends
      if (i < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Step 6: Wait for all responses
    console.log('\n5️⃣ Waiting for responses...');
    let waitTime = 0;
    const maxWait = 10000; // 10 seconds
    
    while (messageCount < 3 && waitTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 500));
      waitTime += 500;
    }

    // Step 7: Summary
    console.log('\n6️⃣ Test Summary:');
    console.log(`   📊 Messages received: ${messageCount}/3`);
    console.log(`   ⏱️  Total processing time: ${waitTime}ms`);
    console.log(`   🎯 Network: ${network}`);
    console.log(`   🔗 Endpoint: ${baseUrl}`);
    console.log(`   📋 Session ID: ${client.getSessionId()}`);

    if (messageCount === 3) {
      console.log('\n✅ All tests passed! Realtime client is working correctly.');
    } else {
      console.log(`\n⚠️  Only received ${messageCount}/3 responses. Check API status.`);
    }

    // Step 8: Cleanup
    console.log('\n7️⃣ Cleaning up...');
    await client.disconnect();
    console.log('   ✅ Disconnected successfully');

    process.exit(messageCount === 3 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
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