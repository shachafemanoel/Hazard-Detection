// Simple test server for Railway deployment
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

// ES Modules __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Basic middleware
app.use(cors({
    origin: '*', // Allow all origins for testing
    credentials: true
}));

app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../public'), { 
    index: false,
    extensions: ['html']
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
        port: port
    });
});

// Default route
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Test API endpoint
app.get('/api/test', (req, res) => {
    res.json({
        message: 'API is working!',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Simple server running on port ${port}`);
    console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
});