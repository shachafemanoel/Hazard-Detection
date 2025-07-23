from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from io import BytesIO

import openvino as ov
import openvino.properties as props
import numpy as np
import cv2
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

# Enable CORS for frontend requests - Enhanced mobile-friendly configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for mobile compatibility
    allow_credentials=False,  # Set to False for mobile compatibility with wildcard origins
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=[
        "Accept",
        "Accept-Language", 
        "Accept-Encoding",
        "Accept-Charset",
        "Content-Language",
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
        "User-Agent",
        "Cache-Control",
        "Pragma",
        "DNT",
        "Sec-Fetch-Site",
        "Sec-Fetch-Mode",
        "Sec-Fetch-Dest",
        # Mobile-specific headers
        "X-Forwarded-For",
        "X-Real-IP",
        "X-Forwarded-Proto",
        "X-Forwarded-Host"
    ],
    expose_headers=[
        "Content-Type",
        "Content-Length",
        "X-Total-Count",
        "Access-Control-Allow-Origin",
        "Access-Control-Allow-Methods",
        "Access-Control-Allow-Headers"
    ]
)

# Global variables for OpenVINO model and class names
core = None
compiled_model = None
input_layer = None
output_layer = None
class_names = ['crack', 'knocked', 'pothole', 'surface_damage']

# Model configuration
MODEL_INPUT_SIZE = 640  # Standard YOLO input size
DEVICE_NAME = "CPU"  # Can be changed to GPU if available
CACHE_ENABLED = True

# Session management
sessions = {}
active_detections = defaultdict(list)  # session_id -> list of detections

# Detection tracking settings
TRACKING_DISTANCE_THRESHOLD = 50  # pixels
TRACKING_TIME_THRESHOLD = 2.0  # seconds
MIN_CONFIDENCE_FOR_REPORT = 0.6

# Load model on startup - Following OpenVINO tutorial best practices
@app.on_event("startup")
async def load_model():
    global core, compiled_model, input_layer, output_layer
    try:
        logger.info("Initializing OpenVINO Runtime...")
        
        # Initialize OpenVINO Core
        core = ov.Core()
        
        # Show available devices (for debugging)
        devices = core.available_devices
        logger.info(f"Available devices: {devices}")
        for device in devices:
            device_name = core.get_property(device, props.device.full_name)
            logger.info(f"{device}: {device_name}")
        
        # Load model from XML file
        model_path = "best_openvino_model/best.xml"
        logger.info(f"Reading model from: {model_path}")
        model = core.read_model(model=model_path)
        
        # Handle dynamic input shapes - set to standard YOLO size
        if model.input().partial_shape.is_dynamic:
            logger.info(f"Model has dynamic input shape: {model.input().partial_shape}")
            logger.info(f"Setting static input shape to [1, 3, {MODEL_INPUT_SIZE}, {MODEL_INPUT_SIZE}]")
            new_shape = ov.PartialShape([1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
            model.reshape({model.input().any_name: new_shape})
        
        # Enable model caching for faster subsequent loads
        config = {}
        if CACHE_ENABLED:
            import os
            cache_dir = "best_openvino_model/cache"
            os.makedirs(cache_dir, exist_ok=True)
            config["CACHE_DIR"] = cache_dir
            logger.info(f"Model caching enabled: {cache_dir}")
        
        # Compile model for specified device
        logger.info(f"Compiling model for device: {DEVICE_NAME}")
        compiled_model = core.compile_model(model=model, device_name=DEVICE_NAME, config=config)
        
        # Get input and output layer information
        input_layer = compiled_model.input(0)
        output_layer = compiled_model.output(0)
        
        logger.info(f"✅ OpenVINO model loaded successfully")
        logger.info(f"Input layer name: {input_layer.any_name}")
        logger.info(f"Input shape: {input_layer.shape}")
        logger.info(f"Input type: {input_layer.element_type}")
        logger.info(f"Output layer name: {output_layer.any_name}")
        logger.info(f"Output shape: {output_layer.shape}")
        logger.info(f"Output type: {output_layer.element_type}")
        
    except Exception as e:
        logger.error(f"❌ Failed to load OpenVINO model: {e}")
        raise e

@app.get("/")
async def root():
    return {"message": "Hazard Detection Backend API", "status": "running"}

# Helper functions for OpenVINO inference
def preprocess_image(image, input_shape):
    """
    Preprocess image for OpenVINO YOLO model - Following OpenVINO tutorial practices
    
    Args:
        image: PIL Image object
        input_shape: Model input shape [N, C, H, W]
    
    Returns:
        tuple: (processed_image, scale, paste_x, paste_y)
    """
    # Get target dimensions from input shape [N, C, H, W]
    N, C, H, W = input_shape
    target_height, target_width = H, W
    
    # Convert PIL to OpenCV format for consistent processing
    img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    original_height, original_width = img_cv.shape[:2]
    
    # Calculate scale to fit the image in target size (letterbox)
    scale = min(target_width / original_width, target_height / original_height)
    new_width = int(original_width * scale)
    new_height = int(original_height * scale)
    
    # Resize image using OpenCV for better performance
    resized_img = cv2.resize(img_cv, (new_width, new_height), interpolation=cv2.INTER_LINEAR)
    
    # Create letterbox image with gray padding (YOLO standard)
    letterbox_img = np.full((target_height, target_width, 3), 114, dtype=np.uint8)
    
    # Calculate padding offsets
    paste_x = (target_width - new_width) // 2
    paste_y = (target_height - new_height) // 2
    
    # Paste resized image onto letterbox
    letterbox_img[paste_y:paste_y + new_height, paste_x:paste_x + new_width] = resized_img
    
    # Convert BGR back to RGB for model inference
    letterbox_img = cv2.cvtColor(letterbox_img, cv2.COLOR_BGR2RGB)
    
    # Convert to float32 and normalize to [0, 1] as expected by YOLO
    img_array = letterbox_img.astype(np.float32) / 255.0
    
    # Transpose from HWC to CHW format (NCHW layout)
    img_array = np.transpose(img_array, (2, 0, 1))
    
    # Add batch dimension [1, C, H, W]
    img_array = np.expand_dims(img_array, axis=0)
    
    logger.debug(f"Image preprocessing: {original_width}x{original_height} -> {target_width}x{target_height}, scale: {scale:.3f}")
    
    return img_array, scale, paste_x, paste_y

def postprocess_predictions(predictions, original_width, original_height, input_width, input_height, conf_threshold=0.5, iou_threshold=0.45):
    """Postprocess OpenVINO model predictions"""
    detections = []
    
    # Scale factors to convert back to original image coordinates
    scale_x = original_width / input_width
    scale_y = original_height / input_height
    
    # predictions shape is typically [1, num_detections, 85] for YOLO
    # where each detection is [x, y, w, h, confidence, class_scores...]
    if len(predictions.shape) == 3:
        predictions = predictions[0]  # Remove batch dimension
    
    for pred in predictions:
        # Extract box coordinates (center format)
        x_center, y_center, width, height = pred[:4]
        confidence = pred[4]
        
        if confidence < conf_threshold:
            continue
            
        # Get class scores and find the class with highest score
        class_scores = pred[5:]
        class_id = np.argmax(class_scores)
        class_confidence = class_scores[class_id]
        
        # Final confidence is object confidence * class confidence
        final_confidence = confidence * class_confidence
        
        if final_confidence < conf_threshold:
            continue
        
        # Convert from center format to corner format and scale to original image
        x1 = (x_center - width / 2) * scale_x
        y1 = (y_center - height / 2) * scale_y
        x2 = (x_center + width / 2) * scale_x
        y2 = (y_center + height / 2) * scale_y
        
        # Ensure coordinates are within image bounds
        x1 = max(0, min(x1, original_width))
        y1 = max(0, min(y1, original_height))
        x2 = max(0, min(x2, original_width))
        y2 = max(0, min(y2, original_height))
        
        detections.append({
            'bbox': [x1, y1, x2, y2],
            'confidence': final_confidence,
            'class_id': int(class_id),
            'class_name': class_names[class_id] if class_id < len(class_names) else f"unknown_{class_id}"
        })
    
    # Apply Non-Maximum Suppression (simple version)
    detections = apply_nms(detections, iou_threshold)
    
    return detections

def apply_nms(detections, iou_threshold):
    """Apply Non-Maximum Suppression to remove overlapping detections"""
    if not detections:
        return []
    
    # Sort by confidence (highest first)
    detections = sorted(detections, key=lambda x: x['confidence'], reverse=True)
    
    selected = []
    while detections:
        # Take the detection with highest confidence
        best = detections.pop(0)
        selected.append(best)
        
        # Remove overlapping detections
        detections = [det for det in detections if calculate_iou(best['bbox'], det['bbox']) < iou_threshold]
    
    return selected

def calculate_iou(box1, box2):
    """Calculate Intersection over Union (IoU) of two bounding boxes"""
    x1_1, y1_1, x2_1, y2_1 = box1
    x1_2, y1_2, x2_2, y2_2 = box2
    
    # Calculate intersection coordinates
    x1_i = max(x1_1, x1_2)
    y1_i = max(y1_1, y1_2)
    x2_i = min(x2_1, x2_2)
    y2_i = min(y2_1, y2_2)
    
    # Check if there's an intersection
    if x2_i <= x1_i or y2_i <= y1_i:
        return 0.0
    
    # Calculate intersection area
    intersection = (x2_i - x1_i) * (y2_i - y1_i)
    
    # Calculate areas of both boxes
    area1 = (x2_1 - x1_1) * (y2_1 - y1_1)
    area2 = (x2_2 - x1_2) * (y2_2 - y1_2)
    
    # Calculate union area
    union = area1 + area2 - intersection
    
    return intersection / union if union > 0 else 0.0

def postprocess_predictions_letterbox(predictions, original_width, original_height, input_width, input_height, scale, paste_x, paste_y, conf_threshold=0.5, iou_threshold=0.45):
    """Postprocess OpenVINO model predictions with letterbox coordinate adjustment"""
    detections = []
    
    # predictions shape is typically [1, num_detections, 85] for YOLO
    # where each detection is [x, y, w, h, confidence, class_scores...]
    if len(predictions.shape) == 3:
        predictions = predictions[0]  # Remove batch dimension
    
    for pred in predictions:
        # Extract box coordinates (center format)
        x_center, y_center, width, height = pred[:4]
        confidence = pred[4]
        
        if confidence < conf_threshold:
            continue
            
        # Get class scores and find the class with highest score
        class_scores = pred[5:]
        class_id = np.argmax(class_scores)
        class_confidence = class_scores[class_id]
        
        # Final confidence is object confidence * class confidence
        final_confidence = confidence * class_confidence
        
        if final_confidence < conf_threshold:
            continue
        
        # Convert from center format to corner format in input space
        x1_input = x_center - width / 2
        y1_input = y_center - height / 2
        x2_input = x_center + width / 2
        y2_input = y_center + height / 2
        
        # Adjust for letterbox padding
        x1_adjusted = (x1_input - paste_x) / scale
        y1_adjusted = (y1_input - paste_y) / scale
        x2_adjusted = (x2_input - paste_x) / scale
        y2_adjusted = (y2_input - paste_y) / scale
        
        # Ensure coordinates are within original image bounds
        x1 = max(0, min(x1_adjusted, original_width))
        y1 = max(0, min(y1_adjusted, original_height))
        x2 = max(0, min(x2_adjusted, original_width))
        y2 = max(0, min(y2_adjusted, original_height))
        
        # Skip invalid boxes
        if x2 <= x1 or y2 <= y1:
            continue
        
        detections.append({
            'bbox': [x1, y1, x2, y2],
            'confidence': final_confidence,
            'class_id': int(class_id),
            'class_name': class_names[class_id] if class_id < len(class_names) else f"unknown_{class_id}"
        })
    
    # Apply Non-Maximum Suppression
    detections = apply_nms(detections, iou_threshold)
    
    return detections

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
    model_status = "loaded" if compiled_model is not None else "not_loaded"
    device_info = None
    
    if compiled_model is not None:
        try:
            # Get device information
            device_info = {
                "device": DEVICE_NAME,
                "input_shape": list(input_layer.shape),
                "output_shape": list(output_layer.shape),
                "model_path": "best_openvino_model/best.xml",
                "cache_enabled": CACHE_ENABLED
            }
        except Exception as e:
            logger.warning(f"Could not get model info: {e}")
    
    # Get server environment info for mobile debugging
    import os
    import platform
    
    env_info = {
        "platform": platform.system(),
        "python_version": platform.python_version(),
        "hostname": platform.node(),
        "deployment_env": os.getenv("RENDER", "local") or os.getenv("DEPLOYMENT_ENV", "unknown"),
        "port": os.getenv("PORT", "8000"),
        "cors_enabled": True,
        "mobile_friendly": True
    }
    
    return {
        "status": "healthy",
        "model_status": model_status,
        "backend_inference": True,
        "backend_type": "openvino",
        "active_sessions": len(sessions),
        "device_info": device_info,
        "environment": env_info,
        "endpoints": {
            "session_start": "/session/start",
            "session_detect": "/detect/{session_id}",
            "legacy_detect": "/detect",
            "batch_detect": "/detect-batch"
        }
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
    if compiled_model is None:
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
        
        # Preprocess image for OpenVINO
        input_shape = input_layer.shape
        processed_image, scale, paste_x, paste_y = preprocess_image(image, input_shape)
        
        # Run OpenVINO inference
        # Run OpenVINO inference - Following tutorial practices
        infer_request = compiled_model.create_infer_request()
        infer_request.infer(inputs={input_layer.any_name: processed_image})
        predictions = infer_request.get_output_tensor(output_layer.index).data
        
        # Postprocess predictions
        raw_detections = postprocess_predictions_letterbox(
            predictions, 
            image.width, 
            image.height, 
            input_shape[3], 
            input_shape[2],
            scale,
            paste_x,
            paste_y,
            conf_threshold=0.5,
            iou_threshold=0.45
        )
        
        # Process results with tracking and report generation
        detections = []
        new_reports = []
        session = sessions[session_id]
        current_time = time.time()
        
        for raw_detection in raw_detections:
            x1, y1, x2, y2 = raw_detection['bbox']
            confidence = raw_detection['confidence']
            class_id = raw_detection['class_id']
            hazard_type = raw_detection['class_name']
            
            detection = {
                "bbox": [float(x1), float(y1), float(x2), float(y2)],
                "confidence": float(confidence),
                "class_id": int(class_id),
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
                "backend": "openvino",
                "classes": class_names,
                "confidence_threshold": MIN_CONFIDENCE_FOR_REPORT,
                "tracking_enabled": True,
                "input_shape": list(input_layer.shape),
                "output_shape": list(output_layer.shape)
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
    if compiled_model is None:
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
            
            # Preprocess image for OpenVINO
            input_shape = input_layer.shape
            processed_image, scale, paste_x, paste_y = preprocess_image(image, input_shape)
            
            # Run OpenVINO inference - Following tutorial practices
            infer_request = compiled_model.create_infer_request()
            infer_request.infer(inputs={input_layer.any_name: processed_image})
            predictions = infer_request.get_output_tensor(output_layer.index).data
            
            # Postprocess predictions
            detections = postprocess_predictions_letterbox(
                predictions, 
                image.width, 
                image.height, 
                input_shape[3], 
                input_shape[2],
                scale,
                paste_x,
                paste_y,
                conf_threshold=0.5,
                iou_threshold=0.45
            )
            
            # Format detections for API response
            formatted_detections = []
            for detection in detections:
                formatted_detections.append({
                    "bbox": detection['bbox'],
                    "confidence": detection['confidence'],
                    "class_id": detection['class_id'],
                    "class_name": detection['class_name']
                })
            detections = formatted_detections
            
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
    if compiled_model is None:
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
        
        # Preprocess image for OpenVINO
        input_shape = input_layer.shape
        processed_image, scale, paste_x, paste_y = preprocess_image(image, input_shape)
        
        # Run OpenVINO inference
        # Run OpenVINO inference - Following tutorial practices
        infer_request = compiled_model.create_infer_request()
        infer_request.infer(inputs={input_layer.any_name: processed_image})
        predictions = infer_request.get_output_tensor(output_layer.index).data
        
        # Postprocess predictions
        raw_detections = postprocess_predictions_letterbox(
            predictions, 
            image.width, 
            image.height, 
            input_shape[3], 
            input_shape[2],
            scale,
            paste_x,
            paste_y,
            conf_threshold=0.5,
            iou_threshold=0.45
        )
        
        # Format detections for API response
        detections = []
        for raw_detection in raw_detections:
            x1, y1, x2, y2 = raw_detection['bbox']
            confidence = raw_detection['confidence']
            class_id = raw_detection['class_id']
            hazard_type = raw_detection['class_name']
            
            detection = {
                "bbox": [float(x1), float(y1), float(x2), float(y2)],
                "confidence": float(confidence),
                "class_id": int(class_id),
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
            "model_info": {"backend": "openvino", "classes": class_names}
        }
        
    except Exception as e:
        logger.error(f"Legacy detection error: {e}")
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")