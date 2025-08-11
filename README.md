# Hazard Detection - Road Damage Detection System

Modern road hazard detection system using AI/ML with intelligent backend selection and unified Docker deployment.

## 🏗️ Project Structure

```
hazard-detection/
├── 📁 api/                    # Python FastAPI backend
│   ├── app.py                 # Main API application
│   ├── best.pt                # PyTorch model
│   └── best_openvino_model/   # OpenVINO model files
├── 📁 public/                 # Web frontend assets
│   ├── *.html                 # HTML pages
│   ├── js/                    # JavaScript files
│   ├── css/                   # Stylesheets
│   ├── object_detection_model/ # AI models for browser
│   └── ort/                   # ONNX Runtime files
├── 📁 server/                 # Node.js Express server
│   └── routes/                # Server routes
├── Dockerfile.unified         # Single Docker container
├── docker-compose.unified.yml # Production deployment
├── build-unified.sh          # Build script
└── README.unified.md         # Comprehensive documentation
```

## 🚀 Quick Start

### 1. Build & Run with Docker

```bash
# Build the unified image
./build-unified.sh

# Run the application
docker run -p 3000:3000 hazard-detection-unified:latest

# Or use Docker Compose
docker-compose -f docker-compose.unified.yml up -d
```

### Client API Results

Client utilities now normalize all detection responses into a stable shape:

```js
{
  ok: boolean,
  session_id: string|null,
  processing_time_ms: number|null,
  detections: [
    { id, class_id, class_name, confidence, box: { x, y, w, h } }
  ]
}
```

Detections are filtered using a global confidence threshold (`window.CONFIDENCE_THRESHOLD`, default `0.5`) and optional per-class overrides via `window.CLASS_THRESHOLDS`.

### 2. Access the Application

- 🌐 **Web Interface**: http://localhost:3000
- 🤖 **API Documentation**: http://localhost:3000/docs (FastAPI auto-docs)
- 🏥 **Health Check**: http://localhost:3000/health

## 🧠 AI Features

- **Intelligent Backend Selection**: Automatically chooses between OpenVINO and PyTorch based on CPU capabilities
- **Multiple Model Formats**: Supports PyTorch (.pt), OpenVINO (.xml/.bin), and ONNX (.onnx)
- **CPU Optimization**: Uses SSE4.2/AVX instruction sets when available
- **Fallback System**: Graceful degradation for unsupported hardware

## 🔧 Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
# Edit .env with your values
```

### Required Variables
- `SESSION_SECRET`: Secure session key
- `CLOUDINARY_*`: Image storage (optional)

### Optional Variables
- `MODEL_BACKEND`: `auto` (default), `openvino`, `pytorch`
- `GOOGLE_*`: OAuth and Maps integration
- `REDIS_*`: Cache configuration
- `CLIENT_URL`: Base URL for client connections (defaults to localhost:3000)
- `BASE_API_URL`: Override API endpoint (configured in config.js)

## 🔒 Security Improvements

This version includes significant security enhancements:

### Network Security
- **Timeout Protection**: All fetch requests now have configurable timeouts
- **AbortController**: Requests can be cancelled to prevent resource leaks
- **Robust Error Handling**: Structured error responses without exposing internals

### Content Security Policy (CSP)
- CSP headers added to HTML pages to prevent XSS attacks
- Removal of unsafe inline handlers and dynamic innerHTML usage
- Safe DOM construction using `createElement` and `textContent`

### Resource Management
- **Camera Cleanup**: Proper cleanup of media streams and tracks
- **Animation Frames**: Guaranteed cancellation of requestAnimationFrame loops
- **Memory Management**: Improved ONNX runtime initialization with fallbacks

### Configuration
- Centralized API configuration through `config.js`
- Environment-driven URLs instead of hardcoded values
- Configurable BASE_API_URL for different deployment environments

## 📖 Documentation

See [README.unified.md](README.unified.md) for comprehensive documentation including:
- Architecture details
- Deployment options
- Performance tuning
- Troubleshooting guide
- API reference

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Test with unified Docker build
4. Submit a pull request

---

**Built for intelligent road safety monitoring** 🛣️