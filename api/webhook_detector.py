"""
Webhook-based Hazard Detection Service
Uses external AI services via webhooks instead of local models
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from io import BytesIO
import aiohttp
import asyncio
import base64
import json
import os
import logging
from typing import Dict, List, Optional
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Hazard Detection Webhook Service", version="1.0.0")

# CORS configuration for Railway
allowed_origins = [
    "https://hazard-detection-production.up.railway.app",
    "http://localhost:3000",
    "http://localhost:8000", 
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class WebhookDetector:
    """Webhook-based hazard detection using external AI services"""
    
    def __init__(self):
        # Configure webhook endpoints (you can add multiple services)
        self.webhook_configs = {
            "huggingface": {
                "url": "https://api-inference.huggingface.co/models/microsoft/resnet-50",
                "headers": {
                    "Authorization": f"Bearer {os.getenv('HUGGINGFACE_API_KEY', '')}",
                    "Content-Type": "application/json"
                },
                "enabled": bool(os.getenv('HUGGINGFACE_API_KEY'))
            },
            "replicate": {
                "url": "https://api.replicate.com/v1/predictions",
                "headers": {
                    "Authorization": f"Token {os.getenv('REPLICATE_API_TOKEN', '')}",
                    "Content-Type": "application/json"
                },
                "enabled": bool(os.getenv('REPLICATE_API_TOKEN'))
            }
        }
        
    async def detect_hazards(self, image_data: bytes) -> Dict:
        """Detect hazards using webhook services"""
        try:
            # Convert image to base64 for webhook transmission
            image_b64 = base64.b64encode(image_data).decode('utf-8')
            
            # Try each configured webhook service
            for service_name, config in self.webhook_configs.items():
                if not config["enabled"]:
                    continue
                    
                try:
                    result = await self._call_webhook(service_name, config, image_b64)
                    if result:
                        return self._process_detection_result(result, service_name)
                except Exception as e:
                    logger.warning(f"Webhook {service_name} failed: {e}")
                    continue
            
            # Fallback: return mock detection for demo
            return self._mock_detection()
            
        except Exception as e:
            logger.error(f"Detection failed: {e}")
            raise HTTPException(status_code=500, detail="Detection service unavailable")
    
    async def _call_webhook(self, service_name: str, config: Dict, image_b64: str) -> Optional[Dict]:
        """Call external webhook service"""
        timeout = aiohttp.ClientTimeout(total=30)
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            if service_name == "huggingface":
                payload = {"inputs": image_b64}
            elif service_name == "replicate":
                payload = {
                    "version": "your-model-version-id",
                    "input": {"image": f"data:image/jpeg;base64,{image_b64}"}
                }
            else:
                payload = {"image": image_b64}
            
            async with session.post(
                config["url"],
                headers=config["headers"],
                json=payload
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.warning(f"Webhook {service_name} returned {response.status}")
                    return None
    
    def _process_detection_result(self, result: Dict, service_name: str) -> Dict:
        """Process webhook response into standardized format"""
        detections = []
        
        if service_name == "huggingface":
            # Process HuggingFace response
            if isinstance(result, list) and result:
                for item in result[:3]:  # Top 3 results
                    detections.append({
                        "type": item.get("label", "unknown"),
                        "confidence": item.get("score", 0.0),
                        "bbox": None  # HF classification doesn't provide bbox
                    })
        
        elif service_name == "replicate":
            # Process Replicate response
            output = result.get("output", [])
            if isinstance(output, list):
                for item in output:
                    detections.append({
                        "type": item.get("class", "unknown"),
                        "confidence": item.get("confidence", 0.0),
                        "bbox": item.get("bbox")
                    })
        
        # Map generic classifications to hazard types
        hazard_types = []
        for detection in detections:
            hazard_type = self._map_to_hazard_type(detection["type"])
            if hazard_type and detection["confidence"] > 0.3:
                hazard_types.append(hazard_type)
        
        return {
            "detections": detections,
            "hazard_types": list(set(hazard_types)) if hazard_types else ["other"],
            "service_used": service_name,
            "timestamp": datetime.now().isoformat()
        }
    
    def _map_to_hazard_type(self, classification: str) -> Optional[str]:
        """Map AI model classifications to hazard types"""
        classification_lower = classification.lower()
        
        hazard_mapping = {
            "pothole": "pothole",
            "crack": "crack", 
            "damaged": "damage",
            "construction": "construction",
            "road": "road_hazard",
            "vehicle": "vehicle",
            "person": "pedestrian",
            "traffic": "traffic",
            "sign": "signage",
            "barrier": "barrier"
        }
        
        for key, hazard_type in hazard_mapping.items():
            if key in classification_lower:
                return hazard_type
        
        return None
    
    def _mock_detection(self) -> Dict:
        """Fallback mock detection for demo purposes"""
        return {
            "detections": [
                {
                    "type": "road_surface_issue",
                    "confidence": 0.85,
                    "bbox": [100, 100, 200, 200]
                }
            ],
            "hazard_types": ["pothole"],
            "service_used": "mock",
            "timestamp": datetime.now().isoformat()
        }

# Initialize detector
detector = WebhookDetector()

@app.get("/")
async def root():
    return {
        "service": "Hazard Detection Webhook API",
        "version": "1.0.0",
        "status": "active",
        "available_services": [
            name for name, config in detector.webhook_configs.items() 
            if config["enabled"]
        ]
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "webhook_services": {
            name: "enabled" if config["enabled"] else "disabled"
            for name, config in detector.webhook_configs.items()
        }
    }

@app.post("/detect")
async def detect_hazards(file: UploadFile = File(...)):
    """Detect hazards in uploaded image using webhook services"""
    try:
        # Validate file type
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Read image data
        image_data = await file.read()
        
        # Validate image
        try:
            image = Image.open(BytesIO(image_data))
            image.verify()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid image file")
        
        # Detect hazards using webhooks
        result = await detector.detect_hazards(image_data)
        
        return {
            "success": True,
            "filename": file.filename,
            "file_size": len(image_data),
            "detection_result": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Detection error: {e}")
        raise HTTPException(status_code=500, detail="Detection failed")

@app.post("/detect-url")
async def detect_hazards_from_url(url: str):
    """Detect hazards from image URL"""
    try:
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise HTTPException(status_code=400, detail="Failed to fetch image from URL")
                
                image_data = await response.read()
                result = await detector.detect_hazards(image_data)
                
                return {
                    "success": True,
                    "image_url": url,
                    "detection_result": result
                }
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"URL detection error: {e}")
        raise HTTPException(status_code=500, detail="URL detection failed")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)