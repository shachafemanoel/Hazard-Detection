// Professional Notification System for Hazard Detection Camera

let notificationId = 0;
const MAX_NOTIFICATIONS = 3;
const NOTIFICATION_DURATION = 4000; // 4 seconds

// Initialize notification system
function initializeNotifications() {
    // Ensure container exists
    let container = document.getElementById('notifications-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notifications-container';
        container.className = 'notifications-container';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }
    
    // Inject CSS if not present
    injectNotificationStyles();
    console.log('📱 Professional notification system initialized');
}

// Main notification function (enhanced version)
function notify(message, type = 'info', duration = NOTIFICATION_DURATION, persistent = false) {
    const container = document.getElementById('notifications-container');
    if (!container) {
        // Fallback to simple version
        return simpleNotify(message, type, persistent);
    }

    // Limit number of notifications
    const existingNotifications = container.querySelectorAll('.notification');
    if (existingNotifications.length >= MAX_NOTIFICATIONS) {
        // Remove oldest notification
        existingNotifications[0].remove();
    }

    const notificationElement = createNotificationElement(message, type, duration, persistent);
    container.appendChild(notificationElement);

    // Auto-remove after duration (unless persistent)
    if (!persistent && duration > 0) {
        setTimeout(() => {
            removeNotification(notificationElement);
        }, duration);
    }

    return notificationElement;
}

// Simple fallback notification (original version)
function simpleNotify(message, type = 'info', persist = false) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.append(toast);
    if (!persist) {
        setTimeout(() => toast.remove(), 3000);
    }
    return toast;
}

// Create professional notification element
function createNotificationElement(message, type, duration, persistent) {
    const id = `notification-${++notificationId}`;
    const notification = document.createElement('div');
    notification.id = id;
    notification.className = `notification notification-${type}`;
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'assertive');

    // Icon based on type
    const iconMap = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-triangle',
        warning: 'fas fa-exclamation-circle',
        info: 'fas fa-info-circle',
        detection: 'fas fa-eye'
    };

    const icon = iconMap[type] || iconMap.info;

    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-icon">
                <i class="${icon}"></i>
            </div>
            <div class="notification-message">${message}</div>
            <button class="notification-close" aria-label="Close notification" onclick="removeNotification(this.parentElement.parentElement)">
                <i class="fas fa-times"></i>
            </button>
        </div>
        ${!persistent && duration > 0 ? `<div class="notification-progress"><div class="notification-progress-bar" style="animation-duration: ${duration}ms;"></div></div>` : ''}
    `;

    // Add entry animation
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    
    // Trigger animation after adding to DOM
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    });

    return notification;
}

// Remove notification with animation
function removeNotification(element) {
    if (!element || !element.parentElement) return;
    
    // Exit animation
    element.style.opacity = '0';
    element.style.transform = 'translateX(100%)';
    
    // Remove from DOM after animation
    setTimeout(() => {
        if (element.parentElement) {
            element.parentElement.removeChild(element);
        }
    }, 300);
}

// Specific notification types
function showSuccess(message, duration = NOTIFICATION_DURATION) {
    return notify(message, 'success', duration);
}

function showError(message, persistent = false) {
    return notify(message, 'error', persistent ? 0 : NOTIFICATION_DURATION, persistent);
}

function showWarning(message, duration = NOTIFICATION_DURATION) {
    return notify(message, 'warning', duration);
}

function showInfo(message, duration = NOTIFICATION_DURATION) {
    return notify(message, 'info', duration);
}

function showDetection(message, duration = 3000) {
    return notify(message, 'detection', duration);
}

// Clear all notifications
function clearAllNotifications() {
    const container = document.getElementById('notifications-container');
    if (container) {
        const notifications = container.querySelectorAll('.notification');
        notifications.forEach(notification => {
            removeNotification(notification);
        });
    }
}

// Inject CSS styles
function injectNotificationStyles() {
    const styleId = 'notification-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .notifications-container {
            position: fixed;
            top: calc(var(--safe-area-top, 20px) + 20px);
            right: 20px;
            z-index: 10000;
            max-width: 400px;
            width: calc(100vw - 40px);
            pointer-events: none;
        }

        .notification {
            background: rgba(15, 20, 30, 0.95);
            backdrop-filter: blur(20px);
            border-radius: 12px;
            margin-bottom: 10px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            overflow: hidden;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: auto;
            position: relative;
        }

        .notification-content {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            color: #ffffff;
        }

        .notification-icon {
            margin-right: 12px;
            font-size: 18px;
            min-width: 24px;
        }

        .notification-message {
            flex: 1;
            font-size: 14px;
            font-weight: 500;
            line-height: 1.4;
        }

        .notification-close {
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.7);
            cursor: pointer;
            padding: 4px;
            border-radius: 50%;
            transition: all 0.2s ease;
            margin-left: 8px;
        }

        .notification-close:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }

        .notification-progress {
            height: 3px;
            background: rgba(255, 255, 255, 0.1);
            overflow: hidden;
        }

        .notification-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #00e5ff, #00bcd4);
            width: 100%;
            animation: notificationProgress linear forwards;
        }

        @keyframes notificationProgress {
            from { width: 100%; }
            to { width: 0%; }
        }

        /* Type-specific colors */
        .notification-success .notification-icon {
            color: #4caf50;
        }

        .notification-success .notification-progress-bar {
            background: linear-gradient(90deg, #4caf50, #66bb6a);
        }

        .notification-error .notification-icon {
            color: #ff5252;
        }

        .notification-error .notification-progress-bar {
            background: linear-gradient(90deg, #ff5252, #ef5350);
        }

        .notification-warning .notification-icon {
            color: #ff9800;
        }

        .notification-warning .notification-progress-bar {
            background: linear-gradient(90deg, #ff9800, #ffb74d);
        }

        .notification-info .notification-icon {
            color: #2196f3;
        }

        .notification-detection .notification-icon {
            color: #00e5ff;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        /* Legacy toast styles for fallback */
        .toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 10000;
            max-width: 300px;
        }

        .toast-success { background: #4caf50; }
        .toast-error { background: #f44336; }
        .toast-warning { background: #ff9800; }
        .toast-info { background: #2196f3; }

        /* Mobile responsive */
        @media (max-width: 480px) {
            .notifications-container {
                top: calc(var(--safe-area-top, 10px) + 10px);
                right: 10px;
                width: calc(100vw - 20px);
                max-width: none;
            }
        }
    `;

    document.head.appendChild(style);
}

// Make functions globally available
if (typeof window !== 'undefined') {
    window.initializeNotifications = initializeNotifications;
    window.notify = notify;
    window.showSuccess = showSuccess;
    window.showError = showError;
    window.showWarning = showWarning;
    window.showInfo = showInfo;
    window.showDetection = showDetection;
    window.removeNotification = removeNotification;
    window.clearAllNotifications = clearAllNotifications;
}

// Auto-inject styles when script loads
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectNotificationStyles);
    } else {
        injectNotificationStyles();
    }
}

console.log('📱 Enhanced notification system loaded');