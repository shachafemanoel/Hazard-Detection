/**
 * Auth Service with Fallback
 * Tries real auth service first, falls back to mock if it fails
 */

let authService = null;
let isUsingMock = false;

// Try to initialize the real auth service, fall back to mock if it fails
async function initializeAuthService() {
    try {
        // Try real auth service first
        const realAuthService = await import('./auth-service.js');
        
        // Test if the API is reachable
        const API_BASE = "https://hazard-api-production-production.up.railway.app";
        const testResponse = await fetch(`${API_BASE}/`, { 
            method: 'GET', 
            mode: 'cors',
            cache: 'no-cache'
        });
        
        console.log('🌐 API connection test:', testResponse.status);
        
        // If API is not reachable or returns error, use mock
        if (!testResponse.ok) {
            throw new Error(`API returned ${testResponse.status}`);
        }
        
        console.log('✅ Using real authentication service');
        authService = realAuthService;
        isUsingMock = false;
        
    } catch (error) {
        console.warn('⚠️ Real auth service unavailable, using mock:', error.message);
        
        // Fall back to mock auth service
        const mockAuthService = await import('./auth-mock.js');
        authService = mockAuthService;
        isUsingMock = true;
        
        // Show user a notification that we're in offline mode
        showOfflineNotification();
    }
    
    return authService;
}

// Show notification that we're using offline mode
function showOfflineNotification() {
    const notification = document.createElement('div');
    notification.className = 'alert alert-warning position-fixed top-0 start-50 translate-middle-x';
    notification.style.cssText = 'z-index: 9999; margin-top: 20px; max-width: 400px;';
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-wifi me-2"></i>
            <span>Offline Mode: Using local authentication for testing</span>
            <button type="button" class="btn-close ms-auto" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 10000);
}

// Export functions that proxy to the actual auth service
export async function login(email, password) {
    if (!authService) {
        await initializeAuthService();
    }
    return authService.login(email, password);
}

export async function register(email, username, password) {
    if (!authService) {
        await initializeAuthService();
    }
    return authService.register(email, username, password);
}

export async function logout() {
    if (!authService) {
        await initializeAuthService();
    }
    return authService.logout();
}

export async function requestPasswordReset(email) {
    if (!authService) {
        await initializeAuthService();
    }
    return authService.requestPasswordReset(email);
}

export function initAuth() {
    // This needs to be synchronous, so we'll initialize the service in the background
    if (!authService) {
        initializeAuthService();
        return null; // No user session available yet
    }
    return authService.initAuth();
}

export function isAuthenticated() {
    if (!authService) {
        return false;
    }
    return authService.isAuthenticated();
}

export function getCurrentUser() {
    if (!authService) {
        return null;
    }
    return authService.getCurrentUser();
}

export function onAuthEvent(callback) {
    if (!authService) {
        // Store the callback and apply it once service is initialized
        initializeAuthService().then(() => {
            authService.onAuthEvent(callback);
        });
        return () => {}; // Return empty unsubscribe function
    }
    return authService.onAuthEvent(callback);
}

export async function verifySession() {
    if (!authService) {
        await initializeAuthService();
    }
    return authService.verifySession();
}

export async function authenticatedFetch(url, options = {}) {
    if (!authService) {
        await initializeAuthService();
    }
    return authService.authenticatedFetch(url, options);
}

export function getAuthHeaders() {
    if (!authService) {
        return { 'Content-Type': 'application/json' };
    }
    return authService.getAuthHeaders();
}

// Export AUTH_EVENTS constant
export const AUTH_EVENTS = {
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILURE: 'login_failure',
    LOGOUT: 'logout',
    SESSION_EXPIRED: 'session_expired',
    SESSION_RESTORED: 'session_restored'
};

// Export utility function to check if using mock
export function isUsingMockAuth() {
    return isUsingMock;
}

console.log('🔄 Auth fallback service loaded');