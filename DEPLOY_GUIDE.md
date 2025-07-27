# 🚀 Deploy Your Hazard Detection App to Render

Your app is fully prepared for deployment! Follow these steps to get your hazard detection system live.

## 🎯 What's Ready for Deployment

✅ **Code Prepared**: Updated for Render's dynamic ports and production environment
✅ **Environment Variables**: All your .env variables are configured
✅ **Dependencies**: Both Python and Node.js requirements are set
✅ **CORS Configuration**: Properly configured for production domains
✅ **Repository**: Code is pushed to GitHub and ready

## Step 1: Deploy Backend Service (Python/FastAPI)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New"** → **"Web Service"**
3. Select **"Build and deploy from a Git repository"**
4. Connect to **GitHub** and select: `NirelJano/Hazard-Detection`

### Backend Configuration:
```
Name: hazard-detection-backend
Environment: Python
Branch: master
Build Command: pip install -r requirements.txt
Start Command: cd server && python app.py
Plan: Free
```

### Backend Environment Variables:
Add these three variables in the **Environment** section:
```
PYTHONPATH=/opt/render/project/src/server
PORT=8000
RENDER=true
```

Click **"Create Web Service"** and wait for the build to complete.

## Step 2: Deploy Frontend Service (Node.js/Express)

1. In Render Dashboard, click **"New"** → **"Web Service"** again
2. Select the same repository: `NirelJano/Hazard-Detection`

### Frontend Configuration:
```
Name: hazard-detection-frontend
Environment: Node
Branch: master
Build Command: npm install
Start Command: npm start
Plan: Free
```

### Frontend Environment Variables:
Add ALL these variables in the **Environment** section:

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

## Step 3: Monitor Deployment Progress

### Watch Build Logs:
1. Go to each service in your Render dashboard
2. Click on the **"Logs"** tab
3. Monitor the build process

### Expected Build Time:
- **Backend**: 3-5 minutes (Python dependencies + OpenVINO)
- **Frontend**: 2-3 minutes (Node.js dependencies)

## Step 4: Your Live Application URLs

Once deployment completes, your app will be available at:
- **Frontend (Main App)**: `https://hazard-detection-frontend.onrender.com`
- **Backend (API)**: `https://hazard-detection-backend.onrender.com`

## Step 5: Verify Deployment

### Test Backend Health:
```bash
curl https://hazard-detection-backend.onrender.com/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "model_status": "loaded",
  "backend_inference": true,
  "backend_type": "openvino"
}
```

### Test Frontend:
1. Open `https://hazard-detection-frontend.onrender.com` in your browser
2. You should see the login page
3. Try logging in with Google OAuth
4. Test the camera detection feature

## 🎉 Features Your Deployed App Includes

### 🎥 **Live Detection**
- Real-time camera hazard detection
- AI-powered analysis using OpenVINO + ONNX
- Mobile-friendly interface

### 📤 **Upload & Analyze**
- Upload images for hazard detection
- Batch processing capabilities
- Detailed detection reports

### 👤 **Authentication**
- Google OAuth login
- Session management
- User profiles

### 📊 **Dashboard**
- Detection history
- Real-time statistics
- Report management

### 🗺️ **Location Services**
- GPS tracking
- Address geocoding
- Location-based reports

## 🐛 Troubleshooting

### Common Issues:

#### Backend Build Fails:
- Check if `requirements.txt` exists in repository root
- Verify Python dependencies are compatible
- Check build logs for specific error messages

#### Frontend Build Fails:
- Ensure `package.json` and `package-lock.json` are committed
- Check for Node.js version compatibility
- Verify all dependencies are available

#### Runtime Errors:
- **Database Connection**: Verify Redis credentials are correct
- **Authentication**: Check Google OAuth settings
- **File Upload**: Verify Cloudinary credentials
- **Email**: Check SendGrid API key

#### Performance Issues:
- **Cold Starts**: Free tier services sleep after 15 minutes
- **Memory Limits**: 512MB RAM on free tier
- **Build Timeouts**: Large builds may timeout

### Solutions:
1. **Clear Build Cache**: Use "Manual Deploy" → "Clear cache"
2. **Check Environment Variables**: Ensure all variables are set correctly
3. **Review Logs**: Always check both build and runtime logs
4. **Redeploy**: Try manual redeploy if automatic deployment fails

## 🔄 Automatic Updates

After deployment:
- Any push to `master` branch triggers automatic rebuild
- Both services will update simultaneously
- Zero-downtime deployments

## 📱 Mobile Support

Your app is fully mobile-responsive and includes:
- Touch-friendly camera controls
- Mobile-optimized detection interface
- Progressive Web App features
- Offline fallback capabilities

## 🔒 Security Features

- HTTPS everywhere
- Secure session management
- CORS protection
- Environment variable encryption
- OAuth authentication

## 💰 Free Tier Limitations

**Render Free Tier Includes:**
- 512 MB RAM per service
- Shared CPU
- 750 hours/month total
- Services sleep after 15 minutes of inactivity
- Automatic SSL certificates

## 📞 Need Help?

If you encounter issues:
1. Check **Logs** tab in Render dashboard for error messages
2. Verify all environment variables are properly set
3. Ensure your GitHub repository is accessible to Render
4. Review the troubleshooting section above
5. Check [Render Documentation](https://render.com/docs)

---

## 🎯 Next Steps After Deployment

1. **Test all features** to ensure everything works
2. **Share your app** with users
3. **Monitor performance** through Render dashboard
4. **Set up monitoring** for production use
5. **Plan for scaling** if usage grows

Your Hazard Detection app will be live and accessible worldwide within 10 minutes! 🌍

**Happy Deploying!** 🚀