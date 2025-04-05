from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from io import BytesIO
from ultralytics import YOLO

app = FastAPI()

# לאפשר בקשות מהדפדפן
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = YOLO("public/object_detecion_model/road_damage_detection_last_version.pt")

@app.post("/detect")
async def detect_image(file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(BytesIO(contents)).convert("RGB")
    results = model(image)
    detections = results[0].boxes.xyxy.tolist()  # תיבת זיהוי בלבד לדוגמה

    return {"detections": detections}
