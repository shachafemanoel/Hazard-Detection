// קובץ זה נוקה מקוד לא רלוונטי לדשבורד הראשי

import { ApiService } from './ApiService.js';

/**
 * Unified Dashboard Class
 * Handles all dashboard functionality in a clean, organized way
 */
class DashboardUnified {
  constructor() {
    this.reports = [];
    this.filteredReports = [];
    this.currentView = 'cards';
    this.isLoading = false;
    this.searchTerm = '';
    this.sortBy = 'date';
    this.sortOrder = 'desc';
    
    // No need to initialize ApiService as it's a static class
    
    // Import existing functions from dashboard.js
    this.map = null;
    this.markers = [];
    this.allReports = [];
    
    // Bind methods
    this.handleSearch = this.handleSearch.bind(this);
    this.refreshReports = this.refreshReports.bind(this);
    this.showReportDetails = this.showReportDetails.bind(this);
  }

  /**
   * Initialize the dashboard
   */
  async init() {
    console.log('Initializing Unified Dashboard...');
    
    try {
      // Setup event listeners
      this.setupEventListeners();
      
      // Load initial data
      await this.loadDashboardData();
      
      // Initialize map (wait for Google Maps API and dashboard.js)
      setTimeout(() => {
        this.initializeMap();
      }, 2000);
      
      console.log('Dashboard initialized successfully');
    } catch (error) {
      console.error('Error initializing dashboard:', error);
      this.showError('Failed to initialize dashboard');
    }
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('search-reports');
    if (searchInput) {
      searchInput.addEventListener('input', this.handleSearch);
    }

    // View toggle buttons
    const viewCardsBtn = document.getElementById('view-cards');
    const viewTableBtn = document.getElementById('view-table');
    
    if (viewCardsBtn) {
      viewCardsBtn.addEventListener('click', () => this.switchView('cards'));
    }
    
    if (viewTableBtn) {
      viewTableBtn.addEventListener('click', () => this.switchView('table'));
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-reports');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', this.refreshReports);
    }

    // Map controls
    const heatmapBtn = document.getElementById('toggle-heatmap');
    const centerBtn = document.getElementById('center-map');
    const fullscreenBtn = document.getElementById('fullscreen-map');

    if (heatmapBtn) {
      heatmapBtn.addEventListener('click', () => this.toggleHeatmap());
    }

    if (centerBtn) {
      centerBtn.addEventListener('click', () => this.centerMap());
    }

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => this.toggleFullscreenMap());
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }
  }

  /**
   * Load dashboard data
   */
  async loadDashboardData() {
    this.setLoading(true);
    
    try {
      // Simulate API call - replace with actual API calls
      await this.delay(1000);
      
      // Load reports from API
      this.reports = await this.loadReportsFromAPI();
      this.filteredReports = [...this.reports];
      
      // Store reports globally for compatibility with existing dashboard.js
      window.allReports = this.reports;
      
      // Update stats
      this.updateStats();
      
      // Render reports
      this.renderReports();
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      this.showError('Failed to load dashboard data');
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Load reports from API (using existing dashboard.js functionality)
   */
  async loadReportsFromAPI() {
    try {
      // Use the static method from ApiService
      const reports = await ApiService.loadReports();
      return reports.map(report => ({
        id: report.id,
        type: report.type || report.hazardType || 'Unknown',
        status: report.status || 'Pending',
        location: report.location || 'Unknown Location',
        date: new Date(report.timestamp || report.date || Date.now()),
        image: report.image || report.imageUrl || null,
        description: report.description || ''
      }));
    } catch (error) {
      console.error('Error loading reports from API:', error);
      return [];
    }
  }

  /**
   * Update statistics
   */
  updateStats() {
    const totalReports = this.reports.length;
    const pendingReports = this.reports.filter(r => r.status === 'Pending').length;
    const resolvedReports = this.reports.filter(r => r.status === 'Resolved').length;
    const locations = new Set(this.reports.map(r => r.location)).size;

    this.animateNumber('total-reports', totalReports);
    this.animateNumber('pending-reports', pendingReports);
    this.animateNumber('resolved-reports', resolvedReports);
    this.animateNumber('locations-count', locations);
  }

  /**
   * Animate number counting
   */
  animateNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const startValue = parseInt(element.textContent) || 0;
    const increment = (targetValue - startValue) / 30;
    let currentValue = startValue;

    const timer = setInterval(() => {
      currentValue += increment;
      if (currentValue >= targetValue) {
        element.textContent = targetValue;
        clearInterval(timer);
      } else {
        element.textContent = Math.round(currentValue);
      }
    }, 30);
  }

  /**
   * Handle search input
   */
  handleSearch(event) {
    this.searchTerm = event.target.value.toLowerCase();
    this.filterReports();
  }

  /**
   * Filter and sort reports based on search term and sort options
   */
  filterReports() {
    if (!this.searchTerm) {
      this.filteredReports = [...this.reports];
    } else {
      this.filteredReports = this.reports.filter(report => 
        report.type.toLowerCase().includes(this.searchTerm) ||
        report.location.toLowerCase().includes(this.searchTerm) ||
        report.status.toLowerCase().includes(this.searchTerm) ||
        (report.description && report.description.toLowerCase().includes(this.searchTerm))
      );
    }
    
    // Apply sorting
    this.sortReports();
    
    this.renderReports();
  }

  /**
   * Sort reports based on current sort settings
   */
  sortReports() {
    this.filteredReports.sort((a, b) => {
      let aVal = a[this.sortBy];
      let bVal = b[this.sortBy];
      
      // Handle different data types
      if (this.sortBy === 'date') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else if (this.sortBy === 'id') {
        aVal = parseInt(aVal) || 0;
        bVal = parseInt(bVal) || 0;
      } else {
        // String comparison (case insensitive)
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }
      
      if (aVal < bVal) return this.sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  /**
   * Change sort settings and refresh
   */
  changeSorting(sortBy, sortOrder = 'desc') {
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
    this.filterReports();
  }

  /**
   * Switch between card and table view
   */
  switchView(view) {
    this.currentView = view;
    
    // Update button states
    const viewCardsBtn = document.getElementById('view-cards');
    const viewTableBtn = document.getElementById('view-table');
    
    if (viewCardsBtn && viewTableBtn) {
      viewCardsBtn.classList.toggle('active', view === 'cards');
      viewTableBtn.classList.toggle('active', view === 'table');
    }
    
    this.renderReports();
  }

  /**
   * Render reports based on current view
   */
  renderReports() {
    if (this.currentView === 'cards') {
      this.renderReportCards();
    } else {
      this.renderReportTable();
    }
  }

  /**
   * Render report cards
   */
  renderReportCards() {
    const container = document.getElementById('reports-container');
    if (!container) return;

    container.innerHTML = '';

    if (this.filteredReports.length === 0) {
      container.innerHTML = `
        <div class="text-center py-4">
          <i class="fas fa-inbox fa-2x text-muted mb-3"></i>
          <p class="text-muted">No reports found</p>
        </div>
      `;
      return;
    }

    this.filteredReports.forEach((report, index) => {
      const card = this.createReportCard(report, index);
      container.appendChild(card);
    });
  }

  /**
   * Create individual report card
   */
  createReportCard(report, index) {
    const card = document.createElement('div');
    card.className = 'card glass animate-fade-in-up';
    card.style.animationDelay = `${index * 0.05}s`;
    card.style.marginBottom = 'var(--space-md)';
    card.style.cursor = 'pointer';

    // Get proper badge class based on design system
    const getBadgeClass = (status) => {
      switch (status?.toLowerCase()) {
        case 'resolved': return 'badge-success';
        case 'pending': return 'badge-warning';
        case 'open': return 'badge-danger';
        case 'new': return 'badge-info';
        case 'in progress': return 'badge-secondary';
        default: return 'badge-secondary';
      }
    };

    // Get hazard icon
    const getHazardIcon = (type) => {
      const icons = {
        'Pothole': 'fas fa-exclamation-triangle',
        'Alligator Crack': 'fas fa-project-diagram',
        'Block Crack': 'fas fa-th-large',
        'Transverse Crack': 'fas fa-arrows-alt-h',
        'Longitudinal Crack': 'fas fa-arrows-alt-v',
        'Crack': 'fas fa-bolt',
        'Debris': 'fas fa-cube',
        'Manhole': 'fas fa-circle',
        'Patch Repair': 'fas fa-band-aid',
        'Default': 'fas fa-road'
      };
      return icons[type] || icons['Default'];
    };

    // Format date
    const dateFormatted = (report.date || report.time) ? 
      new Date(report.date || report.time).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : 'Unknown Date';

    // Truncate location for better display
    const truncatedLocation = (report.location && report.location.length > 35) 
      ? report.location.substring(0, 35) + '...' 
      : (report.location || 'Unknown Location');

    card.innerHTML = `
      <div class="card-body" style="padding: var(--space-lg);">
        <div class="d-flex gap-3">
          <!-- Image Section -->
          <div class="report-image-container" style="flex-shrink: 0;">
            ${report.image 
              ? `<img src="${report.image}" 
                     alt="${report.type}" 
                     class="report-thumbnail" 
                     style="width: 60px; height: 60px; object-fit: cover; border-radius: var(--radius-lg); border: 2px solid rgba(255,255,255,0.1);"
                     loading="lazy"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                 <div class="report-image-placeholder" style="display: none; width: 60px; height: 60px; border-radius: var(--radius-lg); background: rgba(255,255,255,0.05); align-items: center; justify-content: center; border: 2px solid rgba(255,255,255,0.1);">
                   <i class="${getHazardIcon(report.type)} text-muted"></i>
                 </div>`
              : `<div class="report-image-placeholder" style="width: 60px; height: 60px; border-radius: var(--radius-lg); background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; border: 2px solid rgba(255,255,255,0.1);">
                   <i class="${getHazardIcon(report.type)} text-muted"></i>
                 </div>`
            }
          </div>
          
          <!-- Content Section -->
          <div class="flex-grow-1" style="min-width: 0;">
            <!-- Header -->
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div class="d-flex align-items-center gap-2">
                <i class="${getHazardIcon(report.type)}" style="color: var(--warning-color); font-size: 1rem;"></i>
                <h6 class="text-primary mb-0" style="font-weight: 600; font-size: var(--font-size-base);">${report.type || 'Unknown Type'}</h6>
              </div>
              <span class="badge ${getBadgeClass(report.status)}">${report.status || 'Unknown'}</span>
            </div>
            
            <!-- Location -->
            <div class="mb-2">
              <small class="text-secondary d-flex align-items-center gap-1">
                <i class="fas fa-map-marker-alt" style="color: var(--info-color); font-size: 0.8rem;"></i>
                <span title="${report.location || 'Unknown Location'}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${truncatedLocation}</span>
              </small>
            </div>
            
            <!-- Footer -->
            <div class="d-flex justify-content-between align-items-center">
              <small class="text-muted d-flex align-items-center gap-1">
                <i class="fas fa-clock" style="font-size: 0.8rem;"></i>
                ${dateFormatted}
              </small>
              <button class="btn btn-glass btn-sm" onclick="event.stopPropagation(); dashboard.showReportDetails('${report.id || index}')" title="View Details">
                <i class="fas fa-eye"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add click event to the whole card
    card.addEventListener('click', (e) => {
      if (!e.target.closest('button')) {
        this.showReportDetails(report.id || index);
      }
    });

    return card;
  }

  /**
   * Get status CSS class
   */
  getStatusClass(status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'status-pending';
      case 'resolved':
        return 'status-resolved';
      case 'in progress':
        return 'status-in-progress';
      default:
        return 'status-pending';
    }
  }

  /**
   * Show report details modal using existing dashboard.js functionality
   */
  showReportDetails(reportId) {
    const report = this.reports.find(r => r.id === reportId);
    if (!report) return;

    // Use existing showReportDetails function from dashboard.js if available
    if (typeof window.showReportDetails === 'function') {
      window.showReportDetails(report);
    } else {
      // Fallback to our own implementation
      const modalContent = document.getElementById('modal-content');
      const modal = new bootstrap.Modal(document.getElementById('reportModal'));

      if (modalContent) {
        modalContent.innerHTML = `
          <div class="row">
            <div class="col-md-6">
              ${report.image 
                ? `<img src="${report.image}" class="img-fluid rounded mb-3" alt="${report.type}">`
                : '<div class="bg-light rounded d-flex align-items-center justify-content-center" style="height: 200px;"><i class="fas fa-image fa-3x text-muted"></i></div>'
              }
            </div>
            <div class="col-md-6">
              <h6>Report Information</h6>
              <table class="table table-borderless">
                <tr><td><strong>Type:</strong></td><td>${report.type}</td></tr>
                <tr><td><strong>Status:</strong></td><td><span class="badge ${this.getStatusClass(report.status)}">${report.status}</span></td></tr>
                <tr><td><strong>Location:</strong></td><td>${report.location}</td></tr>
                <tr><td><strong>Date:</strong></td><td>${report.date.toLocaleDateString()}</td></tr>
                <tr><td><strong>ID:</strong></td><td>#${report.id}</td></tr>
              </table>
              ${report.description ? `<p><strong>Description:</strong><br>${report.description}</p>` : ''}
            </div>
          </div>
        `;
      }

      modal.show();
    }
  }

  /**
   * Edit report
   */
  editReport(reportId) {
    console.log('Editing report:', reportId);
    // Implement edit functionality
  }

  /**
   * Delete report
   */
  deleteReport(reportId) {
    if (confirm('Are you sure you want to delete this report?')) {
      this.reports = this.reports.filter(r => r.id !== reportId);
      this.filterReports();
      this.updateStats();
      console.log('Report deleted:', reportId);
    }
  }

  /**
   * Refresh reports using existing dashboard.js functionality
   */
  async refreshReports() {
    const refreshBtn = document.getElementById('refresh-reports');
    if (refreshBtn) {
      refreshBtn.innerHTML = '<i class="fas fa-spin fa-spinner"></i> Refreshing...';
      refreshBtn.disabled = true;
    }

    try {
      // Use existing loadReports function if available
      if (typeof window.loadReports === 'function') {
        await window.loadReports();
        // Sync with our local data
        this.reports = window.allReports || [];
        this.filteredReports = [...this.reports];
        this.updateStats();
        this.renderReports();
      } else {
        await this.loadDashboardData();
      }
    } finally {
      if (refreshBtn) {
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        refreshBtn.disabled = false;
      }
    }
  }

  /**
   * Initialize map using existing dashboard.js functionality
   */
  async initializeMap() {
    try {
      // Check if Google Maps API is loaded
      if (typeof google !== 'undefined' && google.maps) {
        // Use existing initMap function from dashboard.js
        if (typeof window.initMap === 'function') {
          await window.initMap();
          this.map = window.map;
          this.markers = window.markers;
        } else {
          console.warn('initMap function not found in dashboard.js');
        }
      } else {
        console.warn('Google Maps API not loaded yet');
      }
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }

  /**
   * Toggle heatmap using existing dashboard.js functionality
   */
  toggleHeatmap() {
    if (typeof window.toggleHeatmap === 'function') {
      window.toggleHeatmap();
    } else {
      console.log('toggleHeatmap function not found in dashboard.js');
    }
  }

  /**
   * Center map using existing dashboard.js functionality
   */
  centerMap() {
    if (typeof window.centerMap === 'function') {
      window.centerMap();
    } else {
      console.log('centerMap function not found in dashboard.js');
    }
  }

  /**
   * Toggle fullscreen map
   */
  toggleFullscreenMap() {
    const mapContainer = document.querySelector('.map-container');
    if (mapContainer) {
      mapContainer.classList.toggle('fullscreen');
    }
  }

  /**
   * Handle logout
   */
  handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
      window.location.href = '/login.html';
    }
  }

  /**
   * Set loading state
   */
  setLoading(loading) {
    this.isLoading = loading;
    const loadingElement = document.getElementById('loading-reports');
    const container = document.getElementById('reports-cards');
    
    if (loadingElement && container) {
      if (loading) {
        container.innerHTML = '';
        container.appendChild(loadingElement);
      } else {
        loadingElement.style.display = 'none';
      }
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    console.error(message);
    // Implement toast notification or error display
  }

  /**
   * Utility: Delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Render report table (placeholder)
   */
  renderReportTable() {
    const container = document.getElementById('reports-cards');
    if (!container) return;

    container.innerHTML = `
      <div class="text-center py-4">
        <i class="fas fa-table fa-2x text-muted mb-3"></i>
        <p class="text-muted">Table view coming soon...</p>
      </div>
    `;
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Wait for existing dashboard.js to load first
  setTimeout(() => {
    window.dashboard = new DashboardUnified();
    window.dashboard.init();
  }, 500);
});

export default DashboardUnified;