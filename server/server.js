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
<<<<<<< HEAD
import { db, bucket } from './firebaseAdmin.js';
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';

=======
import flash from 'connect-flash';  
>>>>>>> origin/master


// הגדרת __dirname בסביבה של ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config(); 
const app = express();
const port = 3000;
app.use(express.json());
app.use(flash());  

// הגדרת SendGrid API Key
sgMail.setApiKey("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");

// חיבור ל-Redis בענן
const client = createClient({
    username: 'default',
    password: 'e7uFJGU10TYEVhTJFoOkyPog0fBMhJMG',
    socket: {
        host: 'redis-13437.c44.us-east-1-2.ec2.redns.redis-cloud.com',
        port: 13437
    }
});

// האזנה לאירועים
client.on('error', (err) => console.log('Redis Client Error:', err));

async function connectRedis() {
    await client.connect();
    console.log('Connected to Redis');
}
connectRedis();

// הגדרת session
app.use(session({
    secret: 'your-secret-key',  // הוסף כאן מפתח ייחודי וסודי
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false,
        httpOnly: true,
     }   // הגדרה עבור סשנים לא מאובטחים ב-localhost
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user.email); // מזהה יחיד
  });
  
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

// הגדרת האסטרטגיה של גוגל
passport.use(new GoogleStrategy({
    clientID: "46375555882-rmivba20noas9slfskb3cfvugssladrr.apps.googleusercontent.com",
    clientSecret: "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",
    callbackURL: "http://localhost:3000/auth/google/callback"
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

// פונקציה לבדוק אם המייל קיים  
async function emailExists(email) {  
    const existingUserKeys = await client.keys('user:*');  
    for (const key of existingUserKeys) {  
        const userData = JSON.parse(await client.get(key));  
        if (userData.email === email) {  
            return true; // מייל קיים  
        }  
    }  
    return false; // מייל לא קיים  
}  

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
    if (!req.session.user) {
        return res.redirect('/'); // אם לא מחובר, מחזירים לדף הבית
    }

    // הצגת דף ה-upload
    res.sendFile(path.join(__dirname, '../public/upload.html'));
});

// יציאה מהמערכת
app.get('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

// הגדרת תקיית public
app.use(express.static(path.join(__dirname, '../public')));

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
<<<<<<< HEAD
app.post('/api/reports', async (req, res) => {
    if (!req.isAuthenticated()) {
=======
app.get('/api/reports', async (req, res) => {
    if (!req.session.user && !req.isAuthenticated()) {
>>>>>>> origin/master
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { type, location, time, image, status, reportedBy } = req.body;

    const reportId = new Date().getTime();
    const reportKey = `report:${reportId}`;
    const createdAt = Date.now();

    try {
        // שלב 1: שמירת התמונה ב-Firebase Storage
        let imageUrl = null;

        if (image && image.startsWith('data:image')) {
            const matches = image.match(/^data:image\/(png|jpeg);base64,(.+)$/);
            if (!matches) {
                return res.status(400).json({ error: 'Invalid image format' });
            }

            const ext = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');

            const filename = `detections/${reportId}_${uuidv4()}.${ext}`;
            const file = bucket.file(filename);

            await file.save(buffer, {
                metadata: { contentType: `image/${ext}` },
                public: true
            });

            imageUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
        }

        // שלב 2: שמירה ב-Redis
        const report = {
            id: reportId,
            type,
            location,
            time,
            imageUrl,
            status,
            reportedBy,
            createdAt
        };

        await client.json.set(reportKey, '$', report);

        // שלב 3: שמירה בפיירבייס (Firestore)
        await db.collection('detections').add(report);

        console.log('✅ Report saved in Redis + Firebase + Storage');

        res.status(200).json({ message: 'Report saved successfully' });
    } catch (err) {
        console.error('🔥 Error saving report:', err);
        res.status(500).json({ error: 'Error saving report' });
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
                    email,node_modules/

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