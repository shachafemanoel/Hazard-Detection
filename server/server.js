import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import dotenv from 'dotenv';
import { createClient } from 'redis';
import path from 'path';
import { fileURLToPath } from 'url';

// הגדרת __dirname בסביבה של ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
// Render מספקת את המשתנה PORT
const port = process.env.PORT || 3000;
app.use(express.json());

// חיבור ל-Redis (עדכן את הפרטים במידת הצורך)
const client = createClient({
    username: 'default',
    password: process.env.REDIS_PASSWORD,  // עדיף להשתמש במשתנה סביבה
    socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
    }
});
client.on('error', (err) => console.log('Redis Client Error:', err));
async function connectRedis() {
    await client.connect();
    console.log('Connected to Redis');
}
connectRedis();

// הגדרת session – הקפד שה-cookie יהיה secure בסביבת production
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',  
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === "production" }
}));
app.use(passport.initialize());
app.use(passport.session());

// הגדרת אסטרטגיית Google OAuth – עדכון callback URL בהתאם למשתנה סביבה
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    const userKey = `user:${profile.id}`;
    const existingUser = await client.get(userKey);
    if (!existingUser) {
        const newUser = {
            email: profile.emails[0].value,
            username: profile.displayName,
            type: 'user',
        };
        await client.set(userKey, JSON.stringify(newUser));
        console.log(`New user created: ${profile.displayName}`);
    } else {
        console.log(`Existing user: ${profile.displayName}`);
    }
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});
passport.deserializeUser((user, done) => {
    done(null, user);
});

// נתיב התחברות עם Google
app.get('/auth/google', (req, res, next) => {
    const mode = req.query.mode || 'login';
    req.session.authMode = mode;
    if (req.isAuthenticated()) {
        req.logout(() => {  
            req.session.destroy(() => {
                next();
            });
        });
    } else {
        next();
    }
}, passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }));

// נקודת callback לאחר התחברות
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), async (req, res) => {
    const mode = req.session.authMode || 'login';
    const userKey = `user:${req.user.id}`;
    const newUser = {
        email: req.user.emails[0].value,
        username: req.user.displayName,
        type: 'user'
    };
    await client.set(userKey, JSON.stringify(newUser));
    console.log(`User registered or updated: ${req.user.displayName}`);
    res.redirect('/upload');
});

// דף העלאת קבצים
app.get('/upload', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }
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
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// API לדיווחים
app.post('/api/reports', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { type, location, time, image, status, reportedBy } = req.body;
    const report = {
        id: new Date().getTime(),
        type,
        location,
        time,
        image,
        status,
        reportedBy,
    };
    const reportKey = `report:${report.id}`;
    try {
        await client.json.set(reportKey, '$', report);
        res.status(200).json({ message: 'Report saved successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error saving report' });
    }
});

app.get('/api/reports', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const reportKeys = await client.keys('report:*');
        if (reportKeys.length === 0) {
            return res.status(404).json({ error: 'No reports found' });
        }
        const reports = [];
        for (const key of reportKeys) {
            const report = await client.json.get(key);
            reports.push(report);
        }
        res.json(reports);
    } catch (err) {
        console.error('Error fetching reports:', err);
        res.status(500).json({ error: 'Error fetching reports from Redis' });
    }
});

// הפעלת השרת
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
