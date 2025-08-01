#!/bin/bash
set -e

echo "🚀 Starting Unified Hazard Detection Service..."
echo "🐳 Container Environment: ${NODE_ENV:-production}"
echo "🌐 Web Server Port: ${WEB_PORT:-3000}"
echo "🐍 API Server Port: ${API_PORT:-8000}"

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down all services..."
    pkill -f "uvicorn" 2>/dev/null || true
    pkill -f "node" 2>/dev/null || true
    pkill -f "pm2" 2>/dev/null || true
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT EXIT

# Step 1: Run intelligent model selection
echo "🧠 Running intelligent CPU detection and model selection..."
cd /app
python3 /app/scripts/detect-cpu-and-select-model.py

# Load the generated model configuration
if [ -f "/app/.env.model" ]; then
    echo "📋 Loading model configuration..."
    export $(cat /app/.env.model | grep -v '^#' | xargs)
    echo "✅ Selected Backend: ${MODEL_BACKEND}"
    echo "📁 Model Directory: ${MODEL_DIR}"
else
    echo "⚠️ No model configuration found, using defaults..."
    export MODEL_BACKEND=pytorch
    export MODEL_DIR=/app/models/pytorch
    export PYTORCH_MODEL_PATH=/app/models/pytorch/best.pt
fi

# Step 2: Update API app configuration based on selection
echo "⚙️ Configuring API service for ${MODEL_BACKEND} backend..."

# Set common environment variables
export PYTHONPATH=/app
export API_URL=http://localhost:${API_PORT:-8000}
export WEB_PORT=${WEB_PORT:-3000}
export API_PORT=${API_PORT:-8000}

# Step 3: Start FastAPI service on configured API port
echo "🐍 Starting FastAPI (${MODEL_BACKEND} backend) on port ${API_PORT}..."
cd /app
uvicorn api.app:app --host 0.0.0.0 --port ${API_PORT} --workers 1 &
API_PID=$!

# Wait for API to be ready
echo "⏳ Waiting for API service to start..."
for i in {1..30}; do
    if curl -f http://localhost:${API_PORT}/health >/dev/null 2>&1; then
        echo "✅ API service is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ API service failed to start within 30 seconds"
        exit 1
    fi
    sleep 1
done

# Step 4: Start Express web server
echo "🌐 Starting Express web server on port ${WEB_PORT}..."
cd /app/server/routes

if [ -f "server.js" ]; then
    # Use the full-featured server with authentication
    API_URL=http://localhost:${API_PORT} PORT=${WEB_PORT} node server.js &
    WEB_PID=$!
elif [ -f "simple-server.js" ]; then
    # Fallback to simple server
    echo "⚠️ Using simple server (full server.js not found)"
    API_URL=http://localhost:${API_PORT} PORT=${WEB_PORT} node simple-server.js &
    WEB_PID=$!
else
    echo "❌ No web server found in $(pwd)"
    echo "📁 Available files:"
    ls -la
    exit 1
fi

# Step 5: Health check and monitoring
echo "🏥 Starting health monitoring..."
for i in {1..20}; do
    if curl -f http://localhost:${WEB_PORT}/health >/dev/null 2>&1; then
        echo "✅ Web server is ready!"
        break
    fi
    if [ $i -eq 20 ]; then
        echo "❌ Web server failed to start within 20 seconds"
        exit 1
    fi
    sleep 1
done

echo "🎉 All services started successfully!"
echo "📊 Service Status:"
echo "   🐍 FastAPI (AI Backend): http://localhost:${API_PORT} (PID: $API_PID)"
echo "   🌐 Web Server: http://localhost:${WEB_PORT} (PID: $WEB_PID)"
echo "   🧠 AI Backend: ${MODEL_BACKEND}"
echo "   📁 Model Path: ${MODEL_DIR}"

# Create a simple health check endpoint info
cat > /tmp/service-info.json << EOL
{
  "status": "running",
  "services": {
    "api": {
      "url": "http://localhost:${API_PORT}",
      "pid": $API_PID,
      "backend": "${MODEL_BACKEND}",
      "model_path": "${MODEL_DIR}"
    },
    "web": {
      "url": "http://localhost:${WEB_PORT}",
      "pid": $WEB_PID
    }
  },
  "started_at": "$(date -Iseconds)"
}
EOL

echo "🔄 Services are running. Press Ctrl+C to stop."

# Wait for both processes
wait
