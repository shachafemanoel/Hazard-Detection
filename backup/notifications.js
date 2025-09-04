/**
 * Enhanced Notification System
 * Modern toast notifications with animations and micro-interactions
 */

class NotificationSystem {
    constructor() {
        this.container = null;
        this.notifications = new Map();
        this.createContainer();
        
        // Periodic cleanup to prevent memory leaks
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 30000); // Clean up every 30 seconds
    }

    createContainer() {
        // Create notification container if it doesn't exist
        if (!document.getElementById('notification-container')) {
            this.container = document.createElement('div');
            this.container.id = 'notification-container';
            this.container.style.cssText = `
                position: fixed;
                top: 1rem;
                right: 1rem;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
                max-width: 400px;
                pointer-events: none;
            `;
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('notification-container');
        }
    }

    show(message, type = 'info', options = {}) {
        const id = Date.now() + Math.random();
        const notification = this.createNotification(id, message, type, options);
        
        this.container.appendChild(notification);
        this.notifications.set(id, notification);

        // Animate in - use single RAF call to avoid multiple frames
        const animate = () => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        };
        requestAnimationFrame(animate);

        // Auto-dismiss
        const duration = options.duration || this.getDefaultDuration(type);
        if (duration > 0) {
            setTimeout(() => this.hide(id), duration);
        }

        return id;
    }

    createNotification(id, message, type, options) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.dataset.id = id;
        
        const colors = this.getTypeColors(type);
        
        notification.style.cssText = `
            background: rgba(30, 41, 59, 0.9);
            backdrop-filter: blur(20px);
            border: 1px solid ${colors.border};
            border-radius: 12px;
            padding: 1rem 1.25rem;
            min-height: 60px;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            transform: translateX(100%);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: all;
            position: relative;
            overflow: hidden;
            color: #e2e8f0;
            font-family: 'Poppins', sans-serif;
            font-weight: 500;
            animation: slideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        // Add colored left border
        const borderElement = document.createElement('div');
        borderElement.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            background: ${colors.accent};
            border-radius: 2px;
        `;
        notification.appendChild(borderElement);

        // Add icon
        const icon = document.createElement('div');
        icon.innerHTML = this.getTypeIcon(type);
        icon.style.cssText = `
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${colors.accent};
            font-size: 1.125rem;
        `;
        notification.appendChild(icon);

        // Add message
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.style.cssText = `
            flex: 1;
            font-size: 0.875rem;
            line-height: 1.4;
        `;
        notification.appendChild(messageElement);

        // Add close button if persistent
        if (options.persistent) {
            const closeButton = document.createElement('button');
            closeButton.innerHTML = '×';
            closeButton.style.cssText = `
                background: none;
                border: none;
                color: #94a3b8;
                font-size: 1.25rem;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s;
            `;
            closeButton.onmouseover = () => {
                closeButton.style.background = 'rgba(255, 255, 255, 0.1)';
                closeButton.style.color = '#ef4444';
            };
            closeButton.onmouseout = () => {
                closeButton.style.background = 'none';
                closeButton.style.color = '#94a3b8';
            };
            closeButton.onclick = () => this.hide(id);
            notification.appendChild(closeButton);
        }

        // Add progress bar for timed notifications
        if (!options.persistent && (options.duration || this.getDefaultDuration(type)) > 0) {
            const progressBar = document.createElement('div');
            progressBar.style.cssText = `
                position: absolute;
                bottom: 0;
                left: 0;
                height: 2px;
                background: ${colors.accent};
                border-radius: 0 0 2px 2px;
                width: 100%;
                transform-origin: left;
                animation: progressShrink ${options.duration || this.getDefaultDuration(type)}ms linear;
            `;
            notification.appendChild(progressBar);
        }

        return notification;
    }

    hide(id) {
        const notification = this.notifications.get(id);
        if (!notification) return;

        // Animate out
        notification.style.transform = 'translateX(100%)';
        notification.style.opacity = '0';

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            this.notifications.delete(id);
        }, 300);
    }

    hideAll() {
        this.notifications.forEach((_, id) => this.hide(id));
    }

    // Cleanup orphaned notifications and prevent memory leaks
    cleanup() {
        const orphaned = [];
        this.notifications.forEach((notification, id) => {
            if (!notification.parentNode || !document.contains(notification)) {
                orphaned.push(id);
            }
        });
        
        orphaned.forEach(id => {
            this.notifications.delete(id);
        });
        
        if (orphaned.length > 0) {
            console.log(`Cleaned up ${orphaned.length} orphaned notifications`);
        }
    }

    // Destroy the notification system and clean up all resources
    destroy() {
        // Clear cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        // Hide all notifications
        this.hideAll();
        
        // Remove container
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        // Clear maps
        this.notifications.clear();
        this.container = null;
    }

    getTypeColors(type) {
        const colors = {
            success: {
                accent: '#22c55e',
                border: 'rgba(34, 197, 94, 0.3)',
            },
            error: {
                accent: '#ef4444',
                border: 'rgba(239, 68, 68, 0.3)',
            },
            warning: {
                accent: '#f59e0b',
                border: 'rgba(245, 158, 11, 0.3)',
            },
            info: {
                accent: '#3b82f6',
                border: 'rgba(59, 130, 246, 0.3)',
            }
        };
        return colors[type] || colors.info;
    }

    getTypeIcon(type) {
        const icons = {
            success: '<i class="fas fa-check-circle"></i>',
            error: '<i class="fas fa-exclamation-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>',
            info: '<i class="fas fa-info-circle"></i>'
        };
        return icons[type] || icons.info;
    }

    getDefaultDuration(type) {
        const durations = {
            success: 4000,
            error: 6000,
            warning: 5000,
            info: 4000
        };
        return durations[type] || 4000;
    }

    // Convenience methods
    success(message, options = {}) {
        return this.show(message, 'success', options);
    }

    error(message, options = {}) {
        return this.show(message, 'error', options);
    }

    warning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    info(message, options = {}) {
        return this.show(message, 'info', options);
    }
}

// Add CSS animations
if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes progressShrink {
            from {
                transform: scaleX(1);
            }
            to {
                transform: scaleX(0);
            }
        }
        
        .notification:hover {
            transform: translateX(-4px) !important;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3) !important;
        }
        
        @media (max-width: 640px) {
            #notification-container {
                top: 0.5rem;
                right: 0.5rem;
                left: 0.5rem;
                max-width: none;
            }
        }
    `;
    document.head.appendChild(style);
}

// Create global instance
window.notifications = new NotificationSystem();

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationSystem;
}