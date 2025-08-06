#!/usr/bin/env python3
"""Test API response format to understand detection structure"""
import requests
import json
from io import BytesIO
from PIL import Image

API_URL = "https://hazard-api-production-production.up.railway.app"
SESSION_ID = "6c1c691e-4bff-4b73-85e3-389fd83cfc03"

# Create a simple test image
img = Image.new('RGB', (100, 100), color='red')
img_bytes = BytesIO()
img.save(img_bytes, format='JPEG')
img_bytes.seek(0)

# Test the API detection response format
print("🧪 Testing API Response Format")
print("==============================")

try:
    # Test detection endpoint
    response = requests.post(
        f"{API_URL}/detect/{SESSION_ID}",
        files={'file': ('test.jpg', img_bytes, 'image/jpeg')}
    )
    
    print(f"Response status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print("\n✅ API Response Structure:")
        print(json.dumps(data, indent=2))
        
        if 'detections' in data:
            print(f"\n🔍 Detections array length: {len(data['detections'])}")
            if data['detections']:
                print("🔍 First detection structure:")
                print(json.dumps(data['detections'][0], indent=2))
        
    else:
        print(f"\n❌ API Error: {response.status_code}")
        print(response.text[:500])
        
except Exception as e:
    print(f"❌ Request failed: {e}")