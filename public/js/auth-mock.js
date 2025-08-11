/**
 * Mock Authentication Service for Testing
 * This is a fallback authentication system that works locally without requiring a backend
 */

// Mock users database (for testing only)
const MOCK_USERS = [
    {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        password: 'testpassword123', // In real systems, this would be hashed
        role: 'user'
    },
    {
        id: '2',
        email: 'admin@example.com',
        username: 'admin',
        password: 'admin123',
        role: 'admin'
    }
];

const STORAGE_KEYS = {
    USER_DATA: 'hazard_auth_user_mock',
    LOGIN_TIMESTAMP: 'hazard_auth_timestamp_mock'
};

let currentUser = null;
let authEventListeners = new Set();

// Auth events (same as real auth service)
export const AUTH_EVENTS = {
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILURE: 'login_failure',
    LOGOUT: 'logout',
    SESSION_EXPIRED: 'session_expired',
    SESSION_RESTORED: 'session_restored'
};

// Add event listener for authentication events
export function onAuthEvent(callback) {
    authEventListeners.add(callback);
    return () => authEventListeners.delete(callback);
}

// Emit authentication event to all listeners
function emitAuthEvent(eventType, data = {}) {
    const event = { type: eventType, data, timestamp: Date.now() };
    console.log(`🔐 [MOCK] Auth event: ${eventType}`, data);
    
    authEventListeners.forEach(callback => {
        try {
            callback(event);
        } catch (error) {
            console.error('Error in auth event listener:', error);
        }
    });
}

// Initialize mock authentication service
export function initAuth() {
    console.log('🔐 [MOCK] Initializing mock authentication service...');
    
    // Try to restore session from localStorage
    const restoredUser = restoreSession();
    
    if (restoredUser) {
        console.log('✅ [MOCK] Session restored:', restoredUser.email);
        emitAuthEvent(AUTH_EVENTS.SESSION_RESTORED, { user: restoredUser });
    } else {
        console.log('ℹ️ [MOCK] No valid session found');
    }
    
    return restoredUser;
}

// Mock login function
export async function login(email, password) {
    console.log('🔐 [MOCK] Attempting login for:', email);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Find user in mock database
    const user = MOCK_USERS.find(u => u.email === email && u.password === password);
    
    if (!user) {
        const error = new Error('Invalid email or password');
        console.error('❌ [MOCK] Login failed:', error.message);
        emitAuthEvent(AUTH_EVENTS.LOGIN_FAILURE, { error: error.message });
        throw error;
    }
    
    // Create user session
    currentUser = {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        loginTime: Date.now()
    };
    
    saveSession(currentUser);
    
    console.log('✅ [MOCK] Login successful:', currentUser.email);
    emitAuthEvent(AUTH_EVENTS.LOGIN_SUCCESS, { user: currentUser });
    
    return currentUser;
}

// Mock register function
export async function register(email, username, password) {
    console.log('📝 [MOCK] Attempting registration for:', email);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if user already exists
    const existingUser = MOCK_USERS.find(u => u.email === email);
    if (existingUser) {
        const error = new Error('Email already exists');
        console.error('❌ [MOCK] Registration failed:', error.message);
        throw error;
    }
    
    // Create new user
    const newUser = {
        id: (MOCK_USERS.length + 1).toString(),
        email,
        username,
        password, // In real systems, this would be hashed
        role: 'user'
    };
    
    MOCK_USERS.push(newUser);
    
    // Auto-login after successful registration
    currentUser = {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
        loginTime: Date.now()
    };
    
    saveSession(currentUser);
    
    console.log('✅ [MOCK] Registration successful:', currentUser.email);
    emitAuthEvent(AUTH_EVENTS.LOGIN_SUCCESS, { user: currentUser });
    
    return currentUser;
}

// Mock logout function
export async function logout() {
    console.log('🔐 [MOCK] Logging out...');
    
    clearSession();
    
    console.log('✅ [MOCK] Logged out successfully');
    emitAuthEvent(AUTH_EVENTS.LOGOUT);
}

// Mock password reset function
export async function requestPasswordReset(email) {
    console.log('🔐 [MOCK] Password reset requested for:', email);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if user exists
    const user = MOCK_USERS.find(u => u.email === email);
    if (!user) {
        // Don't reveal if email exists or not for security
        console.log('ℹ️ [MOCK] Password reset request completed (user existence not revealed)');
    } else {
        console.log('ℹ️ [MOCK] Password reset would be sent to:', email);
    }
    
    return {
        message: 'If the email is registered, you will receive a password reset link shortly.',
        resetUrl: user ? `http://localhost:8080/reset-password.html?token=mock-token-${user.id}` : null
    };
}

// Check if user is currently authenticated
export function isAuthenticated() {
    return currentUser !== null && isSessionValid();
}

// Get current user data
export function getCurrentUser() {
    return isAuthenticated() ? { ...currentUser } : null;
}

// Check if current session is still valid
function isSessionValid() {
    if (!currentUser || !currentUser.loginTime) {
        return false;
    }
    
    const now = Date.now();
    const sessionAge = now - currentUser.loginTime;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (sessionAge > maxAge) {
        console.warn('⚠️ [MOCK] Session expired due to age');
        return false;
    }
    
    return true;
}

// Save session data to localStorage
function saveSession(userData) {
    try {
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
        localStorage.setItem(STORAGE_KEYS.LOGIN_TIMESTAMP, userData.loginTime.toString());
        console.log('💾 [MOCK] Session saved to localStorage');
    } catch (error) {
        console.warn('⚠️ [MOCK] Failed to save session to localStorage:', error);
    }
}

// Restore session from localStorage
function restoreSession() {
    try {
        const userData = localStorage.getItem(STORAGE_KEYS.USER_DATA);
        const timestamp = localStorage.getItem(STORAGE_KEYS.LOGIN_TIMESTAMP);
        
        if (!userData || !timestamp) {
            return null;
        }
        
        currentUser = JSON.parse(userData);
        currentUser.loginTime = parseInt(timestamp, 10);
        
        if (!isSessionValid()) {
            console.warn('⚠️ [MOCK] Restored session is invalid');
            clearSession();
            return null;
        }
        
        return currentUser;
        
    } catch (error) {
        console.warn('⚠️ [MOCK] Failed to restore session:', error);
        clearSession();
        return null;
    }
}

// Clear all session data
function clearSession() {
    currentUser = null;
    try {
        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
        localStorage.removeItem(STORAGE_KEYS.LOGIN_TIMESTAMP);
    } catch (error) {
        console.warn('⚠️ [MOCK] Failed to clear session from localStorage:', error);
    }
}

// Get auth headers for API requests (mock)
export function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': currentUser ? `Bearer mock-token-${currentUser.id}` : ''
    };
}

// Make authenticated API request (mock)
export async function authenticatedFetch(url, options = {}) {
    const authHeaders = getAuthHeaders();
    
    const requestOptions = {
        ...options,
        headers: {
            ...authHeaders,
            ...(options.headers || {})
        }
    };
    
    console.log('🌐 [MOCK] Making authenticated request to:', url);
    
    // For mock, just return a success response
    return new Response(JSON.stringify({ success: true, mock: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

// Verify session (mock)
export async function verifySession() {
    console.log('🔍 [MOCK] Verifying session...');
    return isAuthenticated();
}

console.log('🔐 [MOCK] Auth service loaded');