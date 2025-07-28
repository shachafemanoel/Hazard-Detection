# Railway Deployment Guide for Hazard Detection

## Prerequisites
1. Railway account created
2. Railway CLI installed (`npm install -g @railway/cli`)
3. Logged in to Railway (`railway login`)

## Deployment Steps

### 1. Create Railway Project
Go to [Railway](https://railway.app) and create a new project.

### 2. Environment Variables Setup

#### For API Service:
```bash
# Required environment variables
MODEL_DIR=/app/api/best_openvino_model
REDIS_URL=redis://redis:6379  # Will be provided by Railway Redis service
PYTHONPATH=/app
PORT=8000  # Railway will override this
```

#### For Web Service:
```bash
# Required environment variables
NODE_ENV=production
SESSION_SECRET=your-secure-random-string-here
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
SENDGRID_API_KEY=your-sendgrid-api-key
REDIS_URL=redis://redis:6379  # Will be provided by Railway Redis service
API_URL=https://your-api-service.railway.app  # Update after API deployment
PORT=3000  # Railway will override this
```

### 3. Deploy Services

#### Option A: Using the deployment script
```bash
./deploy-railway.sh
```

#### Option B: Manual deployment

**Deploy API Service:**
```bash
cd api
railway login
railway link  # Select your project
railway up
cd ..
```

**Deploy Web Service:**
```bash
railway link  # Select your project  
railway up
```

### 4. Add Database (Optional)
If you need persistent Redis:
```bash
railway add redis
```

### 5. Configure Custom Domains (Optional)
In Railway dashboard:
1. Go to your service
2. Settings → Domains
3. Add custom domain

## Post Deployment

### Update API URL in Web Service
After API deployment, update the `API_URL` environment variable in your web service:
1. Go to Railway dashboard
2. Select your web service
3. Variables tab
4. Update `API_URL` to your deployed API URL

### Verify Deployment
- API Health Check: `https://your-api.railway.app/health`
- Web Application: `https://your-web.railway.app`
- API Documentation: `https://your-api.railway.app/docs`

## Troubleshooting

### Common Issues:
1. **Port binding errors**: Railway automatically assigns ports via `$PORT` environment variable
2. **Model loading issues**: Ensure model files are included in build (check .dockerignore)
3. **CORS errors**: Update allowed origins in API configuration
4. **Redis connection**: Use Railway-provided Redis URL

### Logs:
```bash
railway logs  # View deployment logs
railway logs --tail  # Follow logs in real-time
```

## Environment Variables Reference

Create a `.env` file based on `.env.example` and set these in Railway dashboard:

```env
# Session and Security
SESSION_SECRET=your-secure-random-string-here

# Cloudinary Configuration  
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# SendGrid Email
SENDGRID_API_KEY=your-sendgrid-api-key

# Redis (automatically provided by Railway)
REDIS_URL=redis://redis:6379

# API URL (update after deployment)
API_URL=https://your-api-service.railway.app
```