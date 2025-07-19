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