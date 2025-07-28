#!/bin/bash

echo "🚂 Railway Deployment Script"
echo "=============================="

# Set your API token
export RAILWAY_TOKEN=f46ecf96-2df0-41f0-9fba-79473351c024

# Project ID
PROJECT_ID="348fd37d-a0d7-4a94-ab14-ea17e5ecfb5b"

echo "📋 Deployment Options:"
echo "1. Deploy API Service (OpenVINO)"
echo "2. Deploy Web Service" 
echo "3. Deploy Both Services"
echo "4. Manual GitHub Deployment Instructions"

read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo "🔧 Deploying API Service..."
        cd api
        if railway whoami > /dev/null 2>&1; then
            railway up --detach
        else
            echo "❌ Not authenticated. Please run 'railway login' first"
        fi
        ;;
    2)
        echo "🔧 Deploying Web Service..."
        cd web
        if railway whoami > /dev/null 2>&1; then
            railway up --detach
        else
            echo "❌ Not authenticated. Please run 'railway login' first"
        fi
        ;;
    3)
        echo "🔧 Deploying both services..."
        echo "First, deploying API service..."
        cd api
        if railway whoami > /dev/null 2>&1; then
            railway up --detach
            cd ../web
            echo "Now deploying web service..."
            railway up --detach
        else
            echo "❌ Not authenticated. Please run 'railway login' first"
        fi
        ;;
    4)
        echo "📖 Manual GitHub Deployment:"
        echo "1. Go to: https://railway.com/project/$PROJECT_ID"
        echo "2. Click 'New Service' → 'GitHub Repo'"
        echo "3. Select 'shachafemanoel/Hazard-Detection'"
        echo "4. For API: Set Root Directory to 'api'"
        echo "5. For Web: Set Root Directory to 'web'"
        echo "6. Deploy both services"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo "✅ Deployment process completed!"
echo "🔗 View project: https://railway.com/project/$PROJECT_ID"