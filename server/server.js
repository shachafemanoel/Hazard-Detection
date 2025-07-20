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
console.log("🔧 Environment Configuration:");
console.log("- Redis Host:", process.env.REDIS_HOST || "localhost (default)");
console.log("- Redis Port:", process.env.REDIS_PORT || "6379 (default)");
console.log("- Session Secret:", process.env.SESSION_SECRET ? "✅ Loaded" : "⚠️  Using default (not secure for production)");
console.log("- Google Maps API:", process.env.GOOGLE_MAPS_API_KEY ? "✅ Loaded" : "❌ Missing (maps won't work)");
console.log("- Cloudinary:", process.env.CLOUDINARY_CLOUD_NAME ? "✅ Loaded" : "❌ Missing (image upload won't work)");
console.log("- Google OAuth:", process.env.GOOGLE_CLIENT_ID ? "✅ Loaded" : "⚠️  Missing (Google login disabled)");
console.log("- SendGrid:", process.env.SENDGRID_API_KEY ? "✅ Loaded" : "⚠️  Missing (password reset disabled)");
console.log("");

// ☁️ Cloudinary config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 🎛️ Setup multer (in-memory uploads)
const upload = multer();

// 🚀 Initialize Express app
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
    origin: ['https://hazard-detection.onrender.com', 'http://localhost:3000'],
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
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log("✅ SendGrid configured for email sending");
} else {
    console.log("⚠️  SendGrid not configured - password reset won't work");
}

// 🔌 Redis client
const client = createClient({
  username: 'default',
  password: process.env.REDIS_PASSWORD || undefined, // אם אין סיסמה, השתמש ב-undefined
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379
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
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback"

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
                return res.redirect('/pages/login.html?error=LogoutFailed');  
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
            return res.redirect('/pages/login.html?error=ServerError');
        }
        
        if (!user) {
            // משתמש לא אותנטי → בדוק אם זה בגלל שהמייל כבר תפוס
            if (info && info.message === 'EmailExists') {
                return res.redirect('/pages/login.html?error=EmailExists');
            }
            return res.redirect('/pages/login.html?error=AuthFailed');
        }
        
        // התחברות או רישום מוצלחים
        req.login(user, async (err) => {
            if (err) {
                console.error('Login Error:', err);
                return res.redirect('/pages/login.html?error=LoginFailed');
            }
            
            req.session.user = { email: user.email, username: user.username };
            
            return res.redirect('/pages/index.html');
        });
    })(req, res, next);
});



// דף העלאת קבצים (Upload)
app.get('/upload', async (req, res) => {
    if (!req.isAuthenticated()) { // שימוש ב-req.isAuthenticated()
        return res.redirect('/'); // אם לא מחובר, מחזירים לדף הבית
    }
    // הצגת דף ה-upload
    res.sendFile(path.join(__dirname, '../public/pages/index.html'));
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

// Authentication check endpoint  
app.get('/api/auth/check', (req, res) => {
    if (req.isAuthenticated()) {
        res.status(200).json({ 
            authenticated: true, 
            user: { 
                email: req.session.user?.email || req.user?.email,
                username: req.session.user?.username || req.user?.username 
            } 
        });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

// דף ברירת מחדל
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/pages/index.html');
    }
    res.redirect('/pages/login.html');
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

// שליפת כל הדיווחים
app.get('/api/reports', async (req, res) => {
    const filters = req.query;

    if (filters.hazardType && typeof filters.hazardType === 'string') {
        filters.hazardType = filters.hazardType.split(',').map(type => type.trim());
    }

    try {
        const keys = await client.keys('report:*');
        const reports = [];

        for (const key of keys) {
            let report;
            try {
                report = await client.json.get(key);
            } catch (err) {
                console.error(`Skipping key ${key} due to Redis type error:`, err.message);
                continue;
            }
            if (!report) continue;

            let match = true;

            // סוגי מפגעים: לפחות אחד מתוך הרשימה
            if (filters.hazardType) {
                const hazardArray = Array.isArray(filters.hazardType) ? filters.hazardType : [filters.hazardType];
            
                const reportTypes = (report.type || '').split(',').map(t => t.trim().toLowerCase());
                const hasMatch = hazardArray.some(type => reportTypes.includes(type.toLowerCase()));
                
                if (!hasMatch) match = false;
            }
                     

            // מיקום
            if (filters.location) {
                const reportLoc = (report.location || '').toLowerCase();
                const pattern = filters.location.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(pattern, 'i');
                if (!regex.test(reportLoc)) match = false;
            }

            // תאריך
            if (filters.startDate && new Date(report.time) < new Date(filters.startDate)) match = false;
            if (filters.endDate && new Date(report.time) > new Date(filters.endDate)) match = false;

            // סטטוס
            if (filters.status) {
                const reportStatus = report.status.toLowerCase();
                const filterStatus = filters.status.toLowerCase();
                if (reportStatus !== filterStatus) match = false;
            }

            // מחפש לפי מדווח
            if (filters.reportedBy) {
                const reporter = (report.reportedBy || '').toLowerCase();
                const search = filters.reportedBy.toLowerCase();
                if (!reporter.includes(search)) match = false;
            }

            if (match) {
                reports.push(report);
            }
        }

        res.status(200).json(reports);
    } catch (err) {
        console.error('🔥 Error fetching reports:', err);
        res.status(500).json({ error: 'Error fetching reports' });
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
app.get('/api/config/maps-key', (_, res) => {
    // Google Maps API key is public anyway, so no need for authentication
    if (!process.env.GOOGLE_MAPS_API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }
    res.json({ apiKey: process.env.GOOGLE_MAPS_API_KEY });
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

// Middleware לבדוק הרשאת admin
function requireAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Try to get user info from different sources
  let userType = null;
  
  // Check session first
  if (req.session && req.session.user) {
    userType = req.session.user.type;
  } else if (req.user) {
    userType = req.user.type;
  }
  
  // If type not in session/user, check Redis or hardcoded admin emails
  if (!userType) {
    const email = req.session?.user?.email || req.user?.email;
    if (email) {
      // Check if email is in admin list
      const adminEmails = ['nireljano@gmail.com', 'shachaf331@gmail.com'];
      userType = adminEmails.includes(email) ? 'admin' : 'user';
    }
  }
  
  if (userType === 'admin') {
    return next();
  }
  
  return res.status(403).json({ error: 'Access denied: Admins only' });
}

// API endpoint to get user info including admin status
app.get('/api/user-info', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ authenticated: false });
  }
  
  const email = req.session?.user?.email || req.user?.email;
  const username = req.session?.user?.username || req.user?.username;
  
  // Check if user is admin
  const adminEmails = ['nireljano@gmail.com', 'shachaf331@gmail.com'];
  const isAdmin = adminEmails.includes(email);
  
  res.json({
    authenticated: true,
    email,
    username,
    type: isAdmin ? 'admin' : 'user'
  });
});

// API endpoint to get current authenticated user information
app.get('/api/user', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ authenticated: false, error: 'Not authenticated' });
  }
  
  const email = req.session?.user?.email || req.user?.email;
  const username = req.session?.user?.username || req.user?.username;
  
  // Check if user is admin
  const adminEmails = ['nireljano@gmail.com', 'shachaf331@gmail.com'];
  const isAdmin = adminEmails.includes(email);
  
  res.json({
    authenticated: true,
    email,
    username,
    type: isAdmin ? 'admin' : 'user',
    role: isAdmin ? 'admin' : 'user'
  });
});

// API endpoint to get all users from Redis (admin only)
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const userKeys = await client.keys('user:*');
    const users = [];
    
    for (const key of userKeys) {
      try {
        const userData = await client.get(key);
        if (userData) {
          const user = JSON.parse(userData);
          // Don't expose passwords
          const { password, ...userWithoutPassword } = user;
          
          // Check if user is admin
          const adminEmails = ['nireljano@gmail.com', 'shachaf331@gmail.com'];
          const isAdmin = adminEmails.includes(user.email);
          
          users.push({
            ...userWithoutPassword,
            id: key,
            type: user.type || (isAdmin ? 'admin' : 'user'),
            role: user.type || (isAdmin ? 'admin' : 'user')
          });
        }
      } catch (parseError) {
        console.warn(`Failed to parse user data for key ${key}:`, parseError.message);
      }
    }
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// API endpoint to get user statistics
app.get('/api/user-stats', async (req, res) => {
  try {
    const userKeys = await client.keys('user:*');
    const reportKeys = await client.keys('report:*');
    
    let totalUsers = 0;
    let adminUsers = 0;
    let regularUsers = 0;
    
    const adminEmails = ['nireljano@gmail.com', 'shachaf331@gmail.com'];
    
    for (const key of userKeys) {
      try {
        const userData = await client.get(key);
        if (userData) {
          const user = JSON.parse(userData);
          totalUsers++;
          
          if (user.type === 'admin' || adminEmails.includes(user.email)) {
            adminUsers++;
          } else {
            regularUsers++;
          }
        }
      } catch (parseError) {
        console.warn(`Failed to parse user data for key ${key}:`, parseError.message);
      }
    }
    
    res.json({
      totalUsers,
      adminUsers,
      regularUsers,
      totalReports: reportKeys.length
    });
  } catch (error) {
    console.error('Error fetching user statistics:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
});

// הגבלת דף admin-dashboard
app.get('/pages/admin-dashboard.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pages/admin-dashboard.html'));
});

// רישום משתמש רגיל (לא Google)
app.post('/register', async (req, res) => {  
    const { email, username, password } = req.body;  

    if (!email || !username || !password) {  
        return res.status(400).json({ success: false, error: 'Missing required fields' });  
    }  

    const existingUser = await emailExists(email);  
    if (existingUser) {  
        return res.status(400).json({ success: false, error: 'User already registered with this email.' }); 
    }  

    const isAdmin = [
        'nireljano@gmail.com',
        'shachaf331@gmail.com'
    ].includes(email);
    const userId = `user:${Date.now()}`;  
    const newUser = {  
        email,  
        username,  
        password,  
        type: isAdmin ? 'admin' : 'user'  
    };  

    try {
        await client.set(userId, JSON.stringify(newUser));
        
        // התחבר אוטומטית אחרי רישום
        req.login(newUser, (err) => {
            if (err) {
                console.error('Auto-login after registration failed:', err);
                return res.status(201).json({ 
                    success: true, 
                    message: 'User registered successfully, please login manually', 
                    user: { email, username } 
                });
            }
            
            res.status(201).json({ 
                success: true, 
                message: 'User registered and logged in successfully', 
                redirect: '/pages/index.html',
                user: { email, username } 
            });
        });
        
    } catch (err) {
        console.error('Error saving user to Redis:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});



app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Missing email or password' });
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

                return res.status(200).json({ success: true, message: 'Login successful', user: { email, username: user.username } });
            } else {
                return res.status(401).json({ success: false, error: 'Incorrect password' });
            }
        }
    }

    return res.status(404).json({ success: false, error: 'User not found' });
});



// שליחה למייל של קישור לאיפוס סיסמה
app.post('/forgot-password', async (req, res) => {
    // בדיקה אם SendGrid מוגדר
    if (!process.env.SENDGRID_API_KEY) {
        return res.status(503).json({ 
            error: 'Email service not configured. Please contact administrator.' 
        });
    }

    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Please enter your email address' });
    }

    try {
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
            return res.status(400).json({ error: 'This account uses Google login and cannot reset password' });
        }

        // מחיקת טוקנים קודמים של אותו משתמש אם קיימים
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
        await client.setEx(tokenKey, 600, userId);

        const resetUrl = `https://hazard-detection.onrender.com/reset-password.html?token=${token}`;

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

        await sgMail.send(message); 
        console.log("Reset email sent successfully to", email);
        res.status(200).json({ message: 'Reset link sent to your email' });
        
    } catch (error) {
        console.error("Error in forgot-password:", error);
        res.status(500).json({ error: 'Failed to send reset email' });
    } 
});


// איפוס סיסמה לפי טוקן
app.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
        return res.status(400).json({ success: false, error: 'Missing token or password' });
    }

    const valid = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(password);
    if (!valid) {
        return res.status(400).json({ success: false, error: 'Invalid password format' });
    }

    const tokenKey = `reset:${token}`;
    const userKey = await client.get(tokenKey);

    if (!userKey) {
        return res.status(400).json({ success: false, error: 'Token expired or invalid' });
    }

    const userData = JSON.parse(await client.get(userKey));
    userData.password = password;

    await client.set(userKey, JSON.stringify(userData));
    await client.del(tokenKey);

    req.session.user = {
        email: userData.email,
        username: userData.username
    };

    res.status(200).json({ success: true, message: 'Password reset successfully' });
});


// Detection upload endpoint (requires authentication)
app.post('/api/detections', upload.single('file'), async (req, res) => {
    console.log("Detection upload requested");
    
    // בדיקה אם Cloudinary מוגדר
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
        return res.status(503).json({ 
            error: 'Image storage service not configured. Please contact administrator.' 
        });
    }

    // בדוק אם הקובץ הועלה
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // אימות משתמש - חובה
    if (!req.isAuthenticated()) {
        console.log("Authentication failed");
        return res.status(401).json({ error: 'Please log in to upload detections' });
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
            createdAt,
            coordinates: geoData ? { lat: geoData.lat, lng: geoData.lng } : null
        };

        // Store in Redis if connected
        if (redisConnected && client.isOpen) {
            try {
                await client.json.set(reportKey, '$', report);
                console.log("💾 Report saved to Redis: ", reportKey);
                
                // Broadcast real-time event
                broadcastSSEEvent({ type: 'new_report', report });
            } catch (redisError) {
                console.warn('Failed to save report to Redis:', redisError.message);
                // Continue anyway - the upload to Cloudinary succeeded
            }
        }
            
        res.status(200).json({
            message: 'Report uploaded and saved successfully',
            reportId: reportId,
            report,
            url: result.secure_url
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

// Delete image from Redis endpoint
app.delete('/api/redis/deleteImage', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // For Cloudinary URLs, we can extract the public_id and delete from Cloudinary
        if (url.includes('cloudinary.com')) {
            const publicIdMatch = url.match(/\/v\d+\/(.+)\.\w+$/);
            if (publicIdMatch) {
                const publicId = publicIdMatch[1];
                try {
                    await cloudinary.uploader.destroy(publicId);
                    console.log(`🗑️ Deleted image from Cloudinary: ${publicId}`);
                } catch (cloudinaryError) {
                    console.warn('Failed to delete from Cloudinary:', cloudinaryError.message);
                }
            }
        }

        res.status(200).json({ message: 'Image deletion processed' });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});
