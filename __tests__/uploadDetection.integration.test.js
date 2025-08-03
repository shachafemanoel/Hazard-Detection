const express = require('express');
const multer = require('multer');
const request = require('supertest');

// Mock cloudinary upload
jest.mock('cloudinary', () => ({
  v2: {
    uploader: {
      upload_stream: jest.fn((opts, cb) => {
        // Return a writable stream mock
        const { Writable } = require('stream');
        const stream = new Writable({
          write(_chunk, _enc, next) { next(); }
        });
        stream.on('finish', () => cb(null, { secure_url: 'http://example.com/image.jpg', public_id: 'abc' }));
        return stream;
      })
    }
  }
}));

function createApp() {
  const app = express();
  const upload = multer();
  app.post('/api/upload-detection', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    return res.json({ success: true, url: 'http://example.com/image.jpg', public_id: 'abc', metadata: {} });
  });
  return app;
}

describe('POST /api/upload-detection', () => {
  test('accepts 2MB payload', async () => {
    const app = createApp();
    const buf = Buffer.alloc(2 * 1024 * 1024); // 2MB
    const res = await request(app)
      .post('/api/upload-detection')
      .attach('image', buf, { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
