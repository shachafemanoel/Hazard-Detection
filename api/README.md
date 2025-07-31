# Hazard Detection API Service

This is the AI backend API service for the Hazard Detection system. It provides computer vision capabilities using PyTorch/YOLO and OpenVINO models to detect road hazards from images.

## 🚀 Quick Deploy

### Deploy to Railway

1. Create a new Railway project
2. Connect this `api/` folder as a separate repository or deploy from this folder
3. Railway will automatically use the `railway.toml` configuration
4. Set environment variables (see below)

### Deploy to Render

1. Create a new Web Service on Render
2. Connect your repository and set the root directory to `api/`
3. Use Docker as the build method
4. Set environment variables (see below)

## 🔧 Environment Variables

### Required
- `PORT` - API server port (default: 8000)
- `API_PORT` - Same as PORT (default: 8000)

### Optional
- `MODEL_DIR` - Path to model files (default: /app/models)
- `MODEL_BACKEND` - Force specific backend: `auto`, `openvino`, `pytorch` (default: auto)
- `FRONTEND_URL` - Your web frontend URL for CORS
- `WEB_SERVICE_URL` - Alternative frontend URL for CORS

## 🧠 AI Models

The API supports multiple model formats with intelligent selection:

### Model Formats
- **OpenVINO** (.xml/.bin) - Optimized for Intel CPUs
- **PyTorch** (.pt) - Universal compatibility
- **ONNX** (.onnx) - Web-optimized format

### Model Locations
Models are searched in this order:
1. `/app/models/openvino/` (OpenVINO format)
2. `/app/models/pytorch/` (PyTorch format)
3. `/app/api/` (Direct in API folder)

## 📡 API Endpoints

### Core Detection
- `GET /health` - Health check and system info
- `POST /detect` - Single image detection (legacy)
- `POST /detect-batch` - Multiple image detection
- `POST /session/start` - Start detection session
- `POST /detect/{session_id}` - Session-based detection with tracking

### Session Management
- `GET /session/{session_id}/summary` - Get session summary
- `POST /session/{session_id}/end` - End detection session
- `POST /session/{session_id}/report/{report_id}/confirm` - Confirm detection report

### External Services
- `GET /api/health` - External API health check
- `POST /api/geocode` - Geocode address to coordinates
- `POST /api/reverse-geocode` - Reverse geocode coordinates

## 🏗️ Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# Build Docker image
./build-api.sh

# Run Docker container
docker run -p 8000:8000 hazard-detection-api:latest
```

## 🔗 Integration with Web Frontend

Your web frontend should connect to this API using:

```javascript
const API_URL = 'https://your-api-service.railway.app'; // or Render URL
// or for local development:
const API_URL = 'http://localhost:8000';

// Make requests to endpoints like:
fetch(`${API_URL}/detect`, {
    method: 'POST',
    body: formData
});
```

## 🔍 Health Check

The API provides comprehensive health information at `/health`:

```json
{
    "status": "healthy",
    "model_status": "loaded",
    "backend_type": "openvino",
    "device_info": {
        "device": "CPU",
        "input_shape": [1, 3, 640, 640]
    }
}
```

## 🛠️ Troubleshooting

### Model Loading Issues
- Check `/health` endpoint for model status
- Verify model files are in the correct format and location
- Check logs for specific error messages

### CORS Issues
- Set `FRONTEND_URL` environment variable to your web frontend URL
- Ensure your frontend makes requests to the correct API URL

### Performance
- OpenVINO models perform better on Intel CPUs
- PyTorch models provide universal compatibility
- Use batch detection for processing multiple images

## 📊 Detection Classes

The API detects these road hazard types:
- `crack` - Road surface cracks
- `knocked` - Damaged/broken road elements  
- `pothole` - Road potholes
- `surface_damage` - General surface damage