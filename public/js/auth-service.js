/**
 * Authentication Service
 * Handles user authentication, session management, and persistence
 * Integrates with the hazard detection backend API
 */

// API configuration - Authentication uses local server, other APIs use remote
const AUTH_BASE = window.location.origin; // Use current domain for auth (e.g., http://localhost:3000)
const API_BASE = window.API_URL || "https://hazard-api-production-production.up.railway.app";
const STORAGE_KEYS = {
    USER_DATA: 'hazard_auth_user',
    SESSION_TOKEN: 'hazard_auth_token',
    LOGIN_TIMESTAMP: 'hazard_auth_timestamp'
};

// Session configuration
const SESSION_CONFIG = {
    CHECK_INTERVAL: 60000,      // Check session validity every minute
    MAX_IDLE_TIME: 24 * 60 * 60 * 1000, // 24 hours max idle
    REFRESH_THRESHOLD: 60 * 60 * 1000    // Refresh if session expires in 1 hour
};

let currentUser = null;
let sessionCheckInterval = null;
let authEventListeners = new Set();

/**
 * Authentication event types
 */
export const AUTH_EVENTS = {
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILURE: 'login_failure',
    LOGOUT: 'logout',
    SESSION_EXPIRED: 'session_expired',
    SESSION_RESTORED: 'session_restored'
};

/**
 * Add event listener for authentication events
 * @param {Function} callback - Event handler function
 */
export function onAuthEvent(callback) {
    authEventListeners.add(callback);
    return () => authEventListeners.delete(callback); // Return unsubscribe function
}

/**
 * Emit authentication event to all listeners
 * @param {string} eventType - Event type from AUTH_EVENTS
 * @param {Object} data - Event data
 */
function emitAuthEvent(eventType, data = {}) {
    const event = { type: eventType, data, timestamp: Date.now() };
    console.log(`🔐 Auth event: ${eventType}`, data);
    
    authEventListeners.forEach(callback => {
        try {
            callback(event);
        } catch (error) {
            console.error('Error in auth event listener:', error);
        }
    });
}

/**
 * Initialize authentication service
 * Call this when the app starts to restore session if available
 */
export async function initAuth() {
    console.log('🔐 Initializing authentication service...');
    
    // Try to restore session from localStorage
    const restoredUser = restoreSession();
    
    if (restoredUser) {
        console.log('✅ Local session restored:', restoredUser.email);
        
        // Verify with server that session is still valid
        try {
            const isServerValid = await verifySession();
            if (isServerValid) {
                console.log('✅ Server session confirmed valid');
                emitAuthEvent(AUTH_EVENTS.SESSION_RESTORED, { user: restoredUser });
                startSessionMonitoring();
                return currentUser; // Return the updated user data
            } else {
                console.warn('⚠️ Server session invalid, clearing local session');
                clearSession();
                return null;
            }
        } catch (error) {
            console.warn('⚠️ Could not verify server session:', error.message);
            // Continue with local session but start monitoring to check later
            emitAuthEvent(AUTH_EVENTS.SESSION_RESTORED, { user: restoredUser });
            startSessionMonitoring();
            return restoredUser;
        }
    } else {
        console.log('ℹ️ No valid local session found');
        return null;
    }
}

/**
 * Login with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} User data if successful
 */
export async function login(email, password) {
    try {
        console.log('🔐 Attempting login for:', email);
        
        const response = await fetch(`${AUTH_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', // Important for cookies
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || error.error || `Login failed: ${response.status}`);
        }

        const userData = await response.json();
        
        // Store user data and session info - handle server response format
        const user = userData.user || userData;
        currentUser = {
            id: user.id || user.user_id,
            email: user.email,
            username: user.username || user.name,
            role: user.role || 'user',
            loginTime: Date.now()
        };
        
        saveSession(currentUser);
        startSessionMonitoring();
        
        console.log('✅ Login successful:', currentUser.email);
        emitAuthEvent(AUTH_EVENTS.LOGIN_SUCCESS, { user: currentUser });
        
        return currentUser;
        
    } catch (error) {
        console.error('❌ Login failed:', error);
        emitAuthEvent(AUTH_EVENTS.LOGIN_FAILURE, { error: error.message });
        throw error;
    }
}

/**
 * Register a new user
 * @param {string} email - User email
 * @param {string} username - Username
 * @param {string} password - User password
 * @returns {Promise<Object>} User data if successful
 */
export async function register(email, username, password) {
    try {
        console.log('📝 Attempting registration for:', email);
        
        const response = await fetch(`${AUTH_BASE}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ email, username, password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || error.error || `Registration failed: ${response.status}`);
        }

        const userData = await response.json();
        
        // Auto-login after successful registration
        currentUser = {
            id: userData.id || userData.user_id,
            email: userData.email,
            username: userData.username || username,
            role: userData.role || 'user',
            loginTime: Date.now()
        };
        
        saveSession(currentUser);
        startSessionMonitoring();
        
        console.log('✅ Registration successful:', currentUser.email);
        emitAuthEvent(AUTH_EVENTS.LOGIN_SUCCESS, { user: currentUser });
        
        return currentUser;
        
    } catch (error) {
        console.error('❌ Registration failed:', error);
        throw error;
    }
}

/**
 * Logout current user
 */
export async function logout() {
    try {
        console.log('🔐 Logging out...');
        
        // Call backend logout endpoint
        await fetch(`${AUTH_BASE}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
    } catch (error) {
        console.warn('⚠️ Logout API call failed:', error);
        // Continue with local logout even if API fails
    }
    
    // Clear local session
    clearSession();
    stopSessionMonitoring();
    
    console.log('✅ Logged out successfully');
    emitAuthEvent(AUTH_EVENTS.LOGOUT);
}

/**
 * Request password reset
 * @param {string} email - User email
 * @returns {Promise<Object>} Reset response
 */
export async function requestPasswordReset(email) {
    try {
        console.log('🔐 Requesting password reset for:', email);
        
        const response = await fetch(`${AUTH_BASE}/auth/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || error.error || 'Password reset failed');
        }

        return await response.json();
        
    } catch (error) {
        console.error('❌ Password reset request failed:', error);
        throw error;
    }
}

/**
 * Check if user is currently authenticated
 * @returns {boolean} True if authenticated
 */
export function isAuthenticated() {
    return currentUser !== null && isSessionValid();
}

/**
 * Get current user data
 * @returns {Object|null} Current user or null if not authenticated
 */
export function getCurrentUser() {
    return isAuthenticated() ? { ...currentUser } : null;
}

/**
 * Check if current session is still valid
 * @returns {boolean} True if session is valid
 */
function isSessionValid() {
    if (!currentUser || !currentUser.loginTime) {
        return false;
    }
    
    const now = Date.now();
    const sessionAge = now - currentUser.loginTime;
    
    // Check if session has exceeded maximum idle time
    if (sessionAge > SESSION_CONFIG.MAX_IDLE_TIME) {
        console.warn('⚠️ Session expired due to idle time');
        return false;
    }
    
    return true;
}

/**
 * Verify session with server
 * @returns {Promise<boolean>} True if server confirms session is valid
 */
export async function verifySession() {
    try {
        const response = await fetch(`${AUTH_BASE}/auth/session`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Check if user is actually authenticated according to server
            if (data.authenticated && data.user) {
                // Update user data if provided by server
                if (currentUser) {
                    Object.assign(currentUser, {
                        id: data.user.id || currentUser.id,
                        email: data.user.email || currentUser.email,
                        username: data.user.username || currentUser.username,
                        role: data.user.role || currentUser.role
                    });
                    saveSession(currentUser);
                }
                return true;
            } else if (!data.authenticated && currentUser) {
                // Server says we're not authenticated, clear local session
                console.warn('⚠️ Server session invalid, clearing local session');
                return false;
            }
        }
        
        return false;
        
    } catch (error) {
        console.warn('⚠️ Session verification failed:', error);
        return false;
    }
}

/**
 * Save session data to localStorage
 * @param {Object} userData - User data to save
 */
function saveSession(userData) {
    try {
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
        localStorage.setItem(STORAGE_KEYS.LOGIN_TIMESTAMP, userData.loginTime.toString());
        console.log('💾 Session saved to localStorage');
    } catch (error) {
        console.warn('⚠️ Failed to save session to localStorage:', error);
    }
}

/**
 * Restore session from localStorage
 * @returns {Object|null} User data if valid session exists
 */
function restoreSession() {
    try {
        const userData = localStorage.getItem(STORAGE_KEYS.USER_DATA);
        const timestamp = localStorage.getItem(STORAGE_KEYS.LOGIN_TIMESTAMP);
        
        if (!userData || !timestamp) {
            return null;
        }
        
        currentUser = JSON.parse(userData);
        currentUser.loginTime = parseInt(timestamp, 10);
        
        // Validate restored session
        if (!isSessionValid()) {
            console.warn('⚠️ Restored session is invalid');
            clearSession();
            return null;
        }
        
        return currentUser;
        
    } catch (error) {
        console.warn('⚠️ Failed to restore session:', error);
        clearSession();
        return null;
    }
}

/**
 * Clear all session data
 */
function clearSession() {
    currentUser = null;
    try {
        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
        localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.LOGIN_TIMESTAMP);
    } catch (error) {
        console.warn('⚠️ Failed to clear session from localStorage:', error);
    }
}

/**
 * Start monitoring session validity
 */
function startSessionMonitoring() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
    }
    
    sessionCheckInterval = setInterval(async () => {
        if (!currentUser) {
            stopSessionMonitoring();
            return;
        }
        
        // Check local session validity
        if (!isSessionValid()) {
            console.warn('⚠️ Local session expired');
            await handleSessionExpiry();
            return;
        }
        
        // Periodically verify with server
        if (Math.random() < 0.1) { // 10% chance each check
            const isValid = await verifySession();
            if (!isValid) {
                console.warn('⚠️ Server session expired');
                await handleSessionExpiry();
            }
        }
        
    }, SESSION_CONFIG.CHECK_INTERVAL);
    
    console.log('👁️ Session monitoring started');
}

/**
 * Stop session monitoring
 */
function stopSessionMonitoring() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
        sessionCheckInterval = null;
        console.log('👁️ Session monitoring stopped');
    }
}

/**
 * Handle session expiry
 */
async function handleSessionExpiry() {
    console.warn('⚠️ Session expired');
    clearSession();
    stopSessionMonitoring();
    emitAuthEvent(AUTH_EVENTS.SESSION_EXPIRED);
}

/**
 * Get auth headers for API requests
 * @returns {Object} Headers object with auth credentials
 */
export function getAuthHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    
    // Session cookies are handled automatically with credentials: 'include'
    return headers;
}

/**
 * Make authenticated API request
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function authenticatedFetch(url, options = {}) {
    const authHeaders = getAuthHeaders();
    
    const requestOptions = {
        ...options,
        headers: {
            ...authHeaders,
            ...(options.headers || {})
        },
        credentials: 'include' // Always include cookies
    };
    
    const response = await fetch(url, requestOptions);
    
    // Check if request failed due to authentication
    if (response.status === 401 && currentUser) {
        console.warn('⚠️ API request returned 401, session may have expired');
        await handleSessionExpiry();
    }
    
    return response;
}

// Initialize auth service when module loads
console.log('🔐 Auth service loaded');