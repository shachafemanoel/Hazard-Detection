# Deployment Guide for Hazard Detection App

This guide explains how to deploy your Hazard Detection application to Render using their Hobby (free) plan.

## 🚀 Quick Deployment

### Option 1: Automated Deployment (Recommended)

1. **Update the GitHub repository URL** in `deploy-to-render.js`:
   ```javascript
   repo: 'https://github.com/YOUR_USERNAME/Hazard-Detection.git'
   ```

2. **Run the deployment script**:
   ```bash
   node deploy-to-render.js
   ```

3. **Set up environment variables** in the Render dashboard (see section below).

### Option 2: Manual Deployment via Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure as shown below

## 📋 Service Configuration

### Backend Service (Python/FastAPI)
- **Name**: `hazard-detection-backend`
- **Environment**: `Python`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `cd server && python app.py`
- **Plan**: Free

### Frontend Service (Node.js/Express)
- **Name**: `hazard-detection-frontend`
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free

## 🔐 Environment Variables

### Frontend Service Variables

Add these in the Render dashboard for your frontend service:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Node environment |
| `SESSION_SECRET` | `[generate random string]` | Session encryption key |
| `GOOGLE_CLIENT_ID` | `[your Google OAuth client ID]` | Google authentication |
| `GOOGLE_CLIENT_SECRET` | `[your Google OAuth secret]` | Google authentication |
| `GOOGLE_CALLBACK_URL` | `https://your-frontend-url.onrender.com/auth/google/callback` | OAuth callback |
| `SENDGRID_API_KEY` | `[your SendGrid key]` | Email service |
| `CLOUDINARY_CLOUD_NAME` | `[your Cloudinary name]` | Image storage |
| `CLOUDINARY_API_KEY` | `[your Cloudinary key]` | Image storage |
| `CLOUDINARY_API_SECRET` | `[your Cloudinary secret]` | Image storage |
| `REDIS_HOST` | `[your Redis host]` | Database |
| `REDIS_PORT` | `6380` | Database port |
| `REDIS_PASSWORD` | `[your Redis password]` | Database auth |
| `GOOGLE_GEOCODING_API_KEY` | `[your geocoding key]` | Location services |

### Backend Service Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `PYTHONPATH` | `/opt/render/project/src/server` | Python path |
| `PORT` | `8000` | Server port |
| `RENDER` | `true` | Environment flag |

## 🛠️ Pre-Deployment Checklist

### 1. Code Preparation
- ✅ Updated `server.js` for dynamic ports
- ✅ Updated `app.py` for Render deployment
- ✅ Created `render.yaml` configuration
- ✅ Updated `package.json` scripts
- ✅ Fixed frontend URLs for production

### 2. Repository Setup
- [ ] Push your code to GitHub
- [ ] Ensure all files are committed
- [ ] Repository is public or you have Render access

### 3. External Services
- [ ] Google OAuth app configured
- [ ] SendGrid account set up
- [ ] Cloudinary account set up
- [ ] Redis database provisioned
- [ ] Google Geocoding API enabled

## 🔗 Service URLs

After deployment, your services will be available at:

- **Frontend**: `https://hazard-detection-frontend.onrender.com`
- **Backend**: `https://hazard-detection-backend.onrender.com`

## 📊 Monitoring Deployment

### Build Logs
1. Go to Render Dashboard
2. Click on your service
3. Go to "Logs" tab
4. Monitor build and runtime logs

### Health Checks
- Backend health: `https://hazard-detection-backend.onrender.com/health`
- Frontend status: Check if the login page loads

## 🐛 Troubleshooting

### Common Issues

#### Build Failures
- **Python dependencies**: Ensure `requirements.txt` is in root directory
- **Node dependencies**: Check `package.json` and `package-lock.json`
- **Memory limits**: Free tier has limited resources

#### Runtime Errors
- **Environment variables**: Double-check all required env vars are set
- **CORS issues**: Backend should allow frontend domain
- **Database connection**: Verify Redis credentials

#### Performance Issues
- **Cold starts**: Free tier services sleep after 15 minutes of inactivity
- **Resource limits**: 512 MB RAM, shared CPU on free tier
- **Build timeouts**: Large builds may timeout on free tier

### Debug Commands

Check backend health:
```bash
curl https://hazard-detection-backend.onrender.com/health
```

Check frontend status:
```bash
curl https://hazard-detection-frontend.onrender.com/
```

### Log Analysis
- Backend logs: Check for OpenVINO model loading errors
- Frontend logs: Check for authentication and Redis connection issues
- Browser console: Check for CORS and API connection errors

## 🔄 Updates and Redeployment

### Automatic Deployment
- Push to main branch triggers automatic rebuild
- Both services will rebuild if repository changes

### Manual Deployment
- Use "Manual Deploy" button in Render dashboard
- Select specific commit or branch

### Rolling Back
- Render keeps deployment history
- Use "Rollback" feature in dashboard

## 💰 Cost Optimization

### Free Tier Limits
- 512 MB RAM per service
- Shared CPU
- Services sleep after 15 minutes
- 750 hours/month total across all services

### Tips
- Combine services if possible
- Use external Redis (RedisLabs free tier)
- Optimize Docker images for size
- Monitor usage in dashboard

## 🔒 Security Best Practices

### Environment Variables
- Never commit secrets to repository
- Use Render's environment variable management
- Rotate keys regularly

### CORS Configuration
- Restrict origins to your domains
- Don't use wildcards in production
- Enable credentials only when needed

### Authentication
- Use strong session secrets
- Configure OAuth redirect URLs carefully
- Implement proper error handling

## 📞 Support

### Resources
- [Render Documentation](https://render.com/docs)
- [FastAPI Deployment Guide](https://fastapi.tiangolo.com/deployment/)
- [Express.js Production Guide](https://expressjs.com/en/advanced/best-practice-security.html)

### Issues
- Check Render community forum
- Review deployment logs carefully
- Test locally before deploying

---

## 🎯 Final Checklist

Before going live:

- [ ] All environment variables configured
- [ ] OAuth redirect URLs updated
- [ ] Database connections tested
- [ ] Health checks passing
- [ ] Frontend loads correctly
- [ ] Backend API responds
- [ ] Camera functionality works
- [ ] File upload works
- [ ] User authentication works
- [ ] Monitoring set up

Your Hazard Detection app should now be live and accessible worldwide! 🌍