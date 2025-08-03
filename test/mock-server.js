const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const upload = multer();

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.post('/session/start', (req, res) => {
  res.json({ session_id: uuidv4() });
});

app.post('/detect/:sessionId', upload.single('file'), (req, res) => {
  res.json({
    success: true,
    detections: [{
      class_name: 'pothole',
      confidence: 0.9
    }]
  });
});

app.post('/session/:sessionId/end', (req, res) => {
  res.json({});
});

const server = app.listen(8080, () => {
  console.log('Mock server listening on port 8080');
});

module.exports = server;
