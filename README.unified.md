# Hazard Detection - Unified Docker Deployment 🚀

A comprehensive road hazard detection system with intelligent AI backend selection, all running in a single Docker container.

## 🌟 Key Features

- **🧠 Intelligent AI Backend Selection**: Automatically detects CPU capabilities and selects the optimal AI model (OpenVINO vs PyTorch)
- **📦 Single Container Deployment**: Everything runs in one container - web interface, API, and AI models
- **🔄 Automatic Fallbacks**: Multiple model formats and paths with intelligent fallback system
- **⚡ CPU Optimization**: Uses OpenVINO for Intel CPUs with AVX/SSE4.2 support, PyTorch for universal compatibility
- **🌐 Complete Web Interface**: Real-time camera detection, dashboard, user authentication
- **🎯 Production Ready**: Health checks, proper logging, resource management

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Container                         │
│  ┌─────────────┐                    ┌─────────────────────┐ │
│  │   Web UI    │◄──── Port 3000 ────┤   Express Server    │ │
│  │ (HTML/CSS/JS)│                   │   (Node.js)         │ │
│  └─────────────┘                    └─────────────────────┘ │
│         │                                       │           │
│         ▼                                       ▼           │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              FastAPI Backend (Port 8080)               │ │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐ │ │
│  │  │  CPU Detection  │───►│    Model Selection Logic    │ │ │
│  │  │   & Selection   │    │                             │ │ │
│  │  └─────────────────┘    └─────────────────────────────┘ │ │
│  │           │                           │                 │ │
│  │           ▼                           ▼                 │ │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐ │ │
│  │  │ OpenVINO Model  │    │      PyTorch Model          │ │ │
│  │  │ (Intel CPUs)    │    │   (Universal Fallback)     │ │ │
│  │  └─────────────────┘    └─────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Docker installed and running
- At least 2GB RAM available
- 4GB disk space

### 1. Build the Unified Image

```bash
# Clone the repository
git clone <your-repo-url>
cd hazard-detection

# Build the unified Docker image
./build-unified.sh

# Or build manually
docker build -f Dockerfile.unified -t hazard-detection-unified .

# For a slimmer image (recommended for platforms like Railway):
docker build -f Dockerfile.unified.slim -t hazard-detection-unified .
```

### 2. Run the Application

**Simple run:**
```bash
docker run -p 3000:3000 hazard-detection-unified
```

**With Docker Compose:**
```bash
docker-compose -f docker-compose.unified.yml up -d
```

**With custom configuration:**
```bash
docker run -p 3000:3000 \
  -e MODEL_BACKEND=pytorch \
  -e SESSION_SECRET=your-secret-key \
  hazard-detection-unified
```

### 3. Access the Application

- 🌐 **Web Interface**: http://localhost:3000
- 🤖 **API Docs**: http://localhost:3000 (API calls are internally routed)
- 🏥 **Health Check**: http://localhost:3000/health

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default | Options |
|----------|-------------|---------|---------|
| `MODEL_BACKEND` | Force specific AI backend | `auto` | `auto`, `openvino`, `pytorch` |
| `MODEL_DIR` | Custom model directory | `/app/models` | Any path |
| `PORT` | Web interface port | `3000` | Any port |
| `NODE_ENV` | Environment mode | `production` | `production`, `development` |

### Authentication & Integrations
| Variable | Description | Required |
|----------|-------------|----------|
| `SESSION_SECRET` | Session encryption key | Recommended |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Optional |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | Optional |
| `CLOUDINARY_CLOUD_NAME` | Image storage service | Optional |
| `SENDGRID_API_KEY` | Email service | Optional |

### AI Model Configuration

The system automatically detects and selects the best available model:

1. **CPU Detection**: Checks for SSE4.2, AVX, AVX2 instruction sets
2. **Model Discovery**: Scans multiple locations for available models
3. **Optimal Selection**: Chooses OpenVINO for compatible CPUs, PyTorch as fallback
4. **Automatic Fallback**: Multiple model paths and formats supported

## 🧠 AI Model Support

### Supported Model Formats

| Format | Use Case | CPU Requirements | Performance |
|--------|----------|------------------|-------------|
| **OpenVINO** (.xml/.bin) | Intel CPUs | SSE4.2, AVX preferred | ⚡ Fastest |
| **PyTorch** (.pt) | Universal | Any CPU | 🔧 Compatible |
| **ONNX** (.onnx) | Browser fallback | Any CPU | 🌐 Web-optimized |

### Model Locations

The system searches for models in this order:
1. `/app/models/openvino/` (OpenVINO format)
2. `/app/models/pytorch/` (PyTorch format)  
3. `/app/api/best_openvino_model/` (Legacy OpenVINO)
4. `/app/public/object_detection_model/` (Legacy PyTorch/ONNX)

### Custom Models

Mount your own models:
```bash
docker run -v /path/to/your/models:/app/models/custom \
  -p 3000:3000 hazard-detection-unified
```

## 🏥 Health & Monitoring

### Health Checks

The container includes comprehensive health monitoring:

```bash
# Check container health
docker exec <container-id> /app/health-check.sh

# View service status
curl http://localhost:3000/health
```

### Logs & Debugging

```bash
# View all logs
docker logs <container-id>

# Follow logs in real-time
docker logs -f <container-id>

# Check model selection
docker exec <container-id> cat /app/model-config.json
```

### Performance Monitoring

The system provides detailed performance metrics:
- CPU utilization and optimization level
- Model loading time and backend selection
- Inference performance (ms per frame)
- Memory usage and resource efficiency

## 🔄 Deployment Scenarios

### Development
```bash
docker run -p 3000:3000 \
  -e NODE_ENV=development \
  -v $(pwd):/app/src \
  hazard-detection-unified
```

### Production with Redis
```bash
docker-compose -f docker-compose.unified.yml --profile redis up -d
```

### High-Performance Setup
```bash
docker run -p 3000:3000 \
  -e MODEL_BACKEND=openvino \
  --cpus=2 \
  --memory=4g \
  hazard-detection-unified
```

### Multi-Instance Load Balancing
```bash
# Run multiple instances behind a load balancer
docker run -p 3001:3000 --name hazard-1 hazard-detection-unified
docker run -p 3002:3000 --name hazard-2 hazard-detection-unified
docker run -p 3003:3000 --name hazard-3 hazard-detection-unified
```

## 🛠️ Troubleshooting

### Common Issues

**Container won't start:**
```bash
# Check Docker resources
docker system df
docker system prune  # Clean up if needed

# Check container logs
docker logs <container-id>
```

**AI models not loading:**
```bash
# Check model files
docker exec <container-id> ls -la /app/models/

# View model selection process
docker exec <container-id> cat /app/model-config.json

# Test specific backend
docker run -e MODEL_BACKEND=pytorch -p 3000:3000 hazard-detection-unified
```

**Performance issues:**
```bash
# Check CPU capabilities
docker exec <container-id> python3 /app/scripts/detect-cpu-and-select-model.py

# Monitor resource usage
docker stats <container-id>
```

### Debug Mode

Run with verbose logging:
```bash
docker run -p 3000:3000 \
  -e NODE_ENV=development \
  -e LOG_LEVEL=debug \
  hazard-detection-unified
```

## 📈 Performance Optimization

### CPU Optimization
- **Intel CPUs**: Automatically uses OpenVINO with AVX/SSE optimizations
- **AMD/ARM CPUs**: Falls back to PyTorch with CPU optimizations
- **Multi-core**: Automatically detects and uses available CPU cores

### Memory Management
- **Model Loading**: Lazy loading and memory-mapped models
- **Inference**: Optimized batch processing and memory pools
- **Caching**: Intelligent model and result caching

### Production Tuning
```bash
# High-performance configuration
docker run -p 3000:3000 \
  --cpus=4 \
  --memory=8g \
  -e OV_CPU_THREADS=4 \
  -e TORCH_NUM_THREADS=4 \
  hazard-detection-unified
```

## 🔐 Security

### Best Practices
- Change default session secrets in production
- Use environment variables for sensitive data
- Run with non-root user (built into container)
- Regular security updates

### Production Security
```bash
docker run -p 3000:3000 \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  --read-only \
  --tmpfs /tmp \
  hazard-detection-unified
```

## 📊 Monitoring & Analytics

### Application Metrics
- Detection accuracy and confidence scores
- Processing time per frame
- Model performance comparisons
- User interaction patterns

### System Metrics  
- CPU/Memory utilization
- Model loading performance
- Container resource usage
- Health check status

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Test with the unified Docker build
4. Submit a pull request

## 📄 License

[Your License Here]

## 🆘 Support

- **Issues**: GitHub Issues
- **Documentation**: This README and inline code comments
- **Community**: [Your community links]

---

**Built with ❤️ for intelligent road safety monitoring**