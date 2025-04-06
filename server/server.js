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
app.use(express.json());


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
    cookie: { secure: false }   // הגדרה עבור סשנים לא מאובטחים ב-localhost
}));
app.use(passport.initialize());
app.use(passport.session());

// הגדרת אסטרטגיית Google OAuth
passport.use(new GoogleStrategy({
    clientID: "46375555882-rmivba20noas9slfskb3cfvugssladrr.apps.googleusercontent.com",
    clientSecret: "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",
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
app.get('/auth/google', (req, res, next) => {
    const mode = req.query.mode || 'login'; // ברירת מחדל היא login
    req.session.authMode = mode; // שמירה ב-session כדי להשתמש לאחר האימות

    if (req.isAuthenticated()) {
        req.logout(() => {  
            req.session.destroy(() => {
                next(); // לאחר התנתקות מוחלטת - נשלח את המשתמש ל-Google
            });
        });
    } else {
        next();
    }
}, passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }));  

// נקודת חזרה לאחר ההתחברות
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), async (req, res) => {
    const mode = req.session.authMode || 'login';
    const userKey = `user:${req.user.id}`;

    // יצירת משתמש חדש ב-Redis בלי לבדוק אם כבר קיים
    const newUser = {
        email: req.user.emails[0].value,
        username: req.user.displayName,
        type: 'user'
    };

    await client.set(userKey, JSON.stringify(newUser));
    console.log(`User registered or updated: ${req.user.displayName}`);

    res.redirect('/upload'); // הפניה לדף ההעלאה
});


// דף העלאת קבצים (Upload)
app.get('/upload', async (req, res) => {
    if (!req.isAuthenticated()) {
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
    // אם המשתמש לא מחובר, תחזיר אותו לדף התחברות
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// יצירת דיווח חדש
app.post('/api/reports', async (req, res) => {
    if (!req.isAuthenticated()) {
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
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // שליפת כל המפתחות במאגר Redis שכוללים את המידע על הדיווחים
        const reportKeys = await client.keys('report:*'); // מצא את כל המפתחות שמתחילים ב- 'report:'

        if (reportKeys.length === 0) {
            return res.status(404).json({ error: 'No reports found' });
        }

        // שליפת כל הדיווחים מ-Redis
        const reports = [];
        for (const key of reportKeys) {
            const report = await client.json.get(key);  // קבלת הנתונים כ-JSON
            reports.push(report);
        }

        res.json(reports);  // החזרת הדיווחים בצורת JSON
    } catch (err) {
        console.error('Error fetching reports:', err);
        res.status(500).json({ error: 'Error fetching reports from Redis' });
    }
});


// הרצת השרת
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

