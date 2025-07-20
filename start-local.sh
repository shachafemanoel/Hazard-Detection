#!/bin/bash

echo "🚀 Starting Hazard Detection Application Locally"
echo "=============================================="

# בדיקת Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Please upgrade to Node.js 18+"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# בדיקת Redis
echo "🔍 Checking Redis connection..."
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo "✅ Redis is running"
    else
        echo "❌ Redis is not running. Please start Redis:"
        echo "   macOS: brew services start redis"
        echo "   Linux: sudo systemctl start redis-server"
        echo "   Windows: Start Redis service"
        exit 1
    fi
else
    echo "⚠️  redis-cli not found. Make sure Redis is installed and running"
fi

# בדיקת קובץ .env
if [ ! -f "server/.env" ]; then
    echo "⚠️  .env file not found. Creating basic .env file..."
    cp server/.env.example server/.env 2>/dev/null || echo "# Basic config for local development
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
SESSION_SECRET=local-development-secret-key-change-in-production
NODE_ENV=development
PORT=3000" > server/.env
    echo "✅ Created server/.env file. Edit it with your API keys if needed."
fi

# התקנת חבילות
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# הרצת השרת
echo "🚀 Starting server on http://localhost:3000"
echo "   Press Ctrl+C to stop"
echo ""

npm start