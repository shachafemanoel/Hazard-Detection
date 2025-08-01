#!/bin/bash
set -e

# Frontend-only startup script for Railway
echo "🚀 Starting Hazard Detection Frontend"

# Use Railway's provided PORT or default to 3000
WEB_PORT=${PORT:-3000}

echo "🌐 Web Server Port: ${WEB_PORT}"
echo "🔗 API Service URL: ${API_URL:-https://hazard-api-production-production.up.railway.app/}"

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down frontend service..."
    pkill -f "node" 2>/dev/null || true
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT EXIT

# Start Express web server (frontend only)
echo "🌐 Starting Express web server on port ${WEB_PORT}..."
cd /app

# Use the main server with full features
PORT=${WEB_PORT} node server/routes/server.js &
WEB_PID=$!

# Health check
echo "🏥 Starting health monitoring..."
for i in {1..20}; do
    if curl -f http://localhost:${WEB_PORT}/health >/dev/null 2>&1; then
        echo "✅ Frontend web server is ready!"
        break
    fi
    if [ $i -eq 20 ]; then
        echo "❌ Web server failed to start within 20 seconds"
        exit 1
    fi
    sleep 1
done

echo "🎉 Frontend started successfully!"
echo "📊 Service Status:"
echo "   🌐 Web Server: http://localhost:${WEB_PORT} (PID: $WEB_PID)"
echo "   🔗 API Service: ${API_URL:-https://hazard-api-production-production.up.railway.app/}"

echo "🔄 Frontend is running. Press Ctrl+C to stop."

# Wait for the process
wait