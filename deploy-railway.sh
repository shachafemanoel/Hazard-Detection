#!/bin/bash

# Railway Deployment Script for Hazard Detection

echo "🚂 Deploying Hazard Detection to Railway..."

# Check if logged in to Railway
if ! railway whoami > /dev/null 2>&1; then
    echo "❌ Not logged in to Railway. Please run: railway login"
    exit 1
fi

# Function to deploy a service
deploy_service() {
    local service_name=$1
    local service_path=$2
    
    echo "🔧 Deploying $service_name..."
    cd $service_path
    
    # Link to Railway project (you'll need to select your project)
    railway link
    
    # Deploy the service
    railway up
    
    cd ..
}

echo "📋 This script will help deploy both services to Railway"
echo "📍 Make sure you have:"
echo "   1. Created a Railway project"
echo "   2. Logged in with: railway login"
echo ""

read -p "Continue with deployment? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Starting deployment..."
    
    echo "📦 Choose which service to deploy:"
    echo "1) API Service (Python/FastAPI)"
    echo "2) Web Service (Node.js/Express)" 
    echo "3) Both services"
    
    read -p "Enter choice (1-3): " choice
    
    case $choice in
        1)
            deploy_service "API" "api"
            ;;
        2)
            deploy_service "Web" "."
            ;;
        3)
            echo "🔄 Deploying API first..."
            deploy_service "API" "api"
            echo "🔄 Deploying Web service..."
            deploy_service "Web" "."
            ;;
        *)
            echo "❌ Invalid choice"
            exit 1
            ;;
    esac
    
    echo "✅ Deployment complete!"
else
    echo "❌ Deployment cancelled"
fi