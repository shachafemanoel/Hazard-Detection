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
curl -s -o /dev/null -w "%{http_code}" https://hazard-api-production-production.up.railway.app/health

API_STATUS=$?
if [ $API_STATUS -eq 0 ]; then
    echo "✅ API service is responding"
else
    echo "⚠️ API service not responding (this is expected if API service is not deployed)"
fi

echo "🎉 Deployment complete! Check your Railway dashboard for details."
echo "📱 Frontend: https://hazard-detection-production.up.railway.app"
echo "🔧 API: https://hazard-api-production-production.up.railway.app"
