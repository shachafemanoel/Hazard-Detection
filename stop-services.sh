#!/bin/bash

# Hazard Detection - Stop Services Script
echo "🛑 Stopping Hazard Detection Services..."

# Kill processes by port
echo "🔍 Finding and stopping processes..."

# Stop API (port 8000)
API_PID=$(lsof -ti:8000)
if [ ! -z "$API_PID" ]; then
    echo "⚪ Stopping API service (PID: $API_PID)"
    kill -9 $API_PID
fi

# Stop Web (port 3000)  
WEB_PID=$(lsof -ti:3000)
if [ ! -z "$WEB_PID" ]; then
    echo "⚪ Stopping Web service (PID: $WEB_PID)"
    kill -9 $WEB_PID
fi

# Clean up PID files
rm -f api.pid web.pid

echo "✅ All services stopped!"