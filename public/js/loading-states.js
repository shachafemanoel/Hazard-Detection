/**
 * Enhanced Loading States System
 * Modern loading indicators with smooth animations
 */

class LoadingStates {
    constructor() {
        this.activeLoaders = new Map();
        this.createStyles();
    }

    createStyles() {
        if (document.getElementById('loading-styles')) return;

        const style = document.createElement('style');
        style.id = 'loading-styles';
        style.textContent = `
            .loading-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(15, 23, 42, 0.8);
                backdrop-filter: blur(8px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9998;
                opacity: 0;
                animation: fadeIn 0.3s ease forwards;
            }

            .loading-card {
                background: rgba(30, 41, 59, 0.9);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(148, 163, 184, 0.2);
                border-radius: 16px;
                padding: 2rem;
                text-align: center;
                color: #e2e8f0;
                font-family: 'Poppins', sans-serif;
                min-width: 280px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                transform: scale(0.9);
                animation: scaleIn 0.3s ease 0.1s forwards;
            }

            .loading-spinner {
                width: 48px;
                height: 48px;
                margin: 0 auto 1rem;
                position: relative;
            }

            .spinner-ring {
                display: inline-block;
                width: 48px;
                height: 48px;
                border: 4px solid rgba(59, 130, 246, 0.2);
                border-radius: 50%;
                border-top: 4px solid #3b82f6;
                animation: spin 1s linear infinite;
                position: relative;
            }

            .spinner-ring::after {
                content: '';
                position: absolute;
                top: -4px;
                left: -4px;
                right: -4px;
                bottom: -4px;
                border: 2px solid transparent;
                border-top: 2px solid #22c55e;
                border-radius: 50%;
                animation: spin 2s linear infinite reverse;
            }

            .spinner-dots {
                display: flex;
                justify-content: center;
                gap: 8px;
                margin: 0 auto 1rem;
            }

            .spinner-dot {
                width: 12px;
                height: 12px;
                background: #3b82f6;
                border-radius: 50%;
                animation: bounce 1.4s ease-in-out infinite both;
            }

            .spinner-dot:nth-child(1) { animation-delay: -0.32s; }
            .spinner-dot:nth-child(2) { animation-delay: -0.16s; }
            .spinner-dot:nth-child(3) { animation-delay: 0s; }

            .loading-text {
                font-size: 1rem;
                font-weight: 600;
                margin-bottom: 0.5rem;
                background: linear-gradient(135deg, #3b82f6, #22c55e);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }

            .loading-subtext {
                font-size: 0.875rem;
                color: #94a3b8;
                margin-bottom: 1rem;
            }

            .loading-progress {
                width: 100%;
                height: 8px;
                background: rgba(148, 163, 184, 0.2);
                border-radius: 4px;
                overflow: hidden;
                margin-top: 1rem;
            }

            .loading-progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #3b82f6, #22c55e);
                border-radius: 4px;
                transition: width 0.3s ease;
                width: 0%;
            }

            .loading-button {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.5rem 1rem;
                border-radius: 8px;
                background: rgba(59, 130, 246, 0.1);
                color: #3b82f6;
                border: 1px solid rgba(59, 130, 246, 0.3);
                cursor: pointer;
                transition: all 0.2s;
                font-size: 0.875rem;
                margin-top: 1rem;
            }

            .loading-button:hover {
                background: rgba(59, 130, 246, 0.2);
                border-color: #3b82f6;
            }

            .btn-loading {
                position: relative;
                pointer-events: none;
                opacity: 0.8;
            }

            .btn-loading::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 20px;
                height: 20px;
                border: 2px solid transparent;
                border-top: 2px solid currentColor;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }

            .btn-loading > * {
                opacity: 0;
            }

            .skeleton {
                background: linear-gradient(
                    90deg,
                    rgba(30, 41, 59, 0.8) 25%,
                    rgba(51, 65, 85, 0.8) 50%,
                    rgba(30, 41, 59, 0.8) 75%
                );
                background-size: 200% 100%;
                animation: shimmer 2s infinite;
                border-radius: 8px;
            }

            .skeleton-line {
                height: 1rem;
                margin-bottom: 0.5rem;
            }

            .skeleton-line.short {
                width: 60%;
            }

            .skeleton-line.long {
                width: 80%;
            }

            .skeleton-avatar {
                width: 3rem;
                height: 3rem;
                border-radius: 50%;
            }

            .skeleton-card {
                padding: 1rem;
                border-radius: 12px;
                background: rgba(30, 41, 59, 0.5);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(148, 163, 184, 0.1);
            }

            @keyframes fadeIn {
                to { opacity: 1; }
            }

            @keyframes scaleIn {
                to { 
                    opacity: 1;
                    transform: scale(1); 
                }
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            @keyframes bounce {
                0%, 80%, 100% {
                    transform: scale(0);
                }
                40% {
                    transform: scale(1);
                }
            }

            @keyframes shimmer {
                0% {
                    background-position: -200% 0;
                }
                100% {
                    background-position: 200% 0;
                }
            }

            /* Responsive adjustments */
            @media (max-width: 640px) {
                .loading-card {
                    margin: 1rem;
                    min-width: auto;
                    padding: 1.5rem;
                }
            }
        `;
        document.head.appendChild(style);
    }

    showFullscreen(options = {}) {
        const {
            text = 'Loading...',
            subtext = '',
            type = 'spinner',
            showProgress = false,
            cancelable = false,
            onCancel = null
        } = options;

        const id = 'fullscreen-loader';
        this.hide(id); // Remove existing

        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.id = id;

        const card = document.createElement('div');
        card.className = 'loading-card';

        // Add spinner
        if (type === 'spinner') {
            const spinner = document.createElement('div');
            spinner.className = 'loading-spinner';
            spinner.innerHTML = '<div class="spinner-ring"></div>';
            card.appendChild(spinner);
        } else if (type === 'dots') {
            const spinner = document.createElement('div');
            spinner.className = 'spinner-dots';
            spinner.innerHTML = `
                <div class="spinner-dot"></div>
                <div class="spinner-dot"></div>
                <div class="spinner-dot"></div>
            `;
            card.appendChild(spinner);
        }

        // Add text
        const textEl = document.createElement('div');
        textEl.className = 'loading-text';
        textEl.textContent = text;
        card.appendChild(textEl);

        if (subtext) {
            const subtextEl = document.createElement('div');
            subtextEl.className = 'loading-subtext';
            subtextEl.textContent = subtext;
            card.appendChild(subtextEl);
        }

        // Add progress bar
        if (showProgress) {
            const progressContainer = document.createElement('div');
            progressContainer.className = 'loading-progress';
            
            const progressBar = document.createElement('div');
            progressBar.className = 'loading-progress-bar';
            progressBar.id = `${id}-progress`;
            
            progressContainer.appendChild(progressBar);
            card.appendChild(progressContainer);
        }

        // Add cancel button
        if (cancelable && onCancel) {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'loading-button';
            cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel';
            cancelBtn.onclick = () => {
                this.hide(id);
                onCancel();
            };
            card.appendChild(cancelBtn);
        }

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        this.activeLoaders.set(id, { overlay, options });
        return id;
    }

    updateProgress(loaderId, progress) {
        const progressBar = document.getElementById(`${loaderId}-progress`);
        if (progressBar) {
            progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        }
    }

    updateText(loaderId, text, subtext) {
        const loader = this.activeLoaders.get(loaderId);
        if (!loader) return;

        const textEl = loader.overlay.querySelector('.loading-text');
        const subtextEl = loader.overlay.querySelector('.loading-subtext');
        
        if (textEl) textEl.textContent = text;
        if (subtextEl) subtextEl.textContent = subtext;
    }

    showButton(button, text = 'Loading...') {
        if (!button) return;
        
        button.classList.add('btn-loading');
        button.setAttribute('data-original-text', button.textContent);
        button.textContent = text;
        button.disabled = true;
    }

    hideButton(button) {
        if (!button) return;
        
        button.classList.remove('btn-loading');
        const originalText = button.getAttribute('data-original-text');
        if (originalText) {
            button.textContent = originalText;
            button.removeAttribute('data-original-text');
        }
        button.disabled = false;
    }

    createSkeleton(container, config = {}) {
        if (!container) return;

        const {
            lines = 3,
            avatar = false,
            card = true
        } = config;

        const skeleton = document.createElement('div');
        if (card) skeleton.className = 'skeleton-card';

        if (avatar) {
            const avatarEl = document.createElement('div');
            avatarEl.className = 'skeleton skeleton-avatar';
            skeleton.appendChild(avatarEl);
        }

        for (let i = 0; i < lines; i++) {
            const line = document.createElement('div');
            line.className = `skeleton skeleton-line ${i % 2 === 0 ? 'long' : 'short'}`;
            skeleton.appendChild(line);
        }

        container.innerHTML = '';
        container.appendChild(skeleton);
    }

    hide(loaderId) {
        if (loaderId) {
            const loader = this.activeLoaders.get(loaderId);
            if (loader && loader.overlay) {
                loader.overlay.style.opacity = '0';
                setTimeout(() => {
                    if (loader.overlay.parentNode) {
                        loader.overlay.parentNode.removeChild(loader.overlay);
                    }
                }, 300);
                this.activeLoaders.delete(loaderId);
            }
        } else {
            // Hide all loaders
            this.activeLoaders.forEach((loader, id) => this.hide(id));
        }
    }

    hideAll() {
        this.hide();
    }
}

// Create global instance
window.loading = new LoadingStates();

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoadingStates;
}