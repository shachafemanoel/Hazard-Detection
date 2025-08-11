
import { createClient } from 'redis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ES Modules __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file in the root directory
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('Loaded environment from', envPath);
} else {
  dotenv.config();
  console.log('Loaded environment from process.env');
}

let client = null;
let redisConnected = false;

const redisUrl = process.env.REDIS_URL || (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`: null);

if (!redisUrl) {
    console.warn('REDIS_URL is not set. Redis is disabled.');
    client = null;
    redisConnected = false;
} else {
    const opts = { url: redisUrl };
    if (redisUrl.startsWith('rediss://')) {
        opts.socket = { tls: true, rejectUnauthorized: false };
    }

    client = createClient(opts);

    client.on('error', (err) => {
        console.error('Redis Client Error', err);
        redisConnected = false;
    });

    client.on('end', () => {
        console.log('Redis connection ended');
        redisConnected = false;
    });

    client.connect()
        .then(() => {
            redisConnected = true;
            console.log('✅ Connected to Redis');
        })
        .catch(err => {
            redisConnected = false;
            console.error('🔥 Failed to connect to Redis:', err);
        });
}

export const redisClient = client;
export const isRedisConnected = () => redisConnected && client && client.isOpen;
