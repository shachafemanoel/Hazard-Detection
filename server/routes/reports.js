import express from 'express';
import { createClient } from 'redis';
import { v2 as cloudinary } from 'cloudinary';
import { geocode } from '../services/geocoding.js';

const router = express.Router();

// Geocoding endpoint
router.get('/api/geocode', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ error: 'Address is required' });
  }

  try {
    const result = await geocode(address);
    if (!result) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('Geocoding error:', error);
    res.status(500).json({ error: 'Geocoding failed' });
  }
});

// Redis client setup
const client = createClient({
  username: process.env.REDIS_USERNAME || 'default',
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

await client.connect();

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper function to generate Cloudinary URLs with transformations
function getCloudinaryUrls(publicId) {
  if (!publicId) return { thumbUrl: null, imageUrl: null };
  
  return {
    thumbUrl: cloudinary.url(publicId, {
      transformation: [
        { fetch_format: 'auto', quality: 'auto' },
        { crop: 'fill', width: 240, height: 160 }
      ]
    }),
    imageUrl: cloudinary.url(publicId, {
      transformation: [
        { fetch_format: 'auto', quality: 'auto' },
        { width: 1200, crop: 'limit' }
      ]
    })
  };
}

// Get paginated reports with cursor
router.get('/api/reports', async (req, res) => {
  try {
    const {
      cursor = '*',
      limit = 100,
      status,
      type,
      since
    } = req.query;

    // Build SCAN pattern based on filters
    let pattern = 'report:*';
    let count = 0;
    const reports = [];
    
    for await (const key of client.scanIterator({
      MATCH: pattern,
      COUNT: parseInt(limit)
    })) {
      if (count >= limit) break;
      
      const report = await client.json.get(key);
      if (!report) continue;

      // Apply filters
      if (status && report.status !== status) continue;
      if (type && report.type !== type) continue;
      if (since && new Date(report.createdAt) < new Date(since)) continue;

      // Generate Cloudinary URLs
      if (report.image) {
        const urls = getCloudinaryUrls(report.image);
        report.thumbUrl = urls.thumbUrl;
        report.imageUrl = urls.imageUrl;
      }

      reports.push(report);
      count++;
    }

    // Get total count for stats
    const totalKeys = await client.keys('report:*');
    
    res.json({
      items: reports,
      nextCursor: count >= limit ? reports[reports.length - 1].id : null,
      total: totalKeys.length
    });

  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// SSE endpoint for real-time updates
router.get('/api/reports/stream', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send('Unauthorized');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Subscribe to Redis report updates
  const subscriber = client.duplicate();
  subscriber.connect().then(() => {
    subscriber.subscribe('report:updates', (message) => {
      try {
        const report = JSON.parse(message);
        if (report.image) {
          const urls = getCloudinaryUrls(report.image);
          report.thumbUrl = urls.thumbUrl;
          report.imageUrl = urls.imageUrl;
        }
        sendEvent(report);
      } catch (error) {
        console.error('Error processing SSE message:', error);
      }
    });
  });

  req.on('close', () => {
    subscriber.unsubscribe('report:updates');
    subscriber.quit();
    res.end();
  });
});

// Health check endpoint
router.get('/api/health', async (req, res) => {
  try {
    // Check Redis connection
    const ping = await client.ping();
    if (ping !== 'PONG') {
      throw new Error('Redis connection failed');
    }

    // Check Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || 
        !process.env.CLOUDINARY_API_KEY || 
        !process.env.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary configuration missing');
    }

    res.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        redis: 'connected',
        cloudinary: 'configured'
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
