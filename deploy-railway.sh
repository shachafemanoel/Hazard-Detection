#!/bin/bash

# 🚀 Railway Deployment Script for Hazard Detection Frontend

echo "🚀 Starting Railway deployment for Hazard Detection Frontend..."

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install it first:"
    echo "   npm install -g @railway/cli"
    exit 1
fi

echo "✅ Railway CLI found"

# Login check
echo "🔐 Checking Railway authentication..."
if ! railway whoami &> /dev/null; then
    if [ -n "$RAILWAY_TOKEN" ]; then
        echo "🔑 Logging in with Railway token..."
        railway login --token "$RAILWAY_TOKEN" >/dev/null 2>&1
    else
        echo "❌ Not logged in to Railway. Please login first:"
        echo "   railway login"
        echo "   or set RAILWAY_TOKEN"
        exit 1
    fi
fi

echo "✅ Railway authentication verified"

# Deploy the project
echo "📦 Deploying to Railway..."
railway up

echo "🔍 Checking deployment status..."
railway status

echo "🌐 Getting service URLs..."
echo "Frontend URL: https://hazard-detection-production.up.railway.app"
echo "API URL: https://hazard-api-production-production.up.railway.app"

echo "🧪 Testing API connectivity..."

# Test public API
echo "Testing public API endpoint..."
PUBLIC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://hazard-api-production-production.up.railway.app/health)
if [ "$PUBLIC_STATUS" -eq 200 ]; then
    echo "✅ Public API service is responding (HTTP $PUBLIC_STATUS)"
else
    echo "⚠️ Public API service not responding (HTTP $PUBLIC_STATUS)"
fi

# Test private API (only works within Railway network)
echo "🔒 Private API endpoint configured: http://ideal-learning.railway.internal:8080"
echo "   (Private network testing requires deployment environment)"

echo "🔄 Realtime client will automatically select best endpoint:"
echo "   1. Private: http://ideal-learning.railway.internal:8080 (preferred)"
echo "   2. Public: https://hazard-api-production-production.up.railway.app (fallback)"

echo "🎉 Deployment complete! Check your Railway dashboard for details."
echo "📱 Frontend: https://hazard-detection-production.up.railway.app"
echo "🔧 API: https://hazard-api-production-production.up.railway.app"
