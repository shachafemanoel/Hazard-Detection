# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a hazard detection system for road infrastructure that combines AI/ML object detection with geolocation mapping and reporting. The system allows users to report road hazards through a progressive web application with real-time camera analysis, image upload, and interactive mapping. The interface is primarily in Hebrew (RTL layout) with offline-first capabilities.

## Architecture

### Core Components
- **Node.js/Express Backend** (`server/server.js`): Main application server handling authentication, API routes, and Redis data storage
- **Python FastAPI** (`server/app.py`): AI/ML inference service for YOLO object detection
- **Progressive Web App Frontend**: Single-page application with modular JavaScript architecture
- **Redis**: Session storage and report data persistence
- **AI Models**: YOLO-based road damage detection models with local and cloud inference

### Frontend Architecture (Major Change)
The frontend has been completely restructured as a modular single-page application:

- **Main Application** (`public/index.html`): Hebrew RTL interface with navigation sections
- **Modular JavaScript**: ES6 modules with clear separation of concerns
  - `public/js/ui.js` - UI state management and navigation
  - `public/js/camera.js` - Real-time video processing and detection
  - `public/js/map.js` - Leaflet-based mapping functionality
  - `public/js/reports.js` - Report management and storage
  - `public/js/settings.js` - User preferences and configuration
  - `public/js/storage.js` - Local storage and data persistence
  - `public/js/utils.js` - Shared utilities and API abstractions

### Dual-Mode AI Inference
- **Primary**: Cloud-based API inference (`https://hazard-detection-production-8735.up.railway.app/api/v1/detect`)
- **Fallback**: Local browser-based ONNX Runtime inference for offline scenarios
- **Models**: Best performing model is `best-11-8-2025.onnx` (newer than previous versions)

### Responsive Design System
- **Mobile-first**: Bottom navigation for mobile devices
- **Desktop**: Side navigation with hover interactions  
- **RTL Support**: Full Hebrew interface with proper text direction
- **Offline-capable**: Progressive Web App features with local storage

## Development Commands

### Server Development
```bash
# Start development server with auto-reload
npm run dev

# Start production server  
npm start
```

### Environment Setup
Create environment files for different environments:
- `.env` - Development environment variables
- `.env.production` - Production environment variables  
- `.env.model` - Model-specific configuration

Required environment variables:
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` - Image storage
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` - Redis connection
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` - Google OAuth
- `SENDGRID_API_KEY` - Email service for password reset
- `SESSION_SECRET` - Session encryption key

### Docker Deployment
```bash
# Build Docker image
docker build -t hazard-detection .

# Run container
docker run -p 3000:3000 hazard-detection
```

## Key File Locations

### Backend Services
- `server/server.js` - Main Express application with all API routes (OAuth, reports, file upload)
- `server/app.py` - FastAPI service for AI inference
- `server/firebaseAdmin.js` - Firebase admin configuration

### Frontend Application
- `public/index.html` - Main single-page application (Hebrew RTL interface)
- `public/css/app.css` - Main stylesheet with CSS custom properties and RTL support
- **Legacy Pages** (maintained for backward compatibility):
  - `public/login.html` - Traditional authentication page
  - `public/upload.html` - Standalone upload interface  
  - `public/dashboard.html` - Admin dashboard with Google Maps

### JavaScript Modules (ES6)
- `public/js/ui.js` - Navigation, toasts, status updates
- `public/js/camera.js` - Video stream processing and real-time detection
- `public/js/map.js` - Leaflet maps with hazard markers
- `public/js/reports.js` - Report CRUD operations and local storage
- `public/js/settings.js` - User preferences and system configuration
- `public/js/storage.js` - IndexedDB/localStorage abstraction
- `public/js/utils.js` - Shared API functions and detection utilities
- **Legacy modules**:
  - `public/js/upload.js` - File upload with dual API/local inference
  - `public/js/dashboard.js` - Google Maps integration for admin dashboard
  - `public/js/yolo_tfjs.js` - ONNX Runtime Web inference utilities

### AI/ML Components
- `public/object_detecion_model/best-11-8-2025.onnx` - Current production model
- `public/object_detecion_model/` - All model files and training data
- `public/ort/` - ONNX Runtime Web distribution files

## API Endpoints

### Authentication
- `GET /auth/google` - Google OAuth login
- `POST /register` - User registration  
- `POST /login` - User login
- `POST /forgot-password` - Password reset email
- `POST /reset-password` - Password reset with token
- `GET /logout` - User logout

### Reports Management
- `POST /api/reports` - Create new hazard report
- `GET /api/reports` - Fetch reports with filtering
- `GET /api/reports/:id` - Get specific report
- `PATCH /api/reports/:id` - Update report
- `PATCH /api/reports/:id/status` - Update report status
- `DELETE /api/reports/:id` - Delete report

### File Upload & Detection
- `POST /upload-detection` - Upload image with hazard detection (legacy backend)
- `POST https://hazard-detection-production-8735.up.railway.app/api/v1/detect` - Primary cloud inference API

## Application Features

### Core User Flows
1. **Real-time Camera Detection**: Live video stream with overlay detection results
2. **Photo Upload Analysis**: File upload with dual cloud/local inference
3. **Interactive Mapping**: Leaflet-based maps with hazard markers and clustering
4. **Offline Report Storage**: Local persistence with sync capabilities
5. **Settings Management**: User preferences for detection sensitivity and data sources

### Hazard Types Detected
- בור (Pothole)
- במפר (Speed Bump) 
- ביוב (Manhole)
- Additional types configured in model training data

## Data Models

### Report Structure
```javascript
{
  id: timestamp,
  type: "hazard types comma-separated",
  location: "geocoded address", 
  time: "ISO timestamp",
  image: "cloudinary URL",
  status: "New|In Progress|Resolved",
  locationNote: "GPS|Manual",
  reportedBy: "username",
  createdAt: "ISO timestamp"
}
```

### User Structure  
```javascript
{
  email: "user@example.com",
  username: "display name",
  password: "hashed password", // only for non-Google users
  type: "user"
}
```

## Security Considerations
- All sensitive routes require authentication
- Session-based authentication with Redis storage
- CORS configured for specific origins
- Password validation for traditional auth
- Secure headers (COOP/COEP) for SharedArrayBuffer support
- Input validation on all endpoints

## Development Patterns

### JavaScript Module Architecture
The application uses ES6 modules with dependency injection patterns:
```javascript
// Import shared utilities
import {getSystemStatus, submitReport} from './utils.js';
import {showToast} from './ui.js';

// Export functions for other modules
export function processDetection(results) { /* ... */ }
```

### Dual Inference Strategy
The system implements a resilient inference pattern:
1. **Attempt cloud API** for fast, accurate results
2. **Fallback to local ONNX** if network fails
3. **User notification** about detection source
4. **Offline persistence** for later sync

### State Management
- **No framework**: Vanilla JavaScript with module patterns
- **Local storage**: For settings and offline reports
- **DOM updates**: Direct manipulation with helper functions
- **Navigation**: Hash-based routing for SPA sections

## ML Model Information
- **Current Model**: `best-11-8-2025.onnx` (updated January 2025)
- **Architecture**: YOLO-based road damage detection
- **Input**: 640x640 RGB images
- **Inference**: Dual-mode (cloud API + local ONNX Runtime Web)
- **Training Data**: Located in `public/object_detecion_model/patchs-2/`
- **Model Formats**: ONNX (production), PyTorch (.pt for training), OpenVINO

## Internationalization
- **Primary Language**: English
- **Secondary Language**: Hebrew (עברית) with RTL support
- **Text Direction**: LTR primary, RTL for Hebrew interface
- **UI Labels**: English primary with Hebrew localization
- **Status Messages**: English system status and notifications