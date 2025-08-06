// Full Integration Test for Railway Deployment
// Tests both frontend and API services with camera detection workflow

const FRONTEND_URL = 'https://hazard-detection-production-8735.up.railway.app';
const API_URL = 'https://hazard-api-production-production.up.railway.app';

async function testFullIntegration() {
    console.log('🧪 Full Integration Test for Railway Deployment');
    console.log('==============================================');
    
    const results = {
        frontend_health: false,
        api_health: false,
        frontend_api_proxy: false,
        camera_page: false,
        api_session: false,
        model_loaded: false
    };
    
    try {
        // Test 1: Frontend Health
        console.log('\\n📋 Step 1: Testing Frontend Health...');
        const frontendHealth = await fetch(`${FRONTEND_URL}/health`);
        if (frontendHealth.ok) {
            const data = await frontendHealth.json();
            results.frontend_health = true;
            console.log('✅ Frontend healthy:', data.status);
            console.log(`   Environment: ${data.env}, Port: ${data.port}`);
            console.log(`   Redis: ${data.redis}, Mode: ${data.mode}`);
        } else {
            console.log('❌ Frontend health check failed');
        }
        
        // Test 2: API Health
        console.log('\\n📋 Step 2: Testing API Health...');
        const apiHealth = await fetch(`${API_URL}/health`);
        if (apiHealth.ok) {
            const data = await apiHealth.json();
            results.api_health = true;
            results.model_loaded = data.model_status === 'loaded_openvino' || data.backend_inference === true;
            console.log('✅ API healthy:', data.status);
            if (data.model_status) {
                console.log(`   Model: ${data.model_status}`);
                console.log(`   Backend: ${data.backend_type || 'N/A'}`);
                console.log(`   Device: ${data.device_info?.device || 'N/A'}`);
                console.log(`   Input Size: ${data.device_info?.input_shape?.join('x') || 'N/A'}`);
            }
        } else {
            console.log('❌ API health check failed');
        }
        
        // Test 3: Frontend-API Proxy
        console.log('\\n📋 Step 3: Testing Frontend-API Proxy...');
        const proxyHealth = await fetch(`${FRONTEND_URL}/api/v1/health`);
        if (proxyHealth.ok) {
            const data = await proxyHealth.json();
            results.frontend_api_proxy = true;
            console.log('✅ Frontend can proxy to API:', data.status);
        } else {
            console.log('❌ Frontend-API proxy failed');
        }
        
        // Test 4: Camera Page Access
        console.log('\\n📋 Step 4: Testing Camera Page Access...');
        const cameraPage = await fetch(`${FRONTEND_URL}/camera.html`);
        if (cameraPage.ok) {
            const html = await cameraPage.text();
            results.camera_page = html.includes('Live Detection') || html.includes('camera-detection');
            console.log('✅ Camera page accessible');
            console.log(`   Contains detection elements: ${results.camera_page}`);
        } else {
            console.log('❌ Camera page not accessible');
        }
        
        // Test 5: API Session Creation
        console.log('\\n📋 Step 5: Testing API Session Creation...');
        const sessionResponse = await fetch(`${API_URL}/session/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                confidence_threshold: 0.5,
                source: 'integration_test'
            })
        });
        
        if (sessionResponse.ok) {
            const session = await sessionResponse.json();
            results.api_session = !!session.session_id;
            console.log('✅ API session created:', session.session_id);
        } else {
            console.log('❌ API session creation failed');
        }
        
    } catch (error) {
        console.error('❌ Integration test error:', error.message);
    }
    
    // Summary
    console.log('\\n📊 Integration Test Results:');
    console.log('============================');
    
    const tests = [
        { name: 'Frontend Health', result: results.frontend_health },
        { name: 'API Health', result: results.api_health },
        { name: 'Model Loaded', result: results.model_loaded },
        { name: 'Frontend-API Proxy', result: results.frontend_api_proxy },
        { name: 'Camera Page', result: results.camera_page },
        { name: 'API Session', result: results.api_session }
    ];
    
    tests.forEach(test => {
        const status = test.result ? '✅ PASS' : '❌ FAIL';
        console.log(`   ${test.name}: ${status}`);
    });
    
    const passCount = tests.filter(t => t.result).length;
    const totalTests = tests.length;
    
    console.log(`\\n📈 Overall Score: ${passCount}/${totalTests} tests passed`);
    
    if (passCount === totalTests) {
        console.log('\\n🎉 ALL TESTS PASSED! Railway deployment is fully functional.');
        console.log('\\n🚀 Ready for camera detection:');
        console.log(`   Camera App: ${FRONTEND_URL}/camera.html`);
        console.log(`   Dashboard:  ${FRONTEND_URL}/dashboard.html`);
        console.log(`   API Docs:   ${API_URL}/docs`);
    } else {
        console.log(`\\n⚠️  ${totalTests - passCount} test(s) failed. Check the issues above.`);
        console.log('\\n🔧 Troubleshooting:');
        if (!results.model_loaded) {
            console.log('   - Model loading: Check Railway logs for OpenVINO initialization');
        }
        if (!results.frontend_api_proxy) {
            console.log('   - API proxy: Check network connectivity between services');
        }
        if (!results.api_session) {
            console.log('   - API sessions: Check API service logs for errors');
        }
    }
    
    console.log('\\n📋 Service Status Summary:');
    console.log(`   Frontend: ${FRONTEND_URL}`);
    console.log(`   API: ${API_URL}`);
    console.log(`   Project ID: 348fd37d-a0d7-4a94-ab14-ea17e5ecfb5b`);
}

// Run the test
testFullIntegration().catch(console.error);