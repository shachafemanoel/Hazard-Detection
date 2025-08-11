/**
 * Route Guard
 * Protects pages that require authentication and handles navigation
 */

import { isAuthenticated, getCurrentUser, initAuth, onAuthEvent, AUTH_EVENTS } from './auth-service.js';

// Configuration
const ROUTE_CONFIG = {
    LOGIN_PAGE: '/login.html',
    DEFAULT_PROTECTED_REDIRECT: '/upload.html', // Where to go after login
    PUBLIC_PAGES: [
        '/login.html',
        '/reset-password.html',
        '/index.html',
        '/',
        '/test-api-connection.html'
    ]
};

/**
 * Protected pages that require authentication
 */
const PROTECTED_PAGES = [
    '/camera.html',
    '/dashboard.html', 
    '/upload.html'
];

/**
 * Initialize route guard
 * Call this on every page to set up authentication checking
 */
export async function initRouteGuard() {
    const currentPath = window.location.pathname;
    
    console.log('🛡️ Route guard initialized for:', currentPath);
    
    // Initialize auth service first
    const user = await initAuth();
    
    // Set up auth event listeners
    setupAuthEventListeners();
    
    // Check if current page requires authentication
    if (isProtectedPage(currentPath)) {
        if (!isAuthenticated()) {
            console.log('🚫 Access denied: Not authenticated, redirecting to login');
            redirectToLogin();
            return false;
        } else {
            console.log('✅ Access granted:', user?.email);
            return true;
        }
    } else {
        // On public pages, redirect authenticated users away from login
        if (currentPath === ROUTE_CONFIG.LOGIN_PAGE && isAuthenticated()) {
            console.log('👤 Already authenticated, redirecting away from login');
            redirectAfterLogin();
        }
        return true;
    }
}

/**
 * Check if a page path is protected
 * @param {string} path - Page path to check
 * @returns {boolean} True if page requires authentication
 */
function isProtectedPage(path) {
    return PROTECTED_PAGES.some(protectedPath => {
        // Exact match or starts with protected path
        return path === protectedPath || path.startsWith(protectedPath + '?');
    });
}

/**
 * Check if a page path is public
 * @param {string} path - Page path to check  
 * @returns {boolean} True if page is public
 */
function isPublicPage(path) {
    return ROUTE_CONFIG.PUBLIC_PAGES.some(publicPath => {
        return path === publicPath || path.startsWith(publicPath + '?');
    });
}

/**
 * Redirect to login page with return URL
 * @param {string} returnUrl - URL to return to after login
 */
export function redirectToLogin(returnUrl = null) {
    const currentPath = window.location.pathname + window.location.search;
    const targetReturnUrl = returnUrl || currentPath;
    
    // Don't set return URL for login page itself
    if (targetReturnUrl === ROUTE_CONFIG.LOGIN_PAGE) {
        window.location.href = ROUTE_CONFIG.LOGIN_PAGE;
        return;
    }
    
    const loginUrl = new URL(ROUTE_CONFIG.LOGIN_PAGE, window.location.origin);
    loginUrl.searchParams.set('returnUrl', targetReturnUrl);
    
    console.log('🔄 Redirecting to login:', loginUrl.href);
    window.location.href = loginUrl.href;
}

/**
 * Redirect after successful login
 * Uses return URL from query params or default redirect
 */
export function redirectAfterLogin() {
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('returnUrl');
    
    let targetUrl = ROUTE_CONFIG.DEFAULT_PROTECTED_REDIRECT;
    
    if (returnUrl) {
        // Validate return URL is safe and not login page
        if (returnUrl.startsWith('/') && 
            !returnUrl.startsWith('//') && 
            returnUrl !== ROUTE_CONFIG.LOGIN_PAGE) {
            targetUrl = returnUrl;
        }
    }
    
    console.log('🔄 Redirecting after login to:', targetUrl);
    window.location.href = targetUrl;
}

/**
 * Logout and redirect to login page
 */
export function logoutAndRedirect() {
    console.log('🚪 Logging out and redirecting...');
    // The logout function from auth-service will handle clearing session
    // The auth event listener will handle the redirect
    import('./auth-service.js').then(({ logout }) => {
        logout();
    });
}

/**
 * Set up authentication event listeners
 */
function setupAuthEventListeners() {
    onAuthEvent((event) => {
        switch (event.type) {
            case AUTH_EVENTS.LOGIN_SUCCESS:
                // Only redirect if we're on the login page
                if (window.location.pathname === ROUTE_CONFIG.LOGIN_PAGE) {
                    redirectAfterLogin();
                }
                break;
                
            case AUTH_EVENTS.LOGOUT:
                // Redirect to login page after logout
                if (!isPublicPage(window.location.pathname)) {
                    redirectToLogin();
                }
                break;
                
            case AUTH_EVENTS.SESSION_EXPIRED:
                // Show session expired message and redirect
                if (!isPublicPage(window.location.pathname)) {
                    showSessionExpiredMessage();
                    setTimeout(() => {
                        redirectToLogin();
                    }, 3000); // Give user time to read the message
                }
                break;
                
            case AUTH_EVENTS.SESSION_RESTORED:
                // User is authenticated, no need to redirect unless on login page
                if (window.location.pathname === ROUTE_CONFIG.LOGIN_PAGE) {
                    redirectAfterLogin();
                }
                break;
        }
    });
}

/**
 * Show session expired message
 */
function showSessionExpiredMessage() {
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.className = 'alert alert-warning position-fixed top-0 start-50 translate-middle-x';
    notification.style.cssText = 'z-index: 9999; margin-top: 20px;';
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-clock me-2"></i>
            <span>Your session has expired. Redirecting to login...</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

/**
 * Create logout button/link
 * @param {HTMLElement} container - Container to append logout button to
 * @param {Object} options - Button configuration options
 */
export function createLogoutButton(container, options = {}) {
    const config = {
        text: 'Logout',
        className: 'btn btn-outline-light',
        icon: 'fas fa-sign-out-alt',
        ...options
    };
    
    const button = document.createElement('button');
    button.className = config.className;
    button.innerHTML = `
        ${config.icon ? `<i class="${config.icon} me-1"></i>` : ''}
        ${config.text}
    `;
    
    button.addEventListener('click', (e) => {
        e.preventDefault();
        logoutAndRedirect();
    });
    
    container.appendChild(button);
    return button;
}

/**
 * Create user info display
 * @param {HTMLElement} container - Container to append user info to
 * @param {Object} options - Display configuration options
 */
export function createUserInfo(container, options = {}) {
    const user = getCurrentUser();
    if (!user) return null;
    
    const config = {
        showEmail: true,
        showUsername: true,
        className: 'user-info d-flex align-items-center',
        ...options
    };
    
    const userInfo = document.createElement('div');
    userInfo.className = config.className;
    
    let infoHTML = '';
    if (config.showUsername && user.username) {
        infoHTML += `<span class="me-2"><i class="fas fa-user me-1"></i>${user.username}</span>`;
    }
    if (config.showEmail && user.email) {
        infoHTML += `<span class="text-muted">${user.email}</span>`;
    }
    
    userInfo.innerHTML = infoHTML;
    container.appendChild(userInfo);
    
    return userInfo;
}

/**
 * Require authentication for current page
 * Call this at the top of protected pages
 * @returns {Object|null} Current user if authenticated, null if redirected
 */
export function requireAuth() {
    if (!initRouteGuard()) {
        return null; // Will redirect to login
    }
    
    return getCurrentUser();
}

/**
 * Get query parameter value
 * @param {string} name - Parameter name
 * @returns {string|null} Parameter value or null
 */
export function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

/**
 * Clear URL parameters without page reload
 * @param {Array<string>} paramsToRemove - Array of parameter names to remove
 */
export function clearUrlParams(paramsToRemove) {
    const url = new URL(window.location);
    paramsToRemove.forEach(param => {
        url.searchParams.delete(param);
    });
    window.history.replaceState({}, document.title, url.toString());
}

// Export configuration for external use
export const ROUTES = {
    LOGIN: ROUTE_CONFIG.LOGIN_PAGE,
    PROTECTED_PAGES,
    PUBLIC_PAGES: ROUTE_CONFIG.PUBLIC_PAGES,
    DEFAULT_REDIRECT: ROUTE_CONFIG.DEFAULT_PROTECTED_REDIRECT
};

console.log('🛡️ Route guard module loaded');