// 📦 External dependencies
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import dotenv from 'dotenv';
import { createClient } from 'redis';
import path from 'path';
import { fileURLToPath } from 'url';
import sgMail from '@sendgrid/mail';
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import cors from 'cors';
import os from 'os';

// 🌍 ES Modules __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

// Validate required environment variables
const requiredEnvVars = [
  'SESSION_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'SENDGRID_API_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`🔥 FATAL ERROR: ${envVar} environment variable is not set.`);
    process.exit(1);
  }
}

// Configure CORS options
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.BASE_URL
    : ['http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:5000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-requested-with']
};

// 📦 Cloudinary
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import streamifier from 'streamifier';

// ☁️ Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// startup check for cloudinary config
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('🔥🔥🔥 FATAL ERROR: Cloudinary environment variables are not set., please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.');
    process.exit(1);
}

// 🎛️ Setup multer (in-memory uploads)
const upload = multer();

// 🚀 Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Set Cross-Origin-Isolation headers as the very first middleware
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
});

// Serving static files from the "public" directory
/* ───── Core middleware ───── */
// Apply CORS middleware with configured options
app.use(cors(corsOptions));

app.use(express.static(path.join(__dirname, '../public'), { 
    index: false,
    extensions: ['html']
}));

app.use(
    '/ort',
    express.static(path.join(__dirname, '../public/ort'))
);

app.use(express.json());

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

  app.use(passport.initialize());
  app.use(passport.session());

// 📨 SendGrid API
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// 🔌 Redis client
const client = createClient({
  username: 'default',
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

let redisConnected = false;

async function connectRedis() {
    try {
      await client.connect();
      redisConnected = true;
      console.log('✅ Connected to Redis');
    } catch (err) {
      redisConnected = false;
      console.error('🔥 Failed to connect to Redis:', err);
    }
  }
connectRedis();

// --- 💡 Refactored Passport Logic --- 
passport.serializeUser((user, done) => {
    // Store only the user's unique redis key in the session
    console.log(`[Passport] Serializing user key: ${user.redisKey}`);
    done(null, user.redisKey);
});

passport.deserializeUser(async (redisKey, done) => {
    // Fetch the user directly by their key
    console.log(`[Passport] Deserializing user key: ${redisKey}`);
    if (!redisConnected || !client.isOpen) {
        return done(new Error("Redis client not available for deserialization"));
    }
    try {
        const userStr = await client.get(redisKey);
        if (userStr) {
            const user = JSON.parse(userStr);
            user.redisKey = redisKey; // Re-attach the key to the user object
            return done(null, user);
        } else {
            return done(null, false, { message: 'User not found in Redis.' });
        }
    } catch (err) {
        console.error("❌ Error in deserializeUser:", err);
        return done(err);
    }
});

// Helper function to find user key by email
async function findUserKeyByEmail(email) {
    // This is still a scan, but we will create an index to optimize it.
    // For now, we create an email-to-key mapping.
    const userKey = await client.get(`email:${email}`);
    return userKey;
}

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails[0].value;
            const username = profile.displayName;
            const googleId = profile.id;

            // Check if user exists via Google ID
            const googleKey = `user:google:${googleId}`;
            const googleUserStr = await client.get(googleKey);
            if (googleUserStr) {
                const user = JSON.parse(googleUserStr);
                user.redisKey = googleKey; // Attach key
                return done(null, user);
            }
            // Check if email is already registered via local auth
            const existingUserKey = await findUserKeyByEmail(email);
            if (existingUserKey) {
                return done(null, false, { message: 'Email already registered locally.' });
            }
            // Create new Google-linked user
            const newUser = { email, username, googleId, type: 'user' };
            await client.set(googleKey, JSON.stringify(newUser));
            // Also create an email-to-key index for lookups
            await client.set(`email:${email}`, googleKey);
            newUser.redisKey = googleKey; // Attach key
            return done(null, newUser);

        } catch (err) {
            console.error('Google Strategy Error:', err);
            return done(err, null);
        }
    }
));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }));

app.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
        if (err) return res.redirect('/login.html?error=ServerError');
        if (!user) {
            if (info && info.message) return res.redirect(`/login.html?error=${info.message}`);
            return res.redirect('/login.html?error=AuthFailed');
        }
        req.login(user, (err) => {
            if (err) return res.redirect('/login.html?error=LoginFailed');
            req.session.user = { email: user.email, username: user.username };
            return res.redirect('/upload.html');
        });
    })(req, res, next);
});

// --- End of Refactored Passport Logic ---

// --- Secure API Key Endpoint ---
app.get('/api/config/maps-key', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    // The API key is not a sensitive secret that needs to be protected from unauthenticated access.
    // Google's API restrictions handle unauthorized usage.
  res.json({ apiKey: process.env.GOOGLE_MAP_GEOCODE });
});

// Forward geocoding endpoint using server-side API key
app.get('/api/geocode', async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const address = (req.query.q || req.query.address || '').toString().trim();
        if (!address) return res.status(400).json({ error: 'Missing address query (q or address)' });

        // Prefer Google Geocoding if key present
        if (process.env.GOOGLE_MAP_GEOCODE) {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAP_GEOCODE}`;
            const resp = await axios.get(url, { timeout: 8000 });
            const result = resp.data?.results?.[0];
            if (result?.geometry?.location) {
                return res.json({
                    lat: result.geometry.location.lat,
                    lng: result.geometry.location.lng,
                    address: result.formatted_address || address,
                    provider: 'google'
                });
            }
        }

        // Fallback to Nominatim if Google fails or no key
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
        const nomResp = await axios.get(nomUrl, { timeout: 8000, headers: { 'User-Agent': 'RoadGuardian/1.0' } });
        const item = Array.isArray(nomResp.data) ? nomResp.data[0] : null;
        if (item && item.lat && item.lon) {
            return res.json({
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
                address: item.display_name || address,
                provider: 'nominatim'
            });
        }
        return res.status(404).json({ error: 'Address could not be geocoded' });
    } catch (e) {
        console.error('🔥 Geocode API error:', e.response?.data || e.message);
        return res.status(500).json({ error: 'Geocoding failed' });
    }
});

app.get('/upload', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    res.sendFile(path.join(__dirname, '../public/upload.html'));
});

app.get('/camera.html', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    res.sendFile(path.join(__dirname, '../public/camera.html'));
  });

app.get('/logout', (req, res) => {
    req.logout(function(err) {
        if (err) return res.redirect('/');
        req.session.destroy(() => { res.redirect('/'); });
    });
});

app.get('/', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login.html');
    res.redirect('/upload');
});

app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// CORS middleware already applied above

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(err.status || 500).json({ 
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    code: err.code
  });
});

app.post('/api/reports', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const { type, location, time, image, status, reportedBy } = req.body;
    const report = { id: new Date().getTime(), type, location, time, image, status, reportedBy, locationNote: req.body.locationNote || 'GPS' };
    const reportKey = `report:${report.id}`;
    try {
        await client.json.set(reportKey, '$', report);
        res.status(200).json({ message: 'Report saved successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error saving report' });
    }
});

app.get('/api/reports', async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            console.log('❌ Unauthorized access attempt to /api/reports');
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!redisConnected || !client.isOpen) {
            console.error('🔥 Redis client is not connected');
            return res.status(503).json({ error: 'Database service unavailable' });
        }

        console.log('📝 API Request received for /api/reports');
        const filters = req.query;
        if (filters.hazardType && typeof filters.hazardType === 'string') {
            filters.hazardType = filters.hazardType.split(',').map(type => type.trim());
        }

        console.log('🔍 Searching for reports in Redis...');
        const keys = await client.keys('report:*');
        console.log(`📊 Found ${keys.length} reports`);
        
        const reports = [];
        const updatePromises = [];

        for (const key of keys) {
            try {
                const report = await client.json.get(key);
                if (report) {
                    if (report.status === 'new') {
                        const updatePromise = client.json.set(key, '$.status', 'open')
                            .then(() => { report.status = 'open'; })
                            .catch(err => console.error(`Failed to update status for ${key}:`, err));
                        updatePromises.push(updatePromise);
                    }
                    reports.push(report);
                }
            } catch (err) {
                console.error(`Failed to fetch report ${key}:`, err);
                // Continue with other reports even if one fails
            }
        }

        // Wait for all status updates to complete
        await Promise.all(updatePromises);
        
        res.status(200).json(reports);
    } catch (err) {
        console.error('🔥 Error fetching reports:', err);
        res.status(500).json({ 
            error: 'Error fetching reports',
            details: err.message,
            code: err.code
        });
    }
});

app.delete('/api/reports/:id', async (req, res) => {
    const reportId = req.params.id;
    const reportKey = `report:${reportId}`;
    try {
        await client.del(reportKey);
        res.status(200).json({ message: 'Report deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error deleting report: ' + err.message });
    }
});

app.put('/api/reports/:id', async (req, res) => {
    const reportId = req.params.id;
    const reportKey = `report:${reportId}`;
    try {
        let report = await client.json.get(reportKey);
        if (!report) return res.status(404).json({ error: 'Report not found' });
        const updatedReport = { ...report, ...req.body, lastModified: new Date().toISOString(), modifiedBy: req.user?.email || 'anonymous' };
        await client.json.set(reportKey, '$', updatedReport);
        res.status(200).json({ message: 'Report updated successfully', report: updatedReport });
    } catch (err) {
        res.status(500).json({ error: 'Error updating report: ' + err.message });
    }
});

app.patch('/api/reports/:id/status', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const reportId = req.params.id;
    const newStatus = req.body.status;
    const reportKey = `report:${reportId}`;
    try {
        const report = await client.json.get(reportKey);
        if (!report) return res.status(404).json({ error: 'Report not found' });
        report.status = newStatus;
        report.lastModified = new Date().toISOString();
        report.modifiedBy = req.user?.email || 'anonymous';
        await client.json.set(reportKey, '$', report);
        res.status(200).json({ message: 'Status updated', report });
    } catch (err) {
        console.error('Error updating status:', err);
        res.status(500).json({ error: 'Error updating status' });
    }
});

app.patch('/api/reports/:id', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Authentication required' });
    const reportId = req.params.id;
    const reportKey = `report:${reportId}`;
    try {
        const existingReport = await client.get(reportKey);
        if (!existingReport) return res.status(404).json({ error: 'Report not found' });
        const report = JSON.parse(existingReport);
        const updates = req.body;
        Object.keys(updates).forEach(key => { if (updates[key] !== undefined) report[key] = updates[key]; });
        report.lastModified = new Date().toISOString();
        report.modifiedBy = req.user.email;
        await client.set(reportKey, JSON.stringify(report));
        res.json({ message: 'Report updated successfully', report });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update report' });
    }
});

app.get('/api/reports/:id', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    const reportId = req.params.id;
    const reportKey = `report:${reportId}`;
    try {
        const report = await client.json.get(reportKey);
        if (!report) return res.status(404).json({ error: 'Report not found' });
        res.status(200).json(report);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching report' });
    }
});

app.listen(port, '0.0.0.0', () => {
    const networkInterfaces = os.networkInterfaces();
    let localIp = 'localhost';
    for (const interfaceKey of Object.keys(networkInterfaces)) {
      for (const net of networkInterfaces[interfaceKey]) {
        if (net.family === 'IPv4' && !net.internal) localIp = net.address;
      }
    }
    console.log(`✅ Server running locally: http://localhost:${port}`);
    console.log(`✅ Server running on your network: http://${localIp}:${port}`);
  });

app.post('/register', async (req, res) => {  
    const { email, username, password } = req.body;  
    if (!email || !username || !password) return res.status(400).json({ error: 'Missing required fields' });  
    if (await findUserKeyByEmail(email)) return res.status(400).json({ error: 'User already registered with this email.' });
    const userId = `user:local:${Date.now()}`;
    const newUser = { email, username, password, type: 'user' };
    try {
        await client.set(userId, JSON.stringify(newUser));
        await client.set(`email:${email}`, userId);
    } catch (err) {
        return res.status(500).json({ error: 'Internal server error' });
    }
    newUser.redisKey = userId;
    req.login(newUser, (err) => {
        if (err) return res.status(500).json({ error: 'Login after registration failed' });
        res.status(201).json({ message: 'User registered successfully', user: { email, username } });
    });
});

app.post('/login', async (req, res, next) => {
    const { email, password } = req.body;  
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
    try {
        const userKey = await findUserKeyByEmail(email);
        if (!userKey) return res.status(404).json({ error: 'User not found' });

        const userData = await client.get(userKey);
        const user = JSON.parse(userData);

        if (user.password === password) {
            user.redisKey = userKey;
            req.login(user, (err) => {
                if (err) { return next(err); }
                return res.status(200).json({ message: 'Login successful', user: { email, username: user.username } });
            });
        } else {
            return res.status(401).json({ error: 'Incorrect password' });
        }
    } catch (err) {
        return next(err);
    }
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const userKey = await findUserKeyByEmail(email);
    if (!userKey) return res.status(404).json({ error: 'Email not found' });
    const userData = JSON.parse(await client.get(userKey));
    if (!userData.password) return res.status(400).json({ error: 'This account uses Google login and cannot reset password.' });
    const token = crypto.randomBytes(20).toString('hex');
    const tokenKey = `reset:${token}`;
    await client.setEx(tokenKey, 600, userKey);
    const resetUrl = `https://hazard-detection.onrender.com/reset-password.html?token=${token}`;
    const message = { to: email, from: 'hazard.reporter@outlook.com', subject: 'Password Reset Request', html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 10 minutes.</p>` };
    try {
        await sgMail.send(message); 
        res.status(200).json({ message: 'Reset link sent to your email' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send email' });
    } 
});

app.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Missing token or password' });
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) return res.status(400).json({ error: 'Invalid password format' });
    const tokenKey = `reset:${token}`;
    const userKey = await client.get(tokenKey);
    if (!userKey) return res.status(400).json({ error: 'Token expired or invalid' });
    const userData = JSON.parse(await client.get(userKey));
    userData.password = password;
    await client.set(userKey, JSON.stringify(userData));
    await client.del(tokenKey);
    req.login(userData, (err) => {
        if (err) return res.status(500).json({ error: 'Login after reset failed' });
        res.status(200).json({ message: 'Password reset successfully' });
    });
});

app.post('/upload-detection', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Please log in again' });
    }

    const { hazardTypes, geoData, locationNote } = req.body;
    if (!geoData) {
        return res.status(400).json({ error: 'Missing geolocation data' });
    }
    try {
        const coords = JSON.parse(geoData);
        if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
            return res.status(400).json({ error: 'Invalid geolocation data' });
        }

        let address = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
        if (process.env.GOOGLE_MAP_GEOCODE) {
            try {
                const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&language=he&key=${process.env.GOOGLE_MAP_GEOCODE}`;
                const geoResponse = await axios.get(geoUrl, { timeout: 6000 });
                if (geoResponse.data?.results?.length > 0) {
                    address = geoResponse.data.results[0].formatted_address || address;
                }
            } catch (geocodeErr) {
                console.warn('⚠️ Geocoding failed. Using coordinates:', geocodeErr.message);
            }
        }

        const streamUpload = (buffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream({ folder: 'detections' }, (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                });
                streamifier.createReadStream(buffer).pipe(stream);
            });
        };

        const result = await streamUpload(req.file.buffer);

        if (!result?.secure_url) {
            return res.status(500).json({ error: 'Failed to upload image to Cloudinary' });
        }

        const reportedBy = req.user?.username || req.session?.user?.username || 'Anonymous';
        const reportId = Date.now();
        const reportKey = `report:${reportId}`;
        const report = { 
            id: reportId, 
            type: hazardTypes, 
            location: address, 
            time: req.body.time || new Date().toISOString(), 
            image: result.secure_url, 
            status:'New', 
            locationNote, 
            reportedBy, 
            createdAt: new Date().toISOString() 
        };

        await client.json.set(reportKey, '$', report);
        

        res.status(200).json({ message: 'Report uploaded and saved successfully', report });
    } catch (e) {
        console.error('🔥 Cloudinary Upload Error:', e);
        res.status(500).json({ error: 'Failed to upload report', details: e?.message || 'unknown' });
    }
});
