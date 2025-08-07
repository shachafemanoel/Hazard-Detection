// Test Canvas Display - Debug detection visualization
// Run this in browser console on camera page to test canvas drawing

async function testCanvasDisplay() {
    console.log('🎨 Testing Canvas Display');
    console.log('=========================');
    
    // Check if we're on the camera page
    if (!window.location.href.includes('camera.html')) {
        console.error('❌ Please run this on the camera.html page');
        return;
    }
    
    // Find canvas and video elements
    const video = document.getElementById('camera-stream');
    const canvas = document.getElementById('overlay-canvas');
    
    if (!video || !canvas) {
        console.error('❌ Video or canvas element not found');
        console.log('Available elements:', {
            video: !!video,
            canvas: !!canvas,
            videoId: video?.id || 'not found',
            canvasId: canvas?.id || 'not found'
        });
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    console.log('✅ Canvas elements found');
    console.log('📊 Canvas info:', {
        canvasSize: `${canvas.width}x${canvas.height}`,
        videoSize: video.videoWidth ? `${video.videoWidth}x${video.videoHeight}` : 'not ready',
        videoReady: video.readyState >= 2
    });
    
    // Test 1: Basic canvas drawing
    console.log('\n📋 Test 1: Basic Canvas Drawing');
    try {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(50, 50, 100, 100);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px Arial';
        ctx.fillText('TEST DRAW', 60, 105);
        ctx.restore();
        console.log('✅ Basic drawing successful');
    } catch (error) {
        console.error('❌ Basic drawing failed:', error);
    }
    
    // Test 2: Video frame drawing
    console.log('\n📋 Test 2: Video Frame Drawing');
    try {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            console.log('✅ Video frame drawing successful');
        } else {
            console.warn('⚠️ Video not ready for frame drawing');
            console.log('Video state:', {
                readyState: video.readyState,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                currentTime: video.currentTime
            });
        }
    } catch (error) {
        console.error('❌ Video frame drawing failed:', error);
    }
    
    // Test 3: Simulate detection drawing
    console.log('\n📋 Test 3: Simulate Detection Drawing');
    
    // Create fake detection data in the format the API returns
    const fakeDetections = [
        {
            bbox: [100, 50, 200, 150],
            confidence: 0.85,
            class_id: 0,
            class_name: 'Pothole'
        },
        {
            bbox: [300, 200, 450, 280],
            confidence: 0.72,
            class_id: 1,
            class_name: 'Crack'
        }
    ];
    
    // Convert to internal format
    const parsedDetections = fakeDetections.map(det => ({
        x1: det.bbox[0],
        y1: det.bbox[1], 
        x2: det.bbox[2],
        y2: det.bbox[3],
        score: det.confidence,
        classId: det.class_id
    }));
    
    console.log('🔍 Fake detections:', parsedDetections);
    
    // Test coordinate scaling
    const assumeVideoSize = video.videoWidth || 640;
    const assumeVideoHeight = video.videoHeight || 480;
    const scaleX = canvas.width / assumeVideoSize;
    const scaleY = canvas.height / assumeVideoHeight;
    
    console.log('📏 Coordinate scaling:', {
        canvasSize: `${canvas.width}x${canvas.height}`,
        videoSize: `${assumeVideoSize}x${assumeVideoHeight}`,
        scale: `${scaleX.toFixed(3)}x, ${scaleY.toFixed(3)}y`
    });
    
    // Draw fake detections
    parsedDetections.forEach((detection, index) => {
        const { x1, y1, x2, y2, score, classId } = detection;
        
        // Apply coordinate scaling (API mode)
        const canvasX1 = x1 * scaleX;
        const canvasY1 = y1 * scaleY;
        const canvasX2 = x2 * scaleX;
        const canvasY2 = y2 * scaleY;
        
        const width = canvasX2 - canvasX1;
        const height = canvasY2 - canvasY1;
        
        console.log(`📦 Fake detection ${index}: (${x1},${y1}) → canvas(${canvasX1.toFixed(1)},${canvasY1.toFixed(1)}) size=${width.toFixed(1)}x${height.toFixed(1)}`);
        
        // Draw detection box
        ctx.save();
        ctx.strokeStyle = index === 0 ? '#FF0000' : '#00FF00';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.8;
        ctx.strokeRect(canvasX1, canvasY1, width, height);
        
        // Draw label
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = '14px Arial';
        const label = `Fake ${index + 1} (${(score * 100).toFixed(0)}%)`;
        ctx.fillText(label, canvasX1, canvasY1 - 5);
        ctx.restore();
        
        console.log(`✅ Drew fake detection ${index + 1}`);
    });
    
    // Test 4: Check if drawing persists
    console.log('\n📋 Test 4: Drawing Persistence');
    setTimeout(() => {
        // Check if our test drawing is still visible after 2 seconds
        const imageData = ctx.getImageData(60, 60, 1, 1);
        const pixel = imageData.data;
        
        if (pixel[0] > 100) { // Red channel should be high from our red rectangle
            console.log('✅ Canvas drawing persisted');
        } else {
            console.log('⚠️ Canvas drawing was cleared - detection loop may be overwriting');
        }
        
        console.log('\n🎯 Canvas Display Test Complete');
        console.log('==============================');
        console.log('If you see colored rectangles and labels on the video,');
        console.log('then canvas drawing is working correctly.');
        console.log('The issue may be:');
        console.log('1. API not returning detections');
        console.log('2. Coordinate scaling problems');
        console.log('3. Detection loop clearing canvas too quickly');
        
    }, 2000);
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
    testCanvasDisplay();
} else {
    console.log('❌ Run this in browser console on the camera page');
}