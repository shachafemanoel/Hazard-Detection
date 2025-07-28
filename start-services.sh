#!/bin/bash

# Hazard Detection - Service Startup Script
echo "🚀 Starting Hazard Detection Services..."

# Function to check if port is in use
check_port() {
    if lsof -ti:$1 > /dev/null 2>&1; then
        echo "⚠️  Port $1 is in use. Killing existing process..."
        lsof -ti:$1 | xargs kill -9
        sleep 2
    fi
}

# Function to start API service
start_api() {
    echo "🔧 Starting API Service (Python FastAPI)..."
    cd api
    
    # Activate virtual environment
    if [ ! -d "venv" ]; then
        echo "📦 Creating Python virtual environment..."
        python3 -m venv venv
    fi
    
    source venv/bin/activate
    
    # Install dependencies if needed
    pip install fastapi uvicorn pillow redis aiohttp python-multipart openvino opencv-python-headless numpy > /dev/null 2>&1
    
    # Start API server in background
    echo "✅ API starting on http://localhost:8000"
    python app.py &
    API_PID=$!
    echo $API_PID > ../api.pid
    cd ..
}

# Function to start Web service
start_web() {
    echo "🌐 Starting Web Service (Node.js Express)..."
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing Node.js dependencies..."
        npm install > /dev/null 2>&1
    fi
    
    # Start web server in background
    echo "✅ Web starting on http://localhost:3000"
    npm start &
    WEB_PID=$!
    echo $WEB_PID > web.pid
}

# Clean up function
cleanup() {
    echo "🛑 Stopping services..."
    if [ -f api.pid ]; then
        kill $(cat api.pid) 2>/dev/null
        rm api.pid
    fi
    if [ -f web.pid ]; then
        kill $(cat web.pid) 2>/dev/null
        rm web.pid
    fi
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Main execution
echo "🔍 Checking ports..."
check_port 3000
check_port 8000

# Start services
start_api
sleep 3
start_web

echo ""
echo "🎉 Services started successfully!"
echo "📱 Web App: http://localhost:3000"
echo "🔧 API: http://localhost:8000"
echo "📋 API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for services
wait