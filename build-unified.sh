#!/bin/bash
set -e

echo "🏗️ Building Unified Hazard Detection Docker Image"
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="hazard-detection-unified"
IMAGE_TAG="${1:-latest}"
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"

echo -e "${BLUE}🔧 Build Configuration:${NC}"
echo "  📦 Image Name: ${FULL_IMAGE_NAME}"
echo "  🐳 Docker Context: $(pwd)"
echo "  📅 Build Time: $(date)"
echo ""

# Pre-build checks
echo -e "${YELLOW}🔍 Pre-build checks...${NC}"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if required files exist
required_files=(
    "Dockerfile.unified"
    "package.json"
    "api/app.py"
    "server/routes/server.js"
    "public/js/upload_tf.js"
)

for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo -e "${RED}❌ Required file missing: $file${NC}"
        # exit 1
    else
        echo -e "${GREEN}✅ Found: $file${NC}"
    fi
done

# Check model files
echo -e "${YELLOW}📊 Checking available models...${NC}"
model_count=0

if [[ -d "api/best_openvino_model" ]] && [[ -f "api/best_openvino_model/best.xml" ]]; then
    echo -e "${GREEN}✅ OpenVINO model found${NC}"
    ((model_count++))
fi

if [[ -f "api/best.pt" ]]; then
    echo -e "${GREEN}✅ PyTorch model (api/best.pt) found${NC}"
    ((model_count++))
fi

if [[ -f "public/object_detecion_model/best.pt" ]]; then
    echo -e "${GREEN}✅ PyTorch model (public/best.pt) found${NC}"
    ((model_count++))
fi

onnx_count=$(find public/object_detecion_model -name "*.onnx" 2>/dev/null | wc -l || echo 0)
if [[ $onnx_count -gt 0 ]]; then
    echo -e "${GREEN}✅ ONNX models found: $onnx_count files${NC}"
fi

if [[ $model_count -eq 0 ]]; then
    echo -e "${YELLOW}⚠️ No AI models found. The container will work but AI detection will be disabled.${NC}"
    read -p "Continue with build? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Build cancelled by user.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Found $model_count model type(s)${NC}"
fi

echo ""

# Build the image
echo -e "${BLUE}🔨 Building Docker image...${NC}"
echo "This may take several minutes on first build..."
echo ""

# Build with progress output
docker build \
    -f Dockerfile.unified \
    -t "$FULL_IMAGE_NAME" \
    --progress=plain \
    . || {
    echo -e "${RED}❌ Docker build failed!${NC}"
    exit 1
}

echo ""

# Post-build information
echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo ""

# Show image information
echo -e "${BLUE}📋 Image Information:${NC}"
docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
echo ""

# Get image size
IMAGE_SIZE=$(docker images "$FULL_IMAGE_NAME" --format "{{.Size}}")
echo -e "${BLUE}💾 Final image size: ${IMAGE_SIZE}${NC}"
echo ""

# Quick container test
echo -e "${YELLOW}🧪 Running quick container test...${NC}"
if docker run --rm --name="${IMAGE_NAME}-test" -d -p 8081:8080 "$FULL_IMAGE_NAME" >/dev/null; then
    echo -e "${GREEN}✅ Container started successfully${NC}"
    
    # Wait a moment for services to start
    sleep 10
    
    # Test web interface
    if curl -f http://localhost:8081/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Web interface responding${NC}"
    else
        echo -e "${YELLOW}⚠️ Web interface not responding (this may be normal during startup)${NC}"
    fi
    
    # Stop test container
    docker stop "${IMAGE_NAME}-test" >/dev/null 2>&1 || true
    echo -e "${GREEN}✅ Test container stopped${NC}"
else
    echo -e "${YELLOW}⚠️ Container test failed, but image was built successfully${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Unified Docker image ready!${NC}"
echo ""
echo -e "${BLUE}📚 Usage Examples:${NC}"
echo ""
echo "  # Run with Docker:"
echo "  docker run -p 8080:8080 $FULL_IMAGE_NAME"
echo ""
echo "  # Run with Docker Compose:"
echo "  docker-compose -f docker-compose.unified.yml up -d"
echo ""
echo "  # Run with custom port:"
echo "  docker run -p 3000:8080 -e PORT=8080 $FULL_IMAGE_NAME"
echo ""
echo "  # Access the application:"
echo "  🌐 Web Interface: http://localhost:8080"
echo "  🤖 API Interface: http://localhost:8080 (internal routing)"
echo ""
echo -e "${BLUE}🔧 Advanced Options:${NC}"
echo "  # Force specific AI backend:"
echo "  docker run -e MODEL_BACKEND=pytorch -p 8080:8080 $FULL_IMAGE_NAME"
echo "  docker run -e MODEL_BACKEND=openvino -p 8080:8080 $FULL_IMAGE_NAME"
echo ""
echo "  # Mount custom models:"
echo "  docker run -v /path/to/models:/app/models/custom -p 8080:8080 $FULL_IMAGE_NAME"
echo ""
echo -e "${GREEN}Build complete! ✨${NC}"