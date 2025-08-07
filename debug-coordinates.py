#!/usr/bin/env python3
"""Debug coordinate scaling issues"""

import subprocess
import json
import base64
from PIL import Image, ImageDraw
from io import BytesIO

# Create a test image with clear features
def create_test_image():
    # Create 640x480 test image (common camera resolution)
    img = Image.new('RGB', (640, 480), color='lightblue')
    draw = ImageDraw.Draw(img)
    
    # Draw some rectangles that might be detected as hazards
    # Top-left corner (should be around 50,50 to 150,100)
    draw.rectangle([50, 50, 150, 100], fill='darkgray', outline='black', width=3)
    
    # Center (should be around 270,190 to 370,290)  
    draw.rectangle([270, 190, 370, 290], fill='brown', outline='black', width=3)
    
    # Bottom-right area (should be around 450,350 to 550,420)
    draw.rectangle([450, 350, 550, 420], fill='darkred', outline='black', width=3)
    
    return img

# Test with the session
session_id = "d94cd82f-0891-4f8f-b005-e302eec6ebe1"
api_url = "https://hazard-api-production-production.up.railway.app"

img = create_test_image()
img_bytes = BytesIO()
img.save(img_bytes, format='JPEG', quality=90)
img_bytes.seek(0)

print("🧪 Testing Coordinate System")
print("============================")
print(f"Test image size: {img.size}")
print("Expected rectangles:")
print("  Top-left: (50,50) to (150,100)")
print("  Center: (270,190) to (370,290)")  
print("  Bottom-right: (450,350) to (550,420)")

# Convert to base64 for curl
img_b64 = base64.b64encode(img_bytes.getvalue()).decode()

# Test the API
curl_cmd = [
    'curl', '-s', '-X', 'POST',
    f'{api_url}/detect-base64',
    '-H', 'Content-Type: application/json',
    '-d', json.dumps({
        'image': img_b64,
        'confidence_threshold': 0.1  # Low threshold to catch any detections
    })
]

try:
    result = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=30)
    if result.returncode == 0:
        response = json.loads(result.stdout)
        
        print(f"\n✅ API Response:")
        print(f"   Success: {response.get('success')}")
        print(f"   Processing time: {response.get('processing_time_ms')}ms")
        print(f"   Image size reported: {response.get('image_size')}")
        print(f"   Detections: {len(response.get('detections', []))}")
        
        if response.get('detections'):
            print(f"\n🔍 Detection coordinates:")
            for i, det in enumerate(response['detections']):
                bbox = det.get('bbox', [])
                if len(bbox) >= 4:
                    print(f"   {i+1}: bbox=[{bbox[0]:.1f}, {bbox[1]:.1f}, {bbox[2]:.1f}, {bbox[3]:.1f}] conf={det.get('confidence', 0):.2f} class={det.get('class_id')}")
        else:
            print("\n❌ No detections found")
            print("   This indicates either:")
            print("   1. Model doesn't detect our test rectangles")
            print("   2. Confidence threshold too high")
            print("   3. Our test pattern doesn't match trained hazard classes")
    else:
        print(f"❌ Curl failed: {result.stderr}")
        
except Exception as e:
    print(f"❌ Error: {e}")