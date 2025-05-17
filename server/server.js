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
import axios from 'axios';
import cors from 'cors';
import os from 'os'; // מייבאים את המודול os

// 📦 Firebase & Cloudinary
// import { initializeApp, cert } from 'firebase-admin/app'; //  הסרת ייבוא Firebase Admin
// import { getFirestore } from 'firebase-admin/firestore'; //  הסרת ייבוא Firestore
import { v2 as cloudinary } from 'cloudinary';import multer from 'multer';
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

// // 🌲 Firebase Admin SDK Initialization -  הסרת כל הבלוק הזה
// try {
//   const serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, './serviceAccountKey.json'), 'utf8'));
//   initializeApp({
//     credential: cert(serviceAccount)
//   });
//   console.log('✅ Firebase Admin initialized');
// } catch (error) {
//   console.error('🔥 Firebase Admin initialization error:', error);
// }

// 🎛️ Setup multer (in-memory uploads)
const upload = multer();

// 🚀 Initialize Express app
// 🚀 Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
    // כל דבר שמשרת JS/WebWorkers או שדורש גיאולוקציה
    if (req.path.startsWith('/ort/') || req.path === '/camera.html' || req.path === '/upload') {
      res.set({
        'Cross-Origin-Embedder-Policy':  'require-corp',
        'Cross-Origin-Opener-Policy':   'same-origin'
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
  app.use(cors());
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: process.env.NODE_ENV === 'production', // true ב-production (HTTPS), false בפיתוח (HTTP)
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : undefined // 'lax' מומלץ ל-production
    }
  }));  app.use(passport.initialize());
  app.use(passport.session());
  
  /* ───── שאר הנתיבים ───── */
  // static files
  app.use(express.static(path.join(__dirname, '../public')));
  
  




// 📨 SendGrid API
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// 🔌 Redis client
const client = createClient({
  username: 'default',
  password: 'e7uFJGU10TYEVhTJFoOkyPog0fBMhJMG',
  socket: {
    host: 'redis-13437.c44.us-east-1-2.ec2.redns.redis-cloud.com',
    port: 13437
  }
});

async function connectRedis() {
    try {
      await client.connect();
      console.log('✅ Connected to Redis');
    } catch (err) {
      console.error('🔥 Failed to connect to Redis:', err);
      // אולי תחליט להמתין ולטעון מחדש, או להריץ fallback
    }
  }
  connectRedis();
  


passport.serializeUser((user, done) => {
    done(null, user.email);  // מזהה יחיד
  });
  
  passport.deserializeUser(async (email, done) => {
    try {
      const keys = await client.keys('user:*');
      for (const key of keys) {
        const user = JSON.parse(await client.get(key));
        if (user.email === email) {
          return done(null, user);
        }
      }
      done(null, false);
    } catch (err) {
      console.error("❌ Error in deserializeUser:", err);  // הוספת לוג
      done(err, null);
    }
  });
  

// הגדרת האסטרטגיה של גוגל
passport.use(new GoogleStrategy({
    clientID: "46375555882-rmivba20noas9slfskb3cfvugssladrr.apps.googleusercontent.com",
    clientSecret: "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",
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
        // const mode = req.session.authMode || 'login'; // נראה שלא משתמשים ב-mode כאן
        
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
                    console.error('Login Error after Google Auth:', err);
                return res.redirect('/login.html?error=LoginFailed');
            }
                console.log('User logged in successfully via Google. Session:', JSON.stringify(req.session, null, 2));
                console.log('req.user after login:', JSON.stringify(req.user, null, 2));
            // req.session.user נשמר אוטומטית על ידי passport.serializeUser ו-deserializeUser
            
            return res.redirect('/upload.html');
        });
    })(req, res, next);
});



// דף העלאת קבצים (Upload)
app.get('/upload', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/'); // אם לא מחובר, מחזירים לדף הבית
    }
    
    // הצגת דף ה-upload
    res.sendFile(path.join(__dirname, '../public/upload.html'));
});
app.get('/camera.html', (req, res) => {
    // אם לא מחובר, נחזיר אותו לדף ההתחברות
    if (!req.session.user) {
      return res.redirect('/login.html');
    }
    // אחרת נחזיר את הקובץ
    res.sendFile(path.join(__dirname, '../public/camera.html'));
  });
// יציאה מהמערכת
app.get('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});


// דף ברירת מחדל
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
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
        locationNote: req.body.locationNote || 'GPS'

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
        console.log('--- Request to /api/reports ---');
        console.log('Session object:', JSON.stringify(req.session, null, 2));
        console.log('req.user (from Passport):', JSON.stringify(req.user, null, 2));
        console.log('req.isAuthenticated():', req.isAuthenticated ? req.isAuthenticated() : 'N/A');

       if (!req.session.user && !(req.isAuthenticated && req.isAuthenticated())) {
            console.log('Unauthorized access to /api/reports. Redirecting or sending 401.');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const filters = req.query;

    // המרת מחרוזת hazardType למערך
    if (filters.hazardType && typeof filters.hazardType === 'string') {
        filters.hazardType = filters.hazardType.split(',').map(type => type.trim());
    }

    try {
        const keys = await client.keys('report:*');
        const reports = [];

        for (const key of keys) {
            const report = await client.json.get(key);
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
    // בדוק אם הקובץ הועלה
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // אימות משתמש
    if (!(req.isAuthenticated?.() || req.session?.user)) { 
        return res.status(401).json({ error: 'Unauthorized' });
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
        if (!geoData || !geoData.lat || !geoData.lng) {
            return res.status(400).json({ error: 'Invalid geolocation data' });
        }

        const apiKey = "AIzaSyAXxZ7niDaxuyPEzt4j9P9U0kFzKHO9pZk";
        const geoCodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${geoData.lat},${geoData.lng}&language=he&key=${apiKey}`;

        const geoResponse = await axios.get(geoCodingUrl);
        if (!geoResponse.data.results.length) {
            return res.status(500).json({ error: 'Failed to get address from geolocation' });
        }
        const address = geoResponse.data.results[0]?.formatted_address || 'כתובת לא זמינה';
        
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
