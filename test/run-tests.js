#!/usr/bin/env node

import { spawn } from 'child_process';
import MockHazardDetectionServer from './mock-server.js';

async function runTests() {
  console.log('🧪 Starting Realtime Client Test Suite\n');

  // Start mock server for integration tests
  console.log('1️⃣ Starting mock server...');
  const mockServer = new MockHazardDetectionServer(0);
  
  try {
    const { port, url } = await mockServer.start();
    
    // Set environment variables for tests
    process.env.HAZARD_API_URL_PRIVATE = url;
    process.env.HAZARD_API_URL_PUBLIC = url;
    process.env.HAZARD_USE_PRIVATE = 'auto';
    
    console.log(`   ✅ Mock server running at ${url}\n`);

    // Run unit tests
    console.log('2️⃣ Running unit tests...');
    
    const testProcess = spawn('npx', ['mocha', 'test/test-apiClient.js', '--reporter', 'spec'], {
      stdio: 'inherit',
      env: { ...process.env }
    });

    await new Promise((resolve, reject) => {
      testProcess.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ Unit tests passed!');
          resolve();
        } else {
          console.log('\n❌ Unit tests failed!');
          reject(new Error(`Tests failed with code ${code}`));
        }
      });

      testProcess.on('error', (error) => {
        console.error('Failed to run tests:', error);
        reject(error);
      });
    });

    // Run integration test with stream-check
    console.log('\n3️⃣ Running integration test...');
    
    const integrationProcess = spawn('node', ['scripts/stream-check.js'], {
      stdio: 'inherit',
      env: { ...process.env }
    });

    await new Promise((resolve, reject) => {
      integrationProcess.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ Integration test passed!');
          resolve();
        } else {
          console.log('\n❌ Integration test failed!');
          reject(new Error(`Integration test failed with code ${code}`));
        }
      });

      integrationProcess.on('error', (error) => {
        console.error('Failed to run integration test:', error);
        reject(error);
      });
    });

    console.log('\n🎉 All tests passed successfully!');

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  } finally {
    // Clean up mock server
    console.log('\n4️⃣ Cleaning up...');
    await mockServer.stop();
    console.log('   ✅ Mock server stopped');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(130);
});

const isDirectRun = import.meta.url.endsWith(process.argv[1]);
if (isDirectRun) {
  runTests();
}

export default runTests;