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

  async updateReport(id, updates) {
    try {
      const resp = await fetch(`/api/reports/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      });
      if (!resp.ok) throw new Error('Failed to update report');
      this.ui.toast.show('Report updated', 'success');
      await this.loadData(false);
    } catch (e) {
      console.error('Update report failed:', e);
      this.ui.toast.show('Failed to update report', 'error');
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

  async openReport(id) {
    try {
      // Fetch full report details
      const resp = await fetch(`/api/reports/${id}`, { credentials: 'include' });
      if (!resp.ok) throw new Error('Failed to fetch report');
      const report = await resp.json();
      this.currentReport = report;

      // Populate modal fields
      const imgEl = document.getElementById('report-modal-image');
      const typeEl = document.getElementById('report-modal-type');
      const statusEl = document.getElementById('report-modal-status');
      const addrEl = document.getElementById('report-modal-address');
      const dateEl = document.getElementById('report-modal-date');
      const descEl = document.getElementById('report-modal-description');
      const modalEl = document.getElementById('reportModal');
      const pinBtn = modalEl?.querySelector('[data-action="toggle-pin"] .pin-text');

      if (imgEl) imgEl.src = report.imageUrl || report.image || '';
      if (typeEl) {
        typeEl.textContent = this.ui.getHazardTypeName(Array.isArray(report.type) ? report.type[0] : report.type);
        typeEl.className = `badge rounded-pill bg-${this.ui.getTypeColor(Array.isArray(report.type) ? report.type[0] : report.type)}`;
      }
      if (statusEl) {
        statusEl.textContent = this.ui.getStatusName(report.status);
        statusEl.className = `badge bg-${this.ui.getStatusColor(report.status)}`;
      }
      if (addrEl) {
        const addr = typeof report.location === 'string' ? report.location : (report.location?.address || '—');
        addrEl.textContent = addr;
      }
      if (dateEl) dateEl.textContent = this.ui.formatDate(report.createdAt || report.time);
      if (descEl) descEl.textContent = report.description || '—';
      if (pinBtn) pinBtn.textContent = report.pinned ? 'Unpin' : 'Pin to Top';

      // Attach actions
      if (modalEl) {
        modalEl.dataset.reportId = report.id;
        modalEl.querySelectorAll('[data-action="set-status"]').forEach(btn => {
          btn.onclick = async () => {
            await this.updateReportStatus(report.id, btn.getAttribute('data-status'));
            // update status badge without closing
            const updated = await (await fetch(`/api/reports/${report.id}`, { credentials: 'include' })).json();
            if (statusEl) {
              statusEl.textContent = this.ui.getStatusName(updated.status);
              statusEl.className = `badge bg-${this.ui.getStatusColor(updated.status)}`;
            }
          };
        });
        const togglePin = modalEl.querySelector('[data-action="toggle-pin"]');
        if (togglePin) togglePin.onclick = async () => {
          await this.updateReport(report.id, { pinned: !report.pinned });
          report.pinned = !report.pinned;
          if (pinBtn) pinBtn.textContent = report.pinned ? 'Unpin' : 'Pin to Top';
        };
        const delBtn = modalEl.querySelector('[data-action="delete-report"]');
        if (delBtn) delBtn.onclick = async () => {
          await this.deleteReport(report.id);
          const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
          modal.hide();
        };
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    } catch (e) {
      console.error('Open report failed:', e);
      this.ui.toast.show('Failed to open report', 'error');
    }
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new Dashboard();
});
