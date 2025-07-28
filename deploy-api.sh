#!/bin/bash

# Deploy API service to Railway
echo "🚀 Deploying API Service..."

# Navigate to API directory
cd api

# Check if logged in
if ! railway whoami > /dev/null 2>&1; then
    echo "❌ Please login to Railway first: railway login"
    exit 1
fi

# Deploy the service
echo "📦 Uploading API service..."
railway up --detach

echo "✅ API service deployment initiated!"
echo "🔗 Check status at: https://railway.com/project/348fd37d-a0d7-4a94-ab14-ea17e5ecfb5b"