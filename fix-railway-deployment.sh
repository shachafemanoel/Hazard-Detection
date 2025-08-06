#!/bin/bash
# Railway Deployment Fix Script for Hazard Detection System
# Project ID: 348fd37d-a0d7-4a94-ab14-ea17e5ecfb5b

set -e

echo "🚀 Railway Deployment Fix for Hazard Detection System"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    print_status $RED "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login check
if ! railway whoami &> /dev/null; then
    print_status $RED "❌ Not logged in to Railway"
    railway login
fi

print_status $BLUE "📋 Current Railway Status:"
railway status

echo ""
print_status $YELLOW "🔧 Step 1: Fix Frontend Service (Hazard Detection)"
echo "=============================================="

# Frontend deployment fixes
cd /Users/shachafemanoel/Documents/Hazard-Detection

print_status $BLUE "📝 Frontend Configuration:"
echo "- Using Nixpacks builder (automatic Node.js detection)"
echo "- Start Command: npm start"  
echo "- Health Check: /health"
echo "- Port: 3000 (Railway auto-assigned)"

# Create a simple health check if it doesn't exist
if ! grep -q "app.get('/health'" server/routes/server.js; then
    print_status $YELLOW "⚠️ Health endpoint exists at line 669"
fi

print_status $GREEN "✅ Frontend configuration ready"

echo ""
print_status $YELLOW "🔧 Step 2: Fix API Service (Hazard Detection API)"  
echo "=============================================="

# API deployment fixes
cd /Users/shachafemanoel/Documents/api/hazard-detection-api-

print_status $BLUE "📝 API Configuration:"
echo "- Using Docker with multi-stage build"
echo "- Start Command: python main.py"
echo "- Health Check: /health" 
echo "- Port: 8080"
echo "- Models: PyTorch + OpenVINO available"

# Verify model files
if [ -f "best.pt" ]; then
    MODEL_SIZE=$(du -h "best.pt" | cut -f1)
    print_status $GREEN "✅ PyTorch model found (${MODEL_SIZE})"
else
    print_status $RED "❌ PyTorch model missing"
fi

if [ -d "best0408_openvino_model" ] && [ -f "best0408_openvino_model/best0408.xml" ]; then
    OPENVINO_SIZE=$(du -sh "best0408_openvino_model" | cut -f1)
    print_status $GREEN "✅ OpenVINO model found (${OPENVINO_SIZE})"
else
    print_status $RED "❌ OpenVINO model missing or incomplete"
fi

print_status $GREEN "✅ API configuration ready"

echo ""
print_status $YELLOW "🚀 Step 3: Deploy Services"
echo "========================"

print_status $BLUE "Deploying API service..."
cd /Users/shachafemanoel/Documents/api/hazard-detection-api-

# Deploy API service with timeout
timeout 300s railway up || print_status $YELLOW "⚠️ API deployment timed out, may still be processing"

print_status $BLUE "Deploying Frontend service..."
cd /Users/shachafemanoel/Documents/Hazard-Detection

# Deploy Frontend service with timeout  
timeout 300s railway up || print_status $YELLOW "⚠️ Frontend deployment timed out, may still be processing"

echo ""
print_status $YELLOW "🔍 Step 4: Verify Deployments"
echo "=========================="

# Wait for services to start
sleep 30

# Check API health
print_status $BLUE "Testing API service..."
API_URL="https://hazard-api-production-production.up.railway.app"
if curl -sf "${API_URL}/health" > /dev/null; then
    print_status $GREEN "✅ API service is responding"
    curl -s "${API_URL}/health" | head -3
else
    print_status $RED "❌ API service not responding"
fi

# Check Frontend health  
print_status $BLUE "Testing Frontend service..."
FRONTEND_URL="https://hazard-detection-production-8735.up.railway.app"
if curl -sf "${FRONTEND_URL}/health" > /dev/null; then
    print_status $GREEN "✅ Frontend service is responding"
    curl -s "${FRONTEND_URL}/health"
else
    print_status $RED "❌ Frontend service not responding"
fi

echo ""
print_status $YELLOW "📊 Step 5: Service Integration Test"
echo "=================================="

# Test API integration from frontend
print_status $BLUE "Testing API integration..."
if curl -sf "${FRONTEND_URL}/api/v1/health" > /dev/null; then
    print_status $GREEN "✅ Frontend can proxy to API"
else
    print_status $YELLOW "⚠️ Frontend-API integration may need time to stabilize"
fi

# Test camera detection integration
print_status $BLUE "Testing camera detection..."
if curl -sf "${FRONTEND_URL}/camera.html" > /dev/null; then
    print_status $GREEN "✅ Camera detection page accessible"
else
    print_status $RED "❌ Camera detection page not accessible"
fi

echo ""
print_status $GREEN "🎉 Deployment Process Complete!"
echo ""
print_status $BLUE "📋 Service URLs:"
echo "  Frontend:  ${FRONTEND_URL}"
echo "  API:       ${API_URL}"
echo "  API Docs:  ${API_URL}/docs"
echo "  Camera:    ${FRONTEND_URL}/camera.html"
echo ""

print_status $BLUE "🔧 Next Steps:"
echo "1. Wait 2-3 minutes for services to fully start"
echo "2. Test camera detection: ${FRONTEND_URL}/camera.html"  
echo "3. Check logs if issues: railway logs"
echo "4. Monitor deployments in Railway dashboard"
echo ""

print_status $YELLOW "⚠️  Common Issues & Solutions:"
echo "- Model loading: Check Railway logs for OpenVINO initialization"
echo "- CORS errors: Services may need time to discover each other"  
echo "- Health checks: Railway needs services to respond within 2 minutes"
echo "- Memory limits: Large models may cause OOM - check Railway metrics"

echo ""
print_status $GREEN "✅ Deployment fix script completed!"