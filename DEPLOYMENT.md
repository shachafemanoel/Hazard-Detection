# Deployment Guide - Separate Services

This guide explains how to deploy the Hazard Detection system as two separate services: the API backend and the web frontend.

## 🏗️ Architecture Overview

```
┌─────────────────────┐    HTTP/API    ┌─────────────────────┐
│   Web Frontend      │◄──────────────►│   API Backend       │
│   (Node.js/Express) │                │   (Python/FastAPI)  │
│   Port: 3000        │                │   Port: 8080        │
│                     │                │                     │
│ • HTML/CSS/JS       │                │ • AI Models         │
│ • Authentication    │                │ • Image Processing  │
│ • Session Mgmt      │                │ • OpenVINO/PyTorch  │
│ • File Uploads      │                │ • Detection API     │
│ • ONNX Models       │                │                     │
└─────────────────────┘                └─────────────────────┘
```

## 🚀 Step 1: Deploy API Backend

### Option A: Railway Deployment

1. **Create New Railway Project**
   ```bash
   cd api/
   # Use RAILWAY_TOKEN for non-interactive login in CI
   railway login --token $RAILWAY_TOKEN  # or run `railway login` interactively
   railway init
   railway up
   ```

2. **Set Environment Variables in Railway Dashboard:**
   - `PORT=8080`
   - `MODEL_BACKEND=auto`
   - `MODEL_DIR=/app/models`

3. **Note the Railway URL** (e.g., `https://hazard-api-production-production.up.railway.app`)

### Option B: Render Deployment

1. **Create New Web Service on Render**
   - Repository: Connect your GitHub repo
   - Root Directory: `api/`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python -m uvicorn app:app --host 0.0.0.0 --port $PORT`

2. **Set Environment Variables:**
   - `FRONTEND_URL` = Your web frontend URL (for CORS)

## 🌐 Step 2: Deploy Web Frontend

### Update Configuration

1. **Update Environment Variables**
   Create/update `.env` in project root:
   ```env
   # API Backend URL (from Step 1)
   API_URL=https://your-api-service.railway.app
   HAZARD_API_URL=https://your-api-service.railway.app
   
   # Web Server Port
   WEB_PORT=3000
   PORT=3000
   
   # Your existing variables
   CLOUDINARY_CLOUD_NAME=your_cloudinary_name
   REDIS_HOST=your_redis_host
   # ... other variables
   ```

2. **Update Railway Configuration**
   Edit `railway.toml`:
   ```toml
   [deploy.kv]
   WEB_PORT = "3000"
   PORT = "3000"
   API_URL = "https://your-api-service.railway.app"
   HAZARD_API_URL = "https://your-api-service.railway.app"
   ```

### Deploy Web Frontend

#### Option A: Railway

```bash
railway up
```

#### Option B: Render

1. Create new Web Service
2. Connect repository (root directory)
3. Use Docker build with `Dockerfile.unified`
4. Set environment variables including `API_URL`

## 🔧 Step 3: Configure Cross-Service Communication

### Update API CORS Settings

The API is already configured to accept requests from Railway/Render domains. If you use custom domains, update the API's environment variables:

```env
FRONTEND_URL=https://your-web-frontend.com
WEB_SERVICE_URL=https://your-web-frontend.railway.app
```

### Update Web Frontend API Calls

The web frontend is now configured to make external API calls instead of using a local proxy. It will automatically use the `API_URL` environment variable.

## 🧪 Step 4: Test Deployment

### 1. Test API Service
```bash
curl https://your-api-service.railway.app/health
```
Expected response:
```json
{
    "status": "healthy",
    "model_status": "loaded",
    "backend_type": "openvino"
}
```

### 2. Test Web Frontend
Visit: `https://your-web-frontend.railway.app`
- Upload an image for detection
- Verify AI detection works
- Check browser network tab for API calls

### 3. Test Integration
- Upload image through web interface
- Verify it calls the external API service
- Check that detections are returned and displayed

## 📊 Environment Variables Summary

### API Backend (`api/`)
```env
PORT=8080
MODEL_BACKEND=auto
MODEL_DIR=/app/models
FRONTEND_URL=https://your-web-frontend.railway.app
```

### Web Frontend (root directory)
```env
PORT=3000
WEB_PORT=3000
API_URL=https://your-api-service.railway.app
HAZARD_API_URL=https://your-api-service.railway.app
NODE_ENV=production

# Your existing variables
CLOUDINARY_CLOUD_NAME=...
REDIS_HOST=...
# etc.
```

## 🔍 Troubleshooting

### CORS Issues
- Ensure `FRONTEND_URL` is set in API environment variables
- Check browser console for CORS errors
- Verify API allows requests from your web domain

### API Connection Issues
- Check `API_URL` environment variable in web frontend
- Test API health endpoint directly
- Verify network connectivity between services

### Model Loading Issues
- Check API `/health` endpoint for model status
- Verify model files are included in API deployment
- Check API logs for loading errors

## 💡 Benefits of Separate Deployment

1. **Independent Scaling**: Scale API and web services separately
2. **Technology Optimization**: Python for AI, Node.js for web
3. **Resource Efficiency**: Allocate resources based on service needs
4. **Deployment Flexibility**: Deploy to different platforms if needed
5. **Development Speed**: Teams can work on services independently

## 🚀 Production Considerations

- **SSL/HTTPS**: Ensure both services use HTTPS in production
- **Load Balancing**: Consider load balancing for high traffic
- **Monitoring**: Set up monitoring for both services
- **Backup**: Regular backups of model files and databases
- **Security**: Implement proper authentication and rate limiting