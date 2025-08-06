import express from 'express';
import multer from 'multer';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  setApiUrl,
  checkHealth,
  startSession,
  detectHazards,
  getReportImage,
  getReportPlot,
} from '../public/js/apiClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server;
let baseUrl;

beforeAll(() => {
  const app = express();
  const upload = multer();

  app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
  });

  app.post('/session/start', (req, res) => {
    res.json({ session_id: 'test-session' });
  });

  app.post('/detect/:sessionId', upload.single('file'), (req, res) => {
    const sid = req.params.sessionId;
    if (sid === '400') return res.status(400).send('Bad Request – check file upload');
    if (sid === '404') return res.status(404).send('Endpoint Not Found');
    if (sid === '405') return res.status(405).send('Method Not Allowed');
    res.json({
      detections: [{ class_name: 'crack', confidence: 0.9, bbox: [1, 2, 3, 4] }],
      report_id: 'r1',
    });
  });
  app.get('/detect/:sessionId', (req, res) => {
    res.status(405).send('Method Not Allowed');
  });

  const imgPath = path.join(__dirname, '../scripts/sample-image.png');
  const imgBuffer = fs.readFileSync(imgPath);

  app.get('/session/:sessionId/report/:reportId/image', (req, res) => {
    res.set('Content-Type', 'image/jpeg');
    res.send(imgBuffer);
  });

  app.get('/session/:sessionId/report/:reportId/plot', (req, res) => {
    res.set('Content-Type', 'image/jpeg');
    res.send(imgBuffer);
  });

  server = http.createServer(app);
  return new Promise(resolve => {
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      setApiUrl(baseUrl);
      resolve();
    });
  });
});

afterAll(() => {
  return new Promise(resolve => server.close(resolve));
});

test('health endpoint', async () => {
  const result = await checkHealth();
  expect(result.status).toBe('healthy');
});

test('session start returns id', async () => {
  const id = await startSession();
  expect(id).toBe('test-session');
});

test('detect hazards returns detections array', async () => {
  const id = await startSession();
  const imgPath = path.join(__dirname, '../scripts/sample-image.png');
  const buffer = fs.readFileSync(imgPath);
  const blob = new Blob([buffer]);
  const result = await detectHazards(id, blob);
  expect(Array.isArray(result.detections)).toBe(true);
});

test('fetch report image and plot', async () => {
  const img = await getReportImage('test-session', 'r1');
  expect(img.byteLength).toBeGreaterThan(0);
  const plot = await getReportPlot('test-session', 'r1');
  expect(plot.byteLength).toBeGreaterThan(0);
});

test('detect hazards handles error codes', async () => {
  const imgPath = path.join(__dirname, '../scripts/sample-image.png');
  const buffer = fs.readFileSync(imgPath);
  const blob = new Blob([buffer]);
  await expect(detectHazards('400', blob)).rejects.toThrow('Bad Request');
  await expect(detectHazards('404', blob)).rejects.toThrow('Endpoint Not Found');
  await expect(detectHazards('405', blob)).rejects.toThrow('Method Not Allowed');
});
