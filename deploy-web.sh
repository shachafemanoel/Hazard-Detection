#!/bin/bash

# Deploy web service to Railway
echo "🚀 Deploying Web Service..."

# Navigate to web directory
cd web

# Check if logged in
if ! railway whoami > /dev/null 2>&1; then
    echo "❌ Please login to Railway first: railway login"
    exit 1
fi

# Deploy the service
echo "📦 Uploading web service..."
railway up --detach

echo "✅ Web service deployment initiated!"
echo "🔗 Check status at: https://railway.com/project/348fd37d-a0d7-4a94-ab14-ea17e5ecfb5b"