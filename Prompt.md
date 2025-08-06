# 🚧 Project Prompt for Hazard Detection System

## 🎯 Project Overview
This is a graduation project for a real-time hazard detection system in urban environments. It detects potholes, cracks, knocked infrastructure, and surface damage using a YOLOv12s ONNX model.

The system is built with:
- Frontend: HTML, CSS, JavaScript (Vanilla)
- Backend: Node.js (Express) + Python (FastAPI)
- AI Models: ONNX + OpenVINO
- Storage: Firebase (Auth, DB, Storage), Redis (for caching)
- Deployment: Railway (split services: Web and API)

## 🧠 Agent Tasks
You are an AI assistant (Claude, Codex, Jules, etc.) working on this project. Your responsibilities include:
- Refactoring and extending JavaScript code in `/public`
- Debugging ONNX inference logic in `camera_detection.js`
- Writing backend logic in Python (`/api/app.py`, `/routes`)
- Creating UI elements with responsive support (mobile + desktop)
- Connecting frontend and backend using REST API endpoints
- Optimizing detection performance with ONNX and OpenVINO

## 📁 Important Files
- `/public/camera.html` – Webcam UI for detection
- `/public/camera_detection.js` – Inference logic
- `/public/upload.js` – Handles image upload to API
- `/api/app.py` – FastAPI backend entry point
- `/api/routes/detect.py` – Detection endpoint
- `/public/dashboard.html` – Map dashboard for reports
- `/public/object_detection_model/best0408.onnx` – Main model file

## ⚠️ Rules and Constraints
- Never hallucinate or invent features/files
- Always check that your suggestions match the actual project structure
- Do not introduce external libraries or frameworks unless explicitly requested
- Frontend must support iOS Safari and Android Chrome
- Keep Git-friendly changes with clear commit messages
- Use native JavaScript and idiomatic Python when possible

## 🧪 Prompt Examples
- “Add a warning if the ONNX model fails to load in `camera_detection.js`”
- “Implement batch upload support in `upload.js`”
- “Refactor `/api/app.py` to separate route logic into `routes/` folder”
- “Add a Redis cache layer for hazard reports with 24h expiry”
- “Style the dashboard for dark mode using CSS variables”

## ✅ Success Criteria
- Code compiles and runs with current system
- UX improvements are visually tested on both desktop and mobile
- API responses conform to existing backend schema
- AI model is called correctly and errors are handled
