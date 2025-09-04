import fetch from 'node-fetch';
import { createClient } from 'redis';

const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days
const NOMINATIM_DELAY = 1000; // 1 second between requests
let lastRequestTime = 0;

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

async function geocode(address) {
  try {
    // Check cache first
    const cacheKey = `geocode:${address}`;
    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < NOMINATIM_DELAY) {
      await new Promise(resolve => setTimeout(resolve, NOMINATIM_DELAY - timeSinceLastRequest));
    }
    lastRequestTime = Date.now();

    // Make request to Nominatim
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RoadGuardian/1.0 (https://hazard-detection.onrender.com)'
      }
    });

    if (!response.ok) {
      throw new Error(`Geocoding failed with status: ${response.status}`);
    }

    const data = await response.json();
    if (data.length === 0) {
      return null;
    }

    const result = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name
    };

    // Cache the result
    await client.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));

    return result;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export { geocode };
