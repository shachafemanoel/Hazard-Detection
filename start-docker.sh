#!/bin/bash

# Hazard Detection - Docker Startup Script
echo "🐳 Starting Hazard Detection with Docker..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker compose down

# Build and start services
echo "🔧 Building and starting services..."
docker compose up --build

echo "🎉 Docker services started!"
echo "📱 Web App: http://localhost:3000"
echo "🔧 API: http://localhost:8000"
echo "🗄️ Redis: localhost:6379"