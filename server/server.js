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
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';

// 📦 Firebase & Cloudinary
import { db, bucket } from './firebaseAdmin.js';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import streamifier from 'streamifier';

// 🌍 ES Modules __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 📁 Load environment variables
dotenv.config();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ☁️ Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dgn5da9f8',
  api_key: process.env.CLOUDINARY_API_KEY || '239479697485235',
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer();
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, '../public')));

// SendGrid configuration
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Initialize Redis client
const client = createClient({
  username: process.env.REDIS_USERNAME || 'default',
  password: process.env.REDIS_PASSWORD || 'e7uFJGU10TYEVhTJFoOkyPog0fBMhJMG',
  socket: { 
    host: process.env.REDIS_HOST || 'redis-13437.c44.us-east-1-2.ec2.redns.redis-cloud.com', 
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 13437 
  }
});

// Passport middleware – חייב להיות אחרי session
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.email));

passport.deserializeUser(async (email, done) => {
  try {
    const keys = await client.keys('user:*');
    for (const key of keys) {
      const user = JSON.parse(await client.get(key));
      if (user.email === email) return done(null, user);
    }
    done(null, false);
  } catch (err) {
    done(err, null);
  }
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || "46375555882-rmivba20noas9slfskb3cfvugssladrr.apps.googleusercontent.com",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "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",
  callbackURL: `${BASE_URL}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const googleId = profile.id;
    const email = profile.emails[0].value;
    const username = profile.displayName;
    const googleKey = `user:${googleId}`;

    const googleUser = await client.get(googleKey);
    if (googleUser) return done(null, JSON.parse(googleUser));

    const keys = await client.keys('user:*');
    for (const key of keys) {
      if (key === googleKey) continue;
      const user = JSON.parse(await client.get(key));
      if (user.email === email) return done(null, false, { message: 'EmailExists' });
    }

    const newUser = { email, username, type: 'user' };
    await client.set(googleKey, JSON.stringify(newUser));
    return done(null, newUser);
  } catch (err) {
    return done(err, null);
  }
}));

// Routes

// Route for initiating Google authentication
app.get('/auth/google', (req, res, next) => {
  req.session.authMode = req.query.mode || 'login';
  req.session.returnTo = req.headers.referer || `${BASE_URL}/upload.html`;

  // בדיקה אם המשתמש כבר מחובר
  if (req.isAuthenticated && req.isAuthenticated()) {
    req.logout(err => {
      if (err) return res.redirect(`${BASE_URL}/login.html?error=LogoutFailed`);
      req.session.destroy(() => next());
    });
  } else {
    next();
  }
}, passport.authenticate('google', {
  scope: ['profile', 'email'],
  prompt: 'select_account'
}));

// Callback לאחר אימות ב-Google
app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', async (err, user, info) => {
    const returnTo = req.session.returnTo || `${BASE_URL}/upload.html`;
    delete req.session.returnTo;

    if (err) return res.redirect(`${BASE_URL}/login.html?error=ServerError`);
    if (!user) {
      if (info && info.message === 'EmailExists')
        return res.redirect(`${BASE_URL}/login.html?error=EmailExists`);
      return res.redirect(`${BASE_URL}/login.html?error=AuthFailed`);
    }

    req.login(user, err => {
      if (err) return res.redirect(`${BASE_URL}/login.html?error=LoginFailed`);
      req.session.user = { email: user.email, username: user.username };
      return res.redirect(returnTo);
    });
  })(req, res, next);
});

// נתיב להעלאת קבצים
app.get('/upload', (req, res) => {
  if (!req.session.user) return res.redirect(`${BASE_URL}/`);
  res.sendFile(path.join(__dirname, '../public/upload.html'));
});

// נתיב ליציאה (logout)
app.get('/logout', (req, res) => {
  req.logout(err => {
    if (err) {
      return res.redirect(`${BASE_URL}/?error=LogoutError`);
    }
    req.session.destroy(() => {
      res.redirect(`${BASE_URL}/`);
    });
  });
});

// נתיב לדף התחברות ראשי
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// נתיב לדשבורד
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect(`${BASE_URL}/`);
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// יצירת דיווח חדש
app.post('/api/reports', async (req, res) => {
    if (!req.session.user && !req.isAuthenticated()) {
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
    };

    const reportKey = `report:${report.id}`;  // יצירת המפתח הייחודי לכל דיווח

    try {
        // שמירה ב-Redis תחת המפתח הייחודי
        await client.json.set(reportKey, '$', report);  // משתמשים ב-JSON.SET כדי לשמור את הדיווח

        res.status(200).json({ message: 'Report saved successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error saving report' });
    }
});

// שליפת כל הדיווחים
app.get('/api/reports', async (req, res) => {
    if (!req.session.user && !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // שליפת כל המפתחות של דיווחים
        const keys = await client.keys('report:*');
        const reports = [];

        for (const key of keys) {
            const report = await client.json.get(key);
            if (report) {
                reports.push(report);
            }
        }

        res.status(200).json(reports);
    } catch (err) {
        console.error('🔥 Error fetching reports:', err);
        res.status(500).json({ error: 'Error fetching reports' });
    }
});


// הרצת השרת
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// רישום משתמש רגיל (לא Google)
app.post('/register', async (req, res) => {  
    const { email, username, password } = req.body;  

    if (!email || !username || !password) {  
        return res.status(400).json({ error: 'Missing required fields' });  
    }  

    const existingUserKey = await client.keys(`user:*`).then(keys => {  
        return keys.find(async (key) => {  
            const user = JSON.parse(await client.get(key));  
            return user.email === email; // בדיקה אם המייל קיים  
        });  
    });  

    if (existingUserKey) {  
        return res.status(400).json({ error: 'User already registered with this email.' }); // הודעת שגיאה  
    }  

    const userId = `user:${Date.now()}`;  
    const newUser = {  
        email,  
        username,  
        password,  
        type: 'user'  
    };  

    await client.set(userId, JSON.stringify(newUser));  

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
    for (const key of userKeys) {
        const userData = JSON.parse(await client.get(key));
        if (userData.email === email) {
            userId = key;
            break;
        }
    }

    if (!userId) {
        return res.status(404).json({ error: 'Email not found' });
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

    const resetUrl = `http://localhost:3000/reset-password.html?token=${token}`;

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
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
  
    // אימות משתמש
    if (!req.session.user && !req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  
    try {
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
  
      // נתוני הדיווח שנשלחים ב-form-data
      const {
        type,
        location,
        time,
        status
      } = req.body;
  
      const reportId = Date.now();
      const reportKey = `report:${reportId}`;
      const createdAt = new Date().toISOString();
  
      // נשלוף את שם המדווח מה-session או מה-user (אם נרשם עם גוגל)
      const reportedBy =
        req.session.user?.username ||
        req.user?.username ||
        req.user?.displayName || // למקרה של Google
        'אנונימי';
  
      const report = {
        id: reportId,
        type: type || 'unknown',
        location: location || 'unknown',
        time: time || createdAt,
        image: result.secure_url,
        status: status || 'New',
        reportedBy,
        createdAt
      };
  
      // שמירה ב-Redis
      await client.json.set(reportKey, '$', report);
      console.log("💾 Report saved to Redis:", reportKey);
  
      // שמירה ב-Firestore
      await db.collection('detections').add(report);
      console.log("✅ Report saved to Firestore");
  
      res.status(200).json({
        message: 'Report uploaded and saved successfully',
        report
      });
  
    } catch (e) {
      console.error('🔥 Upload error:', e);
      res.status(500).json({ error: 'Failed to upload report' });
    }
  });
  
  
 