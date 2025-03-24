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
const port = 3000;


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
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// הגדרת אסטרטגיית Google OAuth
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    // חיפוש אם המשתמש כבר קיים ב-Redis
    const userKey = `user:${profile.id}`;
    const existingUser = await client.get(userKey);

    if (!existingUser) {
        // אם המשתמש לא קיים, ניצור משתמש חדש ונשמור ב-Redis
        const newUser = {
            email: profile.emails[0].value,
            username: profile.displayName,  // אם צריך, אפשר להוסיף שם משתמש נוסף
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

// כפתור התחברות עם Google
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// נקודת חזרה לאחר ההתחברות
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/upload'); // הפניה לדף לאחר התחברות מוצלחת
});

// דף העלאת קבצים (Upload)
app.get('/upload', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/'); // אם לא מחובר, מחזירים לדף הבית
    }

    // הצגת דף ה-upload
    res.sendFile(path.join(__dirname, '../public/html/upload.html'));
});

// יציאה מהמערכת
app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

// הגדרת תקיית public
app.use(express.static(path.join(__dirname, '../public')));

// דף ברירת מחדל
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/login.html'));
});

// הרצת השרת
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});