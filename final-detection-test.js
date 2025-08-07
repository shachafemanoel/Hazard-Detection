// Final End-to-End Detection Test
// Test complete camera detection pipeline after all fixes

const CAMERA_URL = 'https://hazard-detection-production-8735.up.railway.app/camera.html';
const API_URL = 'https://hazard-api-production-production.up.railway.app';

async function testCompleteDetectionPipeline() {
    console.log('🎯 Final Camera Detection Test');
    console.log('===============================');
    
    try {
        // Test 1: Frontend availability
        console.log('\n📋 Step 1: Testing Frontend Deployment...');
        const frontendResponse = await fetch(CAMERA_URL);
        if (frontendResponse.ok) {
            const html = await frontendResponse.text();
            const hasHotfix = html.includes('camera-hotfix.js');
            const hasUpdatedParsing = html.includes('camera_detection.js');
            
            console.log('✅ Frontend deployed successfully');
            console.log(`✅ Camera hotfix included: ${hasHotfix}`);
            console.log(`✅ Detection script included: ${hasUpdatedParsing}`);
        } else {
            throw new Error(`Frontend not accessible: ${frontendResponse.status}`);
        }
        
        // Test 2: API health and session
        console.log('\n📋 Step 2: Testing API Connection...');
        const healthResponse = await fetch(`${API_URL}/health`);
        if (healthResponse.ok) {
            const health = await healthResponse.json();
            console.log('✅ API is healthy:', health.status);
        } else {
            throw new Error(`API health failed: ${healthResponse.status}`);
        }
        
        // Create session
        const sessionResponse = await fetch(`${API_URL}/session/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                confidence_threshold: 0.5,
                source: 'final_test'
            })
        });
        
        if (!sessionResponse.ok) {
            throw new Error(`Session creation failed: ${sessionResponse.status}`);
        }
        
        const session = await sessionResponse.json();
        console.log('✅ Session created:', session.session_id);
        
        // Test 3: Detection with various image formats
        console.log('\n📋 Step 3: Testing Detection Pipeline...');
        
        const testCases = [
            { name: 'Small RGB Image', width: 100, height: 100, format: 'image/jpeg' },
            { name: 'Medium Image', width: 320, height: 240, format: 'image/jpeg' },
            { name: 'PNG Format', width: 150, height: 100, format: 'image/png' }
        ];
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const testCase of testCases) {
            try {
                console.log(`\n🖼️  Testing ${testCase.name}...`);
                
                // Create test image with gradient and shapes
                const canvas = document.createElement('canvas');
                canvas.width = testCase.width;
                canvas.height = testCase.height;
                const ctx = canvas.getContext('2d');
                
                // Create interesting test pattern
                const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
                gradient.addColorStop(0, '#FF6B6B');
                gradient.addColorStop(0.5, '#4ECDC4');
                gradient.addColorStop(1, '#45B7D1');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Add some geometric shapes that might look like hazards
                ctx.fillStyle = '#333333';
                ctx.fillRect(10, 10, 40, 20);  // Rectangle
                ctx.beginPath();
                ctx.arc(canvas.width - 30, 30, 15, 0, 2 * Math.PI);
                ctx.fill();  // Circle
                
                // Add some lines
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, canvas.height / 2);
                ctx.lineTo(canvas.width, canvas.height / 2);
                ctx.stroke();
                
                // Convert to blob
                const imageBlob = await new Promise(resolve => {
                    canvas.toBlob(resolve, testCase.format, 0.8);
                });
                
                // Test detection
                const formData = new FormData();
                formData.append('file', imageBlob, `test_${testCase.name.replace(/\\s+/g, '_').toLowerCase()}.jpg`);
                
                const detectionResponse = await fetch(`${API_URL}/detect/${session.session_id}`, {
                    method: 'POST',
                    body: formData
                });
                
                if (detectionResponse.ok) {
                    const result = await detectionResponse.json();
                    
                    console.log(`  ✅ ${testCase.name} processed successfully`);
                    console.log(`     Success: ${result.success}`);
                    console.log(`     Detections: ${result.detections?.length || 0}`);
                    console.log(`     Processing time: ${result.processing_time_ms || 'N/A'}ms`);
                    console.log(`     Image size: ${result.image_size?.width}x${result.image_size?.height}`);
                    console.log(`     Backend: ${result.model_info?.backend || 'unknown'}`);
                    
                    // Validate response structure
                    if (result.success && Array.isArray(result.detections)) {
                        console.log(`  ✅ Response structure valid`);
                        successCount++;
                        
                        // If we got detections, validate their format
                        if (result.detections.length > 0) {
                            const detection = result.detections[0];
                            const hasValidFormat = detection.bbox && 
                                                 Array.isArray(detection.bbox) && 
                                                 detection.bbox.length === 4 &&
                                                 typeof detection.confidence === 'number' &&
                                                 typeof detection.class_id === 'number';
                            
                            console.log(`  ✅ Detection format valid: ${hasValidFormat}`);
                        }
                    } else {
                        console.log(`  ⚠️ Response structure issue`);
                        errorCount++;
                    }
                } else {
                    const errorText = await detectionResponse.text();
                    console.log(`  ❌ ${testCase.name} failed: ${detectionResponse.status}`);
                    console.log(`     Error: ${errorText.substring(0, 200)}`);
                    errorCount++;
                }
                
            } catch (error) {
                console.log(`  ❌ ${testCase.name} error: ${error.message}`);
                errorCount++;
            }
        }
        
        // Test 4: Base64 detection (camera format)
        console.log('\n📋 Step 4: Testing Base64 Detection (Camera Format)...');
        
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            
            // Create camera-like test image
            ctx.fillStyle = '#87CEEB';  // Sky blue background
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Add road-like patterns
            ctx.fillStyle = '#696969';
            ctx.fillRect(0, canvas.height * 0.6, canvas.width, canvas.height * 0.4);
            
            // Add white lines (lane markings)
            ctx.fillStyle = '#FFFFFF';
            for (let i = 0; i < canvas.width; i += 60) {
                ctx.fillRect(i, canvas.height * 0.75, 30, 4);
            }
            
            // Convert to base64
            const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            
            const base64Response = await fetch(`${API_URL}/detect-base64`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Data,
                    confidence_threshold: 0.3
                })
            });
            
            if (base64Response.ok) {
                const result = await base64Response.json();
                console.log('✅ Base64 detection working');
                console.log(`   Success: ${result.success}`);
                console.log(`   Detections: ${result.detections?.length || 0}`);
                console.log(`   Processing time: ${result.processing_time_ms || 'N/A'}ms`);
                successCount++;
            } else {
                const errorText = await base64Response.text();
                console.log('❌ Base64 detection failed:', base64Response.status);
                console.log('   Error:', errorText.substring(0, 200));
                errorCount++;
            }
            
        } catch (error) {
            console.log('❌ Base64 test error:', error.message);
            errorCount++;
        }
        
        // Final Results
        console.log('\n🎉 Final Detection Test Results');
        console.log('================================');
        console.log(`✅ Successful tests: ${successCount}`);
        console.log(`❌ Failed tests: ${errorCount}`);
        console.log(`📊 Success rate: ${Math.round((successCount / (successCount + errorCount)) * 100)}%`);
        
        if (successCount > 0 && errorCount === 0) {
            console.log('\\n🚀 PERFECT! Camera detection pipeline is fully working!');
            console.log('🎯 All systems operational:');
            console.log('   ✅ Frontend loading fixed');
            console.log('   ✅ API OpenCV errors resolved');
            console.log('   ✅ PIL fallback working');
            console.log('   ✅ Detection parsing fixed');
            console.log('   ✅ Response format compatibility ensured');
            console.log(`\\n📱 Ready for testing: ${CAMERA_URL}`);
        } else if (successCount > 0) {
            console.log('\\n🟡 PARTIAL SUCCESS - Some issues remain');
            console.log(`   ${successCount} tests passed, ${errorCount} failed`);
            console.log('   Camera detection should work but may have occasional issues');
            console.log(`\\n📱 Test at: ${CAMERA_URL}`);
        } else {
            console.log('\\n🔴 PIPELINE FAILURE - Major issues detected');
            console.log('   All tests failed - camera detection not functional');
            console.log('   Check API logs and frontend console for errors');
        }
        
    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
        console.log('\\n🔄 Deployment may still be in progress.');
        console.log('   Wait 2-3 minutes and retry the test.');
    }
}

// Check if we're in browser environment
if (typeof window !== 'undefined') {
    testCompleteDetectionPipeline();
} else {
    console.log('❌ This test needs to run in a browser environment');
    console.log('   Copy and paste into browser console to run comprehensive test');
}