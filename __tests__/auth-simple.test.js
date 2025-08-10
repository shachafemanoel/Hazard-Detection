#!/usr/bin/env node

/**
 * Simple authentication API test script
 * Tests the new /auth endpoints with curl-like HTTP requests
 */

import { execSync } from 'child_process';

const API_BASE = process.env.API_URL || 'https://hazard-api-production-production.up.railway.app';
const FRONTEND_ORIGIN = 'https://hazard-detection-production-8735.up.railway.app';

console.log('🧪 Testing Authentication API Endpoints');
console.log(`📡 API Base: ${API_BASE}`);
console.log(`🌐 Frontend Origin: ${FRONTEND_ORIGIN}`);
console.log('=' .repeat(60));

// Test data
const testUser = {
  email: 'test@example.com',
  username: 'testuser',
  password: 'Test123456'
};

const testLogin = {
  email: 'test@example.com', 
  password: 'test'
};

/**
 * Execute curl command and return parsed response
 */
function curlTest(description, curlCommand) {
  console.log(`\n🔍 ${description}`);
  console.log(`   Command: ${curlCommand}`);
  
  try {
    const result = execSync(curlCommand, { encoding: 'utf8', timeout: 15000 });
    
    // Try to parse as JSON
    let response;
    try {
      response = JSON.parse(result);
    } catch (e) {
      response = { raw: result };
    }
    
    console.log(`   ✅ Response:`, JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    console.log(`   ❌ Error:`, error.message);
    if (error.stdout) {
      console.log(`   📄 Output:`, error.stdout);
    }
    return null;
  }
}

// Test 1: Health Check
curlTest(
  'Health Check',
  `curl -s -X GET "${API_BASE}/auth/health" ` +
  `-H "Origin: ${FRONTEND_ORIGIN}" ` +
  `-H "Content-Type: application/json"`
);

// Test 2: Session Status (Unauthenticated)
curlTest(
  'Session Status (Unauthenticated)',
  `curl -s -X GET "${API_BASE}/auth/session" ` +
  `-H "Origin: ${FRONTEND_ORIGIN}" ` +
  `-H "Content-Type: application/json"`
);

// Test 3: User Registration
const registerResponse = curlTest(
  'User Registration',
  `curl -s -X POST "${API_BASE}/auth/register" ` +
  `-H "Origin: ${FRONTEND_ORIGIN}" ` +
  `-H "Content-Type: application/json" ` +
  `-d '${JSON.stringify(testUser)}'`
);

// Test 4: Login with Test Credentials  
const loginResponse = curlTest(
  'Login with Test Credentials',
  `curl -s -X POST "${API_BASE}/auth/login" ` +
  `-H "Origin: ${FRONTEND_ORIGIN}" ` +
  `-H "Content-Type: application/json" ` +
  `-d '${JSON.stringify(testLogin)}'`
);

// Test 5: Session Status (Authenticated) - requires cookies from login
if (loginResponse && loginResponse.success) {
  console.log('\n📝 Note: Session status test would require cookie handling');
}

// Test 6: Forgot Password
curlTest(
  'Forgot Password Request',
  `curl -s -X POST "${API_BASE}/auth/forgot-password" ` +
  `-H "Origin: ${FRONTEND_ORIGIN}" ` +
  `-H "Content-Type: application/json" ` +
  `-d '{"email":"${testLogin.email}"}'`
);

// Test 7: Invalid Login
curlTest(
  'Invalid Login Attempt',
  `curl -s -X POST "${API_BASE}/auth/login" ` +
  `-H "Origin: ${FRONTEND_ORIGIN}" ` +
  `-H "Content-Type: application/json" ` +
  `-d '{"email":"invalid@example.com","password":"wrongpassword"}'`
);

// Test 8: Invalid Registration (Missing Fields)
curlTest(
  'Invalid Registration (Missing Fields)',
  `curl -s -X POST "${API_BASE}/auth/register" ` +
  `-H "Origin: ${FRONTEND_ORIGIN}" ` +
  `-H "Content-Type: application/json" ` +
  `-d '{"email":"incomplete@example.com"}'`
);

// Test 9: Invalid Email Format
curlTest(
  'Invalid Email Format',
  `curl -s -X POST "${API_BASE}/auth/login" ` +
  `-H "Origin: ${FRONTEND_ORIGIN}" ` +
  `-H "Content-Type: application/json" ` +
  `-d '{"email":"not-an-email","password":"test123"}'`
);

console.log('\n' + '='.repeat(60));
console.log('🏁 Authentication API Tests Complete');
console.log('\n💡 Expected Results:');
console.log('  ✅ Health check should return status: "healthy"');
console.log('  ✅ Session status should show authenticated: false initially'); 
console.log('  ✅ Registration should return success for new users');
console.log('  ✅ Login should return success with valid credentials');
console.log('  ✅ Forgot password should always return success message');
console.log('  ❌ Invalid attempts should return appropriate error messages');
console.log('  ❌ Missing fields should return validation errors');
console.log('\n🔧 For full session testing, use a browser or tool that handles cookies');