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
    try:
        file_bytes = await file.read()
        np_array = np.frombuffer(file_bytes, np.uint8)
        image = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
        if image is None:
            logger.error("Invalid image data for session %s", session_id)
            raise HTTPException(status_code=400, detail="Invalid image data")
        try:
            resized = cv2.resize(image, (640, 640))
        except Exception as e:
            logger.error("Resize failed for session %s: %s", session_id, e)
            raise HTTPException(status_code=500, detail="Image processing failed")
        return {"session_id": session_id, "detections": []}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during detection for session %s: %s", session_id, e)
        raise HTTPException(status_code=500, detail="Failed to process image")
