"""
Improved FastAPI backend for hazard detection model inference
Optimized for performance, reliability, and observability
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import uvicorn

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps
import numpy as np
from pydantic import BaseModel, Field
import torch

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Response models
class Detection(BaseModel):
    bbox: List[float] = Field(..., description="Bounding box coordinates [x1, y1, x2, y2]")
    confidence: float = Field(..., description="Detection confidence score")
    class_id: int = Field(..., description="Class ID")
    class_name: str = Field(..., description="Human-readable class name")

class InferenceResponse(BaseModel):
    detections: List[Detection]
    processing_time_ms: float
    image_dimensions: Tuple[int, int]
    model_version: str
    timestamp: float

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    gpu_available: bool
    memory_usage_mb: float
    uptime_seconds: float

# Global variables
model = None
model_loaded = False
app_start_time = time.time()

# Hazard type mapping
HAZARD_CLASSES = {
    0: "Alligator Crack",
    1: "Block Crack", 
    2: "Construction Joint Crack",
    3: "Crosswalk Blur",
    4: "Lane Blur",
    5: "Longitudinal Crack",
    6: "Manhole",
    7: "Patch Repair",
    8: "Pothole",
    9: "Transverse Crack",
    10: "Wheel Mark Crack"
}

async def load_model() -> bool:
    """Load YOLO model with error handling and fallback options"""
    global model, model_loaded
    
    model_paths = [
        "public/object_detecion_model/road_damage_detection_last_version.pt",
        "public/object_detection_model/road_damage_detection_last_version.pt",
        "./road_damage_detection_last_version.pt"
    ]
    
    for model_path in model_paths:
        try:
            if Path(model_path).exists():
                logger.info(f"Loading model from: {model_path}")
                
                # Import ultralytics here to handle missing dependency gracefully
                try:
                    from ultralytics import YOLO
                except ImportError:
                    logger.error("Ultralytics not installed. Install with: pip install ultralytics")
                    return False
                
                model = YOLO(model_path)
                
                # Warm up model with dummy inference
                dummy_image = Image.new('RGB', (640, 640), color='black')
                _ = model(dummy_image, verbose=False)
                
                model_loaded = True
                logger.info(f"Model loaded successfully from {model_path}")
                return True
                
        except Exception as e:
            logger.warning(f"Failed to load model from {model_path}: {str(e)}")
            continue
    
    logger.error("Failed to load model from any path")
    return False

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    logger.info("Starting FastAPI application...")
    success = await load_model()
    if not success:
        logger.warning("Model loading failed, continuing without model")
    
    yield
    
    # Shutdown
    logger.info("Shutting down FastAPI application...")

# Initialize FastAPI app
app = FastAPI(
    title="Hazard Detection API",
    description="AI-powered road hazard detection service",
    version="2.0.0",
    lifespan=lifespan
)

# Security middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1", "*.onrender.com", "hazard-detection.onrender.com"]
)

# CORS with proper origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://hazard-detection.onrender.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"]
)

# Dependency for request validation
async def validate_file_upload(file: UploadFile = File(...)) -> UploadFile:
    """Validate uploaded file"""
    # Check file size (max 10MB)
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size: 10MB")
    
    # Check content type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Invalid file type. Only images are allowed")
    
    return file

async def preprocess_image(image: Image.Image, target_size: int = 640) -> np.ndarray:
    """Preprocess image for YOLO inference with optimization"""
    try:
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Apply auto-orient to handle EXIF rotation
        image = ImageOps.exif_transpose(image)
        
        # Resize maintaining aspect ratio
        image.thumbnail((target_size, target_size), Image.Resampling.LANCZOS)
        
        # Create square image with padding
        new_image = Image.new('RGB', (target_size, target_size), (114, 114, 114))
        paste_x = (target_size - image.width) // 2
        paste_y = (target_size - image.height) // 2
        new_image.paste(image, (paste_x, paste_y))
        
        return np.array(new_image)
        
    except Exception as e:
        logger.error(f"Image preprocessing failed: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid image format")

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with detailed system info"""
    try:
        import psutil
        memory_usage = psutil.Process().memory_info().rss / 1024 / 1024
    except ImportError:
        memory_usage = 0.0
    
    return HealthResponse(
        status="healthy" if model_loaded else "degraded",
        model_loaded=model_loaded,
        gpu_available=torch.cuda.is_available(),
        memory_usage_mb=memory_usage,
        uptime_seconds=time.time() - app_start_time
    )

@app.post("/detect", response_model=InferenceResponse)
async def detect_hazards(
    background_tasks: BackgroundTasks,
    file: UploadFile = Depends(validate_file_upload)
):
    """
    Detect road hazards in uploaded image
    
    Args:
        file: Image file to analyze
    
    Returns:
        InferenceResponse with detections and metadata
    """
    if not model_loaded or model is None:
        raise HTTPException(
            status_code=503, 
            detail="Model not available. Service is starting up or model failed to load."
        )
    
    start_time = time.time()
    
    try:
        # Read and validate image
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Empty file")
        
        # Load image
        try:
            image = Image.open(BytesIO(contents))
            original_size = image.size
        except Exception as e:
            logger.error(f"Image loading failed: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid image file")
        
        # Preprocess image
        processed_image = await preprocess_image(image)
        
        # Run inference with timeout
        try:
            # Convert to PIL for YOLO
            pil_image = Image.fromarray(processed_image)
            
            # Run inference
            results = model(pil_image, verbose=False, conf=0.25, iou=0.45)
            
            # Process results
            detections = []
            if results and len(results) > 0 and results[0].boxes is not None:
                boxes = results[0].boxes
                
                for i in range(len(boxes)):
                    bbox = boxes.xyxy[i].cpu().numpy().tolist()
                    confidence = float(boxes.conf[i].cpu().numpy())
                    class_id = int(boxes.cls[i].cpu().numpy())
                    
                    # Scale bbox back to original image size
                    scale_x = original_size[0] / 640
                    scale_y = original_size[1] / 640
                    bbox = [
                        bbox[0] * scale_x,
                        bbox[1] * scale_y, 
                        bbox[2] * scale_x,
                        bbox[3] * scale_y
                    ]
                    
                    detections.append(Detection(
                        bbox=bbox,
                        confidence=confidence,
                        class_id=class_id,
                        class_name=HAZARD_CLASSES.get(class_id, f"Unknown_{class_id}")
                    ))
            
            processing_time = (time.time() - start_time) * 1000
            
            # Log performance metrics
            background_tasks.add_task(
                log_inference_metrics,
                processing_time,
                len(detections),
                original_size
            )
            
            return InferenceResponse(
                detections=detections,
                processing_time_ms=processing_time,
                image_dimensions=original_size,
                model_version="road_damage_detection_last_version",
                timestamp=time.time()
            )
            
        except Exception as e:
            logger.error(f"Model inference failed: {str(e)}")
            raise HTTPException(status_code=500, detail="Inference failed")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in detect_hazards: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

async def log_inference_metrics(processing_time: float, detection_count: int, image_size: Tuple[int, int]):
    """Log performance metrics for monitoring"""
    logger.info(
        f"Inference completed - "
        f"Time: {processing_time:.2f}ms, "
        f"Detections: {detection_count}, "
        f"Image: {image_size[0]}x{image_size[1]}"
    )

@app.get("/metrics")
async def get_metrics():
    """Prometheus-style metrics endpoint"""
    return {
        "model_loaded": int(model_loaded),
        "gpu_available": int(torch.cuda.is_available()),
        "uptime_seconds": time.time() - app_start_time
    }

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for better error reporting"""
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error_type": type(exc).__name__}
    )

if __name__ == "__main__":
    uvicorn.run(
        "app_improved:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        access_log=True,
        log_level="info"
    )