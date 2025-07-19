/* ============================================
   DASHBOARD-PAGE.JS - Dashboard page functionality
   ============================================ */

/**
 * Dashboard Page Module
 * Handles the main dashboard page functionality
 */
export class DashboardPage {
  constructor() {
    this.metrics = {
      totalReports: 0,
      openHazards: 0,
      resolvedThisMonth: 0
    };
    this.reports = [];
    this.isFiltersCollapsed = false;
  }

  /**
   * Initialize the dashboard
   */
  async init() {
    console.log('Dashboard Page initialized');
    
    // Add animation classes
    this.addAnimationClasses();
    
    // Initialize components
    await this.initializeMap();
    await this.loadDashboardData();
    this.setupEventListeners();
    
    // Load components
    this.loadComponents();
  }

  /**
   * Add animation classes to elements
   */
  addAnimationClasses() {
    const header = document.querySelector('.dashboard-header');
    const metricsRow = document.querySelector('.dashboard-metrics-row');
    const centerRow = document.querySelector('.dashboard-center-row');
    
    if (header) header.classList.add('fade-in');
    if (metricsRow) metricsRow.classList.add('slide-in-left');
    if (centerRow) centerRow.classList.add('slide-in-right');
  }

  /**
   * Load dashboard components
   */
  loadComponents() {
    this.loadComponent('/components/navigation/floating-menu.html', 'floating-menu-container');
    this.loadComponent('/components/ui/toast.html', 'toast-container-placeholder');
  }

  /**
   * Simple component loader
   */
  loadComponent(url, targetId) {
    return fetch(url)
      .then(response => response.text())
      .then(html => {
        const target = document.getElementById(targetId);
        if (target) {
          target.innerHTML = html;
          
          // Execute any scripts in the loaded component
          const scripts = target.querySelectorAll('script');
          scripts.forEach(script => {
            const newScript = document.createElement('script');
            newScript.textContent = script.textContent;
            document.head.appendChild(newScript);
          });
        }
      })
      .catch(error => {
        console.error('Error loading component:', error);
      });
  }

  /**
   * Initialize the map
   */
  async initializeMap() {
    console.log('Map initialized');
    
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
      // Add loading state
      mapContainer.classList.add('loading');
      
      // Simulate map loading
      setTimeout(() => {
        mapContainer.classList.remove('loading');
        mapContainer.innerHTML = `
          <div style="text-align: center; color: white; position: relative; z-index: 1;">
            <i class="fas fa-map fa-3x mb-3"></i>
            <p style="margin: 0.5rem 0; font-size: 1.1rem; font-weight: 500;">Interactive Map</p>
            <small style="opacity: 0.8;">Hazard locations will appear here</small>
          </div>
        `;
      }, 1000);
    }
  }

  /**
   * Load dashboard data
   */
  async loadDashboardData() {
    try {
      // Simulate API call
      const data = await this.simulateApiCall();
      
      this.updateMetrics(data.metrics);
      this.reports = data.reports;
      this.renderReportsCards(this.reports);
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  }

  /**
   * Simulate API call
   */
  simulateApiCall() {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          metrics: {
            totalReports: 145,
            openHazards: 23,
            resolvedThisMonth: 67
          },
          reports: [
            {
              id: 1,
              type: 'Pothole',
              status: 'Open',
              date: '2024-01-15',
              location: 'Main Street & 1st Ave',
              image: '/assets/placeholder-hazard.jpg'
            },
            {
              id: 2,
              type: 'Crack',
              status: 'In Progress',
              date: '2024-01-14',
              location: 'Highway 101',
              image: null
            },
            {
              id: 3,
              type: 'Debris',
              status: 'Resolved',
              date: '2024-01-13',
              location: 'Park Avenue',
              image: '/assets/placeholder-hazard.jpg'
            },
            {
              id: 4,
              type: 'Pothole',
              status: 'Open',
              date: '2024-01-12',
              location: 'Downtown District',
              image: null
            }
          ]
        });
      }, 1000);
    });
  }

  /**
   * Update metrics display
   */
  updateMetrics(metrics) {
    this.metrics = metrics;
    
    const totalReports = document.getElementById('total-reports-count');
    const openHazards = document.getElementById('open-hazards-count');
    const resolvedThisMonth = document.getElementById('resolved-this-month');

    if (totalReports) {
      this.animateNumber(totalReports, metrics.totalReports);
    }

    if (openHazards) {
      this.animateNumber(openHazards, metrics.openHazards);
    }

    if (resolvedThisMonth) {
      this.animateNumber(resolvedThisMonth, metrics.resolvedThisMonth);
    }
  }

  /**
   * Animate number counting
   */
  animateNumber(element, targetValue) {
    const startValue = parseInt(element.textContent) || 0;
    const increment = (targetValue - startValue) / 20;
    let currentValue = startValue;

    const timer = setInterval(() => {
      currentValue += increment;
      if (currentValue >= targetValue) {
        element.textContent = targetValue;
        clearInterval(timer);
      } else {
        element.textContent = Math.round(currentValue);
      }
    }, 50);
  }

  /**
   * Render reports cards
   */
  renderReportsCards(reports) {
    const container = document.getElementById('reports-cards-container');
    if (!container) return;

    container.innerHTML = '';

    if (!reports.length) {
      container.innerHTML = `
        <div class="text-center text-muted p-4">
          <i class="fas fa-inbox fa-2x mb-2"></i>
          <br>No reports found
        </div>
      `;
      return;
    }

    reports.forEach((report, index) => {
      const card = this.createReportCard(report, index);
      container.appendChild(card);
    });
  }

  /**
   * Create individual report card
   */
  createReportCard(report, index) {
    const card = document.createElement('div');
    card.className = 'report-card';
    card.style.animationDelay = `${index * 0.1}s`;
    
    const statusClass = this.getStatusBadgeClass(report.status);
    const dateFormatted = new Date(report.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    card.innerHTML = `
      <div class="d-flex align-items-start gap-3">
        <div class="report-image" style="min-width: 56px;">
          ${report.image 
            ? `<img src="${report.image}" alt="Hazard" class="rounded" style="width: 56px; height: 56px; object-fit: cover;" onerror="this.style.display='none'">` 
            : `<div class="bg-secondary rounded d-flex align-items-center justify-content-center text-white" style="width: 56px; height: 56px; font-size: 0.8rem;">No Image</div>`
          }
        </div>
        
        <div class="report-content flex-grow-1 min-w-0">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h6 class="mb-0 text-truncate">${report.type}</h6>
            <span class="badge ${statusClass} ms-2">${report.status}</span>
          </div>
          
          <p class="text-muted mb-1 small">
            <i class="fas fa-map-marker-alt me-1"></i>
            ${report.location}
          </p>
          
          <p class="text-muted mb-0 small">
            <i class="fas fa-calendar me-1"></i>
            ${dateFormatted}
          </p>
        </div>
        
        <div class="report-actions d-flex flex-column gap-1">
          <button class="btn btn-outline-primary btn-sm" title="View Details">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-outline-warning btn-sm" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-outline-danger btn-sm" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;

    // Add event listeners
    const [viewBtn, editBtn, deleteBtn] = card.querySelectorAll('button');
    viewBtn.onclick = () => this.viewReport(report.id);
    editBtn.onclick = () => this.editReport(report.id);
    deleteBtn.onclick = () => this.deleteReport(report.id);

    return card;
  }

  /**
   * Get status badge class
   */
  getStatusBadgeClass(status) {
    switch (status) {
      case 'Open':
        return 'bg-danger';
      case 'In Progress':
        return 'bg-warning text-dark';
      case 'Resolved':
        return 'bg-success';
      default:
        return 'bg-secondary';
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Filter toggle
    const filterToggle = document.getElementById('toggle-filters-btn');
    const filtersContainer = document.getElementById('reports-filters');

    if (filterToggle && filtersContainer) {
      filterToggle.addEventListener('click', () => {
        this.toggleFilters();
      });
    }

    // Search functionality
    const searchInput = document.getElementById('report-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Sort functionality
    const sortSelect = document.getElementById('report-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.handleSort(e.target.value);
      });
    }

    // Map controls
    this.setupMapControls();

    // Admin link functionality
    this.setupAdminLinks();
  }

  /**
   * Toggle filters visibility
   */
  toggleFilters() {
    const filtersContainer = document.getElementById('reports-filters');
    const filterToggle = document.getElementById('toggle-filters-btn');
    
    this.isFiltersCollapsed = !this.isFiltersCollapsed;
    
    if (filtersContainer) {
      filtersContainer.classList.toggle('collapsed', this.isFiltersCollapsed);
    }
    
    if (filterToggle) {
      filterToggle.classList.toggle('collapsed', this.isFiltersCollapsed);
      const icon = filterToggle.querySelector('i');
      if (icon) {
        icon.className = this.isFiltersCollapsed ? 'fas fa-chevron-down' : 'fas fa-filter';
      }
    }
  }

  /**
   * Handle search
   */
  handleSearch(query) {
    console.log('Search:', query);
    
    const filteredReports = this.reports.filter(report => 
      report.type.toLowerCase().includes(query.toLowerCase()) ||
      report.location.toLowerCase().includes(query.toLowerCase()) ||
      report.status.toLowerCase().includes(query.toLowerCase())
    );
    
    this.renderReportsCards(filteredReports);
  }

  /**
   * Handle sort
   */
  handleSort(sortBy) {
    console.log('Sort by:', sortBy);
    
    const sortedReports = [...this.reports].sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.date) - new Date(a.date);
        case 'type':
          return a.type.localeCompare(b.type);
        case 'status':
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });
    
    this.renderReportsCards(sortedReports);
  }

  /**
   * Setup map controls
   */
  setupMapControls() {
    const heatmapToggle = document.getElementById('toggle-heatmap');
    const centerMap = document.getElementById('center-map');

    if (heatmapToggle) {
      heatmapToggle.addEventListener('click', () => {
        console.log('Toggle heatmap');
        // Implement heatmap toggle
      });
    }

    if (centerMap) {
      centerMap.addEventListener('click', () => {
        console.log('Center map');
        // Implement map centering
      });
    }
  }

  /**
   * Setup admin links
   */
  setupAdminLinks() {
    fetch('/api/auth/check')
      .then(r => r.json())
      .then(data => {
        const adminLink = document.getElementById('admin-link');
        const adminLinkHeader = document.getElementById('admin-link-header');
        
        if (data.user && data.user.email && 
            ['nireljano@gmail.com', 'shachaf331@gmail.com'].includes(data.user.email)) {
          if (adminLink) adminLink.style.display = 'block';
          if (adminLinkHeader) adminLinkHeader.style.display = 'inline-block';
        }
      })
      .catch(error => {
        console.error('Error checking admin status:', error);
      });
  }

  /**
   * Report actions
   */
  viewReport(reportId) {
    console.log('View report:', reportId);
    // Implement report viewing
  }

  editReport(reportId) {
    console.log('Edit report:', reportId);
    // Implement report editing
  }

  deleteReport(reportId) {
    if (confirm('Are you sure you want to delete this report?')) {
      console.log('Delete report:', reportId);
      // Implement report deletion
      this.reports = this.reports.filter(report => report.id !== reportId);
      this.renderReportsCards(this.reports);
    }
  }
}

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const dashboard = new DashboardPage();
  dashboard.init();
});