# Enhanced Backend Inference with Object Tracking & Session Management

This system implements an advanced hybrid inference approach with object tracking, report generation, and session management. The frontend prioritizes enhanced backend inference, falls back to legacy backend, and finally to local ONNX inference when unavailable.

## Architecture

```
Frontend Camera → Try Backend API → Success: Use Backend Results
                                  ↓
                                  Fail: Use Local ONNX Model
```

## Features

### 🔥 NEW: Enhanced Backend Features
- ✅ **Object Tracking**: Prevents duplicate reports using spatial & temporal tracking
- ✅ **Session Management**: Organizes detections into trackable sessions
- ✅ **Smart Reporting**: Generates unique reports for high-confidence detections
- ✅ **Report Review**: User can confirm/dismiss reports at session end
- ✅ **Duplicate Prevention**: 50px distance + 2-second time threshold
- ✅ **Session Statistics**: Real-time tracking of unique hazards and pending reports

### 🎯 Core Detection Features
- ✅ **Multi-tier Inference**: Enhanced backend → Legacy backend → Local ONNX
- ✅ **Automatic Fallback**: Seamlessly switches between inference modes
- ✅ **Real-time Health Monitoring**: Periodic backend availability checks
- ✅ **Enhanced Visual Indicators**: Orange (session), Cyan (legacy backend), Green (frontend)
- ✅ **Performance Metrics**: Shows inference mode and processing times
- ✅ **Manual Toggle**: Ctrl+I to switch between inference modes for testing

## Backend Setup

### 1. Install Python Dependencies

```bash
cd server/
pip install fastapi uvicorn ultralytics pillow numpy
```

### 2. Start Backend Server

```bash
# Option 1: Using the startup script
python start_backend.py

# Option 2: Direct uvicorn command
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Verify Backend is Running

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "model_status": "loaded",
  "backend_inference": true
}
```

## Frontend Configuration

The frontend automatically detects and connects to the backend at `http://localhost:8000`. Key configuration variables in `upload_tf.js`:

```javascript
let backendUrl = 'http://localhost:8000';
let useBackendInference = true;
let backendCheckInterval = 30000; // 30 seconds
```

## API Endpoints

### Health Check
```
GET /health
```
Returns backend status, model readiness, and active session count.

### 🆕 Session Management
```
POST /session/start
```
Starts a new detection session for tracking unique hazards.

```
GET /session/{session_id}/summary
```
Get current session statistics and reports.

```
POST /session/{session_id}/end
```
End session and return complete summary with all reports.

### 🆕 Enhanced Detection (Session-based)
```
POST /detect/{session_id}
Content-Type: multipart/form-data
Body: file (image)
```

Returns enhanced response with tracking:
```json
{
  "success": true,
  "detections": [
    {
      "bbox": [x1, y1, x2, y2],
      "confidence": 0.85,
      "class_name": "crack",
      "is_new": true,
      "report_id": "uuid-here"
    }
  ],
  "new_reports": [{"report_id": "...", "detection": {...}}],
  "session_stats": {
    "total_detections": 15,
    "unique_hazards": 3,
    "pending_reports": 2
  },
  "processing_time_ms": 150
}
```

### 🆕 Report Management
```
POST /session/{session_id}/report/{report_id}/confirm
POST /session/{session_id}/report/{report_id}/dismiss
```
Confirm or dismiss specific reports for submission.

### Legacy Detection (Backward Compatible)
```
POST /detect
Content-Type: multipart/form-data
Body: file (image)
```
Original endpoint for compatibility with existing clients.

### Batch Detection
```
POST /detect-batch
Content-Type: multipart/form-data
Body: files[] (multiple images)
```

## How It Works

### 1. Enhanced System Initialization

1. Frontend attempts to connect to enhanced backend at startup
2. If enhanced backend available: Starts detection session
3. If enhanced backend fails: Falls back to legacy backend endpoint
4. If all backend modes fail: Loads local ONNX model as final fallback

### 2. Session-Based Detection Flow

- **Session Start**: Creates unique session ID for tracking
- **Object Tracking**: Monitors spatial proximity (50px) and temporal proximity (2s)
- **Smart Reporting**: Generates reports only for new, high-confidence detections (≥60%)
- **Real-time Stats**: Updates session statistics with each detection
- **Session End**: Presents summary with all reports for user review

### 3. Multi-tier Runtime Behavior

- **Enhanced Backend**: Full session management + object tracking + smart reporting
- **Legacy Backend**: Simple detection without session features
- **Frontend Mode**: Local ONNX processing when backend unavailable
- **Health Monitoring**: Checks backend every 30 seconds
- **Automatic Failover**: Graceful degradation through inference tiers

### 4. Enhanced Visual Indicators

- **Session Mode**: Orange bounding boxes with `[Session]` label (thicker border)
- **Legacy Backend**: Cyan bounding boxes with standard styling
- **Frontend Mode**: Green bounding boxes with `[frontend]` label
- **Status Display**: Shows session ID and mode in connection status
- **Performance Panel**: Enhanced with session statistics and tracking info

## Benefits

### 🆕 Enhanced Backend with Session Management
- ✅ **Eliminates Duplicate Reports**: Smart tracking prevents redundant hazard reports
- ✅ **Organized Detection Sessions**: Groups related detections for better analysis
- ✅ **User Control**: Review and approve reports before submission
- ✅ **Better Accuracy**: Server-side YOLO with intelligent post-processing
- ✅ **Real-time Statistics**: Live tracking of unique hazards and session progress
- ✅ **Scalable Architecture**: Session-based design supports multiple concurrent users

### 🎯 Core Backend Benefits
- ✅ Higher accuracy (full YOLO model vs optimized ONNX)
- ✅ Better GPU utilization on server
- ✅ Reduced client-side resource usage
- ✅ Centralized model updates
- ✅ Multiple fallback tiers for reliability

### 💻 Frontend Fallback Benefits
- ✅ Works offline without internet
- ✅ No server dependency
- ✅ Lower latency (no network calls)
- ✅ Privacy (no data sent to server)
- ✅ Seamless transition when backend unavailable

## Testing

### Test Enhanced Backend Mode
1. Start the backend server: `python server/start_backend.py`
2. Open the camera interface
3. Verify status shows "Backend Inference Active | Session: xxxxx..."
4. Detections should have **orange** bounding boxes with `[Session]` labels
5. Watch for "New hazard detected" notifications
6. Stop detection to see session summary with report review

### Test Legacy Backend Fallback
1. Use the legacy `/detect` endpoint directly or disable session features
2. Detections should have **cyan** bounding boxes
3. No session management or report generation

### Test Frontend Fallback
1. Stop the backend server (Ctrl+C)
2. Refresh the camera interface
3. Verify status shows "Frontend Inference (Offline Mode)"
4. Detections should have **green** bounding boxes

### Manual Toggle & Testing
- Press `Ctrl+I` to manually switch between inference modes
- Test object tracking by moving objects slowly vs quickly
- Verify duplicate prevention with repeated detections
- Check session statistics update in real-time

## Troubleshooting

### Backend Won't Start
- Check if model file exists: `server/best.pt` (pulled from Git LFS)
- Verify Python dependencies: `pip install fastapi uvicorn ultralytics pillow python-multipart`
- Check port 8000 is not in use: `lsof -i :8000`
- Ensure Git LFS files are pulled: `git lfs pull`

### Session Management Issues
- Check session is created: Look for "Detection session started" notification
- Verify session endpoint: `curl -X POST http://localhost:8000/session/start`
- Session not found errors: Restart detection to create new session
- Reports not generated: Ensure detections meet confidence threshold (≥60%)

### Frontend Not Connecting
- Verify enhanced backend: `curl http://localhost:8000/health` (should show `active_sessions: 0`)
- Test session creation: `curl -X POST http://localhost:8000/session/start`
- Check browser console for CORS errors
- Fallback verification: Look for "Using local inference" notifications

### Performance & Tracking Issues
- **Enhanced backend** is typically fastest and most accurate
- **Object tracking**: Adjust `TRACKING_DISTANCE_THRESHOLD` (50px) if needed
- **Duplicate detection**: Modify `TRACKING_TIME_THRESHOLD` (2s) for sensitivity
- **Report threshold**: Change `MIN_CONFIDENCE_FOR_REPORT` (0.6) for more/fewer reports
- Monitor processing times and session stats in the performance panel

## Development

### Adding New Features
1. **Backend**: Add endpoints in `server/app.py` following session pattern
2. **Frontend**: Update `upload_tf.js` with new API integration
3. **UI**: Add session management components and styling
4. **Testing**: Test enhanced → legacy → frontend fallback chain

### Model Updates
1. Replace YOLO model file: `server/best.pt`
2. Update class names in both backend (`class_names` array) and frontend
3. Update confidence thresholds if needed
4. Test object tracking with new classes
5. Restart backend server and verify session functionality

### Session Management Customization
- Modify tracking thresholds in backend configuration
- Customize report review UI in frontend
- Integrate with existing user management systems
- Add custom report fields and metadata
- Implement report export and submission workflows

## Production Deployment

### Enhanced Backend Considerations
- **Session Management**: Implement session cleanup and persistence
- **Database Storage**: Store session data and reports in proper database
- **User Authentication**: Associate sessions with authenticated users
- **Report Workflow**: Integrate with existing hazard reporting systems
- **Analytics**: Track detection accuracy and user report confirmation rates

### Infrastructure Requirements
- **WSGI Server**: Use gunicorn with multiple workers for session handling
- **Load Balancing**: Distribute sessions across backend instances
- **Session Storage**: Redis or database for session state persistence
- **Security**: HTTPS, API authentication, rate limiting
- **Monitoring**: Health checks, session metrics, model performance tracking
- **Scaling**: Auto-scaling based on active sessions and detection load

### Configuration Management
- Environment variables for tracking thresholds
- Database URLs for session/report storage
- Model paths and inference parameters
- CORS policies for production domains
- Logging levels and monitoring endpoints