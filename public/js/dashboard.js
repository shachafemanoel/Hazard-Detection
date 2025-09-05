// Main dashboard application
import { MapManager } from './modules/map.js';
import { DataManager } from './modules/data.js';
import { UIManager } from './modules/ui.js';

class Dashboard {
  constructor() {
    this.config = {
      map: {
        center: [32.0853, 34.7818], // Tel Aviv
        zoom: 13,
        tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      },
      refreshInterval: 30000 // 30 seconds
    };

    this.map = new MapManager(this.config.map);
    this.data = new DataManager();
    this.ui = new UIManager();

    this.init();
  }

  async init() {
    try {
      // Initialize map
      this.map.init();

      // Load initial data
      await this.loadData();

      // Attempt to get user location for nearest sorting
      this.tryGetUserLocation();

      // Setup auto-refresh
      this.startAutoRefresh();

      // Setup event listeners
      this.setupEventListeners();
    } catch (error) {
      console.error('Dashboard initialization failed:', error);
      this.ui.toast.show('Failed to initialize dashboard', 'error');
    }
  }

  tryGetUserLocation() {
    if (!('geolocation' in navigator)) return;
    const onSuccess = (pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      this.data.setUserLocation(coords);
      // If currently sorted by nearest, refresh ordering
      if ((this.data.filters.sort || 'newest') === 'nearest') {
        this.redrawFiltered();
      }
    };
    const onError = (err) => {
      console.warn('Geolocation not available:', err); 
    };
    try {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 });
    } catch (e) { console.warn('Geo error:', e); }
  }

  async loadData(showLoading = true) {
    try {
      if (showLoading) {
        this.ui.toggleLoading(true);
        const mapLoader = document.getElementById('map-loader');
        if (mapLoader) mapLoader.style.display = 'flex';
      }
      
      // Fetch and filter reports
      await this.data.fetchReports();
      const filteredReports = this.data.getFilteredReports();
      
      // Update UI components
      this.ui.updateTable(filteredReports);
      this.ui.updateStats(this.data.getStats());
      await this.map.plotReports(filteredReports);
      
      if (showLoading) {
        this.ui.toggleLoading(false);
        const mapLoader = document.getElementById('map-loader');
        if (mapLoader) mapLoader.style.display = 'none';
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      if (error.message.includes('Authentication required')) {
        this.ui.toast.show('נא להתחבר כדי לצפות בדיווחים', 'warning');
      } else {
        this.ui.toast.show(error.message || 'שגיאה בטעינת נתונים', 'error');
      }
      this.ui.toggleLoading(false);
      const mapLoader = document.getElementById('map-loader');
      if (mapLoader) mapLoader.style.display = 'none';
    }
  }

  redrawFiltered() {
    try {
      const filteredReports = this.data.getFilteredReports();
      this.ui.updateTable(filteredReports);
      this.ui.updateStats(this.data.getStats());
      this.map.plotReports(filteredReports);
    } catch (err) {
      console.error('Redraw failed:', err);
      this.ui.toast.show('Failed to apply filters', 'error');
    }
  }

  setupEventListeners() {
    // Filter change events are handled by UIManager
    document.addEventListener('filterChange', (e) => {
      this.data.updateFilters(e.detail);
      this.redrawFiltered();
    });

    // Handle visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopAutoRefresh();
      } else {
        this.startAutoRefresh();
        this.loadData(false);
      }
    });

    // Manual refresh
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        try {
          await this.loadData(true);
          this.ui.toast.show('Dashboard refreshed successfully', 'success');
        } catch (err) {
          console.error('Refresh failed:', err);
          this.ui.toast.show('Failed to refresh dashboard', 'error');
        } finally {
          refreshBtn.disabled = false;
        }
      });
    }
  }

  startAutoRefresh() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(() => this.loadData(false), this.config.refreshInterval);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // Admin actions used by table and map popups
  async updateReportStatus(id, status) {
    try {
      const resp = await fetch(`/api/reports/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status })
      });
      if (!resp.ok) throw new Error('Failed to update status');
      this.ui.toast.show('Status updated', 'success');
      await this.loadData(false);
    } catch (e) {
      console.error(e);
      this.ui.toast.show('Failed to update status', 'error');
    }
  }

  async deleteReport(id) {
    try {
      const confirmed = confirm('Delete this report? This action cannot be undone.');
      if (!confirmed) return;
      const resp = await fetch(`/api/reports/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!resp.ok) throw new Error('Failed to delete');
      this.ui.toast.show('Report deleted', 'success');
      await this.loadData(false);
    } catch (e) {
      console.error(e);
      this.ui.toast.show('Failed to delete report', 'error');
    }
  }

  showImage(url) {
    try {
      const img = document.getElementById('modal-image');
      if (img) {
        img.src = url;
        const modalEl = document.getElementById('imageModal');
        if (modalEl) {
          const modal = new bootstrap.Modal(modalEl);
          modal.show();
        }
      }
    } catch {}
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new Dashboard();
});
