import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

const app = express();
app.use(cors());

let sseClient = null;

// --- Mock Endpoints ---

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.post('/api/v1/session/start', (req, res) => {
  res.status(200).json({ session_id: 'mock-session-123' });
});

app.post('/api/v1/detect/:sessionId', (req, res) => {
  res.status(200).json({
    detections: [{
      bbox: [0, 0, 10, 10],
      class_name: 'pothole',
      confidence: 0.9,
      is_new: true,
    }],
  });
});

app.get('/api/config', (req, res) => {
  res.status(200).json({
    HAZARD_API_URL_PRIVATE: 'http://localhost:8081/api/v1', // Mock server itself
    HAZARD_API_URL_PUBLIC: 'http://localhost:8081/api/v1',
    HAZARD_USE_PRIVATE: 'auto',
    REALTIME_MAX_RETRIES: 3,
    REALTIME_BACKOFF_MS: 100,
  });
});

app.get('/api/events/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();

  sseClient = res;
  console.log('[Mock Server] SSE client connected.');

  // Send a few messages
  setTimeout(() => sendSseMessage({ type: 'greeting', message: 'Welcome!' }), 100);
  setTimeout(() => sendSseMessage({ type: 'update', message: 'Status normal.' }), 200);
  setTimeout(() => sendSseMessage({ type: 'update', message: 'All systems go.' }), 300);

  req.on('close', () => {
    console.log('[Mock Server] SSE client disconnected.');
    sseClient = null;
  });
});

function sendSseMessage(data) {
  if (sseClient) {
    sseClient.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

// --- Server Setup ---

const server = createServer(app);

export function startMockServer(port = 8081) {
  return new Promise(resolve => {
    server.listen(port, () => {
      console.log(`[Mock Server] Listening on http://localhost:${port}`);
      resolve(server);
    });
  });
}

export function stopMockServer() {
  return new Promise(resolve => {
    server.close(() => {
        console.log('[Mock Server] Stopped.');
        resolve();
    });
  });
}

// Allow running this file directly to start the server
if (process.argv[1].endsWith('mock-server.js')) {
    startMockServer();
}
