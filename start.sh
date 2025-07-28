#!/bin/bash
set -e

# Start script for Railway deployment
echo "🚀 Starting Hazard Detection services..."
echo "Environment: ${NODE_ENV:-development}"
echo "Port: ${PORT:-3000}"

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down services..."
    if [ ! -z "$API_PID" ]; then
        kill $API_PID 2>/dev/null || true
    fi
    if [ ! -z "$WEB_PID" ]; then
        kill $WEB_PID 2>/dev/null || true
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Function to start API service
start_api() {
    echo "🐍 Starting Python API service on port 8001..."
    cd /app
    
    # Check if API requirements are met
    if [ ! -f "api/app.py" ]; then
        echo "❌ API app.py not found, skipping API service"
        return 1
    fi
    
    python3 -m uvicorn api.app:app --host 0.0.0.0 --port 8001 --workers 1 &
    API_PID=$!
    echo "✅ API service started with PID: $API_PID"
    return 0
}

# Function to start web service
start_web() {
    echo "🌐 Starting Node.js web service on port ${PORT:-3000}..."
    cd /app
    
    # Check if web service requirements are met
    if [ ! -f "server/server.js" ]; then
        echo "❌ Web server.js not found"
        return 1
    fi
    
    npm run start:web:full &
    WEB_PID=$!
    echo "✅ Web service started with PID: $WEB_PID"
    return 0
}

# Start API service (optional)
if start_api; then
    echo "🔄 Waiting for API to initialize..."
    sleep 10
else
    echo "⚠️  API service not started, continuing with web only"
    API_PID=""
fi

# Start web service (required)
if ! start_web; then
    echo "❌ Failed to start web service, exiting"
    exit 1
fi

echo "✅ Services started successfully!"

# Function to check if process is running
check_process() {
    if [ -z "$1" ]; then
        return 1
    fi
    if ! kill -0 $1 2>/dev/null; then
        return 1
    fi
    return 0
}

# Health check loop
echo "🔍 Starting health monitoring..."
HEALTH_CHECK_INTERVAL=30

while true; do
    # Check API service (if it was started)
    if [ ! -z "$API_PID" ] && ! check_process $API_PID; then
        echo "⚠️  API service died, attempting restart..."
        if start_api; then
            sleep 5
        else
            echo "❌ Failed to restart API service"
            API_PID=""
        fi
    fi
    
    # Check web service (critical)
    if ! check_process $WEB_PID; then
        echo "❌ Web service died, attempting restart..."
        if start_web; then
            sleep 5
        else
            echo "💥 Failed to restart web service, exiting"
            exit 1
        fi
    fi
    
    # Status report
    if [ ! -z "$API_PID" ] && check_process $API_PID; then
        API_STATUS="✅ Running"
    else
        API_STATUS="❌ Not running"
    fi
    
    if check_process $WEB_PID; then
        WEB_STATUS="✅ Running"
    else
        WEB_STATUS="❌ Not running"
    fi
    
    echo "📊 Status - API: $API_STATUS | Web: $WEB_STATUS"
    
    sleep $HEALTH_CHECK_INTERVAL
done