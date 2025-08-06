#!/bin/bash
set -e

# Define ports (must match start-unified.sh)
WEB_PORT=${WEB_PORT:-3000}
API_PORT=${API_PORT:-8000}

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down test services..."
    pkill -f "uvicorn" 2>/dev/null || true
    pkill -f "node server.js" 2>/dev/null || true
    pkill -f "node simple-server.js" 2>/dev/null || true
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT EXIT

echo "🚀 Starting unified server for testing..."
# Start the unified server in the background
./start-unified.sh &
SERVER_PID=$!

echo "⏳ Waiting for web server to be ready on port ${WEB_PORT}..."
for i in {1..60}; do
    if curl -f http://localhost:${WEB_PORT}/health >/dev/null 2>&1; then
        echo "✅ Web server is ready!"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "❌ Web server failed to start within 60 seconds"
        cleanup
        exit 1
    fi
    sleep 1
done

echo "Running tests..."
# Run the actual tests
npm run test:run

echo "Tests finished. Cleaning up..."
cleanup
