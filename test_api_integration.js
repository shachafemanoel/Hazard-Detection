/**
 * Test script for validating API integration between frontend and backend
 * Run with: node test_api_integration.js
 */

const API_BASE_URL = 'https://hazard-api-production-production.up.railway.app';

async function testHealthCheck() {
  console.log('🔍 Testing health check endpoint...');
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    console.log('✅ Health check response:', data);
    return response.ok && (data.status === 'healthy' || data.status === 'ok');
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testRootEndpoint() {
  console.log('🔍 Testing root endpoint...');
  try {
    const response = await fetch(`${API_BASE_URL}/`);
    const data = await response.json();
    console.log('✅ Root endpoint response:', data);
    return response.ok && data.status === 'ok';
  } catch (error) {
    console.error('❌ Root endpoint failed:', error.message);
    return false;
  }
}

async function testSessionCreation() {
  console.log('🔍 Testing session creation...');
  try {
    const response = await fetch(`${API_BASE_URL}/session/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        confidence_threshold: 0.5,
        source: 'test_script'
      })
    });
    
    const data = await response.json();
    console.log('✅ Session creation response:', data);
    
    if (response.ok && data.session_id) {
      console.log('📋 Session ID:', data.session_id);
      return data.session_id;
    }
    return null;
  } catch (error) {
    console.error('❌ Session creation failed:', error.message);
    return null;
  }
}

async function testDetectionEndpoint() {
  console.log('🔍 Testing detection endpoint with sample base64 image...');
  
  // Simple 1x1 pixel red PNG encoded as base64
  const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  
  try {
    const response = await fetch(`${API_BASE_URL}/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: sampleBase64,
        confidence_threshold: 0.5
      })
    });
    
    const data = await response.json();
    console.log('✅ Detection response:', data);
    
    return response.ok && data.success;
  } catch (error) {
    console.error('❌ Detection endpoint failed:', error.message);
    return false;
  }
}

async function testCompleteFlow() {
  console.log('🎯 Testing complete API integration flow...\n');
  
  const results = {
    health: await testHealthCheck(),
    root: await testRootEndpoint(),
    session: await testSessionCreation(),
    detection: await testDetectionEndpoint()
  };
  
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  console.log(`Health Check: ${results.health ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Root Endpoint: ${results.root ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Session Creation: ${results.session ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Detection Endpoint: ${results.detection ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = results.health && results.root && results.session && results.detection;
  console.log(`\n🏁 Overall Status: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  if (allPassed) {
    console.log('\n🎉 Frontend-Backend API integration is working correctly!');
    console.log('The camera detection app should be able to connect to the cloud API.');
  } else {
    console.log('\n⚠️ Some integration issues detected. Check the failed endpoints above.');
  }
  
  return allPassed;
}

// Run the tests
if (typeof window === 'undefined') {
  // Node.js environment
  const fetch = require('node-fetch');
  testCompleteFlow();
} else {
  // Browser environment
  console.log('Run testCompleteFlow() in browser console');
}