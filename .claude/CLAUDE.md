# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a hazard detection system for road infrastructure that combines AI/ML object detection with geolocation mapping and reporting. The system allows users to report road hazards (potholes, cracks, etc.) by uploading photos that are automatically analyzed using YOLO models to identify specific types of road damage.

## Architecture

### Core Components
- **Node.js/Express Backend** (`server/server.js`): Main application server handling authentication, API routes, and Redis data storage
- **Python FastAPI** (`server/app.py`): AI/ML inference service for YOLO object detection running on port 8000
- **Frontend**: Static HTML/CSS/JS files in `public/` directory with dashboard, upload, and camera interfaces
- **Redis**: Session storage and report data persistence
- **AI Models**: YOLO-based road damage detection models in multiple formats (ONNX, PyTorch, TensorFlow)

### Dual AI Inference Architecture
- **Client-side**: ONNX Runtime Web for real-time browser inference (primary)
- **Server-side**: Python FastAPI with PyTorch YOLO models (fallback/batch processing)
- **Model files**: Stored in both `public/object_detecion_model/` and `public/object_detection_model/` directories

### Authentication & Session Management
- Supports both Google OAuth2 and traditional username/password authentication
- Passport.js with Redis session storage
- Session-based authentication for all protected routes

### Data Storage
- Redis for user sessions and report storage using JSON documents
- Reports stored as `report:{id}` keys with structured data including location, hazard types, images, and metadata
- User data stored as `user:{timestamp}` or `user:{googleId}` keys

### AI/ML Pipeline  
- Client-side inference using ONNX Runtime Web (`public/js/yolo_tfjs.js`)
- Server-side Python FastAPI for additional processing capability
- Multiple model formats: ONNX, PyTorch (.pt), TensorFlow Lite
- Detects 11 types of road hazards: Alligator Crack, Block Crack, Construction Joint Crack, Crosswalk Blur, Lane Blur, Longitudinal Crack, Manhole, Patch Repair, Pothole, Transverse Crack, Wheel Mark Crack

### Geolocation & Mapping
- GPS coordinates converted to addresses using Google Maps Geocoding API
- Interactive dashboard with Google Maps integration showing hazard locations
- Heatmap visualization for hazard density

## Development Commands

### Server Development
```bash
# Start development server with auto-reload (watches server/ directory)
npm run dev

# Start production server  
npm start
```

### Python FastAPI Service
```bash
# Run the AI inference service (required for server-side YOLO detection)
cd server
python app.py
# OR with uvicorn directly:
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### CSS Development
```bash
# Build Tailwind CSS (when making style changes)
npx tailwindcss -i ./src/css/input.css -o ./dist/output.css --watch
```

### Testing & Validation
Test framework is configured with Jest:
```bash
# Run tests
npm test

# Check server health
curl http://localhost:3000/api/reports

# Verify AI inference service
curl -X POST http://localhost:8000/detect -F "file=@test_image.jpg"
```

### Environment Setup
Create environment files in the `server/` directory:
- `server/.env` - Development environment variables (loaded by server.js)
- `.env.production` - Production environment variables  
- `.env.model` - Model-specific configuration

Required environment variables:
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` - Image storage
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` - Redis connection
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` - Google OAuth
- `SENDGRID_API_KEY` - Email service for password reset
- `SESSION_SECRET` - Session encryption key
- `PORT` - Server port (defaults to 3000)

**Note**: Environment files must be placed in the `server/` directory as the application loads them from `path.join(__dirname, '.env')`

### Deployment

#### Render.com (Primary)
```bash
# Deploy configuration in render.yaml
# Build: npm install
# Start: npm start
```

#### Local Docker
```bash
# Build Docker image
docker build -t hazard-detection .

# Run container
docker run -p 3000:3000 hazard-detection
```

## Key File Locations

### Backend Services
- `server/server.js` - Main Express application with all API routes
- `server/app.py` - FastAPI service for AI inference
- `server/firebaseAdmin.js` - Firebase admin configuration

### Frontend Pages
- `public/login.html` - Authentication page
- `public/upload.html` - Hazard report upload interface  
- `public/camera.html` - Camera capture interface
- `public/dashboard.html` - Admin dashboard with map view

### AI/ML Components
- `public/object_detecion_model/` - Primary ONNX model files for browser inference (note: intentional typo in directory name)
- `public/object_detection_model/` - PyTorch model files for server-side processing
- `public/js/yolo_tfjs.js` - Client-side AI inference using ONNX Runtime
- `public/ort/` - ONNX Runtime Web distribution files (complete WebAssembly build)
- `server/app.py` - FastAPI service using Ultralytics YOLO for server-side inference

### Styling
- `tailwind.config.js` - Tailwind CSS configuration
- `public/css/` - Component-specific stylesheets

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

### File Upload
- `POST /upload-detection` - Upload image with hazard detection

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

## ML Model Information
- Models trained on road damage dataset with YOLO architecture
- Support for real-time browser inference via ONNX Runtime Web
- Fallback from WebGL to CPU execution providers
- Models located in `public/object_detecion_model/` directory (note: intentional typo in directory name)
- Primary models:
  - Browser: `road_damage_detection_last_version.onnx` 
  - Server: `road_damage_detection_last_version.pt`
- Multiple model versions available for different performance/accuracy tradeoffs

### Python Dependencies
The FastAPI service requires:
- `fastapi` - Web framework
- `ultralytics` - YOLO model inference
- `PIL` (Pillow) - Image processing
- `uvicorn` - ASGI server (for standalone FastAPI deployment)

## Frontend Architecture

### Static File Structure
- `public/` - Static assets served directly by Express
- `public/css/` - Component-specific stylesheets with dark theme support
- `public/js/` - Client-side JavaScript modules
- `src/` - Source files for build process (Tailwind CSS)
- `tests/` - Jest test suite for unit testing

### Key Frontend Features
- Responsive design with mobile-first approach
- Dark theme with custom color palette (see style-guide.md)
- Real-time hazard detection using ONNX Runtime Web
- Interactive Google Maps integration
- Camera capture with geolocation
- Session-based authentication state management
- Error handling and accessibility features

### Cross-Origin Isolation
The application sets specific headers for SharedArrayBuffer support:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
Required for ONNX Runtime Web with WebAssembly threading.

## Development Notes

### Model Directory Naming
**CRITICAL**: `public/object_detecion_model/` contains an intentional typo ("detecion" instead of "detection"). This is hardcoded throughout the application. Do not rename without updating all references in:
- `public/js/yolo_tfjs.js`
- `server/app.py`
- Any configuration files

### Session Management
- Redis-backed sessions with 24-hour expiry
- Development: HTTP cookies with SameSite=lax
- Production: HTTPS cookies with SameSite=none
- Session data includes user info and authentication state

### Image Processing Pipeline
1. Client uploads image via multer (in-memory)
2. Image uploaded to Cloudinary for storage
3. YOLO inference (client-side ONNX or server-side PyTorch)
4. Results stored in Redis with geocoded location
5. Real-time updates to dashboard via JavaScript

### Environment Variables Location
**IMPORTANT**: All environment files must be placed in the `server/` directory:
- `server/.env` (development)
- `server/.env.production` (production)
- `server/.env.model` (model configuration)

The application loads environment variables using `path.join(__dirname, '.env')` from the server directory.

### ONNX Runtime Web Configuration
- Session caching for performance optimization
- Execution provider fallback: WebGL → WebGPU → WASM → CPU
- Warmup tensor for initial model loading
- Support for SharedArrayBuffer and multithreading

### Code Quality & Testing
- Jest configuration in `jest.config.js`
- Babel transpilation for ES modules
- Unit tests for YOLO detection functionality
- Error handling utilities in `public/js/error-handler.js`
- Smoke tests for basic functionality verification