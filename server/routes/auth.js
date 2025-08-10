import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import sgMail from '@sendgrid/mail';
import { createRequire } from 'module';
import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const router = express.Router();

// Constants
const BCRYPT_ROUNDS = 12;
const SESSION_COOKIE_NAME = 'hazard_session';
const PASSWORD_RESET_TTL = 600; // 10 minutes in seconds

// Rate limiting store (in-memory for simplicity)
const rateLimitStore = new Map();

// Rate limiting middleware
const rateLimit = (maxRequests = 5, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const record = rateLimitStore.get(key);
    
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }
    
    if (record.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Please try again later',
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }
    
    record.count++;
    next();
  };
};

// Input validation helpers
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  // At least 8 characters, 1 letter, 1 number
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
  return passwordRegex.test(password);
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().substring(0, 255); // Limit length and trim whitespace
};

// User management functions
class UserManager {
  constructor(redisClient, isSimpleMode = false) {
    this.client = redisClient;
    this.isSimpleMode = isSimpleMode;
    this.userStorePath = path.resolve(process.cwd(), 'server', 'data', 'users.json');
  }

  async ensureUserStoreDir() {
    if (!this.isSimpleMode) return;
    const dir = path.dirname(this.userStorePath);
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (err) {
      console.error('Failed to create user store directory:', err);
    }
  }

  async loadUsersFromFile() {
    if (!this.isSimpleMode) return [];
    try {
      const data = await fs.promises.readFile(this.userStorePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async saveUsersToFile(users) {
    if (!this.isSimpleMode) return;
    await this.ensureUserStoreDir();
    await fs.promises.writeFile(this.userStorePath, JSON.stringify(users, null, 2), 'utf8');
  }

  async findUserByEmail(email) {
    if (this.isSimpleMode) {
      const users = await this.loadUsersFromFile();
      return users.find(u => u.email === email) || null;
    }

    if (!this.client || !this.client.isOpen) {
      throw new Error('Redis client not available');
    }

    try {
      const keys = await this.client.keys('user:*');
      for (const key of keys) {
        const userStr = await this.client.get(key);
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user.email === email) {
            return user;
          }
        }
      }
      return null;
    } catch (err) {
      console.error('Error finding user by email:', err);
      throw err;
    }
  }

  async createUser({ email, username, password }) {
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    
    if (this.isSimpleMode) {
      const users = await this.loadUsersFromFile();
      if (users.some(u => u.email === email)) {
        throw new Error('User already exists with this email');
      }
      
      const newUser = {
        id: `user:${Date.now()}`,
        email,
        username,
        password: hashedPassword,
        type: 'user',
        createdAt: new Date().toISOString(),
        emailVerified: false
      };
      
      users.push(newUser);
      await this.saveUsersToFile(users);
      return newUser;
    }

    if (!this.client || !this.client.isOpen) {
      throw new Error('Redis client not available');
    }

    // Check if user already exists
    const existingUser = await this.findUserByEmail(email);
    if (existingUser) {
      throw new Error('User already exists with this email');
    }

    const userId = `user:${Date.now()}`;
    const newUser = {
      id: userId,
      email,
      username,
      password: hashedPassword,
      type: 'user',
      createdAt: new Date().toISOString(),
      emailVerified: false
    };

    await this.client.set(userId, JSON.stringify(newUser));
    return newUser;
  }

  async updateUserPassword(email, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    if (this.isSimpleMode) {
      const users = await this.loadUsersFromFile();
      const userIndex = users.findIndex(u => u.email === email);
      if (userIndex === -1) return false;
      
      users[userIndex].password = hashedPassword;
      users[userIndex].updatedAt = new Date().toISOString();
      await this.saveUsersToFile(users);
      return true;
    }

    if (!this.client || !this.client.isOpen) {
      throw new Error('Redis client not available');
    }

    const keys = await this.client.keys('user:*');
    for (const key of keys) {
      const userStr = await this.client.get(key);
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.email === email) {
          user.password = hashedPassword;
          user.updatedAt = new Date().toISOString();
          await this.client.set(key, JSON.stringify(user));
          return true;
        }
      }
    }
    return false;
  }

  async verifyPassword(email, password) {
    const user = await this.findUserByEmail(email);
    if (!user || !user.password) return null;
    
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }
}

// Token management for password reset
class TokenManager {
  constructor(redisClient, isSimpleMode = false) {
    this.client = redisClient;
    this.isSimpleMode = isSimpleMode;
    this.simpleTokenStore = new Map(); // In-memory store for simple mode
  }

  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  async storeToken(token, email, ttlSeconds = PASSWORD_RESET_TTL) {
    const tokenData = {
      email,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ttlSeconds * 1000)
    };

    if (this.isSimpleMode) {
      this.simpleTokenStore.set(token, tokenData);
      // Clean up expired tokens
      setTimeout(() => {
        this.simpleTokenStore.delete(token);
      }, ttlSeconds * 1000);
      return;
    }

    if (!this.client || !this.client.isOpen) {
      throw new Error('Redis client not available');
    }

    const tokenKey = `reset_token:${token}`;
    await this.client.setEx(tokenKey, ttlSeconds, JSON.stringify(tokenData));
  }

  async validateToken(token) {
    if (this.isSimpleMode) {
      const tokenData = this.simpleTokenStore.get(token);
      if (!tokenData) return null;
      
      if (Date.now() > tokenData.expiresAt) {
        this.simpleTokenStore.delete(token);
        return null;
      }
      
      return tokenData;
    }

    if (!this.client || !this.client.isOpen) {
      throw new Error('Redis client not available');
    }

    const tokenKey = `reset_token:${token}`;
    const tokenDataStr = await this.client.get(tokenKey);
    if (!tokenDataStr) return null;
    
    return JSON.parse(tokenDataStr);
  }

  async deleteToken(token) {
    if (this.isSimpleMode) {
      this.simpleTokenStore.delete(token);
      return;
    }

    if (!this.client || !this.client.isOpen) {
      return;
    }

    const tokenKey = `reset_token:${token}`;
    await this.client.del(tokenKey);
  }
}

// Initialize managers (will be set by the main server)
let userManager;
let tokenManager;

// Middleware to initialize managers
router.use((req, res, next) => {
  if (!userManager) {
    const redisClient = req.app.get('redisClient');
    const isSimpleMode = req.app.get('isSimpleMode') || false;
    
    userManager = new UserManager(redisClient, isSimpleMode);
    tokenManager = new TokenManager(redisClient, isSimpleMode);
  }
  next();
});

// POST /auth/login - Email/password authentication
router.post('/login', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Email and password are required'
      });
    }

    const sanitizedEmail = sanitizeInput(email).toLowerCase();
    
    if (!validateEmail(sanitizedEmail)) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'Please provide a valid email address'
      });
    }

    // Simple mode for testing
    if (req.app.get('isSimpleMode')) {
      const simpleUser = {
        id: `user:${Date.now()}`,
        email: sanitizedEmail,
        username: sanitizedEmail.split('@')[0],
        type: 'user'
      };
      
      req.login(simpleUser, (err) => {
        if (err) {
          console.error('Passport login error in simple mode:', err);
          return res.status(500).json({ error: 'Login failed' });
        }
        
        res.json({
          success: true,
          message: 'Login successful',
          user: {
            email: simpleUser.email,
            username: simpleUser.username
          }
        });
      });
      return;
    }

    // Verify credentials
    const user = await userManager.verifyPassword(sanitizedEmail, password);
    
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Use Passport for session management
    req.login(user, (err) => {
      if (err) {
        console.error('Passport login error:', err);
        return res.status(500).json({
          error: 'Login failed',
          message: 'Session creation failed'
        });
      }
      
      res.json({
        success: true,
        message: 'Login successful',
        user: {
          email: user.email,
          username: user.username,
          id: user.id
        }
      });
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Login service temporarily unavailable'
    });
  }
});

// POST /auth/register - User registration
router.post('/register', rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  try {
    const { email, username, password } = req.body;

    // Input validation
    if (!email || !username || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email, username, and password are required'
      });
    }

    const sanitizedEmail = sanitizeInput(email).toLowerCase();
    const sanitizedUsername = sanitizeInput(username);

    if (!validateEmail(sanitizedEmail)) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'Please provide a valid email address'
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        error: 'Invalid password format',
        message: 'Password must be at least 8 characters with at least one letter and one number'
      });
    }

    if (sanitizedUsername.length < 2 || sanitizedUsername.length > 50) {
      return res.status(400).json({
        error: 'Invalid username',
        message: 'Username must be between 2 and 50 characters'
      });
    }

    // Create user
    try {
      const newUser = await userManager.createUser({
        email: sanitizedEmail,
        username: sanitizedUsername,
        password
      });

      // Auto-login after registration
      req.login(newUser, (err) => {
        if (err) {
          console.error('Auto-login after registration failed:', err);
          return res.status(201).json({
            success: true,
            message: 'User registered successfully. Please log in.',
            user: {
              email: newUser.email,
              username: newUser.username
            }
          });
        }

        res.status(201).json({
          success: true,
          message: 'User registered and logged in successfully',
          user: {
            email: newUser.email,
            username: newUser.username,
            id: newUser.id
          }
        });
      });

    } catch (createError) {
      if (createError.message.includes('already exists')) {
        return res.status(409).json({
          error: 'Email already registered',
          message: 'An account with this email already exists'
        });
      }
      throw createError;
    }

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Registration service temporarily unavailable'
    });
  }
});

// POST /auth/logout - Session destruction
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        error: 'Logout failed',
        message: 'Session cleanup failed'
      });
    }

    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error('Session destruction error:', destroyErr);
        return res.status(500).json({
          error: 'Session cleanup failed',
          message: 'Please clear your cookies manually'
        });
      }

      res.clearCookie(SESSION_COOKIE_NAME);
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    });
  });
});

// POST /auth/forgot-password - Password reset token generation
router.post('/forgot-password', rateLimit(3, 15 * 60 * 1000), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email required',
        message: 'Please provide your email address'
      });
    }

    const sanitizedEmail = sanitizeInput(email).toLowerCase();

    if (!validateEmail(sanitizedEmail)) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'Please provide a valid email address'
      });
    }

    // Always return success to prevent email enumeration
    const genericResponse = {
      success: true,
      message: 'If your email is registered, you will receive a password reset link shortly'
    };

    try {
      const user = await userManager.findUserByEmail(sanitizedEmail);
      
      // Only proceed if user exists and has a password (not OAuth-only account)
      if (!user || !user.password) {
        return res.json(genericResponse);
      }

      // Generate and store reset token
      const token = tokenManager.generateToken();
      await tokenManager.storeToken(token, sanitizedEmail);

      // Construct reset URL
      const baseUrl = process.env.RENDER_EXTERNAL_URL ||
                      process.env.RAILWAY_STATIC_URL ||
                      process.env.RAILWAY_PUBLIC_DOMAIN ||
                      `${req.protocol}://${req.get('host')}`;
      
      const resetUrl = `${baseUrl}/reset-password.html?token=${token}`;

      // Send email if SendGrid is configured
      if (process.env.SENDGRID_API_KEY && sgMail) {
        try {
          const message = {
            to: sanitizedEmail,
            from: process.env.SENDGRID_FROM_EMAIL || 'noreply@hazard-detection.app',
            subject: 'Password Reset Request - Hazard Detection',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Password Reset Request</h2>
                <p>Hello,</p>
                <p>You requested to reset your password for your Hazard Detection account.</p>
                <p>Click the button below to reset your password:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetUrl}" 
                     style="background-color: #007bff; color: white; padding: 12px 30px; 
                            text-decoration: none; border-radius: 5px; display: inline-block;">
                    Reset Password
                  </a>
                </div>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666;">${resetUrl}</p>
                <p style="color: #666; font-size: 14px;">
                  This link will expire in 10 minutes for security reasons.
                </p>
                <p style="color: #666; font-size: 14px;">
                  If you didn't request this password reset, please ignore this email.
                </p>
              </div>
            `
          };

          await sgMail.send(message);
          console.log(`Password reset email sent to ${sanitizedEmail}`);

        } catch (emailError) {
          console.error('Failed to send password reset email:', emailError);
          // Don't expose email sending failure to client
        }
      } else {
        // Development mode: log the reset URL
        console.log(`Password reset requested for ${sanitizedEmail}`);
        console.log(`Reset URL: ${resetUrl}`);
        
        // In development, include the URL in response
        if (process.env.NODE_ENV !== 'production') {
          return res.json({
            ...genericResponse,
            resetUrl // Only include in development
          });
        }
      }

    } catch (findError) {
      console.error('Error during password reset process:', findError);
      // Don't expose internal errors
    }

    res.json(genericResponse);

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Password reset service temporarily unavailable'
    });
  }
});

// POST /auth/reset-password - Password reset with token validation
router.post('/reset-password', rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Token and new password are required'
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        error: 'Invalid password format',
        message: 'Password must be at least 8 characters with at least one letter and one number'
      });
    }

    // Validate token
    const tokenData = await tokenManager.validateToken(token);
    
    if (!tokenData) {
      return res.status(400).json({
        error: 'Invalid or expired token',
        message: 'Password reset token is invalid or has expired'
      });
    }

    // Update password
    const success = await userManager.updateUserPassword(tokenData.email, password);
    
    if (!success) {
      await tokenManager.deleteToken(token);
      return res.status(404).json({
        error: 'User not found',
        message: 'Associated user account not found'
      });
    }

    // Clean up token
    await tokenManager.deleteToken(token);

    // Auto-login after password reset
    const user = await userManager.findUserByEmail(tokenData.email);
    if (user) {
      req.login(user, (err) => {
        if (err) {
          console.error('Auto-login after password reset failed:', err);
          return res.json({
            success: true,
            message: 'Password reset successfully. Please log in with your new password.'
          });
        }

        res.json({
          success: true,
          message: 'Password reset successfully and logged in',
          user: {
            email: user.email,
            username: user.username
          }
        });
      });
    } else {
      res.json({
        success: true,
        message: 'Password reset successfully'
      });
    }

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Password reset service temporarily unavailable'
    });
  }
});

// GET /auth/session - Session validation endpoint
router.get('/session', (req, res) => {
  const isAuthenticated = req.isAuthenticated();
  
  res.json({
    authenticated: isAuthenticated,
    user: isAuthenticated ? {
      email: req.user.email,
      username: req.user.username,
      id: req.user.id
    } : null,
    sessionAge: req.session.cookie.maxAge,
    timestamp: new Date().toISOString()
  });
});

// GET /auth/health - Health check endpoint
router.get('/health', (req, res) => {
  const redisClient = req.app.get('redisClient');
  const isSimpleMode = req.app.get('isSimpleMode') || false;
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    mode: isSimpleMode ? 'simple' : 'full',
    redis: {
      available: !!redisClient,
      connected: redisClient ? redisClient.isOpen : false,
      ready: redisClient ? redisClient.isReady : false
    },
    features: {
      registration: true,
      passwordReset: true,
      sessionManagement: true,
      rateLimiting: true,
      emailNotifications: !!process.env.SENDGRID_API_KEY
    }
  });
});

export default router;