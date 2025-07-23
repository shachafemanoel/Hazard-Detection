from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from io import BytesIO
from ultralytics import YOLO
# import numpy as np  # Commented out as not currently used
import time
import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional
import math
from collections import defaultdict
import base64

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Hazard Detection Backend", version="1.0.0")

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for model and class names
model = None
class_names = ['crack', 'knocked', 'pothole', 'surface_damage']

# Session management
sessions = {}
active_detections = defaultdict(list)  # session_id -> list of detections

# Detection tracking settings
TRACKING_DISTANCE_THRESHOLD = 50  # pixels
TRACKING_TIME_THRESHOLD = 2.0  # seconds
MIN_CONFIDENCE_FOR_REPORT = 0.6

# Load model on startup
@app.on_event("startup")
async def load_model():
    global model
    try:
        logger.info("Loading YOLO model...")
        model = YOLO("best.pt")
        logger.info("✅ YOLO model loaded successfully")
    except Exception as e:
        logger.error(f"❌ Failed to load YOLO model: {e}")
        raise e

@app.get("/")
async def root():
    return {"message": "Hazard Detection Backend API", "status": "running"}

# Helper functions
def calculate_distance(box1, box2):
    """Calculate Euclidean distance between box centers"""
    x1, y1 = (box1[0] + box1[2]) / 2, (box1[1] + box1[3]) / 2
    x2, y2 = (box2[0] + box2[2]) / 2, (box2[1] + box2[3]) / 2
    return math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)

def is_duplicate_detection(new_detection, existing_detections, time_threshold=TRACKING_TIME_THRESHOLD):
    """Check if detection is duplicate based on location and time"""
    current_time = time.time()
    new_bbox = new_detection['bbox']
    
    for existing in existing_detections:
        # Check if same class and within time threshold
        if (existing['class_id'] == new_detection['class_id'] and 
            current_time - existing['timestamp'] < time_threshold):
            
            # Check spatial proximity
            distance = calculate_distance(new_bbox, existing['bbox'])
            if distance < TRACKING_DISTANCE_THRESHOLD:
                return True, existing['report_id']
    
    return False, None

def create_report(detection, session_id, image_data=None):
    """Create a new report for a detection"""
    report_id = str(uuid.uuid4())
    report = {
        'report_id': report_id,
        'session_id': session_id,
        'detection': detection,
        'timestamp': datetime.now().isoformat(),
        'status': 'pending',  # pending, confirmed, dismissed
        'image_data': image_data,  # base64 encoded frame image
        'thumbnail': None,  # Will store thumbnail version
        'location': {
            'bbox': detection['bbox'],
            'center': [detection['center_x'], detection['center_y']]
        },
        'frame_info': {
            'has_image': image_data is not None,
            'image_size': len(image_data) if image_data else 0
        }
    }
    return report

@app.get("/health")
async def health_check():
    model_status = "loaded" if model is not None else "not_loaded"
    return {
        "status": "healthy",
        "model_status": model_status,
        "backend_inference": True,
        "active_sessions": len(sessions)
    }

@app.post("/session/start")
async def start_session():
    """Start a new detection session"""
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        'id': session_id,
        'start_time': datetime.now().isoformat(),
        'reports': [],
        'detection_count': 0,
        'unique_hazards': 0
    }
    active_detections[session_id] = []
    
    return {
        "session_id": session_id,
        "message": "Detection session started"
    }

@app.post("/session/{session_id}/end")
async def end_session(session_id: str):
    """End a detection session and return summary"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    session['end_time'] = datetime.now().isoformat()
    
    # Clean up active detections for this session
    if session_id in active_detections:
        del active_detections[session_id]
    
    return {
        "session_id": session_id,
        "summary": session,
        "message": "Session ended successfully"
    }

@app.get("/session/{session_id}/summary")
async def get_session_summary(session_id: str):
    """Get session summary with all reports"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return sessions[session_id]

@app.post("/session/{session_id}/report/{report_id}/confirm")
async def confirm_report(session_id: str, report_id: str):
    """Confirm a report for submission"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    for report in session['reports']:
        if report['report_id'] == report_id:
            report['status'] = 'confirmed'
            return {"message": "Report confirmed", "report_id": report_id}
    
    raise HTTPException(status_code=404, detail="Report not found")

@app.post("/session/{session_id}/report/{report_id}/dismiss")
async def dismiss_report(session_id: str, report_id: str):
    """Dismiss a report"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    for report in session['reports']:
        if report['report_id'] == report_id:
            report['status'] = 'dismissed'
            return {"message": "Report dismissed", "report_id": report_id}
    
    raise HTTPException(status_code=404, detail="Report not found")

@app.post("/detect/{session_id}")
async def detect_hazards(session_id: str, file: UploadFile = File(...)):
    """
    Enhanced detection endpoint with object tracking and report generation
    Returns detections and creates reports for new unique hazards
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found. Start a session first.")
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        start_time = time.time()
        
        # Read and process image
        contents = await file.read()
        image = Image.open(BytesIO(contents)).convert("RGB")
        
        # Store original image data for reports
        image_base64 = base64.b64encode(contents).decode('utf-8')
        
        # Convert to numpy array for consistency
        # img_array = np.array(image)  # Commented out as not currently used
        
        # Run YOLO inference
        results = model(image, conf=0.5, iou=0.45)  # Set confidence and NMS thresholds
        
        # Process results with tracking and report generation
        detections = []
        new_reports = []
        session = sessions[session_id]
        current_time = time.time()
        
        if len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            
            for i in range(len(boxes)):
                # Get box coordinates (xyxy format)
                x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
                confidence = float(boxes.conf[i].cpu().numpy())
                class_id = int(boxes.cls[i].cpu().numpy())
                
                # Get class name
                hazard_type = class_names[class_id] if class_id < len(class_names) else f"unknown_{class_id}"
                
                detection = {
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "confidence": confidence,
                    "class_id": class_id,
                    "class_name": hazard_type,
                    "center_x": float((x1 + x2) / 2),
                    "center_y": float((y1 + y2) / 2),
                    "width": float(x2 - x1),
                    "height": float(y2 - y1),
                    "area": float((x2 - x1) * (y2 - y1)),
                    "timestamp": current_time
                }
                
                # Check for duplicates only for high-confidence detections
                if confidence >= MIN_CONFIDENCE_FOR_REPORT:
                    is_duplicate, existing_report_id = is_duplicate_detection(
                        detection, active_detections[session_id]
                    )
                    
                    if not is_duplicate:
                        # Create new report for unique detection with frame image
                        report = create_report(detection, session_id, image_base64)
                        session['reports'].append(report)
                        new_reports.append(report)
                        session['unique_hazards'] += 1
                        
                        # Add to active detections for tracking
                        detection['report_id'] = report['report_id']
                        active_detections[session_id].append(detection)
                        
                        # Mark as new detection
                        detection['is_new'] = True
                        detection['report_id'] = report['report_id']
                    else:
                        # Mark as existing detection
                        detection['is_new'] = False
                        detection['report_id'] = existing_report_id
                else:
                    # Low confidence detections are not tracked
                    detection['is_new'] = False
                    detection['report_id'] = None
                
                detections.append(detection)
                session['detection_count'] += 1
        
        processing_time = round((time.time() - start_time) * 1000, 2)  # in milliseconds
        
        logger.info(f"Processed image: {len(detections)} detections in {processing_time}ms")
        
        return {
            "success": True,
            "detections": detections,
            "new_reports": new_reports,
            "session_stats": {
                "total_detections": session['detection_count'],
                "unique_hazards": session['unique_hazards'],
                "pending_reports": len([r for r in session['reports'] if r['status'] == 'pending'])
            },
            "processing_time_ms": processing_time,
            "image_size": {
                "width": image.width,
                "height": image.height
            },
            "model_info": {
                "backend": "ultralytics_yolo",
                "classes": class_names,
                "confidence_threshold": MIN_CONFIDENCE_FOR_REPORT,
                "tracking_enabled": True
            }
        }
        
    except Exception as e:
        logger.error(f"Detection error: {e}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")

@app.post("/detect-batch")
async def detect_batch(files: list[UploadFile] = File(...)):
    """
    Batch detection endpoint for processing multiple images
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    results = []
    start_time = time.time()
    
    for i, file in enumerate(files):
        if not file.content_type.startswith("image/"):
            results.append({
                "file_index": i,
                "filename": file.filename,
                "error": "File must be an image"
            })
            continue
        
        try:
            # Process each image
            contents = await file.read()
            image = Image.open(BytesIO(contents)).convert("RGB")
            
            # Run inference
            inference_results = model(image, conf=0.5, iou=0.45)
            
            # Process detections
            detections = []
            if len(inference_results) > 0 and inference_results[0].boxes is not None:
                boxes = inference_results[0].boxes
                
                for j in range(len(boxes)):
                    x1, y1, x2, y2 = boxes.xyxy[j].cpu().numpy()
                    confidence = float(boxes.conf[j].cpu().numpy())
                    class_id = int(boxes.cls[j].cpu().numpy())
                    
                    hazard_type = class_names[class_id] if class_id < len(class_names) else f"unknown_{class_id}"
                    
                    detection = {
                        "bbox": [float(x1), float(y1), float(x2), float(y2)],
                        "confidence": confidence,
                        "class_id": class_id,
                        "class_name": hazard_type
                    }
                    detections.append(detection)
            
            results.append({
                "file_index": i,
                "filename": file.filename,
                "success": True,
                "detections": detections
            })
            
        except Exception as e:
            results.append({
                "file_index": i,
                "filename": file.filename,
                "error": str(e)
            })
    
    total_time = round((time.time() - start_time) * 1000, 2)
    
    return {
        "success": True,
        "results": results,
        "total_processing_time_ms": total_time,
        "processed_count": len(files)
    }
# Legacy detect endpoint to add to app.py

@app.post("/detect")
async def detect_hazards_legacy(file: UploadFile = File(...)):
    """
    Legacy detection endpoint for backward compatibility
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        start_time = time.time()
        
        # Read and process image
        contents = await file.read()
        image = Image.open(BytesIO(contents)).convert("RGB")
        
        # Store original image data for reports
        image_base64 = base64.b64encode(contents).decode('utf-8')
        
        # Run YOLO inference
        results = model(image, conf=0.5, iou=0.45)
        
        # Process results
        detections = []
        
        if len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            
            for i in range(len(boxes)):
                x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy()
                confidence = float(boxes.conf[i].cpu().numpy())
                class_id = int(boxes.cls[i].cpu().numpy())
                
                hazard_type = class_names[class_id] if class_id < len(class_names) else f"unknown_{class_id}"
                
                detection = {
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "confidence": confidence,
                    "class_id": class_id,
                    "class_name": hazard_type,
                    "center_x": float((x1 + x2) / 2),
                    "center_y": float((y1 + y2) / 2),
                    "width": float(x2 - x1),
                    "height": float(y2 - y1),
                    "area": float((x2 - x1) * (y2 - y1))
                }
                detections.append(detection)
        
        processing_time = round((time.time() - start_time) * 1000, 2)
        
        return {
            "success": True,
            "detections": detections,
            "processing_time_ms": processing_time,
            "image_size": {"width": image.width, "height": image.height},
            "model_info": {"backend": "ultralytics_yolo", "classes": class_names}
        }
        
    except Exception as e:
        logger.error(f"Legacy detection error: {e}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")