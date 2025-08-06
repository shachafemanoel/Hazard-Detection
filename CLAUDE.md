## 🎯 Project Purpose:
Road Hazard Detection System for municipalities. Detects potholes, cracks, knocked infrastructure and surface damage in real-time using a YOLOv12s ONNX model.

## 🧱 Stack:
- Frontend: HTML/CSS + Vanilla JS (camera.html, dashboard.html)
- Backend: Node.js (Express) + FastAPI (Python)
- AI Models: ONNX + OpenVINO (best0408.onnx)
- Firebase (Auth, Realtime DB, Storage)
- Redis (report caching)
- Deployment: Railway (multiple services: API, Web)

## 🔧 Instructions for Claude:
- Never hallucinate features.
- Always use the provided model files, paths and APIs.
- Before applying changes, validate that the edited file exists.
- Always suggest git-friendly diffs with clear commit messages.
- Use native JS if possible (no frameworks unless asked).
- Frontend changes must support both mobile and desktop users.

## 🧠 Important files:
- /public/camera.html → Real-time detection with webcam
- /public/camera_detection.js → Handles ONNX inference, overlay
- /api/app.py → FastAPI backend for model processing
- /api/upload.js → Receives and uploads images
- /object_detection_model/best0408.onnx → Current ONNX model

## ✅ Primary Goals:
- Improve detection UX
- Optimize inference speed
- Add detailed hazard reports to dashboard
- Enable batch image uploads with labeling

## 📦 Commands:
- npm run dev (web)
- uvicorn app:app --reload (api)
