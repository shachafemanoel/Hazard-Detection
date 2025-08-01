#!/bin/bash
set -e

# Detect CPU and choose backend
python3 /app/scripts/detect_backend.py

[ -f /app/backend.env ] && source /app/backend.env
# Set model directory based on selected backend if not already defined
if [ -z "$MODEL_DIR" ]; then
  if [ "$MODEL_BACKEND" = "openvino" ]; then
    export MODEL_DIR="/app/api/best_openvino_model"
  else
    export MODEL_DIR="/app"
  fi
fi

echo "Using backend: $MODEL_BACKEND"

# Verify required files
if [ ! -f /app/api/app.py ]; then
  echo "api/app.py not found" >&2
  exit 1
fi
if [ ! -f /app/server/routes/server.js ]; then
  echo "server/routes/server.js not found" >&2
  exit 1
fi

# Start API
uvicorn api.app:app --host 0.0.0.0 --port 8000 &
API_PID=$!

# Wait a moment
sleep 5

# Start web server
cd /app/server/routes
PORT=${PORT:-8080} API_URL=http://localhost:8000 node server.js &
WEB_PID=$!

wait $API_PID $WEB_PID
