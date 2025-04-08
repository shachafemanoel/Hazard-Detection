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
import flash from 'connect-flash';  


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
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), async (req, res) => {  
    const mode = req.session.authMode || 'login';  
    const email = req.user.emails[0].value;  
    const displayName = req.user.displayName;  

    // בדוק אם המייל קיים במערכת  
    const userExists = await emailExists(email);  

    if (mode === 'signup') {  
        if (userExists) {  
            console.log("Email already exists! Redirecting to login.");  
            return res.redirect('/login.html?error=EmailExists');  
        }  

        // רק אם לא קיים - צור משתמש חדש  
        const newUserKey = `user:${req.user.id}`;  
        const newUser = {  
            email,  
            username: displayName,  
            type: 'google' // מבהיר שזו הרישום דרך גוגל  
        };  

        await client.set(newUserKey, JSON.stringify(newUser));  
        console.log('New user created (Google signup):', displayName);  

        req.session.user = { email, username: displayName };  
        return res.redirect('/upload.html');  
    }  

    // אם זה login mode  
    if (mode === 'login') {  
        if (!userExists) {  
            console.log("User not found during login.");  
            return res.redirect('/login.html?error=UserNotFound');  
        }  

        req.session.user = {  
            email,  
            username: displayName // אנו מקבלים את השם מדף החלון  
        };  
        console.log('Google login successful for:', displayName);  
        return res.redirect('/upload.html');  
    }  

    // fallback  
    res.redirect('/login.html');  
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
app.get('/api/reports', async (req, res) => {
    if (!req.session.user && !req.isAuthenticated()) {
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
                    email,
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