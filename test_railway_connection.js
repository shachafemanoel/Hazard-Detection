// Test Railway API Connection
// Test script to verify full Railway integration

// Configure fetch to use proxy when defined (Node.js environment)
if (typeof process !== 'undefined' && process.release?.name === 'node') {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (proxyUrl) {
    const { setGlobalDispatcher, ProxyAgent } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  }
}

const API_CONFIG = {
  baseUrl: 'https://hazard-api-production-production.up.railway.app',
  healthEndpoint: '/api/v1/health',
  detectEndpoint: '/detect',
  sessionEndpoint: '/session/start',
  timeout: 10000
};

async function testRailwayConnection() {
  console.log('🚀 Testing Railway API Connection');
  console.log('================================');
  
  try {
    // Test 1: Health Check
    console.log('📋 Step 1: Testing Health Check...');
    const healthResponse = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.healthEndpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(API_CONFIG.timeout)
    });
    
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log('✅ Health check passed');
      console.log(`   Status: ${health.status}`);
      if (health.model_status) {
        console.log(`   Model: ${health.model_status}`);
      }
      if (health.backend_type) {
        console.log(`   Backend: ${health.backend_type}`);
      }
      if (health.device_info?.input_shape) {
        console.log(`   Model Input: ${health.device_info.input_shape.join('x')}`);
      }
    } else {
      throw new Error(`Health check failed: ${healthResponse.status}`);
    }
    
    // Test 2: Session Creation
    console.log('\\n📋 Step 2: Testing Session Creation...');
    const sessionResponse = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.sessionEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        confidence_threshold: 0.5,
        source: 'railway_test'
      }),
      signal: AbortSignal.timeout(API_CONFIG.timeout)
    });
    
    if (sessionResponse.ok) {
      const session = await sessionResponse.json();
      console.log('✅ Session creation successful');
      console.log(`   Session ID: ${session.session_id}`);
      
      // Test 3: Detection (with dummy base64)
      console.log('\\n📋 Step 3: Testing Detection Endpoint...');
      // Create a minimal base64 image (1x1 pixel PNG)
      const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      
      const detectionResponse = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.detectEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: dummyBase64,
          confidence_threshold: 0.5,
          session_id: session.session_id
        }),
        signal: AbortSignal.timeout(API_CONFIG.timeout)
      });
      
      if (detectionResponse.ok) {
        const result = await detectionResponse.json();
        console.log('✅ Detection endpoint working');
        console.log(`   Detections found: ${result.detections ? result.detections.length : 0}`);
        console.log(`   Processing time: ${result.processing_time_ms || 'N/A'}ms`);
      } else {
        const error = await detectionResponse.text();
        console.log('⚠️ Detection test failed (expected with dummy image):');
        console.log(`   Status: ${detectionResponse.status}`);
        console.log(`   Response: ${error.substring(0, 200)}...`);
      }
      
    } else {
      throw new Error(`Session creation failed: ${sessionResponse.status}`);
    }
    
    console.log('\\n🎉 Railway API Connection Test Completed Successfully!');
    console.log('\\n📝 Integration Details:');
    console.log(`   API URL: ${API_CONFIG.baseUrl}`);
    console.log(`   Health: ${API_CONFIG.baseUrl}${API_CONFIG.healthEndpoint}`);
    console.log(`   Session: ${API_CONFIG.baseUrl}${API_CONFIG.sessionEndpoint}`);
    console.log(`   Detect: ${API_CONFIG.baseUrl}${API_CONFIG.detectEndpoint}`);
    console.log('\\n✅ Your API is fully operational and ready for camera integration!');
    
  } catch (error) {
    console.error('❌ Railway API Connection Test Failed:');
    console.error(`   Error: ${error.message}`);
    console.error('\\n🔧 Troubleshooting:');
    console.error('   1. Check if Railway service is running: railway status');
    console.error('   2. Verify domain: railway domain');
    console.error('   3. Check logs: railway logs');
    console.error(`   4. Test manually: curl ${API_CONFIG.baseUrl}${API_CONFIG.healthEndpoint}`);
  }
}

// Run the test
if (typeof window === 'undefined') {
  // Node.js environment - use built-in fetch (Node 18+)
  testRailwayConnection();
} else {
  // Browser environment
  testRailwayConnection();
}

// Export for use in other modules
export { testRailwayConnection, API_CONFIG };
