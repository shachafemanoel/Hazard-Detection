#!/bin/bash

echo "🚂 Deploying services to Railway..."

# Deploy API service (OpenVINO server)
echo "📦 Deploying API service..."
cd api
railway up --service api-service &
API_PID=$!

# Deploy web service  
echo "📦 Deploying web service..."
cd ../web
railway up --service web-service &
WEB_PID=$!

# Wait for both deployments
echo "⏳ Waiting for deployments to complete..."
wait $API_PID
wait $WEB_PID

echo "✅ Both services deployed!"
echo "🔗 Access your project at: https://railway.com/project/348fd37d-a0d7-4a94-ab14-ea17e5ecfb5b"