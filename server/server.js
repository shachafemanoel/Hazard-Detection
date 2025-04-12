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
  cloud_name: 'dgn5da9f8',
  api_key: '239479697485235',
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer();
const app = express();
app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`);
  });
  
app.use(express.json());
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const client = createClient({
  username: 'default',
  password: 'e7uFJGU10TYEVhTJFoOkyPog0fBMhJMG',
  socket: { host: 'redis-13437.c44.us-east-1-2.ec2.redns.redis-cloud.com', port: 13437 }
});
await client.connect();

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
  clientID: "46375555882-rmivba20noas9slfskb3cfvugssladrr.apps.googleusercontent.com",
  clientSecret: "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",
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

app.get('/auth/google', (req, res, next) => {
  req.session.authMode = req.query.mode || 'login';
  req.session.returnTo = req.headers.referer || `${BASE_URL}/upload.html`;
  if (req.isAuthenticated()) {
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

app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', async (err, user, info) => {
    const mode = req.session.authMode || 'login';
    const returnTo = req.session.returnTo || `${BASE_URL}/upload.html`;
    delete req.session.returnTo;

    if (err) return res.redirect(`${BASE_URL}/login.html?error=ServerError`);
    if (!user) {
      if (info?.message === 'EmailExists') return res.redirect(`${BASE_URL}/login.html?error=EmailExists`);
      return res.redirect(`${BASE_URL}/login.html?error=AuthFailed`);
    }

    req.login(user, err => {
      if (err) return res.redirect(`${BASE_URL}/login.html?error=LoginFailed`);
      req.session.user = { email: user.email, username: user.username };
      return res.redirect(returnTo);
    });
  })(req, res, next);
});

// 🔁 Update redirects in other endpoints
app.get('/upload', (req, res) => {
  if (!req.session.user) return res.redirect(`${BASE_URL}/`);
  res.sendFile(path.join(__dirname, '../public/upload.html'));
});

app.get('/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.redirect(`${BASE_URL}/`);
    });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect(`${BASE_URL}/`);
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});
