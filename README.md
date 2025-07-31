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
│   ├── object_detecion_model/ # AI models for browser
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
docker run -p 8080:8080 hazard-detection-unified:latest

# Or use Docker Compose
docker-compose -f docker-compose.unified.yml up -d
```

### 2. Access the Application

- 🌐 **Web Interface**: http://localhost:8080
- 🤖 **API Documentation**: http://localhost:8080/docs (FastAPI auto-docs)
- 🏥 **Health Check**: http://localhost:8080/health

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