// 📦 External dependencies
import express from 'express';
import session from 'express-session';
import { createRequire } from 'module';

// Some environments bundle different versions of connect-redis. Use createRequire
// so we can support both CommonJS and ESM variants gracefully.
const require = createRequire(import.meta.url);
let RedisStore;
try {
  const pkg = require('connect-redis');
  // Support both CommonJS and ESM exports
  RedisStore = pkg.RedisStore || pkg.default || pkg;
} catch (err) {
  console.warn('⚠️ connect-redis module not found or incompatible:', err.message);
  RedisStore = null;
}

// 🧠 ONNX Runtime logging
try {
  const ort = require('onnxruntime-node');
  console.log('ONNX Runtime:', ort.version);
} catch (err) {
  console.warn('⚠️ ONNX Runtime Node.js not available:', err.message);
}
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import dotenv from 'dotenv';
import { createClient } from 'redis';
import path from 'path';
import { fileURLToPath } from 'url';
import sgMail from '@sendgrid/mail';
import fs from 'fs'; // 👈 הוספת ייבוא של מודול fs
import crypto from 'crypto';
import axios from 'axios';
import FormData from 'form-data';
import cors from 'cors';
import os from 'os'; // מייבאים את המודול os

// 📦 Firebase & Cloudinary
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import streamifier from 'streamifier';
import { uploadReport } from '../services/reportUploadService.js';
const { keys } = Object;

// 🌍 ES Modules __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 📁 Load environment variables
// Ensure environment variables are loaded before any use.
// The project's documentation expects the `.env` file to live at the repo root,
// but this file resides under `server/routes`. Resolve the path accordingly.
const envPath = path.resolve(__dirname, '../../.env');
if (process.env.NODE_ENV !== 'production' && fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('Loaded environment from', envPath);
} else {
  dotenv.config();
  console.log('Loaded environment from process.env');
}

// הדפסה לבדיקת טעינת משתני סביבה
console.log("Attempting to load environment variables...");
if (process.env.DEBUG_ENV === 'true') {
  console.log("CLOUDINARY_CLOUD_NAME from env:", process.env.CLOUDINARY_CLOUD_NAME);
  console.log("GOOGLE_CALLBACK_URL from env:", process.env.GOOGLE_CALLBACK_URL);
  console.log(
    "SESSION_SECRET from env:",
    process.env.SESSION_SECRET ? "Loaded" : "NOT LOADED"
  );
}

// ☁️ Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 🎛️ Setup multer (in-memory uploads)
const upload = multer();

// 🚀 Initialize Express app
const app = express();
const port = process.env.PORT || process.env.WEB_PORT || 3000;

// Simple mode detection (for testing without Redis/complex features)
const isSimpleMode = process.env.SIMPLE_MODE === 'true' || !process.env.REDIS_HOST;
// In-memory store for password reset tokens in simple mode or when Redis/SENDGRID are unavailable
const simpleResetTokens = new Map();

// --- Simple user store (file-based) for environments without Redis ---
const userStorePath = path.resolve(process.cwd(), 'server', 'data', 'users.json');
async function ensureUserStoreDir() {
    const dir = path.dirname(userStorePath);
    try { await fs.promises.mkdir(dir, { recursive: true }); } catch (_) {}
}
async function loadUsers() {
    try {
        const data = await fs.promises.readFile(userStorePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}
async function saveUsers(users) {
    await ensureUserStoreDir();
    await fs.promises.writeFile(userStorePath, JSON.stringify(users, null, 2), 'utf8');
}
async function findUserByEmailSimple(email) {
    const users = await loadUsers();
    return users.find(u => u.email === email) || null;
}
async function createUserSimple({ email, username, password }) {
    const users = await loadUsers();
    if (users.some(u => u.email === email)) {
        return { error: 'User already registered with this email.' };
    }
    const newUser = { id: `user:${Date.now()}`, email, username, password, type: 'user' };
    users.push(newUser);
    await saveUsers(users);
    return { user: newUser };
}
async function updateUserPasswordSimple(email, newPassword) {
    const users = await loadUsers();
    const idx = users.findIndex(u => u.email === email);
    if (idx === -1) return false;
    users[idx].password = newPassword;
    await saveUsers(users);
    return true;
}

// Serving static files from the "public" directory
// Make sure to set index: false to prevent serving index.html by default
app.use(express.static(path.join(__dirname, '../../public'), { 
    index: false,
    extensions: ['html'], // This will allow serving .html files without the extension
    setHeaders: (res, path) => {
        // Set proper MIME types for ML models and WASM files
        if (path.endsWith('.onnx')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        } else if (path.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        } else if (path.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        }
    }
}));

// Specific route for ONNX model files
app.get('/object_detection_model/*.onnx', (req, res) => {
    const modelName = decodeURIComponent(req.params[0]);
    const modelPath = path.resolve(
      process.cwd(),
      'public',
      'object_detection_model',
      `${modelName}.onnx`
    );
    
    console.log(`📂 Requesting ONNX model: ${modelName}.onnx`);
    console.log(`📁 Full path: ${modelPath}`);
    
    // Check if file exists
    if (!require('fs').existsSync(modelPath)) {
        console.log(`❌ Model not found: ${modelPath}`);
        return res.status(404).json({ error: 'Model not found' });
    }
    
    // Set proper headers for ONNX files
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    console.log(`✅ Serving ONNX model: ${modelName}.onnx`);
    res.sendFile(modelPath);
});

app.use((req, res, next) => {
    // Only apply COOP/COEP to specific routes, not to API or map-related pages
    if (!req.path.includes('/dashboard') && 
        !req.path.includes('/api/config/maps-key') && 
        !req.path.includes('/api/v1/') && 
        !req.path.includes('/api/')) {
        res.set({
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Resource-Policy': 'cross-origin'
        });
    } else {
        // For API and map-related routes, use less restrictive headers
        res.set({
            'Cross-Origin-Resource-Policy': 'cross-origin'
        });
    }
    next();
});

/* ───── Core middleware (סדר חשוב!) ───── */
app.use(
    '/ort',
    (req, res, next) => {
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(path.join(__dirname, '../../public/ort'))
  );
  
  /* ───── Core middleware ───── */
  app.use(cors({
    origin: function(origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      // List of allowed origins
      const allowedOrigins = [
        'https://hazard-detection.onrender.com',
        'https://hazard-detection-production.up.railway.app',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
      ];
      
      // Check if the origin is in the allowed list or is Railway/Render URL
      if (allowedOrigins.includes(origin) || origin.includes('.onrender.com') || origin.includes('.railway.app')) {
        return callback(null, true);
      }
      
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 🔗 API URL using private-first networking (Railway internal network)
import { resolveBaseUrl } from '../utils/network.js';

// Determine API URL using private-first resolution with automatic fallback
let API_URL;
try {
  API_URL = await resolveBaseUrl();
  console.log(`🔗 Resolved API URL: ${API_URL}`);
} catch (error) {
  API_URL = 'https://hazard-api-production-production.up.railway.app';
  console.error(`⚠️ Failed to resolve API URL, falling back to public: ${error.message}`);
}

// API request helper function
async function makeApiRequest(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Hazard-Detection-Web/1.0',
            ...options.headers
        },
        timeout: 30000 // 30 second timeout
    };
    
    try {
        const response = await axios({
            url,
            ...defaultOptions,
            ...options
        });
        return response.data;
    } catch (error) {
        console.error(`API request failed: ${url}`, error.message);
        throw new Error(`API service unavailable: ${error.message}`);
    }
}

// API endpoint routes for session-based workflow
app.get('/api/v1/health', async (req, res) => {
    try {
        const result = await makeApiRequest('/health');
        res.json(result);
    } catch (error) {
        // Return a graceful unhealthy status instead of a 502 to avoid
        // triggering platform health check failures when the upstream
        // service is unavailable. This keeps the web server responsive
        // while still conveying the backend issue.
        res.status(200).json({ status: 'unhealthy', error: error.message });
    }
});

// Session management endpoints
app.post('/api/v1/session/start', async (req, res) => {
    try {
        const result = await makeApiRequest('/session/start', {
            method: 'POST'
        });
        res.json(result);
    } catch (error) {
        res.status(502).json({ error: error.message });
    }
});

app.post('/api/v1/session/:sessionId/end', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = await makeApiRequest(`/session/${sessionId}/end`, {
            method: 'POST'
        });
        res.json(result);
    } catch (error) {
        res.status(502).json({ error: error.message });
    }
});

// Session-based detection endpoint
app.post('/api/v1/detect/:sessionId', upload.single('file'), async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Forward file upload to external API with session
        const formData = new FormData();
        if (req.file) {
            formData.append('file', req.file.buffer, {
                filename: req.file.originalname || 'frame.jpg',
                contentType: req.file.mimetype || 'image/jpeg'
            });
        }
        
        const result = await makeApiRequest(`/detect/${sessionId}`, {
            method: 'POST',
            data: formData,
            headers: {
                ...formData.getHeaders(),
            }
        });
        res.json(result);
    } catch (error) {
        res.status(502).json({ error: error.message });
    }
});

// Legacy detection endpoint (for backward compatibility)
app.post('/api/v1/detect', upload.single('file'), async (req, res) => {
    try {
        // Forward file upload to external API
        const formData = new FormData();
        if (req.file) {
            formData.append('file', req.file.buffer, {
                filename: req.file.originalname,
                contentType: req.file.mimetype
            });
        }
        
        const result = await makeApiRequest('/detect', {
            method: 'POST',
            data: formData,
            headers: {
                ...formData.getHeaders(),
            }
        });
        res.json(result);
    } catch (error) {
        res.status(502).json({ error: error.message });
    }
});

// Generic API proxy for other endpoints
app.all('/api/v1/*', async (req, res) => {
    try {
        const endpoint = req.path.replace('/api/v1', '');
        const options = {
            method: req.method,
            params: req.query,
        };
        
        if (req.method !== 'GET' && req.body) {
            options.data = req.body;
        }
        
        const result = await makeApiRequest(endpoint, options);
        res.json(result);
    } catch (error) {
        res.status(502).json({ error: error.message });
    }
});

let client = null;
let redisConnected = false;

if (process.env.REDIS_HOST && process.env.REDIS_PASSWORD && RedisStore) {
    // With modern `connect-redis` (v7+), it's a class, not a factory function.
    // The old pattern `connectRedis(session)` is deprecated.
    client = createClient({
        username: process.env.REDIS_USERNAME || 'default',
        password: process.env.REDIS_PASSWORD,
        socket: {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT) || 6379,
            connectTimeout: 10000
        }
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

    app.use(session({
        store: new RedisStore({ client }),
        secret: process.env.SESSION_SECRET || 'your-secret-key',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        },
        proxy: process.env.NODE_ENV === 'production'
    }));
} else {
    console.log('⚠️ Redis not configured or connect-redis unavailable - using MemoryStore for sessions');
    app.use(session({
        secret: process.env.SESSION_SECRET || 'your-secret-key',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        },
        proxy: process.env.NODE_ENV === 'production'
    }));
}

  app.use(passport.initialize());
  app.use(passport.session());

// 📨 SendGrid API
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn('⚠️ SENDGRID_API_KEY not set - email features disabled');
}

// Helper functions for safe Redis operations
async function safeRedisGet(key) {
  if (!client || !redisConnected) return null;
  try {
    return await client.get(key);
  } catch (err) {
    console.error(`Redis get error for key ${key}:`, err);
    return null;
  }
}

async function safeRedisSet(key, value, options = {}) {
  if (!client || !redisConnected) return false;
  try {
    await client.set(key, value, options);
    return true;
  } catch (err) {
    console.error(`Redis set error for key ${key}:`, err);
    return false;
  }
}

async function safeRedisKeys(pattern) {
  if (!client || !redisConnected) return [];
  try {
    return await client.keys(pattern);
  } catch (err) {
    console.error(`Redis keys error for pattern ${pattern}:`, err);
    return [];
  }
}


passport.serializeUser((user, done) => {
    console.log('[Passport] Serializing user:', user.email);
    done(null, user.email);  // מזהה יחיד
  });
  
  passport.deserializeUser(async (email, done) => {
    console.log('[Passport] Attempting to deserialize user:', email);
    if (!client || !redisConnected || !client.isOpen) {
        console.log("⚠️ Redis not available for user deserialization - using fallback");
        // Fallback: create a minimal user object
        return done(null, { email: email, type: 'user' });
    }
    try {
      const keys = await safeRedisKeys('user:*');
      console.log('[Passport] Found keys for deserialization:', keys.length);
      for (const key of keys) {
        const userStr = await safeRedisGet(key);
        if (userStr) {
            const user = JSON.parse(userStr);
            if (user.email === email) {
              console.log('[Passport] User deserialized successfully:', user.email);
              return done(null, user);
            }
        } else {
            console.warn(`[Passport] No data found for key: ${key}`);
        }
      }
      console.log('[Passport] User not found for deserialization:', email);
      done(null, false);
    } catch (err) {
      console.error("❌ Error in deserializeUser:", err);
      done(err, null);
    }
  });
  

// הגדרת האסטרטגיה של גוגל (רק אם מוגדרים משתני הסביבה הדרושים)
const googleAuthConfigured = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;
if (googleAuthConfigured) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'

    },
    async (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails[0].value;
          const username = profile.displayName;
    
          const googleKey = `user:${googleId}`;
          const googleUser = await client.get(googleKey);
    
          if (googleUser) {
            // קיים משתמש עם גוגל ID → התחברות
            return done(null, JSON.parse(googleUser));
          }
    
          // בדיקה אם מייל כבר קיים אצל משתמש עם timestamp (רישום רגיל)
          const keys = await client.keys('user:*');
          for (const key of keys) {
            if (key === googleKey) continue; // דלג על מפתח הגוגל שכבר בדקנו
            const user = JSON.parse(await client.get(key));
            if (user.email === email) {
              // מייל כבר קיים מרישום רגיל → אל תיצור
              return done(null, false, { message: 'EmailExists' });
            }
          }
    
          // לא קיים בכלל → צור משתמש חדש עם גוגל
          const newUser = {
            email,
            username,
            type: 'user'
          };
          await client.set(googleKey, JSON.stringify(newUser));
    
          return done(null, newUser);
    
        } catch (err) {
          console.error('Google Strategy Error:', err);
          return done(err, null);
        }
      }
    ));

// כפתור התחברות/הרשמה עם Google  
app.get('/auth/google', async (req, res, next) => {  
    const mode = req.query.mode || 'login';  
    req.session.authMode = mode; // נשמור את המצב (login/signup) ב-session  

    // אם המשתמש כבר מחובר, ננתק אותו כדי למנוע בלבול בהרשמה או התחברות חדשה  
    if (req.isAuthenticated()) {  
        req.logout(function(err) {  
            if (err) {  
                console.error('Error during logout:', err);  
                return res.redirect('/login.html?error=LogoutFailed');  
            }  
            req.session.destroy(() => {  
                next(); // נמשיך רק אחרי שה-session נוקתה  
            });  
        });  
    } else {  
        next(); // אם המשתמש לא מחובר, ממשיכים ישירות  
    }  
}, passport.authenticate('google', {  
    scope: ['profile', 'email'],  
    prompt: 'select_account' // מוודא שהמשתמש בוחר חשבון כל פעם  
}));  



// נקודת חזרה לאחר ההתחברות  
app.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', async (err, user, info) => {
        const mode = req.session.authMode || 'login';
        
        if (err) {
            console.error('Google Auth Error:', err);
            return res.redirect('/login.html?error=ServerError');
        }
        
        if (!user) {
            // משתמש לא אותנטי → בדוק אם זה בגלל שהמייל כבר תפוס
            if (info && info.message === 'EmailExists') {
                return res.redirect('/login.html?error=EmailExists');
            }
            return res.redirect('/login.html?error=AuthFailed');
        }
        
        // התחברות או רישום מוצלחים
        req.login(user, async (err) => {
            if (err) {
                console.error('Login Error:', err);
                return res.redirect('/login.html?error=LoginFailed');
            }
            
            req.session.user = { email: user.email, username: user.username };
            
            return res.redirect('/upload.html');
        });
    })(req, res, next);
  });
} else {
  console.warn('⚠️ Google OAuth credentials missing - Google login disabled');
  app.get('/auth/google', (req, res) => {
    res.status(501).send('Google OAuth not configured');
  });
  app.get('/auth/google/callback', (req, res) => {
    res.status(501).send('Google OAuth not configured');
  });
}



// דף העלאת קבצים (Upload)
app.get('/upload', async (req, res) => {
    // Simple mode: serve upload page without authentication
    if (isSimpleMode) {
        return res.sendFile(path.join(__dirname, '../../public/upload.html'));
    }
    
    if (!req.isAuthenticated()) { // שימוש ב-req.isAuthenticated()
        return res.redirect('/'); // אם לא מחובר, מחזירים לדף הבית
    }
    // הצגת דף ה-upload
    res.sendFile(path.join(__dirname, '../../public/upload.html'));
});

// Direct HTML file access
app.get('/upload.html', (req, res) => {
    if (isSimpleMode) {
        return res.sendFile(path.join(__dirname, '../../public/upload.html'));
    }
    
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../../public/upload.html'));
});

app.get('/camera.html', (req, res) => {
    if (isSimpleMode) {
        return res.sendFile(path.join(__dirname, '../../public/camera.html'));
    }
    
    if (!req.isAuthenticated()) { // שימוש ב-req.isAuthenticated()
      return res.redirect('/'); // הפניה לדף הבית (login.html)
    }
    res.sendFile(path.join(__dirname, '../../public/camera.html'));
});

// Camera route without .html extension
app.get('/camera', (req, res) => {
    if (isSimpleMode) {
        return res.sendFile(path.join(__dirname, '../../public/camera.html'));
    }
    
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../../public/camera.html'));
});

// יציאה מהמערכת
app.get('/logout', (req, res) => {
    req.logout(function(err) { // Passport 0.6.0 דורש callback
        if (err) { 
            console.error('Logout error:', err);
            // אפשר להוסיף טיפול בשגיאה, למשל להפנות לדף שגיאה
            return res.redirect('/'); // או לדף אחר מתאים
        }
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error during logout:', err);
            }
            res.redirect('/');
        });
    });
});

// Authentication status endpoint used by the frontend to determine if a
// user session is active. This mirrors the non-API auth routes (login,
// logout) by living at the top level rather than under /api.
app.get('/auth/status', (req, res) => {
    res.json({
        authenticated: req.isAuthenticated(),
        user: req.user || null
    });
});

// Health check endpoint (enhanced with simple mode support)
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
        port: port,
        mode: isSimpleMode ? 'simple' : 'full',
        redis: redisConnected ? 'connected' : 'disconnected'
    });
});

// Test API endpoint (from simple-server)
app.get('/api/test', (req, res) => {
    res.json({
        message: 'API is working!',
        timestamp: new Date().toISOString(),
        mode: isSimpleMode ? 'simple' : 'full'
    });
});

// API configuration endpoint for frontend
app.get('/api/config', (req, res) => {
    const apiUrl = process.env.API_URL || process.env.HAZARD_API_URL || 'https://hazard-api-production-production.up.railway.app';
    // Ensure URL does NOT end with slash for proper endpoint construction in the guide
    const normalizedUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    
    res.json({
        apiUrl: normalizedUrl,
        hasApiService: !!(process.env.API_URL || process.env.HAZARD_API_URL),

        // Real-time client configuration
        HAZARD_API_URL_PRIVATE: process.env.HAZARD_API_URL_PRIVATE || 'http://ideal-learning.railway.internal:8080',
        HAZARD_API_URL_PUBLIC: process.env.HAZARD_API_URL_PUBLIC || 'https://hazard-api-production-production.up.railway.app',
        HAZARD_USE_PRIVATE: process.env.HAZARD_USE_PRIVATE || 'auto',
        REALTIME_TRANSPORT: process.env.REALTIME_TRANSPORT || 'auto',
        REALTIME_AUTH_TOKEN: process.env.REALTIME_AUTH_TOKEN || null,
        REALTIME_TIMEOUT_MS: parseInt(process.env.REALTIME_TIMEOUT_MS, 10) || 30000,
        REALTIME_MAX_RETRIES: parseInt(process.env.REALTIME_MAX_RETRIES, 10) || 5,
        REALTIME_BACKOFF_MS: parseInt(process.env.REALTIME_BACKOFF_MS, 10) || 500,
        REALTIME_HEARTBEAT_MS: parseInt(process.env.REALTIME_HEARTBEAT_MS, 10) || 0,
    });
});

// דף ברירת מחדל (updated for simple mode)
app.get('/', (req, res) => {
    if (isSimpleMode) {
        // In simple mode, redirect directly to login page
        return res.redirect('/login.html');
    }
    
    if (req.isAuthenticated()) {
        return res.redirect('/upload');
    }
    res.redirect('/login.html');
});


app.get('/dashboard', (req, res) => {
    if (isSimpleMode) {
        return res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
    }
    
    if (!req.isAuthenticated()) { // שימוש ב-req.isAuthenticated()
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
});

// Dashboard with .html extension
app.get('/dashboard.html', (req, res) => {
    if (isSimpleMode) {
        return res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
    }
    
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
});


// יצירת דיווח חדש
app.post('/api/reports', async (req, res) => {
    if (!req.isAuthenticated()) { // מספיק לבדוק req.isAuthenticated()
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { type, location, time, image, status, reportedBy } = req.body;
    
    const report = {
        id: new Date().getTime(), // מזהה ייחודי לדיווח (מזמן היצירה)
        type,
        location,
        time,
        image,
        status,
        reportedBy,
        locationNote: req.body.locationNote || 'GPS'
    };

    // Geocode location to add coordinates
    if (location) {
        try {
            const geocodeUrl = `http://localhost:${port}/api/geocode?address=${encodeURIComponent(location)}`;
            const response = await axios.get(geocodeUrl);
            if (response.data && response.data.success) {
                report.coordinates = {
                    lat: response.data.location[0],
                    lon: response.data.location[1]
                };
            }
        } catch (error) {
            console.error('Geocoding failed for new report:', error.message);
            // Continue without coordinates
        }
    }
    
    const reportKey = `report:${report.id}`;  // יצירת המפתח הייחודי לכל דיווח
    
    try {
        // שמירה ב-Redis תחת המפתח הייחודי
        await client.json.set(reportKey, '$', report);  // משתמשים ב-JSON.SET כדי לשמור את הדיווח
        broadcastSSEEvent({ type: 'new_report', report });
        res.status(200).json({ message: 'Report saved successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error saving report' });
    }
});

// Enhanced reports fetcher with improved error handling
async function getReports() {
    try {
        if (!client || !redisConnected) {
            console.warn('Redis not available - returning empty reports array');
            return [];
        }

        const keys = await safeRedisKeys('report:*');
        if (keys.length === 0) {
            return [];
        }

        const reports = [];
        
        // Process in batches to avoid memory issues
        const batchSize = 50;
        for (let i = 0; i < keys.length; i += batchSize) {
            const batchKeys = keys.slice(i, i + batchSize);
            
            const batchPromises = batchKeys.map(async (key) => {
                try {
                    // Try to get as JSON first
                    let report = await client.json.get(key);
                    if (report) return report;

                    // Fallback to getting as a string and parsing
                    const str = await client.get(key);
                    if (str) return JSON.parse(str);

                    return null;
                } catch (err) {
                    console.warn(`Skipping corrupted report ${key}:`, err.message);
                    return null;
                }
            });

            const batchReports = (await Promise.all(batchPromises)).filter(report => report !== null);
            reports.push(...batchReports);
        }

        // Ensure all reports have required lat/lon for mapping
        return reports.map(report => {
            // If report has coordinates as lat/lon properties, keep them
            if (report.lat && report.lon) {
                return report;
            }
            
            // Try to parse location for coordinates
            if (typeof report.location === 'string') {
                const coordMatch = report.location.match(/Coordinates:\s*([+-]?\d*\.?\d+),\s*([+-]?\d*\.?\d+)/);
                if (coordMatch) {
                    return {
                        ...report,
                        lat: parseFloat(coordMatch[1]),
                        lon: parseFloat(coordMatch[2])
                    };
                }
            }
            
            return report;
        });
    } catch (error) {
        console.error('🔥 Error in getReports:', error);
        throw new Error(`Database operation failed: ${error.message}`);
    }
}

// שליפת דיווחים עם pagination ביצועים משופרים
app.get('/api/reports', async (req, res) => {
    try {
        const startTime = Date.now();
        const filters = req.query;
        
        // Pagination parameters
        const page = parseInt(filters.page) || 1;
        const limit = parseInt(filters.limit) || 25;
        const offset = (page - 1) * limit;
        
        // Convert hazardType string to array if needed
        if (filters.hazardType && typeof filters.hazardType === 'string') {
            filters.hazardType = filters.hazardType.split(',').map(type => type.trim());
        }

        console.log(`[API] Fetching reports - Page: ${page}, Limit: ${limit}, Filters:`, filters);

        // Get all reports with error handling
        let allReports;
        try {
            allReports = await getReports();
        } catch (error) {
            console.error('🔥 Failed to fetch reports from database:', error);
            return res.status(500).json({ 
                error: 'Database unavailable', 
                details: error.message,
                reports: [],
                pagination: {
                    page: 1,
                    limit,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false
                }
            });
        }

        console.log(`[API] Found ${allReports.length} reports in ${Date.now() - startTime}ms`);
        
        if (allReports.length === 0) {
            return res.json({
                reports: [],
                pagination: {
                    page: 1,
                    limit,
                    total: 0,
                    totalPages: 0,
                    hasNext: false,
                    hasPrev: false
                }
            });
        }

        // Sort reports by timestamp (newest first) for consistent ordering
        allReports.sort((a, b) => {
            const timeA = new Date(a.time || a.createdAt || 0).getTime();
            const timeB = new Date(b.time || b.createdAt || 0).getTime();
            return timeB - timeA; // Descending order (newest first)
        });

        const reports = [];
        let totalMatchingCount = 0;

        // Apply filters to all reports
        for (const report of allReports) {
                let match = true;

                // סוגי מפגעים: לפחות אחד מתוך הרשימה
                if (filters.hazardType && filters.hazardType.length > 0) {
                    const reportTypes = (report.type || '').split(',').map(t => t.trim().toLowerCase());
                    const hasMatch = filters.hazardType.some(type => 
                        reportTypes.includes(type.toLowerCase())
                    );
                    if (!hasMatch) match = false;
                }

                // מיקום
                if (match && filters.location) {
                    const reportLoc = (report.location || '').toLowerCase();
                    const searchTerm = filters.location.trim().toLowerCase();
                    if (!reportLoc.includes(searchTerm)) match = false;
                }

                // תאריך
                if (match && filters.startDate && new Date(report.time) < new Date(filters.startDate)) {
                    match = false;
                }
                if (match && filters.endDate && new Date(report.time) > new Date(filters.endDate)) {
                    match = false;
                }

                // סטטוס
                if (match && filters.status) {
                    const reportStatus = (report.status || '').toLowerCase();
                    const filterStatus = filters.status.toLowerCase();
                    if (reportStatus !== filterStatus) match = false;
                }

                // מחפש לפי מדווח
                if (match && filters.reportedBy) {
                    const reporter = (report.reportedBy || '').toLowerCase();
                    const search = filters.reportedBy.toLowerCase();
                    if (!reporter.includes(search)) match = false;
                }

                // Filter by the current user's reports
                if (match && filters.my_reports === 'true' && req.isAuthenticated()) {
                    if (report.reportedBy !== req.user.username) {
                        match = false;
                    }
                }

                if (match) {
                    totalMatchingCount++;
                    // Only include in result if within pagination range
                    if (totalMatchingCount > offset && reports.length < limit) {
                        reports.push(report);
                    }
                }

                // Early exit if we have enough reports for this page
                if (reports.length >= limit) {
                    break;
                }
        }

        const totalPages = Math.ceil(totalMatchingCount / limit);
        const hasNext = page < totalPages;
        const hasPrev = page > 1;

        const response = {
            reports,
            pagination: {
                page,
                limit,
                total: totalMatchingCount,
                totalPages,
                hasNext,
                hasPrev
            },
            filters: filters,
            performance: {
                // Use the number of retrieved reports instead of undefined Redis keys
                totalKeys: allReports.length,
                processedInMs: Date.now() - startTime
            }
        };

        console.log(`[API] Returning ${reports.length} reports (${totalMatchingCount} total matches) in ${Date.now() - startTime}ms`);
        res.json(response);

    } catch (err) {
        console.error('🔥 Error fetching reports:', err);
        res.status(500).json({ 
            error: 'Error fetching reports', 
            details: err.message 
        });
    }
});

// Simple Redis test endpoint
app.get('/api/test/redis', (req, res) => {
    try {
        const isConnected = client.isOpen;
        const isReady = client.isReady;
        
        res.json({
            connected: isConnected,
            ready: isReady,
            timestamp: new Date().toISOString(),
            message: 'Redis connection test'
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to check Redis', details: err.message });
    }
});

// Quick reports stats endpoint (with timeout protection)
app.get('/api/reports/stats', async (req, res) => {
    try {
        console.log('Stats endpoint called');
        
        // Add 5-second timeout
        const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Operation timed out after 5s')), 5000)
        );
        
        const keys = await Promise.race([
            client.keys('report:*'),
            timeout
        ]);
        console.log(`Found ${keys.length} report keys`);
        
        // Get Redis connection info
        const isConnected = client.isOpen;
        const redisInfo = {
            connected: isConnected,
            ready: client.isReady
        };
        
        res.json({
            total: keys.length,
            timestamp: new Date().toISOString(),
            sampleKeys: keys.slice(0, 5),
            redis: redisInfo
        });
    } catch (err) {
        console.error('Error getting report stats:', err);
        res.status(500).json({ error: 'Failed to get stats', details: err.message });
    }
});

// מחיקת דיווח לפי ID
app.delete('/api/reports/:id', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const reportId = req.params.id;
    const reportKey = `report:${reportId}`;
    try {
        await client.del(reportKey);
        res.status(200).json({ message: 'Report deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error deleting report' });
    }
});

// עדכון סטטוס דיווח
app.patch('/api/reports/:id/status', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const reportId = req.params.id;
    const newStatus = req.body.status;
    const reportKey = `report:${reportId}`;
    try {
        let report = await client.json.get(reportKey);
        if (!report) {
            // Fallback: try to get as string and parse
            const str = await client.get(reportKey);
            if (str) {
                report = JSON.parse(str);
                // Migrate to JSON
                await client.json.set(reportKey, '$', report);
                await client.del(reportKey); // Remove old string key if needed
            }
        }
        if (!report) return res.status(404).json({ error: 'Report not found' });
        report.status = newStatus;
        await client.json.set(reportKey, '$', report);
        broadcastSSEEvent({ type: 'status_update', report });
        res.status(200).json({ message: 'Status updated', report });
    } catch (err) {
        console.error('Error updating status:', err);
        res.status(500).json({ error: 'Error updating status', details: err.message });
    }
});

// API endpoint to get Google Maps API key (public endpoint)
// Geocoding endpoint to avoid CORS issues with external services
app.get('/api/geocode', async (req, res) => {
    const { address } = req.query;
    
    if (!address) {
        return res.status(400).json({ error: 'Address parameter is required' });
    }
    
    try {
        // Try OpenStreetMap Nominatim first
        console.log(`Geocoding address: ${address}`);
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&addressdetails=1`;
        
        const response = await axios.get(nominatimUrl, {
            headers: {
                'User-Agent': 'Hazard-Detection-App/1.0 (contact@example.com)' // Required by Nominatim
            },
            timeout: 10000
        });
        
        if (response.data && response.data.length > 0) {
            const result = response.data[0];
            return res.json({
                success: true,
                location: [parseFloat(result.lat), parseFloat(result.lon)],
                display_name: result.display_name
            });
        }
        
        // Fallback: try with simplified address (just city/area name)
        const simplifiedAddress = address.split(',')[0].trim();
        if (simplifiedAddress !== address) {
            const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(simplifiedAddress)}&limit=1&addressdetails=1`;
            
            const fallbackResponse = await axios.get(fallbackUrl, {
                headers: {
                    'User-Agent': 'Hazard-Detection-App/1.0 (contact@example.com)'
                },
                timeout: 10000
            });
            
            if (fallbackResponse.data && fallbackResponse.data.length > 0) {
                const result = fallbackResponse.data[0];
                return res.json({
                    success: true,
                    location: [parseFloat(result.lat), parseFloat(result.lon)],
                    display_name: result.display_name
                });
            }
        }
        
        // If no results found
        return res.json({
            success: false,
            error: 'No location found for the given address'
        });
        
    } catch (error) {
        console.error('Geocoding error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Geocoding service temporarily unavailable'
        });
    }
});

// עדכון דיווח (עריכה מלאה)
app.patch('/api/reports/:id', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const reportId = req.params.id;
    const reportKey = `report:${reportId}`;

    try {
        const existingReportStr = await client.get(reportKey);
        if (!existingReportStr) {
            return res.status(404).json({ error: 'Report not found' });
        }

        const report = JSON.parse(existingReportStr);
        
        // Update only the fields that are provided
        const updates = req.body;
        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined) {
                report[key] = updates[key];
            }
        });

        // Add audit information
        report.lastModified = new Date().toISOString();
        report.modifiedBy = req.user.email;

        // Save back to Redis
        await client.set(reportKey, JSON.stringify(report));

        broadcastSSEEvent({ type: 'report_updated', report });
        res.json({ message: 'Report updated successfully', report });
    } catch (err) {
        console.error('Error updating report:', err);
        res.status(500).json({ error: 'Failed to update report' });
    }
});

// NEW: GET a single report by ID (for editing)
app.get('/api/reports/:id', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const reportId = req.params.id;
    const reportKey = `report:${reportId}`;
    try {
        const report = await client.json.get(reportKey);
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        res.status(200).json(report);
    } catch (err) {
        console.error('🔥 Error fetching report:', err);
        res.status(500).json({ error: 'Error fetching report' });
    }
});


// הרצת השרת
app.listen(port, '0.0.0.0', () => {
    if (process.env.NODE_ENV === 'production') {
        console.log(`✅ Server running in production on port ${port}`);
        const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
        console.log(`✅ External URL: ${externalUrl || 'Not set'}`);
    } else {
        const networkInterfaces = os.networkInterfaces();
        let localIp = 'localhost';
        
        for (const interfaceKey of Object.keys(networkInterfaces)) {
          for (const net of networkInterfaces[interfaceKey]) {
            if (net.family === 'IPv4' && !net.internal) {
              localIp = net.address;
            }
          }
        }
      
        console.log(`✅ Server running locally: http://localhost:${port}`);
        console.log(`✅ Server running on your network: http://${localIp}:${port}`);
    }
});

// To run the server in debug mode, execute in terminal:
//   node --inspect server.js

// פונקציה לבדוק אם המייל קיים ב-Redis
async function emailExists(email) {  
    const existingUserKeys = await client.keys('user:*');  
    for (const key of existingUserKeys) {  
        const userData = JSON.parse(await client.get(key));  // קבלת המידע כ-string
        if (userData.email === email) {  
            return true; // מייל קיים  
        }  
    }
    return false; // מייל לא קיים  
}  

// רישום משתמש רגיל (לא Google)
app.post('/register', async (req, res) => {  
    const { email, username, password } = req.body;  

    if (!email || !username || !password) {  
        return res.status(400).json({ error: 'Missing required fields' });  
    }  

    // בדוק אם המייל קיים בעזרת פונקציה שנבנתה קודם
    if (client && redisConnected) {
        const existingUser = await emailExists(email);  
        if (existingUser) {  
            return res.status(400).json({ error: 'User already registered with this email.' });
        }  

        const userId = `user:${Date.now()}`;  
        const newUser = {  
            email,  
            username,  
            password,  
            type: 'user'  
        };  
        try {
            await client.set(userId, JSON.stringify(newUser));
        } catch (err) {
            console.error('Error saving user to Redis:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    } else {
        // Simple mode: save to file store
        const result = await createUserSimple({ email, username, password });
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
    }

    // Use Passport login to properly authenticate the new user
    req.login(newUser, function(err) {
        if (err) {
            console.error('Passport login error after registration:', err);
            return res.status(500).json({ error: 'Registration successful but login failed' });
        }
        
        // Also save to session for compatibility
        req.session.user = {  
            email,  
            username  
        };  

        res.status(201).json({   
            message: 'User registered successfully',   
            user: { email, username }   
        });
    });  
});



app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Missing email or password' });
    }

    // Simple mode: accept any credentials for testing
    if (isSimpleMode) {
        // For testing purposes, accept any email/password combination
        const simpleUser = {
            email: email,
            username: email.split('@')[0], // Use email prefix as username
            type: 'user'
        };
        
        req.login(simpleUser, function(err) {
            if (err) {
                console.error('Passport login error in simple mode:', err);
                return res.status(500).json({ error: 'Login failed' });
            }
            
            req.session.user = {
                email: email,
                username: email.split('@')[0]
            };
            
            return res.json({
                success: true,
                message: 'Login successful (simple mode)',
                user: {
                    email: email,
                    username: email.split('@')[0]
                }
            });
        });
        return; // Exit early to prevent further execution
    }

    // Full mode: check Redis
    if (!client || !redisConnected) {
        return res.status(500).json({ error: 'Database unavailable' });
    }

    try {
        const userKeys = await client.keys('user:*');
        for (const key of userKeys) {
            const userData = await client.get(key);
            const user = JSON.parse(userData);

            if (user.email === email) {
                if (user.password === password) {
                    // ✅ Use Passport login to properly authenticate the user
                    req.login(user, function(err) {
                        if (err) {
                            console.error('Passport login error:', err);
                            return res.status(500).json({ error: 'Login failed' });
                        }
                        
                        // Also save to session for compatibility
                        req.session.user = {
                            email: user.email,
                            username: user.username
                        };

                        return res.status(200).json({ message: 'Login successful', user: { email, username: user.username } });
                    });
                    return; // Exit early to prevent further execution
                } else {
                    return res.status(401).json({ error: 'Incorrect password' });
                }
            }
        }

        return res.status(404).json({ error: 'User not found' });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Login failed' });
    }
});



// שליחה למייל של קישור לאיפוס סיסמה
app.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Try to find the user when Redis is available; otherwise allow silent success
        let userId = null;
        let userData = null;
        const canUseRedis = client && redisConnected;
    if (canUseRedis) {
            const userKeys = await client.keys('user:*');
            for (const key of userKeys) {
                const dataStr = await client.get(key);
                if (!dataStr) continue;
                const data = JSON.parse(dataStr);
                if (data.email === email) {
                    userId = key;
                    userData = data;
                    break;
                }
            }

            // If user not found or Google-only account, return generic success to avoid email enumeration
            if (!userId || !userData || !userData.password) {
                return res.status(200).json({ message: 'If the email is registered, you will receive a password reset link shortly.' });
            }

            // Remove previous tokens for this user
            const existingTokens = await client.keys('reset:*');
            for (const key of existingTokens) {
                const value = await client.get(key);
                if (value === userId) {
                    await client.del(key);
                }
            }
        } else {
            // Simple mode: find user by email in file store
            const simpleUser = await findUserByEmailSimple(email);
            if (!simpleUser || !simpleUser.password) {
                return res.status(200).json({ message: 'If the email is registered, you will receive a password reset link shortly.' });
            }
        }

        // Create token
        const token = crypto.randomBytes(20).toString('hex');
        const tokenKey = `reset:${token}`;

        // Save token for 10 minutes
        if (canUseRedis) {
            await client.setEx(tokenKey, 600, userId);
        } else {
            // Simple mode: store mapping to email in-memory
            simpleResetTokens.set(token, { email, createdAt: Date.now(), ttlMs: 10 * 60 * 1000 });
        }

        const externalBase =
            process.env.RENDER_EXTERNAL_URL ||
            process.env.RAILWAY_STATIC_URL ||
            process.env.RAILWAY_PUBLIC_DOMAIN ||
            `${req.protocol}://${req.get('host')}` ||
            'http://localhost:3000';
        const resetUrl = `${externalBase}/reset-password.html?token=${token}`;

        const sendgridConfigured = !!process.env.SENDGRID_API_KEY;
        if (sendgridConfigured) {
            const message = {
                to: email,
                from: 'hazard.reporter@outlook.com',
                subject: 'Password Reset Request',
                html: `
                    <h3>Hello,</h3>
                    <p>You requested to reset your password. Click the link below to reset it:</p>
                    <a href="${resetUrl}">${resetUrl}</a>
                    <p>This link will expire in 10 minutes.</p>
                `
            };
            try {
                await sgMail.send(message);
                console.log('Reset email sent successfully to', email);
                return res.status(200).json({ message: 'Reset link sent to your email' });
            } catch (error) {
                console.error('Error sending email via SendGrid:', error.message || error);
                // Fall through to dev-friendly response including resetUrl
            }
        }

        // Dev/simple-mode fallback: respond with reset URL so the client can display it
        console.warn('Email not sent (SendGrid not configured or Redis unavailable). Returning reset URL in response for dev.');
        return res.status(200).json({ message: 'Reset link generated', resetUrl });
    } catch (err) {
        console.error('Forgot password error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});


// איפוס סיסמה לפי טוקן
app.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ error: 'Missing token or password' });
        }

        const valid = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(password);
        if (!valid) {
            return res.status(400).json({ error: 'Invalid password format' });
        }

        const canUseRedis = client && redisConnected;
        if (canUseRedis) {
            const tokenKey = `reset:${token}`;
            const userKey = await client.get(tokenKey);
            if (!userKey) {
                return res.status(400).json({ error: 'Token expired or invalid' });
            }

            const userDataStr = await client.get(userKey);
            if (!userDataStr) {
                return res.status(404).json({ error: 'User not found' });
            }
            const userData = JSON.parse(userDataStr);
            userData.password = password;

            await client.set(userKey, JSON.stringify(userData));
            await client.del(tokenKey);

            req.session.user = {
                email: userData.email,
                username: userData.username
            };
            return res.status(200).json({ message: 'Password reset successfully' });
        }

        // Simple mode: validate token from memory, cannot persist password across restarts
        const tokenEntry = simpleResetTokens.get(token);
        if (!tokenEntry) {
            return res.status(400).json({ error: 'Token expired or invalid' });
        }
        // TTL check (10 minutes)
        const expired = Date.now() - tokenEntry.createdAt > (tokenEntry.ttlMs || 600000);
        if (expired) {
            simpleResetTokens.delete(token);
            return res.status(400).json({ error: 'Token expired or invalid' });
        }
        // Update password in simple file store
        const updated = await updateUserPasswordSimple(tokenEntry.email, password);
        simpleResetTokens.delete(token);
        if (!updated) {
            return res.status(404).json({ error: 'User not found' });
        }
        req.session.user = { email: tokenEntry.email, username: tokenEntry.email.split('@')[0] };
        return res.status(200).json({ message: 'Password reset successfully' });
    } catch (err) {
        console.error('Reset password error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});


// Unified endpoint for all report uploads
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        console.log("📤 Unified upload request received");

        // Authentication check (skip in simple mode)
        if (!isSimpleMode && !req.isAuthenticated()) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Extract metadata from the request body
        const metadata = { ...req.body };

        // The service expects a filename, let's create one
        const filename = `detection_${Date.now()}`;

        // Call the report upload service
        const report = await uploadReport({
            file: req.file,
            filename,
            metadata,
        });

        res.status(201).json({
            success: true,
            message: 'Report uploaded successfully.',
            report,
        });

    } catch (error) {
        console.error("❌ Unified upload error:", error);
        res.status(500).json({
            error: 'Failed to process upload.',
            details: error.message,
        });
    }
});



// --- SSE clients storage and broadcast ---
const sseClients = new Set();
function broadcastSSEEvent(event) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
        client.write(data);
    }
}
// --- Minimal SSE endpoint for real-time events ---
app.get('/api/events/stream', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*', // Optional: for local dev
    });
    res.flushHeaders();

    sseClients.add(res);

    // Keep-alive comment every 20s
    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 20000);

    req.on('close', () => {
        clearInterval(keepAlive);
        sseClients.delete(res);
        res.end();
    });
});