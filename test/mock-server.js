import express from 'express';
import multer from 'multer';

class MockHazardDetectionServer {
  constructor(port = 0) {
    this.app = express();
    this.port = port;
    this.server = null;
    this.sessions = new Map();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(multer().single('file'));
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        model_status: 'loaded',
        backend: 'mock',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // Start session
    this.app.post('/session/start', (req, res) => {
      const sessionId = `mock-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      this.sessions.set(sessionId, {
        id: sessionId,
        started: new Date().toISOString(),
        detectionCount: 0,
        detections: []
      });

      console.log(`📍 Session started: ${sessionId}`);
      
      res.json({
        session_id: sessionId,
        message: 'Session started successfully'
      });
    });

    // Detection endpoint
    this.app.post('/detect/:sessionId', (req, res) => {
      const { sessionId } = req.params;
      const session = this.sessions.get(sessionId);

      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          detail: `Session ${sessionId} does not exist`
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'No file provided',
          detail: 'Image file is required for detection'
        });
      }

      // Simulate processing delay
      const processingDelay = Math.random() * 500 + 100; // 100-600ms
      
      setTimeout(() => {
        session.detectionCount++;
        
        // Generate mock detections
        const mockDetections = this.generateMockDetections();
        session.detections.push(...mockDetections);

        console.log(`🎯 Detection ${session.detectionCount} for session ${sessionId}: ${mockDetections.length} hazards found`);

        res.json({
          success: true,
          session_id: sessionId,
          detections: mockDetections,
          processing_time_ms: Math.round(processingDelay),
          image_size: req.file.size,
          timestamp: new Date().toISOString()
        });
      }, processingDelay);
    });

    // End session
    this.app.post('/session/:sessionId/end', (req, res) => {
      const { sessionId } = req.params;
      const session = this.sessions.get(sessionId);

      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          detail: `Session ${sessionId} does not exist`
        });
      }

      const summary = {
        session_id: sessionId,
        total_detections: session.detectionCount,
        unique_hazards: session.detections.length,
        duration_ms: Date.now() - new Date(session.started).getTime(),
        ended: new Date().toISOString()
      };

      this.sessions.delete(sessionId);
      console.log(`✅ Session ended: ${sessionId}, ${summary.total_detections} detections processed`);

      res.json({
        message: 'Session ended successfully',
        summary
      });
    });

    // Session summary (optional)
    this.app.get('/session/:sessionId/summary', (req, res) => {
      const { sessionId } = req.params;
      const session = this.sessions.get(sessionId);

      if (!session) {
        return res.status(404).json({
          error: 'Session not found'
        });
      }

      res.json({
        session_id: sessionId,
        started: session.started,
        detection_count: session.detectionCount,
        detections: session.detections
      });
    });

    // Catch-all for unknown routes
    this.app.all('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        detail: `${req.method} ${req.path} is not supported`
      });
    });
  }

  generateMockDetections() {
    const hazardTypes = [
      'pothole', 'crack', 'knocked_surfaces', 'surface_damage',
      'longitudinal_crack', 'transverse_crack', 'block_crack',
      'alligator_crack', 'patch', 'utility_cut'
    ];

    const numDetections = Math.floor(Math.random() * 3); // 0-2 detections
    const detections = [];

    for (let i = 0; i < numDetections; i++) {
      detections.push({
        class_name: hazardTypes[Math.floor(Math.random() * hazardTypes.length)],
        confidence: 0.5 + Math.random() * 0.5, // 0.5-1.0
        bbox: [
          Math.floor(Math.random() * 200), // x1
          Math.floor(Math.random() * 200), // y1
          Math.floor(Math.random() * 200) + 200, // x2
          Math.floor(Math.random() * 200) + 200  // y2
        ],
        center_x: Math.random() * 640,
        center_y: Math.random() * 480
      });
    }

    return detections;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (err) => {
        if (err) {
          reject(err);
        } else {
          this.port = this.server.address().port;
          console.log(`🚀 Mock Hazard Detection Server running on port ${this.port}`);
          console.log(`   Health: http://localhost:${this.port}/health`);
          resolve({
            port: this.port,
            url: `http://localhost:${this.port}`
          });
        }
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 Mock server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getStats() {
    return {
      activeSessions: this.sessions.size,
      port: this.port,
      uptime: this.server ? process.uptime() : 0
    };
  }
}

// CLI usage
const isDirectRun = import.meta.url.endsWith(process.argv[1]);
if (isDirectRun) {
  const port = process.argv[2] ? parseInt(process.argv[2]) : 8080;
  const server = new MockHazardDetectionServer(port);
  
  server.start()
    .then(({ port, url }) => {
      console.log(`Mock server started successfully at ${url}`);
      console.log('Press Ctrl+C to stop');
    })
    .catch(err => {
      console.error('Failed to start mock server:', err);
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down mock server...');
    await server.stop();
    process.exit(0);
  });
}

export default MockHazardDetectionServer;