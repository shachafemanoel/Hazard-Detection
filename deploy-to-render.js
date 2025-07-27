#!/usr/bin/env node

/**
 * Deploy Hazard Detection App to Render
 * 
 * This script uses the Render API to deploy both frontend and backend services
 */

import fs from 'fs';
import path from 'path';

const RENDER_API_KEY = 'rnd_I7eVgXVX1Aln4TrRWVjhZviyv2X0';
const RENDER_API_BASE = 'https://api.render.com/v1';
const OWNER_ID = 'tea-cvohm79r0fns739nih30';

// Helper function to make API calls
async function renderAPI(endpoint, method = 'GET', data = null) {
    const url = `${RENDER_API_BASE}${endpoint}`;
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${RENDER_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    console.log(`📡 ${method} ${url}`);
    
    try {
        const response = await fetch(url, options);
        const result = await response.json();
        
        if (!response.ok) {
            console.error(`❌ API Error (${response.status}):`, result);
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }
        
        return result;
    } catch (error) {
        console.error('❌ Network error:', error.message);
        throw error;
    }
}

// Check if services already exist
async function checkExistingServices() {
    console.log('🔍 Checking for existing services...');
    
    try {
        const services = await renderAPI('/services');
        
        const existingServices = {
            frontend: services.find(s => s.name === 'hazard-detection-frontend'),
            backend: services.find(s => s.name === 'hazard-detection-backend')
        };
        
        console.log('📋 Existing services:');
        console.log(`   Frontend: ${existingServices.frontend ? '✅ Found' : '❌ Not found'}`);
        console.log(`   Backend: ${existingServices.backend ? '✅ Found' : '❌ Not found'}`);
        
        return existingServices;
    } catch (error) {
        console.log('⚠️ Could not check existing services:', error.message);
        return { frontend: null, backend: null };
    }
}

// Deploy backend service
async function deployBackend(existingService = null) {
    console.log('🚀 Deploying backend service...');
    
    const serviceConfig = {
        name: 'hazard-detection-backend',
        type: 'web_service',
        ownerID: OWNER_ID,
        serviceDetails: {
            repo: 'https://github.com/NirelJano/Hazard-Detection.git',
            branch: 'master',
            buildCommand: 'pip install -r requirements.txt',
            startCommand: 'cd server && python app.py',
            plan: 'starter',
            env: 'python',
            envVars: [
                { key: 'PYTHONPATH', value: '/opt/render/project/src/server' },
                { key: 'PORT', value: '8000' },
                { key: 'RENDER', value: 'true' }
            ]
        }
    };

    try {
        let result;
        if (existingService) {
            console.log('🔄 Updating existing backend service...');
            result = await renderAPI(`/services/${existingService.id}`, 'PATCH', serviceConfig);
        } else {
            console.log('➕ Creating new backend service...');
            result = await renderAPI('/services', 'POST', serviceConfig);
        }
        
        console.log('✅ Backend service deployed:', result.id);
        console.log(`🌐 Backend URL: https://${result.name}.onrender.com`);
        return result;
    } catch (error) {
        console.error('❌ Backend deployment failed:', error.message);
        throw error;
    }
}

// Deploy frontend service
async function deployFrontend(existingService = null) {
    console.log('🚀 Deploying frontend service...');
    
    const serviceConfig = {
        name: 'hazard-detection-frontend',
        type: 'web_service',
        ownerID: OWNER_ID,
        serviceDetails: {
            repo: 'https://github.com/NirelJano/Hazard-Detection.git',
            branch: 'master',
            buildCommand: 'npm install',
            startCommand: 'npm start',
            plan: 'starter',
            env: 'node',
            envVars: [
                { key: 'NODE_ENV', value: 'production' },
                { key: 'SESSION_SECRET', value: 'aVeryStrongAndRandomSecretKeyForYourSessionManagement123!@#$' },
                { key: 'GOOGLE_CLIENT_ID', value: '46375555882-rmivba20noas9slfskb3cfvugssladrr.apps.googleusercontent.com' },
                { key: 'GOOGLE_CLIENT_SECRET', value: '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' },
                { key: 'GOOGLE_CALLBACK_URL', value: 'https://hazard-detection-frontend.onrender.com/auth/google/callback' },
                { key: 'SENDGRID_API_KEY', value: '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' },
                { key: 'CLOUDINARY_CLOUD_NAME', value: 'dgn5da9f8' },
                { key: 'CLOUDINARY_API_KEY', value: '688173149321172' },
                { key: 'CLOUDINARY_API_SECRET', value: 'Mb_3IFGPoWA1_AM-XzOd6AH_Pyg' },
                { key: 'REDIS_HOST', value: 'redis-13437.c44.us-east-1-2.ec2.redns.redis-cloud.com' },
                { key: 'REDIS_PORT', value: '13437' },
                { key: 'REDIS_USERNAME', value: 'default' },
                { key: 'REDIS_PASSWORD', value: 'e7uFJGU10TYEVhTJFoOkyPog0fBMhJMG' },
                { key: 'GOOGLE_GEOCODING_API_KEY', value: 'AIzaSyAJ4073PjQ5koFcU9O3WCt8IsK43NNMPcc' },
                { key: 'GOOGLE_MAPS_API_KEY', value: 'AIzaSyAJ4073PjQ5koFcU9O3WCt8IsK43NNMPcc' }
            ]
        }
    };

    try {
        let result;
        if (existingService) {
            console.log('🔄 Updating existing frontend service...');
            result = await renderAPI(`/services/${existingService.id}`, 'PATCH', serviceConfig);
        } else {
            console.log('➕ Creating new frontend service...');
            result = await renderAPI('/services', 'POST', serviceConfig);
        }
        
        console.log('✅ Frontend service deployed:', result.id);
        console.log(`🌐 Frontend URL: https://${result.name}.onrender.com`);
        return result;
    } catch (error) {
        console.error('❌ Frontend deployment failed:', error.message);
        throw error;
    }
}

// Main deployment function
async function deploy() {
    console.log('🎯 Starting Hazard Detection deployment to Render...');
    console.log('=' .repeat(60));
    
    try {
        // Check existing services
        const existing = await checkExistingServices();
        
        // Deploy backend first
        const backend = await deployBackend(existing.backend);
        
        // Deploy frontend
        const frontend = await deployFrontend(existing.frontend);
        
        console.log('');
        console.log('🎉 Deployment completed successfully!');
        console.log('=' .repeat(60));
        console.log(`🌐 Frontend: https://${frontend.name}.onrender.com`);
        console.log(`🔗 Backend: https://${backend.name}.onrender.com`);
        console.log('');
        console.log('📝 Next steps:');
        console.log('1. Update your GitHub repository URL in this script');
        console.log('2. Add your environment variables in the Render dashboard');
        console.log('3. Push your code to GitHub to trigger the first build');
        console.log('4. Check the build logs in Render dashboard');
        
    } catch (error) {
        console.error('💥 Deployment failed:', error.message);
        process.exit(1);
    }
}

// Run deployment if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    deploy();
}

export { deploy, deployBackend, deployFrontend };