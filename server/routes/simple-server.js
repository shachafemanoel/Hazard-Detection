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
app.use(express.static(path.join(__dirname, '../../public'), { 
    index: false,
    extensions: ['html'],
    setHeaders: (res, path) => {
        // Set proper MIME types for ML models and WASM files
        if (path.endsWith('.onnx')) {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        } else if (path.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        } else if (path.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        }
    }
}));

// Specific route for ONNX model files
app.get('/object_detection_model/*.onnx', (req, res) => {
    const modelName = decodeURIComponent(req.params[0]);
    const modelPath = path.resolve(
        process.cwd(),
        'public',
        'object_detection_model',
        `${modelName}.onnx`
    );
    
    console.log(`📂 Requesting ONNX model: ${modelName}.onnx`);
    console.log(`📁 Full path: ${modelPath}`);
    
    // Check if file exists
    if (!require('fs').existsSync(modelPath)) {
        console.log(`❌ Model not found: ${modelPath}`);
        return res.status(404).json({ error: 'Model not found' });
    }
    
    // Set proper headers for ONNX files
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    console.log(`✅ Serving ONNX model: ${modelName}.onnx`);
    res.sendFile(modelPath);
});

// Specific route for web ONNX model files  
app.get('/web/*.onnx', (req, res) => {
    const modelName = decodeURIComponent(req.params[0]);
    const modelPath = path.resolve(
        process.cwd(),
        'public',
        'web',
        `${modelName}.onnx`
    );
    
    console.log(`📂 Requesting web ONNX model: ${modelName}.onnx`);
    console.log(`📁 Full path: ${modelPath}`);
    
    // Check if file exists
    if (!require('fs').existsSync(modelPath)) {
        console.log(`❌ Web model not found: ${modelPath}`);
        return res.status(404).json({ error: 'Web model not found' });
    }
    
    // Set proper headers for ONNX files
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    console.log(`✅ Serving web ONNX model: ${modelName}.onnx`);
    res.sendFile(modelPath);
});

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

// Basic login endpoint for testing (simplified - no real authentication)
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    
    // Simple validation
    if (!email || !password) {
        return res.status(400).json({
            error: 'Email and password are required'
        });
    }
    
    // For testing purposes, accept any email/password combination
    // In production, this should validate against a real user database
    res.json({
        success: true,
        message: 'Login successful',
        user: {
            email: email
        }
    });
});

// Start server
app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Simple server running on port ${port}`);
    if (process.env.DEBUG_ENV === 'true') {
        console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
    }
});
