#!/usr/bin/env node

/**
 * Authentication Implementation Validation Script
 * Validates that the auth implementation is properly wired
 */

const fs = require('fs');
const path = require('path');

console.log('🔐 Validating Authentication Implementation\n');

const publicDir = path.join(__dirname, 'public');
const jsDir = path.join(publicDir, 'js');

const requiredFiles = [
    'js/auth-service.js',
    'js/route-guard.js',
    'js/login.js',
    'login.html',
    'camera.html',
    'dashboard.html',
    'upload.html',
    'test-auth-flow.html'
];

const validationResults = [];

function addResult(test, status, message, details = null) {
    const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
    console.log(`${icon} ${test}: ${message}`);
    if (details) console.log(`   ${details}`);
    validationResults.push({ test, status, message, details });
}

// Test 1: Check required files exist
console.log('📁 Checking required files...\n');

requiredFiles.forEach(filePath => {
    const fullPath = path.join(publicDir, filePath);
    if (fs.existsSync(fullPath)) {
        addResult(`File existence: ${filePath}`, 'pass', 'File exists');
    } else {
        addResult(`File existence: ${filePath}`, 'fail', 'File missing');
    }
});

// Test 2: Check auth-service.js structure
console.log('\n🔧 Checking auth-service.js structure...\n');

const authServicePath = path.join(jsDir, 'auth-service.js');
if (fs.existsSync(authServicePath)) {
    const authServiceContent = fs.readFileSync(authServicePath, 'utf8');
    
    const requiredExports = [
        'initAuth',
        'login',
        'register', 
        'logout',
        'isAuthenticated',
        'getCurrentUser',
        'onAuthEvent',
        'AUTH_EVENTS'
    ];
    
    requiredExports.forEach(exportName => {
        if (authServiceContent.includes(`export function ${exportName}`) || 
            authServiceContent.includes(`export const ${exportName}`) ||
            authServiceContent.includes(`export async function ${exportName}`)) {
            addResult(`Auth service export: ${exportName}`, 'pass', 'Export found');
        } else {
            addResult(`Auth service export: ${exportName}`, 'fail', 'Export missing');
        }
    });
    
    // Check API endpoints
    const expectedEndpoints = ['/login', '/register', '/logout', '/forgot-password'];
    expectedEndpoints.forEach(endpoint => {
        if (authServiceContent.includes(endpoint)) {
            addResult(`Auth API endpoint: ${endpoint}`, 'pass', 'Endpoint referenced');
        } else {
            addResult(`Auth API endpoint: ${endpoint}`, 'warn', 'Endpoint not found');
        }
    });
}

// Test 3: Check route-guard.js structure  
console.log('\n🛡️ Checking route-guard.js structure...\n');

const routeGuardPath = path.join(jsDir, 'route-guard.js');
if (fs.existsSync(routeGuardPath)) {
    const routeGuardContent = fs.readFileSync(routeGuardPath, 'utf8');
    
    const requiredExports = [
        'initRouteGuard',
        'requireAuth',
        'redirectToLogin',
        'redirectAfterLogin'
    ];
    
    requiredExports.forEach(exportName => {
        if (routeGuardContent.includes(`export function ${exportName}`)) {
            addResult(`Route guard export: ${exportName}`, 'pass', 'Export found');
        } else {
            addResult(`Route guard export: ${exportName}`, 'fail', 'Export missing');
        }
    });
    
    // Check protected pages configuration
    const protectedPages = ['/camera.html', '/dashboard.html', '/upload.html'];
    protectedPages.forEach(page => {
        if (routeGuardContent.includes(page)) {
            addResult(`Protected page config: ${page}`, 'pass', 'Page listed as protected');
        } else {
            addResult(`Protected page config: ${page}`, 'fail', 'Page not listed as protected');
        }
    });
}

// Test 4: Check login.js integration
console.log('\n🔑 Checking login.js integration...\n');

const loginJsPath = path.join(jsDir, 'login.js');
if (fs.existsSync(loginJsPath)) {
    const loginJsContent = fs.readFileSync(loginJsPath, 'utf8');
    
    if (loginJsContent.includes("import { login, register")) {
        addResult('Login.js imports', 'pass', 'Properly imports auth service functions');
    } else {
        addResult('Login.js imports', 'fail', 'Does not import auth service');
    }
    
    if (loginJsContent.includes('await login(email, password)') || 
        loginJsContent.includes('await register(email, username, password)')) {
        addResult('Login.js auth calls', 'pass', 'Uses auth service functions');
    } else {
        addResult('Login.js auth calls', 'fail', 'Still using direct fetch calls');
    }
}

// Test 5: Check protected pages have auth guards
console.log('\n🔒 Checking protected pages have auth guards...\n');

const protectedPages = ['camera.html', 'dashboard.html', 'upload.html'];
protectedPages.forEach(page => {
    const pagePath = path.join(publicDir, page);
    if (fs.existsSync(pagePath)) {
        const pageContent = fs.readFileSync(pagePath, 'utf8');
        
        if (pageContent.includes('requireAuth') || pageContent.includes('route-guard.js')) {
            addResult(`Auth guard: ${page}`, 'pass', 'Has auth guard integration');
        } else {
            addResult(`Auth guard: ${page}`, 'fail', 'Missing auth guard');
        }
        
        if (pageContent.includes('type="module"')) {
            addResult(`Module support: ${page}`, 'pass', 'Uses ES modules');
        } else {
            addResult(`Module support: ${page}`, 'warn', 'May not support ES modules');
        }
    }
});

// Test 6: Check login.html is updated for modules
console.log('\n📄 Checking login.html module integration...\n');

const loginHtmlPath = path.join(publicDir, 'login.html');
if (fs.existsSync(loginHtmlPath)) {
    const loginHtmlContent = fs.readFileSync(loginHtmlPath, 'utf8');
    
    if (loginHtmlContent.includes('type="module"') && loginHtmlContent.includes('login.js')) {
        addResult('Login HTML modules', 'pass', 'Properly configured for ES modules');
    } else {
        addResult('Login HTML modules', 'fail', 'Not configured for ES modules');
    }
}

// Test 7: Check layout.js logout integration
console.log('\n🎨 Checking layout.js logout integration...\n');

const layoutJsPath = path.join(jsDir, 'layout.js');
if (fs.existsSync(layoutJsPath)) {
    const layoutJsContent = fs.readFileSync(layoutJsPath, 'utf8');
    
    if (layoutJsContent.includes('logout-link') && layoutJsContent.includes('auth-service.js')) {
        addResult('Layout logout integration', 'pass', 'Logout properly integrated');
    } else {
        addResult('Layout logout integration', 'warn', 'Logout may not be properly integrated');
    }
}

// Summary
console.log('\n📊 VALIDATION SUMMARY\n');

const passed = validationResults.filter(r => r.status === 'pass').length;
const failed = validationResults.filter(r => r.status === 'fail').length;
const warned = validationResults.filter(r => r.status === 'warn').length;
const total = validationResults.length;

console.log(`Total tests: ${total}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`⚠️  Warnings: ${warned}`);

if (failed === 0) {
    console.log('\n🎉 All critical tests passed! Auth implementation looks good.');
    console.log('\n📝 Next steps:');
    console.log('1. Test the authentication flow at http://localhost:5174/test-auth-flow.html');
    console.log('2. Try logging in at http://localhost:5174/login.html');  
    console.log('3. Verify protected pages redirect when not authenticated');
    console.log('4. Test session persistence across page reloads');
} else {
    console.log(`\n⚠️ ${failed} critical issues found. Please fix before testing.`);
    
    const failedTests = validationResults.filter(r => r.status === 'fail');
    console.log('\nFailed tests:');
    failedTests.forEach(test => {
        console.log(`  - ${test.test}: ${test.message}`);
    });
}

console.log('\n🌐 Test URLs:');
console.log('- Auth Flow Test: http://localhost:5174/test-auth-flow.html');
console.log('- Login Page: http://localhost:5174/login.html'); 
console.log('- Camera (Protected): http://localhost:5174/camera.html');
console.log('- Dashboard (Protected): http://localhost:5174/dashboard.html');
console.log('- Upload (Protected): http://localhost:5174/upload.html');