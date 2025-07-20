// js/login.js
// Consolidated login page logic and utilities

// Initialize login page functionality
document.addEventListener('DOMContentLoaded', function() {
    initializeLoginPage();
});

function initializeLoginPage() {
    // Set up global authentication utilities
    window.AuthUtils = {
        // Check if user is authenticated
        isAuthenticated: function() {
            return fetch('/api/auth/check', { 
                method: 'GET',
                credentials: 'include' 
            })
            .then(response => response.ok)
            .catch(() => false);
        },

        // Redirect authenticated users
        redirectIfAuthenticated: function() {
            this.isAuthenticated().then(isAuth => {
                if (isAuth) {
                    window.location.href = '/pages/index.html';
                }
            });
        },

        // Handle authentication responses
        handleAuthResponse: function(response, redirectOnSuccess = true) {
            if (response.success) {
                if (redirectOnSuccess && response.redirect) {
                    setTimeout(() => {
                        window.location.href = response.redirect;
                    }, 1000);
                }
                return true;
            } else {
                console.error('Authentication failed:', response.message);
                return false;
            }
        },

        // Validate email format
        isValidEmail: function(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        },

        // Show loading state on button
        setButtonLoading: function(button, loading) {
            const text = button.querySelector('span');
            const spinner = button.querySelector('.fa-spinner');
            
            if (loading) {
                button.disabled = true;
                if (text) text.style.opacity = '0.7';
                if (spinner) spinner.classList.remove('hidden');
            } else {
                button.disabled = false;
                if (text) text.style.opacity = '1';
                if (spinner) spinner.classList.add('hidden');
            }
        }
    };

    // Check if user is already authenticated and redirect
    window.AuthUtils.redirectIfAuthenticated();
    
    // Initialize page-specific functionality
    console.log('Login page initialized');

    // DOM elements
    const buttonsDiv = document.getElementById('buttons');
    const emailOptionsDiv = document.getElementById('email-options');
    const emailFormDiv = document.getElementById('email-form');
    const signupFormDiv = document.getElementById('signup-form');
    const loginFormDiv = document.getElementById('login-form');
    const forgotPasswordFormDiv = document.getElementById('forgot-password-form');
    const backOptionsBtn = document.getElementById('back-options');

    // Toggle between main buttons and email options
    window.toggleForm = function() {
        buttonsDiv.classList.add('hidden');
        emailOptionsDiv.classList.remove('hidden');
        emailFormDiv.classList.add('hidden');
        signupFormDiv.classList.add('hidden');
        loginFormDiv.classList.add('hidden');
        forgotPasswordFormDiv.classList.add('hidden');
    };
    window.backToMainScreen = function() {
        buttonsDiv.classList.remove('hidden');
        emailOptionsDiv.classList.add('hidden');
        emailFormDiv.classList.add('hidden');
        signupFormDiv.classList.add('hidden');
        loginFormDiv.classList.add('hidden');
        forgotPasswordFormDiv.classList.add('hidden');
    };
    window.showSignupForm = function() {
        emailOptionsDiv.classList.add('hidden');
        emailFormDiv.classList.remove('hidden');
        signupFormDiv.classList.remove('hidden');
        loginFormDiv.classList.add('hidden');
        forgotPasswordFormDiv.classList.add('hidden');
    };
    window.showLoginForm = function() {
        emailOptionsDiv.classList.add('hidden');
        emailFormDiv.classList.remove('hidden');
        signupFormDiv.classList.add('hidden');
        loginFormDiv.classList.remove('hidden');
        forgotPasswordFormDiv.classList.add('hidden');
    };
    window.toggleForgotPassword = function() {
        emailOptionsDiv.classList.add('hidden');
        emailFormDiv.classList.remove('hidden');
        signupFormDiv.classList.add('hidden');
        loginFormDiv.classList.add('hidden');
        forgotPasswordFormDiv.classList.remove('hidden');
    };

    // Handle signup form submit
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = registerForm.email.value.trim();
            const username = registerForm.username.value.trim();
            const password = registerForm.password.value;
            const errorDiv = document.getElementById('email-error');
            errorDiv.classList.add('hidden');
            if (!window.AuthUtils.isValidEmail(email)) {
                errorDiv.textContent = 'Invalid email format.';
                errorDiv.classList.remove('hidden');
                return;
            }
            if (username.length < 3) {
                errorDiv.textContent = 'Username must be at least 3 characters.';
                errorDiv.classList.remove('hidden');
                return;
            }
            if (password.length < 8) {
                errorDiv.textContent = 'Password must be at least 8 characters.';
                errorDiv.classList.remove('hidden');
                return;
            }
            // Send register request
            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, username, password })
                });
                const data = await res.json();
                if (!window.AuthUtils.handleAuthResponse(data)) {
                    errorDiv.textContent = data.message || 'Registration failed.';
                    errorDiv.classList.remove('hidden');
                }
            } catch (err) {
                errorDiv.textContent = 'Network error.';
                errorDiv.classList.remove('hidden');
            }
        });
    }

    // Handle login form submit
    const loginFormInner = document.getElementById('login-form-inner');
    if (loginFormInner) {
        loginFormInner.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = loginFormInner.email.value.trim();
            const password = loginFormInner.password.value;
            const errorDiv = document.getElementById('login-error');
            errorDiv.classList.add('hidden');
            if (!window.AuthUtils.isValidEmail(email)) {
                errorDiv.textContent = 'Invalid email format.';
                errorDiv.classList.remove('hidden');
                return;
            }
            if (password.length < 8) {
                errorDiv.textContent = 'Password must be at least 8 characters.';
                errorDiv.classList.remove('hidden');
                return;
            }
            // Send login request
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!window.AuthUtils.handleAuthResponse(data)) {
                    errorDiv.textContent = data.message || 'Login failed.';
                    errorDiv.classList.remove('hidden');
                }
            } catch (err) {
                errorDiv.textContent = 'Network error.';
                errorDiv.classList.remove('hidden');
            }
        });
    }

    // Handle reset password form submit
    const resetPasswordForm = document.getElementById('reset-password-form');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = resetPasswordForm.email.value.trim();
            const errorDiv = document.getElementById('reset-password-error');
            errorDiv.classList.add('hidden');
            if (!window.AuthUtils.isValidEmail(email)) {
                errorDiv.textContent = 'Invalid email format.';
                errorDiv.classList.remove('hidden');
                return;
            }
            // Send reset password request
            try {
                const res = await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();
                if (data.success) {
                    errorDiv.textContent = 'Reset link sent to your email.';
                    errorDiv.classList.remove('hidden');
                    errorDiv.classList.remove('text-red-500');
                    errorDiv.classList.add('text-green-500');
                } else {
                    errorDiv.textContent = data.message || 'Reset failed.';
                    errorDiv.classList.remove('hidden');
                    errorDiv.classList.remove('text-green-500');
                    errorDiv.classList.add('text-red-500');
                }
            } catch (err) {
                errorDiv.textContent = 'Network error.';
                errorDiv.classList.remove('hidden');
                errorDiv.classList.remove('text-green-500');
                errorDiv.classList.add('text-red-500');
            }
        });
    }

    // Google button: just redirect (already handled in HTML)
}

// Global utility functions that can be used by login form component
window.LoginPageUtils = {
    showMessage: function(type, message) {
        const messagesDiv = document.getElementById('form-messages');
        if (!messagesDiv) return;
        
        const messageClass = type === 'success' ? 'success-message' : 'error-message';
        const icon = type === 'success' ? 'check-circle' : 'exclamation-triangle';
        
        messagesDiv.innerHTML = `
            <div class="${messageClass}">
                <i class="fas fa-${icon}"></i>
                ${message}
            </div>
        `;
        
        // Auto hide after 5 seconds
        setTimeout(() => {
            messagesDiv.innerHTML = '';
        }, 5000);
    },

    clearMessages: function() {
        const messagesDiv = document.getElementById('form-messages');
        if (messagesDiv) {
            messagesDiv.innerHTML = '';
        }
    }
};