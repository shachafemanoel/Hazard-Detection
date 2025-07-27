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
import fs from 'fs'; // 👈 הוספת ייבוא של מודול fs
import crypto from 'crypto';
import axios from 'axios';
import cors from 'cors';
import os from 'os'; // מייבאים את המודול os

// 📦 Firebase & Cloudinary
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import streamifier from 'streamifier';

// 🌍 ES Modules __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 📁 Load environment variables
// ודא שאתה טוען את משתני הסביבה לפני כל שימוש בהם
// טעינת קובץ .env מהתיקייה הנוכחית של server.js
dotenv.config({ path: path.join(__dirname, '.env') });

// הדפסה לבדיקת טעינת משתני סביבה
console.log("Attempting to load environment variables...");
console.log("CLOUDINARY_CLOUD_NAME from env:", process.env.CLOUDINARY_CLOUD_NAME);
console.log("GOOGLE_CALLBACK_URL from env:", process.env.GOOGLE_CALLBACK_URL);
console.log("SESSION_SECRET from env:", process.env.SESSION_SECRET ? "Loaded" : "NOT LOADED");

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
const port = process.env.PORT || 3000;

// Serving static files from the "public" directory
// Make sure to set index: false to prevent serving index.html by default
app.use(express.static(path.join(__dirname, '../public'), { 
    index: false,
    extensions: ['html'] // This will allow serving .html files without the extension
}));


app.use((req, res, next) => {
    // Only apply COOP/COEP to specific routes, not to map-related pages
    if (!req.path.includes('/dashboard') && !req.path.includes('/api/config/maps-key')) {
        res.set({
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Resource-Policy': 'cross-origin'
        });
    } else {
        // For map-related routes, use less restrictive headers
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
    express.static(path.join(__dirname, '../public/ort'))
  );
  
  /* ───── Core middleware ───── */
  app.use(cors({
    origin: function(origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      // List of allowed origins
      const allowedOrigins = [
        'https://hazard-detection.onrender.com',
        'http://localhost:3000',
        'http://localhost:8000',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:8000'
      ];
      
      // Check if the origin is in the allowed list or is a Render preview URL
      if (allowedOrigins.includes(origin) || origin.includes('.onrender.com')) {
        return callback(null, true);
      }
      
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
}));

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
  password: process.env.REDIS_PASSWORD, // מומלץ לשמור סיסמאות במשתני סביבה
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

let redisConnected = false; // דגל למעקב אחר מצב החיבור

async function connectRedis() {
    try {
      await client.connect();
      redisConnected = true;
      console.log('✅ Connected to Redis');
    } catch (err) {
      redisConnected = false;
      console.error('🔥 Failed to connect to Redis:', err);
      // אולי תחליט להמתין ולטעון מחדש, או להריץ fallback
    }
  }
connectRedis(); // קריאה לפונקציה בעת עליית השרת


passport.serializeUser((user, done) => {
    console.log('[Passport] Serializing user:', user.email);
    done(null, user.email);  // מזהה יחיד
  });
  
  passport.deserializeUser(async (email, done) => {
    console.log('[Passport] Attempting to deserialize user:', email);
    if (!redisConnected || !client.isOpen) { // בדיקה אם הלקוח מחובר ופתוח
        console.error("❌ Redis client not connected or not open in deserializeUser.");
        // חשוב להחזיר שגיאה ברורה כאן
        return done(new Error("Redis client not available for deserialization"), null);
    }
    try {
      const keys = await client.keys('user:*');
      console.log('[Passport] Found keys for deserialization:', keys.length);
      for (const key of keys) {
        const userStr = await client.get(key);
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
      console.error("❌ Error in deserializeUser:", err);  // הוספת לוג
      done(err, null);
    }
  });
  

// הגדרת האסטרטגיה של גוגל
passport.use(new GoogleStrategy({
    clientID:  process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}/auth/google/callback`

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



// דף העלאת קבצים (Upload)
app.get('/upload', async (req, res) => {
    if (!req.isAuthenticated()) { // שימוש ב-req.isAuthenticated()
        return res.redirect('/'); // אם לא מחובר, מחזירים לדף הבית
    }
    // הצגת דף ה-upload
    res.sendFile(path.join(__dirname, '../public/upload.html'));
});

app.get('/camera.html', (req, res) => {
    if (!req.isAuthenticated()) { // שימוש ב-req.isAuthenticated()
      return res.redirect('/'); // הפניה לדף הבית (login.html)
    }
    res.sendFile(path.join(__dirname, '../public/camera.html'));
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

// דף ברירת מחדל
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/upload');
    }
    res.redirect('/login.html');
});


app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) { // שימוש ב-req.isAuthenticated()
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
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

// שליפת דיווחים עם pagination ביצועים משופרים
app.get('/api/reports', async (req, res) => {
    try {
        const startTime = Date.now();
        const filters = req.query;
        
        // Pagination parameters
        const page = parseInt(filters.page) || 1;
        const limit = parseInt(filters.limit) || 25; // Reduced default for better performance
        const offset = (page - 1) * limit;
        
        // Convert hazardType string to array if needed
        if (filters.hazardType && typeof filters.hazardType === 'string') {
            filters.hazardType = filters.hazardType.split(',').map(type => type.trim());
        }

        console.log(`[API] Fetching reports - Page: ${page}, Limit: ${limit}, Filters:`, filters);

        // Add timeout to Redis operations
        const timeout = 15000; // 15 second timeout
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Redis operation timed out')), timeout)
        );

        // Get all report keys with timeout
        const keys = await Promise.race([
            client.keys('report:*'),
            timeoutPromise
        ]);
        console.log(`[API] Found ${keys.length} report keys in ${Date.now() - startTime}ms`);
        
        if (keys.length === 0) {
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

        // Sort keys by timestamp (newest first) for consistent ordering
        keys.sort((a, b) => {
            const timeA = parseInt(a.split(':')[1]) || 0;
            const timeB = parseInt(b.split(':')[1]) || 0;
            return timeB - timeA; // Descending order (newest first)
        });

        const reports = [];
        let processedCount = 0;
        let totalMatchingCount = 0;

        // Process reports in batches to avoid memory issues
        const batchSize = 100;
        for (let i = 0; i < keys.length; i += batchSize) {
            const batchKeys = keys.slice(i, i + batchSize);
            
            // Get multiple reports in parallel
            const batchPromises = batchKeys.map(async (key) => {
                try {
                    const report = await client.json.get(key);
                    return report;
                } catch (err) {
                    console.warn(`Skipping key ${key}:`, err.message);
                    return null;
                }
            });

            const batchReports = (await Promise.all(batchPromises)).filter(report => report !== null);
            
            // Apply filters to batch
            for (const report of batchReports) {
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

                if (match) {
                    totalMatchingCount++;
                    // Only include in result if within pagination range
                    if (totalMatchingCount > offset && reports.length < limit) {
                        reports.push(report);
                    }
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
                totalKeys: keys.length,
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
        // Get existing report
        const existingReport = await client.get(reportKey);
        if (!existingReport) {
            return res.status(404).json({ error: 'Report not found' });
        }

        const report = JSON.parse(existingReport);
        
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
        console.log(`✅ External URL: ${process.env.RENDER_EXTERNAL_URL || 'Not set'}`);
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
    const existingUser = await emailExists(email);  
    if (existingUser) {  
        return res.status(400).json({ error: 'User already registered with this email.' }); // הודעת שגיאה  
    }  

    const userId = `user:${Date.now()}`;  // יצירת מזהה ייחודי למשתמש
    const newUser = {  
        email,  
        username,  
        password,  
        type: 'user'  
    };  

    // שמירה ב-Redis כ-string
    try {
        await client.set(userId, JSON.stringify(newUser));  // שמירה כ-string
    } catch (err) {
        console.error('Error saving user to Redis:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }

    req.session.user = {  
        email,  
        username  
    };  

    res.status(201).json({   
        message: 'User registered successfully',   
        user: { email, username }   
    });  
});



app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Missing email or password' });
    }

    const userKeys = await client.keys('user:*');
    for (const key of userKeys) {
        const userData = await client.get(key);
        const user = JSON.parse(userData);

        if (user.email === email) {
            if (user.password === password) {

                // ✅ שמירה בסשן – כמו שעשית בהתחברות עם גוגל
                req.session.user = {
                    email: user.email,
                    username: user.username
                };

                return res.status(200).json({ message: 'Login successful', user: { email, username: user.username } });
            } else {
                return res.status(401).json({ error: 'Incorrect password' });
            }
        }
    }

    return res.status(404).json({ error: 'User not found' });
});



// שליחה למייל של קישור לאיפוס סיסמה
app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const userKeys = await client.keys('user:*');
    let userId = null;
    let userData = null;
    for (const key of userKeys) {
        const data = JSON.parse(await client.get(key));
        if (data.email === email) {
            userId = key;
            userData = data;
            break;
        }
    }

    if (!userId || !userData) {
        return res.status(404).json({ error: 'Email not found' });
    }

    if (!userData.password) {
        return res.status(400).json({ error: 'This account uses Google login and cannot reset password.' });
    }


    // ✅ מחיקת טוקנים קודמים של אותו משתמש אם קיימים
    const existingTokens = await client.keys('reset:*');
    for (const key of existingTokens) {
        const value = await client.get(key);
        if (value === userId) {
            await client.del(key);
        }
    }

    // יצירת טוקן ייחודי
    const token = crypto.randomBytes(20).toString('hex');
    const tokenKey = `reset:${token}`;

    // שמירת הטוקן עם תוקף של 10 דקות
    await client.setEx(tokenKey, 600, userId); // 600 שניות = 10 דקות

    const resetUrl = `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;

    const message = {
        to: email,
        from: 'hazard.reporter@outlook.com', // כתובת שנרשמה ואושרה ב-SendGrid
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
        console.log("Reset email sent successfully to", email);
        res.status(200).json({ message: 'Reset link sent to your email' });
    } catch (error) {
        console.error("Error sending email: ", error);
        res.status(500).json({ error: 'Failed to send email' });
    } 
});


// איפוס סיסמה לפי טוקן
app.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
        return res.status(400).json({ error: 'Missing token or password' });
    }

    const valid = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(password);
    if (!valid) {
        return res.status(400).json({ error: 'Invalid password format' });
    }

    const tokenKey = `reset:${token}`;
    const userKey = await client.get(tokenKey);

    if (!userKey) {
        return res.status(400).json({ error: 'Token expired or invalid' });
    }

    const userData = JSON.parse(await client.get(userKey));
    userData.password = password;

    await client.set(userKey, JSON.stringify(userData));
    await client.del(tokenKey);

    req.session.user = {
        email: userData.email,
        username: userData.username
    };

    res.status(200).json({ message: 'Password reset successfully' });
});


app.post('/upload-detection', upload.single('file'), async (req, res) => {
    console.log("Session:", req.session); // Debug session
    console.log("Is Authenticated:", req.isAuthenticated()); // Debug authentication
    console.log("User:", req.user); // Debug user object

    // בדוק אם הקובץ הועלה
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // אימות משתמש - בדיקה משופרת
    if (!req.isAuthenticated()) {
        console.log("Authentication failed"); // Debug log
        return res.status(401).json({ error: 'Please log in again' });
    }

    const hazardTypes = req.body.hazardTypes;
    
    // שלב המרת קואורדינטות לכתובת
    const jsonString = req.body.geoData;
    if (!jsonString) {
        return res.status(400).json({ error: 'Missing geolocation data in image metadata' });
    }

    try {
        // עיבוד המידע
        const geoData = JSON.parse(jsonString);
        if (!geoData || typeof geoData.lat !== 'number' || typeof geoData.lng !== 'number' || 
            isNaN(geoData.lat) || isNaN(geoData.lng) || 
            geoData.lat < -90 || geoData.lat > 90 || 
            geoData.lng < -180 || geoData.lng > 180) {
            return res.status(400).json({ error: 'Invalid geolocation data' });
        }

        const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
        const geoCodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${geoData.lat},${geoData.lng}&language=he&key=${apiKey}`;

        let address = `Coordinates: ${geoData.lat}, ${geoData.lng}`;
        
        try {
            const geoResponse = await axios.get(geoCodingUrl, { timeout: 5000 });
            if (geoResponse.data && geoResponse.data.results && geoResponse.data.results.length > 0) {
                address = geoResponse.data.results[0]?.formatted_address || address;
            } else {
                console.warn('No geocoding results found for coordinates:', geoData.lat, geoData.lng);
            }
        } catch (geocodeError) {
            console.warn('Geocoding API failed:', geocodeError.message);
            // Continue with coordinate fallback address
        }
        
        // העלאה ל-Cloudinary
        const streamUpload = (buffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'detections' },
                    (error, result) => {
                        if (result) {
                            resolve(result);
                        } else {
                            reject(error);
                        }
                    }
                );
                streamifier.createReadStream(buffer).pipe(stream);
            });
        };

        const result = await streamUpload(req.file.buffer);

        // אם העלאה לא הצליחה
        if (!result || !result.secure_url) {
            return res.status(500).json({ error: 'Failed to upload image to Cloudinary' });
        }
        let locationNote = req.body.locationNote || "GPS";

        // קבלת שם המדווח
        let reportedBy;  

        if (req.session?.user?.username) {  
          reportedBy = req.session.user.username;  
        } else if (req.user?.username) {  
          reportedBy = req.user.username;  
        } else {  
          reportedBy = 'אנונימי';  
        }
        
        // שמירה ב-Redis
        const reportId = Date.now();
        const reportKey = `report:${reportId}`;
        const createdAt = new Date().toISOString();
        
        const report = {
            id: reportId,
            type: hazardTypes,
            location: address,
            time: req.body.time || createdAt,
            image: result.secure_url,
            status:'New',
            locationNote,
            reportedBy,
            createdAt
        };

        await client.json.set(reportKey, '$', report);
        console.log("💾 Report saved to Redis: ", reportKey);

        res.status(200).json({
            message: 'Report uploaded and saved successfully',
            report
        });
    } catch (e) {
        console.error('🔥 Upload error:', e);
        res.status(500).json({ error: 'Failed to upload report' });
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
