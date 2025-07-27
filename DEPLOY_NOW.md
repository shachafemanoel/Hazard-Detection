# 🚀 Deploy Your Hazard Detection App to Render NOW

Your app is fully prepared for deployment! Follow these simple steps:

## Step 1: Deploy Backend Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New"** → **"Web Service"**
3. Select **"Build and deploy from a Git repository"**
4. Connect to **GitHub** and select your repository: `NirelJano/Hazard-Detection`

### Backend Configuration:
- **Name**: `hazard-detection-backend`
- **Environment**: `Python`
- **Branch**: `master`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `cd server && python app.py`
- **Plan**: `Free`

### Backend Environment Variables:
Add these in the **Environment** section:

```
PYTHONPATH=/opt/render/project/src/server
PORT=8000
RENDER=true
```

Click **"Create Web Service"** and wait for build to complete.

## Step 2: Deploy Frontend Service

1. In Render Dashboard, click **"New"** → **"Web Service"** again
2. Select the same repository: `NirelJano/Hazard-Detection`

### Frontend Configuration:
- **Name**: `hazard-detection-frontend`
- **Environment**: `Node`
- **Branch**: `master`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: `Free`

### Frontend Environment Variables:
Add these **EXACT** values in the Environment section:

```
NODE_ENV=production
SESSION_SECRET=aVeryStrongAndRandomSecretKeyForYourSessionManagement123!@#$
GOOGLE_CLIENT_ID=46375555882-rmivba20noas9slfskb3cfvugssladrr.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_CALLBACK_URL=https://hazard-detection-frontend.onrender.com/auth/google/callback
SENDGRID_API_KEY=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
CLOUDINARY_CLOUD_NAME=dgn5da9f8
CLOUDINARY_API_KEY=688173149321172
CLOUDINARY_API_SECRET=Mb_3IFGPoWA1_AM-XzOd6AH_Pyg
REDIS_HOST=redis-13437.c44.us-east-1-2.ec2.redns.redis-cloud.com
REDIS_PORT=13437
REDIS_USERNAME=default
REDIS_PASSWORD=e7uFJGU10TYEVhTJFoOkyPog0fBMhJMG
GOOGLE_GEOCODING_API_KEY=AIzaSyAJ4073PjQ5koFcU9O3WCt8IsK43NNMPcc
GOOGLE_MAPS_API_KEY=AIzaSyAJ4073PjQ5koFcU9O3WCt8IsK43NNMPcc
```

Click **"Create Web Service"**.

## Step 3: Monitor Deployment

### Check Build Logs:
- Go to each service in your dashboard
- Click on **"Logs"** tab
- Watch for successful deployment messages

### Expected URLs:
- **Frontend**: `https://hazard-detection-frontend.onrender.com`
- **Backend**: `https://hazard-detection-backend.onrender.com`

## Step 4: Verify Deployment

### Test Backend:
```bash
curl https://hazard-detection-backend.onrender.com/health
```

Should return:
```json
{
  "status": "healthy",
  "model_status": "loaded",
  "backend_inference": true
}
```

### Test Frontend:
Open `https://hazard-detection-frontend.onrender.com` in browser.
You should see the login page.

## 🎯 What's Already Configured

✅ **Dynamic Ports**: Both services use `process.env.PORT`
✅ **CORS**: Configured for Render domains
✅ **Environment Detection**: Auto-detects production vs development
✅ **Database**: Redis connection configured
✅ **Authentication**: Google OAuth ready
✅ **File Storage**: Cloudinary configured
✅ **Email**: SendGrid configured
✅ **AI Model**: OpenVINO backend + ONNX frontend fallback

## 🐛 Troubleshooting

### Backend Issues:
- **Build fails**: Check if `requirements.txt` exists in root
- **Start fails**: Verify Python model files are included
- **Model loading**: OpenVINO requires specific CPU instructions

### Frontend Issues:
- **Build fails**: Check `package.json` and dependencies
- **Authentication fails**: Verify Google OAuth redirect URLs
- **Database errors**: Check Redis credentials

### Common Solutions:
1. **Clear cache**: Use "Manual Deploy" → "Clear cache"
2. **Check logs**: Always check both build and runtime logs
3. **Environment vars**: Ensure all variables are set correctly
4. **Branch**: Make sure you're deploying from `master` branch

## 🔄 Updates

After deployment, any push to `master` branch will trigger automatic rebuild of both services.

## 📞 Support

If you encounter issues:
1. Check the **Logs** tab in Render dashboard
2. Verify all environment variables are set
3. Ensure your GitHub repository is accessible
4. Check that all required files are committed

---

## 🎉 That's It!

Your Hazard Detection app will be live within 5-10 minutes!

**Frontend URL**: https://hazard-detection-frontend.onrender.com
**Backend URL**: https://hazard-detection-backend.onrender.com

The app includes:
- 🎥 Live camera hazard detection
- 📤 Image upload and analysis
- 👤 Google OAuth authentication
- 📊 Dashboard with detection history
- 🔄 Real-time updates
- 📱 Mobile-friendly interface
- 🤖 AI-powered detection (OpenVINO + ONNX)