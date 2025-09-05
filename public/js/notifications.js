/**
 * Enhanced Notification System
 * Modern toast notifications with animations and micro-interactions
 */

class NotificationSystem {
  constructor() {
    this.container = null;
    this.notifications = new Map();
    this.createContainer();
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  createContainer() {
    let el = document.getElementById('notification-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'notification-container';
      el.style.cssText = `position:fixed;top:1rem;right:1rem;z-index:9999;display:flex;flex-direction:column;gap:.75rem;max-width:400px;pointer-events:none;`;
      document.body.appendChild(el);
    }
    this.container = el;
  }

  getTypeColors(type) {
    const map = {
      success: { accent: '#22c55e', border: 'rgba(34,197,94,.3)' },
      error: { accent: '#ef4444', border: 'rgba(239,68,68,.3)' },
      warning: { accent: '#f59e0b', border: 'rgba(245,158,11,.3)' },
      info: { accent: '#3b82f6', border: 'rgba(59,130,246,.3)' }
    };
    return map[type] || map.info;
  }

  getTypeIcon(type) {
    const map = {
      success: '<i class="fas fa-check-circle"></i>',
      error: '<i class="fas fa-exclamation-circle"></i>',
      warning: '<i class="fas fa-exclamation-triangle"></i>',
      info: '<i class="fas fa-info-circle"></i>'
    };
    return map[type] || map.info;
  }

  getDefaultDuration(type) {
    const map = { success: 4000, error: 6000, warning: 5000, info: 4000 };
    return map[type] || 4000;
  }

  createNotification(id, message, type, options) {
    const colors = this.getTypeColors(type);
    const n = document.createElement('div');
    n.className = `notification notification-${type}`;
    n.dataset.id = id;
    n.style.cssText = `
      background: rgba(30,41,59,.9); backdrop-filter: blur(20px); border:1px solid ${colors.border};
      border-radius:12px; padding:1rem 1.25rem; min-height:60px; display:flex; align-items:center; gap:.75rem;
      box-shadow: 0 10px 25px rgba(0,0,0,.2); transform: translateX(100%); opacity:0; transition: all .3s cubic-bezier(.4,0,.2,1);
      pointer-events: all; position: relative; overflow: hidden; color:#e2e8f0; font-family: Poppins, system-ui; font-weight:500;`;

    const border = document.createElement('div');
    border.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:2px;';
    border.style.background = colors.accent;
    n.appendChild(border);

    const icon = document.createElement('div');
    icon.innerHTML = this.getTypeIcon(type);
    icon.style.cssText = `flex-shrink:0;width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:${colors.accent};font-size:1.125rem;`;
    n.appendChild(icon);

    const msg = document.createElement('div');
    msg.textContent = message;
    msg.style.cssText = 'flex:1;font-size:.9rem;line-height:1.4;';
    n.appendChild(msg);

    if (options.persistent) {
      const close = document.createElement('button');
      close.innerHTML = '×';
      close.style.cssText = 'background:none;border:none;color:#94a3b8;font-size:1.25rem;cursor:pointer;padding:0;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:all .2s;';
      close.onmouseover = () => { close.style.background = 'rgba(255,255,255,.1)'; close.style.color = '#ef4444'; };
      close.onmouseout = () => { close.style.background = 'none'; close.style.color = '#94a3b8'; };
      close.onclick = () => this.hide(id);
      n.appendChild(close);
    }

    if (!options.persistent && (options.duration || this.getDefaultDuration(type)) > 0) {
      const bar = document.createElement('div');
      bar.style.cssText = `position:absolute;bottom:0;left:0;height:2px;background:${colors.accent};border-radius:0 0 2px 2px;width:100%;transform-origin:left;`;
      bar.style.animation = `progressShrink ${options.duration || this.getDefaultDuration(type)}ms linear`;
      n.appendChild(bar);
    }

    return n;
  }

  show(message, type = 'info', options = {}) {
    const id = Date.now() + Math.random();
    const n = this.createNotification(id, message, type, options);
    this.container.appendChild(n);
    this.notifications.set(id, n);
    requestAnimationFrame(() => { n.style.transform = 'translateX(0)'; n.style.opacity = '1'; });
    const duration = options.duration || this.getDefaultDuration(type);
    if (duration > 0 && !options.persistent) setTimeout(() => this.hide(id), duration);
    return id;
  }

  hide(id) {
    const n = this.notifications.get(id);
    if (!n) return;
    n.style.transform = 'translateX(100%)';
    n.style.opacity = '0';
    setTimeout(() => { n.remove(); this.notifications.delete(id); }, 300);
  }

  hideAll() { this.notifications.forEach((_, id) => this.hide(id)); }

  cleanup() {
    const orphaned = [];
    this.notifications.forEach((n, id) => { if (!n.isConnected) orphaned.push(id); });
    orphaned.forEach(id => this.notifications.delete(id));
  }

  destroy() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.hideAll();
    if (this.container) this.container.remove();
    this.notifications.clear();
    this.container = null;
  }
}

// Add CSS animations once
if (!document.getElementById('notification-styles')) {
  const style = document.createElement('style');
  style.id = 'notification-styles';
  style.textContent = `
    @keyframes progressShrink { from { transform: scaleX(1) } to { transform: scaleX(0) } }
    @media (max-width: 640px) { #notification-container { top:.5rem;right:.5rem;left:.5rem;max-width:none } }
    .notification:hover { transform: translateX(-4px) !important; box-shadow: 0 15px 35px rgba(0,0,0,.3) !important; }
  `;
  document.head.appendChild(style);
}

// Global instance
window.notifications = new NotificationSystem();

