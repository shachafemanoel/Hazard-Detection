# Realtime Hazard Detection Client

A private-first realtime client for the Hazard Detection API with automatic fallback to public networks.

## Features

- 🔒 **Private-First Connectivity**: Automatically detects and prefers private network endpoints
- 🌐 **Public Fallback**: Seamless fallback to public endpoints when private is unavailable
- ⚡ **Session Management**: Robust session lifecycle with proper cleanup
- 🔄 **Auto-Retry**: Smart retry logic with exponential backoff
- 📊 **Status Monitoring**: Real-time connection status updates
- 🧪 **Comprehensive Testing**: Unit tests, integration tests, and mock server
- 📝 **Structured Logging**: Secure logging without exposing sensitive data

## Client Specification

Based on the [Hazard Detection API](https://github.com/shachafemanoel/hazard-detection-api-):

### Transport Protocol
- **HTTP POST** with multipart form-data for image uploads
- Polling-based detection (not WebSocket or SSE)
- Session-based communication flow

### Endpoints
- `POST /session/start` - Initialize detection session
- `POST /detect/{session_id}` - Upload image for hazard detection  
- `POST /session/{session_id}/end` - Terminate session
- `GET /health` - Service health check

### Message Schemas

**Session Start Response:**
```json
{
  "session_id": "string",
  "message": "Session started successfully"
}
```

**Detection Response:**
```json
{
  "success": true,
  "session_id": "string",
  "detections": [
    {
      "class_name": "pothole",
      "confidence": 0.85,
      "bbox": [x1, y1, x2, y2],
      "center_x": 320.5,
      "center_y": 240.0
    }
  ],
  "processing_time_ms": 250,
  "timestamp": "2025-01-01T12:00:00Z"
}
```

## Installation

The client is already included in this project. Required dependencies:
- `axios` - HTTP client
- `form-data` - Multipart form handling

## Configuration

Configure via environment variables:

```bash
# Network Endpoints
HAZARD_API_URL_PRIVATE=http://ideal-learning.railway.internal:8080
HAZARD_API_URL_PUBLIC=https://hazard-api-production-production.up.railway.app

# Network Selection
HAZARD_USE_PRIVATE=auto    # auto | true | false

# Client Timeouts
REALTIME_TIMEOUT_MS=30000
REALTIME_MAX_RETRIES=5
REALTIME_BACKOFF_MS=500
REALTIME_HEARTBEAT_MS=0    # Not used (HTTP-based)

# Authentication (if required)
REALTIME_AUTH_TOKEN=       # Bearer token if needed
```

## Usage

### Basic Usage

```javascript
const { createRealtimeClient } = require('./lib/realtimeClient');

const client = createRealtimeClient({
  timeout: 30000,
  maxRetries: 3
});

// Set up event listeners
client.onMessage((data) => {
  console.log('Detections:', data.detections);
});

client.onError((error) => {
  console.error('Error:', error.message);
});

client.onStatus((status) => {
  console.log('Status:', status);
});

// Connect and send data
await client.connect();

// Send image for detection
const imageBuffer = fs.readFileSync('road-image.jpg');
await client.send({
  buffer: imageBuffer,
  filename: 'road-image.jpg',
  contentType: 'image/jpeg'
});

// Clean up
await client.disconnect();
```

### Private-First Network Selection

The client automatically selects the best available endpoint:

1. **Probe private endpoint** (`HAZARD_API_URL_PRIVATE`) with 2s timeout
2. **If healthy**, use private network (logs: `🔒 Private network selected`)
3. **If unhealthy**, fallback to public (`🌐 Public network selected`)
4. **If both fail**, throw error

Override with `HAZARD_USE_PRIVATE`:
- `true` - Force private (no probing)
- `false` - Force public (no probing)  
- `auto` - Smart selection (default)

## API Reference

### `createRealtimeClient(config)`

Creates a new realtime client instance.

**Parameters:**
- `config.authToken` - Optional Bearer token
- `config.timeout` - Request timeout in ms (default: 30000)
- `config.maxRetries` - Max retry attempts (default: 5)
- `config.backoffMs` - Retry backoff in ms (default: 500)

**Returns:** Client instance with methods:

#### `client.connect()`
Establishes connection and starts session.

#### `client.disconnect()`
Ends session and cleans up resources.

#### `client.send(payload)`
Sends image for detection. Payload can be:
- `Buffer` - Raw image data
- `{ buffer, filename, contentType }` - Structured payload

#### `client.onMessage(callback)`
Listen for detection results.

#### `client.onError(callback)` 
Listen for errors.

#### `client.onStatus(callback)`
Listen for status changes: `connecting | connected | uploading | disconnected`

#### `client.isConnected()`
Returns current connection state.

## Testing

### Run All Tests
```bash
npm test                    # Unit tests only
node test/run-tests.js      # Full test suite with mock server
```

### Verification Script
```bash
npm run stream:check        # Test against live API
```

### Unit Tests
- URL resolution and private/public failover
- Header injection and authentication
- Retry/backoff behavior  
- Error handling and edge cases

### Integration Tests
- End-to-end flow with mock server
- Session lifecycle management
- Network connectivity scenarios

## Example Logs

### Private Network Selection
```
🔧 Private network forced via config
🔄 POST http://ideal-learning.railway.internal:8080/session/start
📊 Status changed: connecting
📊 Status changed: connected
✅ Session started: session-123
🔄 POST http://ideal-learning.railway.internal:8080/detect/session-123
⚡ Detection completed in 245ms
```

### Public Fallback
```
🌐 Public network selected
🔄 POST https://hazard-api-production-production.up.railway.app/session/start
📊 Status changed: connecting  
📊 Status changed: connected
✅ Session started: session-456
```

### Error Handling
```
❌ Detection failed after 2150ms: timeout of 2000ms exceeded
🔄 Retry 1/3 in 500ms
⚡ Detection completed in 180ms (retry successful)
```

## Security

- No sensitive data logged (tokens, full payloads)
- Automatic SSL certificate validation
- Request signing support (when implemented)
- Secure timeout handling

## Development

### Adding New Features
1. Update `lib/realtimeClient.js`
2. Add tests in `test/test-apiClient.js`
3. Update documentation
4. Run test suite: `node test/run-tests.js`

### Mock Server
For local development:
```bash
node test/mock-server.js 8080
```

### Environment Configuration
Create `.env` file:
```bash
HAZARD_API_URL_PRIVATE=http://localhost:8080
HAZARD_USE_PRIVATE=true
REALTIME_TIMEOUT_MS=10000
```

## Troubleshooting

### Connection Issues
- Check network connectivity: `npm run stream:check`
- Verify endpoint health: `curl $HAZARD_API_URL_PUBLIC/health`
- Review logs for network selection

### Performance Issues  
- Increase `REALTIME_TIMEOUT_MS` for slow networks
- Adjust `REALTIME_MAX_RETRIES` for unstable connections
- Monitor processing times in logs

### Authentication Errors
- Verify `REALTIME_AUTH_TOKEN` if using authentication
- Check token expiration and permissions

## Contributing

1. Fork repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass: `node test/run-tests.js`
5. Submit pull request

## License

ISC License (same as parent project)