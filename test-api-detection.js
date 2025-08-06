// Test API Detection with Image Processing Fix
// This script tests the OpenCV image processing fix

const API_URL = 'https://hazard-api-production-production.up.railway.app';

async function testAPIDetection() {
    console.log('🧪 Testing API Detection with Image Processing Fix');
    console.log('================================================');
    
    try {
        // Test 1: API Health
        console.log('\\n📋 Step 1: Testing API Health...');
        const healthResponse = await fetch(`${API_URL}/health`);
        if (healthResponse.ok) {
            const health = await healthResponse.json();
            console.log('✅ API is healthy:', health.status);
        } else {
            throw new Error(`Health check failed: ${healthResponse.status}`);
        }
        
        // Test 2: Session Creation
        console.log('\\n📋 Step 2: Creating Session...');
        const sessionResponse = await fetch(`${API_URL}/session/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                confidence_threshold: 0.5,
                source: 'test_detection_fix'
            })
        });
        
        if (!sessionResponse.ok) {
            throw new Error(`Session creation failed: ${sessionResponse.status}`);
        }
        
        const session = await sessionResponse.json();
        console.log('✅ Session created:', session.session_id);
        
        // Test 3: Create a simple test image (1x1 pixel)
        console.log('\\n📋 Step 3: Testing Detection with Simple Image...');
        
        // Create a minimal test image (PNG data URL to Blob)
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(0, 0, 100, 100);
        
        // Convert canvas to blob
        const imageBlob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/jpeg', 0.8);
        });
        
        // Test detection
        const formData = new FormData();
        formData.append('file', imageBlob, 'test.jpg');
        
        const detectionResponse = await fetch(`${API_URL}/detect/${session.session_id}`, {
            method: 'POST',
            body: formData
        });
        
        console.log('Detection response status:', detectionResponse.status);
        
        if (detectionResponse.ok) {
            const result = await detectionResponse.json();
            console.log('✅ Detection completed successfully!');
            console.log(`   Found ${result.detections?.length || 0} detections`);
            console.log(`   Processing time: ${result.processing_time_ms || 'N/A'}ms`);
            console.log('✅ OpenCV image processing fix working!');
        } else {
            const errorText = await detectionResponse.text();
            console.log('❌ Detection failed:', detectionResponse.status);
            console.log('Error details:', errorText.substring(0, 500));
            
            if (errorText.includes('cvtColor')) {
                console.log('⚠️ Still having OpenCV issues - may need more time for deployment');
            }
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('\\n🔄 Railway API may still be deploying the fixes.');
        console.log('   Wait 2-3 minutes and test camera detection again.');
    }
}

// Create test environment if we're in browser
if (typeof window !== 'undefined') {
    testAPIDetection();
} else {
    console.log('❌ This test needs to run in a browser environment');
}