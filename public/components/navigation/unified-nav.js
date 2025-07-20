/**
 * Unified Navigation System for Road Management Platform
 * Handles role-based navigation, user status, and system monitoring
 */

// Prevent duplicate loading
if (typeof window.UnifiedNavigation !== 'undefined') {
  console.log('UnifiedNavigation already loaded, skipping...');
} else {

class UnifiedNavigation {
  constructor() {
    this.currentUser = null;
    this.systemStatus = 'healthy';
    this.notifications = [];
    this.init();
  }

  async init() {
    await this.loadUserData();
    this.setupNavigation();
    this.setupEventListeners();
    this.updateActiveNavItem();
    this.startStatusMonitoring();
  }

  async loadUserData() {
    try {
      // Fetch real user data from Redis via API
      const response = await fetch('/api/user', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const userData = await response.json();
        this.currentUser = {
          id: userData.id || userData.email,
          name: userData.username || 'User',
          email: userData.email,
          role: this.mapUserTypeToRole(userData.type || userData.role),
          avatar: null,
          status: 'online',
          type: userData.type || userData.role
        };
        
        console.log('✅ Real user data loaded:', this.currentUser);
      } else {
        // User not authenticated, redirect to login
        console.warn('User not authenticated, redirecting to login');
        window.location.href = '/pages/login.html';
        return;
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      // Fallback to login page on error
      window.location.href = '/pages/login.html';
    }
  }

  // Map backend user types to navigation roles
  mapUserTypeToRole(userType) {
    const typeMapping = {
      'admin': 'admin',
      'manager': 'manager',
      'user': 'reporter'
    };
    return typeMapping[userType] || 'reporter';
  }

  setupNavigation() {
    this.updateUserInterface();
    this.updateRoleBasedNavigation();
    this.updateUserAvatar();
    this.updateUserDisplay();
    this.applyRoleBasedStyling();
    this.setupRoleSpecificFeatures();
  }

  updateUserInterface() {
    const roleIndicator = document.getElementById('user-role-indicator');
    const roleText = document.getElementById('role-text');
    
    if (roleIndicator && roleText) {
      // Update role indicator
      roleIndicator.className = `role-indicator ${this.currentUser.role}`;
      
      // Update role text and icon
      const roleConfig = this.getRoleConfig(this.currentUser.role);
      roleText.textContent = roleConfig.displayName;
      
      const roleIcon = roleIndicator.querySelector('i');
      if (roleIcon) {
        roleIcon.className = roleConfig.icon;
      }
    }
  }

  getRoleConfig(role) {
    const configs = {
      manager: {
        displayName: 'Manager',
        icon: 'fas fa-user-tie',
        color: 'var(--info)'
      },
      reporter: {
        displayName: 'Reporter',
        icon: 'fas fa-user-edit',
        color: 'var(--success)'
      },
      admin: {
        displayName: 'Admin',
        icon: 'fas fa-user-shield',
        color: 'var(--primary-accent)'
      }
    };
    return configs[role] || configs.reporter;
  }

  updateRoleBasedNavigation() {
    const managerOnlyItems = document.querySelectorAll('.role-manager-only');
    const reporterItems = document.querySelectorAll('.role-reporter-item');
    
    // Show/hide navigation items based on role
    if (this.currentUser.role === 'manager' || this.currentUser.role === 'admin') {
      managerOnlyItems.forEach(item => item.style.display = 'flex');
    } else {
      managerOnlyItems.forEach(item => item.style.display = 'none');
    }

    // Update reporter-specific items
    if (this.currentUser.role === 'reporter') {
      reporterItems.forEach(item => item.style.display = 'flex');
    }
  }

  updateUserAvatar() {
    const userAvatar = document.getElementById('user-avatar');
    const userStatus = document.getElementById('user-status');
    
    if (userAvatar) {
      if (this.currentUser.avatar) {
        userAvatar.innerHTML = `<img src="${this.currentUser.avatar}" alt="${this.currentUser.name}">`;
      } else {
        // Use initials or default icon
        const initials = this.getInitials(this.currentUser.name);
        userAvatar.innerHTML = initials || '<i class="fas fa-user"></i>';
      }
    }

    if (userStatus) {
      userStatus.className = `user-status ${this.currentUser.status}`;
    }
  }

  getInitials(name) {
    if (!name) return '';
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  }

  setupEventListeners() {
    // Quick search functionality
    const quickSearch = document.getElementById('quick-search');
    if (quickSearch) {
      quickSearch.addEventListener('click', () => this.handleQuickSearch());
    }

    // Notifications
    const notificationsBtn = document.getElementById('notifications');
    if (notificationsBtn) {
      notificationsBtn.addEventListener('click', () => this.handleNotifications());
    }

    // User profile
    const userProfile = document.getElementById('user-profile');
    if (userProfile) {
      userProfile.addEventListener('click', () => this.handleUserProfile());
    }

    // System status (manager only)
    const systemStatus = document.getElementById('system-status');
    if (systemStatus && (this.currentUser.role === 'manager' || this.currentUser.role === 'admin')) {
      systemStatus.addEventListener('click', () => this.handleSystemStatus());
    }

    // Navigation item clicks
    document.querySelectorAll('.floating-nav-item').forEach(item => {
      item.addEventListener('click', (e) => this.handleNavigation(e));
    });

    // Logout handling
    document.querySelectorAll('[data-action="logout"]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleLogout();
      });
    });
  }

  updateActiveNavItem() {
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.floating-nav-item[data-page]');
    
    navItems.forEach(item => {
      item.classList.remove('active');
      const page = item.dataset.page;
      
      // Match current page
      if (currentPath.includes(page) || 
          (page === 'home' && currentPath === '/') ||
          (page === 'home' && currentPath.includes('index.html'))) {
        item.classList.add('active');
      }
    });
  }

  handleQuickSearch() {
    // Create and show search modal
    this.showSearchModal();
  }

  showSearchModal() {
    const searchModal = document.createElement('div');
    searchModal.className = 'search-modal';
    searchModal.innerHTML = `
      <div class="search-modal-content glass">
        <div class="search-header">
          <h3><i class="fas fa-search"></i> Quick Search</h3>
          <button class="close-search" onclick="this.closest('.search-modal').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="search-body">
          <input type="text" class="form-control" placeholder="Search reports, locations, users..." id="quick-search-input">
          <div class="search-results" id="search-results">
            <div class="search-suggestions">
              <h4>Quick Access</h4>
              <div class="suggestion-item" onclick="window.location.href='/pages/dashboard.html'">
                <i class="fas fa-chart-line"></i> Dashboard
              </div>
              <div class="suggestion-item" onclick="window.location.href='/pages/camera.html'">
                <i class="fas fa-camera"></i> Camera Detection
              </div>
              ${this.currentUser.role === 'manager' ? `
                <div class="suggestion-item" onclick="window.location.href='/pages/admin-dashboard.html'">
                  <i class="fas fa-shield-alt"></i> Management Dashboard
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(searchModal);
    
    // Focus search input
    setTimeout(() => {
      document.getElementById('quick-search-input').focus();
    }, 100);

    // Add search modal styles
    this.addSearchModalStyles();
  }

  addSearchModalStyles() {
    if (document.getElementById('search-modal-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'search-modal-styles';
    styles.textContent = `
      .search-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        z-index: 10000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 100px;
      }

      .search-modal-content {
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        padding: var(--space-xl);
      }

      .search-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-lg);
      }

      .search-header h3 {
        color: var(--text-primary);
        margin: 0;
        display: flex;
        align-items: center;
        gap: var(--space-sm);
      }

      .close-search {
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: var(--font-size-lg);
        cursor: pointer;
        padding: var(--space-sm);
        border-radius: var(--radius-full);
        transition: var(--transition-base);
      }

      .close-search:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-primary);
      }

      .search-body {
        margin-bottom: var(--space-lg);
      }

      .search-results {
        margin-top: var(--space-lg);
      }

      .search-suggestions h4 {
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
        margin-bottom: var(--space-md);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .suggestion-item {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        padding: var(--space-sm) var(--space-md);
        margin-bottom: var(--space-xs);
        border-radius: var(--radius-lg);
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-primary);
        cursor: pointer;
        transition: var(--transition-base);
      }

      .suggestion-item:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateX(4px);
      }
    `;

    document.head.appendChild(styles);
  }

  handleNotifications() {
    // Toggle notifications panel
    console.log('Notifications clicked');
    // Implement notifications panel
  }

  handleUserProfile() {
    // Show user profile dropdown or modal
    console.log('User profile clicked');
    // Implement user profile functionality
  }

  handleSystemStatus() {
    // Show system status details
    console.log('System status clicked');
    // Implement system status panel
  }

  handleNavigation(e) {
    const item = e.currentTarget;
    const page = item.dataset.page;
    
    // Add visual feedback
    item.style.transform = 'scale(0.95)';
    setTimeout(() => {
      item.style.transform = '';
    }, 150);
  }

  async handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
      try {
        // Call logout API
        const response = await fetch('/logout', {
          method: 'GET',
          credentials: 'include'
        });
        
        // Clear any local storage data
        localStorage.removeItem('userData');
        localStorage.removeItem('authToken');
        
        // Redirect to login page
        if (response.redirected) {
          window.location.href = response.url;
        } else {
          window.location.href = '/pages/login.html';
        }
      } catch (error) {
        console.error('Logout error:', error);
        // Still redirect to login even if API call fails
        window.location.href = '/pages/login.html';
      }
    }
  }

  startStatusMonitoring() {
    // Monitor system status for managers
    if (this.currentUser.role === 'manager' || this.currentUser.role === 'admin') {
      this.updateSystemStatus();
      
      // Update every 30 seconds
      setInterval(() => {
        this.updateSystemStatus();
      }, 30000);
    }
  }

  async updateSystemStatus() {
    try {
      // Simulate system health check - replace with actual API call
      const isHealthy = Math.random() > 0.1; // 90% chance of being healthy
      
      this.systemStatus = isHealthy ? 'healthy' : 'warning';
      
      const statusDot = document.getElementById('status-dot');
      if (statusDot) {
        statusDot.className = `status-indicator ${this.systemStatus}`;
      }
    } catch (error) {
      console.error('Error checking system status:', error);
      this.systemStatus = 'error';
    }
  }

  // Public method to update user role (for role switching)
  async updateUserRole(newRole) {
    try {
      // Note: Role changes typically require admin permissions
      // This method updates the local UI only - backend role changes
      // should be handled through proper admin endpoints
      this.currentUser.role = newRole;
      this.setupNavigation();
      
      console.log(`User role updated to: ${newRole}`);
    } catch (error) {
      console.error('Error updating user role:', error);
    }
  }

  // Public method to add notification
  addNotification(notification) {
    this.notifications.push(notification);
    this.updateNotificationBadge();
  }

  updateNotificationBadge() {
    const badge = document.getElementById('notification-count');
    if (badge) {
      const count = this.notifications.length;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count.toString();
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // Apply role-based styling to the page
  applyRoleBasedStyling() {
    // Remove any existing role classes
    document.body.classList.remove('role-manager', 'role-reporter', 'role-admin');
    
    // Add current role class
    document.body.classList.add(`role-${this.currentUser.role}`);
    
    // Load role-specific CSS if not already loaded
    if (!document.getElementById('role-enhancements-css')) {
      const link = document.createElement('link');
      link.id = 'role-enhancements-css';
      link.rel = 'stylesheet';
      link.href = '/styles/role-enhancements.css';
      document.head.appendChild(link);
    }
  }

  // Setup role-specific features and UI elements
  setupRoleSpecificFeatures() {
    // Remove any existing role-specific elements
    this.removeRoleSpecificElements();
    
    switch (this.currentUser.role) {
      case 'reporter':
        this.setupReporterFeatures();
        break;
      case 'manager':
        this.setupManagerFeatures();
        break;
      case 'admin':
        this.setupAdminFeatures();
        break;
    }
  }

  setupReporterFeatures() {
    // Add quick report button
    const quickReportBtn = document.createElement('button');
    quickReportBtn.className = 'quick-report-btn';
    quickReportBtn.innerHTML = '<i class="fas fa-plus"></i>';
    quickReportBtn.title = 'Quick Report';
    quickReportBtn.id = 'quick-report-btn';
    
    quickReportBtn.addEventListener('click', () => {
      this.showQuickReportModal();
    });
    
    document.body.appendChild(quickReportBtn);
    
    // Add reporter-specific notifications
    this.addNotification({
      id: 'reporter-welcome',
      type: 'info',
      message: 'Welcome back! Ready to report road hazards?',
      timestamp: new Date()
    });
  }

  setupManagerFeatures() {
    // Add manager-specific dashboard widgets
    this.addNotification({
      id: 'manager-summary',
      type: 'info',
      message: 'Daily report summary ready for review',
      timestamp: new Date()
    });
    
    // Setup advanced search features
    this.enableAdvancedSearch = true;
  }

  setupAdminFeatures() {
    // Add system control panel
    const systemControls = document.createElement('div');
    systemControls.className = 'system-controls';
    systemControls.id = 'system-controls';
    
    const controls = [
      { icon: 'fas fa-cog', title: 'System Settings', action: 'showSystemSettings' },
      { icon: 'fas fa-users', title: 'User Management', action: 'showUserManagement' },
      { icon: 'fas fa-chart-bar', title: 'Analytics', action: 'showAnalytics' },
      { icon: 'fas fa-database', title: 'Database', action: 'showDatabase' }
    ];
    
    controls.forEach(control => {
      const btn = document.createElement('button');
      btn.className = 'system-control-btn';
      btn.innerHTML = `<i class="${control.icon}"></i>`;
      btn.title = control.title;
      btn.addEventListener('click', () => this[control.action]());
      systemControls.appendChild(btn);
    });
    
    document.body.appendChild(systemControls);
    
    // Add admin notifications
    this.addNotification({
      id: 'admin-alert',
      type: 'warning',
      message: 'System maintenance scheduled for tonight',
      timestamp: new Date()
    });
  }

  removeRoleSpecificElements() {
    // Remove existing role-specific elements
    const elementsToRemove = [
      'quick-report-btn',
      'system-controls',
      'manager-dashboard-widgets'
    ];
    
    elementsToRemove.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.remove();
      }
    });
  }

  // Quick report modal for reporters
  showQuickReportModal() {
    const modal = document.createElement('div');
    modal.className = 'quick-report-modal';
    modal.innerHTML = `
      <div class="quick-report-content glass">
        <div class="quick-report-header">
          <h3><i class="fas fa-exclamation-triangle"></i> Quick Hazard Report</h3>
          <button class="close-modal" onclick="this.closest('.quick-report-modal').remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="quick-report-body">
          <div class="hazard-types">
            <button class="hazard-type-btn" data-type="pothole">
              <i class="fas fa-road"></i> Pothole
            </button>
            <button class="hazard-type-btn" data-type="debris">
              <i class="fas fa-trash"></i> Debris
            </button>
            <button class="hazard-type-btn" data-type="crack">
              <i class="fas fa-bolt"></i> Road Crack
            </button>
            <button class="hazard-type-btn" data-type="flooding">
              <i class="fas fa-water"></i> Flooding
            </button>
            <button class="hazard-type-btn" data-type="other">
              <i class="fas fa-exclamation"></i> Other
            </button>
          </div>
          <div class="location-section">
            <button class="btn btn-primary" id="use-current-location">
              <i class="fas fa-map-marker-alt"></i> Use Current Location
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.addQuickReportStyles();
    this.setupQuickReportHandlers(modal);
  }

  addQuickReportStyles() {
    if (document.getElementById('quick-report-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'quick-report-styles';
    styles.textContent = `
      .quick-report-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-lg);
      }

      .quick-report-content {
        width: 100%;
        max-width: 500px;
        padding: var(--space-xl);
        animation: fadeInScale 0.3s ease-out;
      }

      .quick-report-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-lg);
      }

      .quick-report-header h3 {
        color: var(--text-primary);
        margin: 0;
        display: flex;
        align-items: center;
        gap: var(--space-sm);
      }

      .close-modal {
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: var(--font-size-lg);
        cursor: pointer;
        padding: var(--space-sm);
        border-radius: var(--radius-full);
        transition: var(--transition-base);
      }

      .close-modal:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-primary);
      }

      .hazard-types {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: var(--space-md);
        margin-bottom: var(--space-lg);
      }

      .hazard-type-btn {
        padding: var(--space-lg);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-lg);
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-primary);
        cursor: pointer;
        transition: var(--transition-base);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-sm);
        font-size: var(--font-size-sm);
        font-weight: 500;
      }

      .hazard-type-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: var(--success);
        transform: translateY(-2px);
      }

      .hazard-type-btn i {
        font-size: var(--font-size-xl);
        color: var(--success);
      }

      .location-section {
        text-align: center;
        padding-top: var(--space-lg);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
    `;

    document.head.appendChild(styles);
  }

  setupQuickReportHandlers(modal) {
    // Handle hazard type selection
    modal.querySelectorAll('.hazard-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hazardType = btn.dataset.type;
        this.createQuickReport(hazardType);
        modal.remove();
      });
    });

    // Handle location detection
    modal.querySelector('#use-current-location').addEventListener('click', () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            console.log('Location:', position.coords);
            // Handle location data
          },
          (error) => {
            console.error('Location error:', error);
          }
        );
      }
    });
  }

  createQuickReport(hazardType) {
    // Simulate creating a quick report
    console.log(`Creating quick report for: ${hazardType}`);
    
    // Add success notification
    this.addNotification({
      id: `report-${Date.now()}`,
      type: 'success',
      message: `${hazardType} report created successfully!`,
      timestamp: new Date()
    });
    
    // Update notification badge
    this.updateNotificationBadge();
  }

  // Admin system control methods
  showSystemSettings() {
    console.log('Opening system settings...');
    // Implement system settings modal
  }

  showUserManagement() {
    console.log('Opening user management...');
    // Implement user management interface
  }

  showAnalytics() {
    console.log('Opening analytics dashboard...');
    // Implement analytics interface
  }

  showDatabase() {
    console.log('Opening database management...');
    // Implement database interface
  }

  // User management methods
  async getUserStats() {
    try {
      const response = await fetch('/api/user-stats', {
        credentials: 'include'
      });
      
      if (response.ok) {
        return await response.json();
      } else {
        throw new Error('Failed to fetch user stats');
      }
    } catch (error) {
      console.error('Error fetching user stats:', error);
      return null;
    }
  }

  async getAllUsers() {
    try {
      const response = await fetch('/api/users', {
        credentials: 'include'
      });
      
      if (response.ok) {
        return await response.json();
      } else if (response.status === 403) {
        console.warn('Access denied: Admin privileges required');
        return null;
      } else {
        throw new Error('Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      return null;
    }
  }

  // Enhanced role detection
  hasPermission(permission) {
    const rolePermissions = {
      'admin': ['view_all_reports', 'manage_users', 'system_settings', 'view_analytics'],
      'manager': ['view_all_reports', 'manage_reports', 'view_analytics'],
      'reporter': ['create_reports', 'view_own_reports']
    };
    
    const userPermissions = rolePermissions[this.currentUser.role] || [];
    return userPermissions.includes(permission);
  }

  // Check if user can access a specific page
  canAccessPage(pageName) {
    const pagePermissions = {
      'admin-dashboard': ['admin'],
      'dashboard': ['admin', 'manager', 'reporter'],
      'camera': ['admin', 'manager', 'reporter'],
      'reports': ['admin', 'manager'],
      'users': ['admin']
    };
    
    const allowedRoles = pagePermissions[pageName] || ['admin', 'manager', 'reporter'];
    return allowedRoles.includes(this.currentUser.role);
  }

  // Display user information in navigation
  updateUserDisplay() {
    const userNameElement = document.querySelector('.user-name');
    const userEmailElement = document.querySelector('.user-email');
    const userRoleElement = document.querySelector('.user-role-text');
    
    if (userNameElement) {
      userNameElement.textContent = this.currentUser.name;
    }
    
    if (userEmailElement) {
      userEmailElement.textContent = this.currentUser.email;
    }
    
    if (userRoleElement) {
      const roleConfig = this.getRoleConfig(this.currentUser.role);
      userRoleElement.textContent = roleConfig.displayName;
    }
  }

  // Refresh user data from server
  async refreshUserData() {
    await this.loadUserData();
    this.setupNavigation();
    this.updateUserDisplay();
  }
}

// Make UnifiedNavigation globally available
window.UnifiedNavigation = UnifiedNavigation;

// Initialize navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  if (!window.unifiedNav) {
    window.unifiedNav = new UnifiedNavigation();
  }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnifiedNavigation;
}

} // End of duplicate prevention check