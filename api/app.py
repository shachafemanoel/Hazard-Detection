from fastapi import FastAPI, UploadFile, File, HTTPException
import numpy as np
import cv2
import logging

app = FastAPI()
logger = logging.getLogger(__name__)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/detect/{session_id}")
async def detect(session_id: str, file: UploadFile = File(...)):
    """
    This is a mock detection endpoint.
    It simulates running an ML model and returns a hardcoded, but contract-compliant,
    InferenceResponse. This is crucial for unblocking client-side development.
    """
    try:
        # We still read the file to simulate work and ensure the request is valid.
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file uploaded")

        # Simulate image processing
        np_array = np.frombuffer(file_bytes, np.uint8)
        image = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
        if image is None:
            logger.error("Invalid image data for session %s", session_id)
            raise HTTPException(status_code=400, detail="Invalid image data")

        height, width, _ = image.shape

        # MOCK RESPONSE: Create a hardcoded, but valid, response object.
        mock_detections = [
            {
                "box": [100, 150, 250, 300],  # [x1, y1, x2, y2]
                "label": "pothole",
                "score": 0.92
            },
            {
                "box": [400, 200, 450, 480],  # [x1, y1, x2, y2]
                "label": "crack",
                "score": 0.85
            }
        ]

        return {
            "detections": mock_detections,
            "original_image_size": {"width": width, "height": height},
            "detections_count": len(mock_detections),
            "processing_time": 45.5, # ms
            "has_new_reports": False,
            "has_session_stats": False
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during detection for session %s: %s", session_id, e)
        raise HTTPException(status_code=500, detail="Failed to process image")
