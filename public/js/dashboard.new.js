/**
 * RoadGuardian Dashboard Application
 * Main module for the road hazard reporting dashboard
 * @module RoadGuardian
 */

const RoadGuardian = (function() {
  'use strict';

  // ===============================
  // Configuration
  // ===============================
  const CONFIG = {
    batch: {
      size: 50,
      blockSize: 80,
      viewportBuffer: 10,
      debounceTime: 250
    },
    map: {
      center: [32.0853, 34.7818], // Tel Aviv
      zoom: 13,
      maxZoom: 19,
      minZoom: 6,
      tileLayer: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        backup: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png'
      }
    },
    hazardTypes: {
      pothole: {
        icon: 'fa-circle-exclamation',
        color: '#dc3545',
        label: 'Pothole',
        description: 'Road surface damage'
      },
      speed_bump: {
        icon: 'fa-triangle-exclamation',
        color: '#ffc107',
        label: 'Speed Bump',
        description: 'Traffic calming measure'
      },
      manhole: {
        icon: 'fa-circle-dot',
        color: '#0dcaf0',
        label: 'Manhole',
        description: 'Manhole cover issue'
      },
      road_marking: {
        icon: 'fa-road',
        color: '#6c757d',
        label: 'Road Marking',
        description: 'Faded or missing road markings'
      },
      road_sign: {
        icon: 'fa-sign',
        color: '#198754',
        label: 'Road Sign',
        description: 'Missing or damaged road sign'
      },
      barrier: {
        icon: 'fa-bars',
        color: '#fd7e14',
        label: 'Barrier',
        description: 'Road barrier or obstruction'
      },
      other: {
        icon: 'fa-exclamation-circle',
        color: '#6c757d',
        label: 'Other',
        description: 'Other road hazard'
      }
    }
  };

  // API Routes
  const API_ROUTES = {
    reports: '/api/reports',
    status: '/api/reports/status', 
    stream: '/api/stream'
  };

  // ===============================
  // Module State
  // ===============================
  const state = {
    reportsById: new Map(),
    markersById: new Map(),
    rowsById: new Map(),
    map: null,
    clusterGroup: null,
    eventSource: null,
    loadingReports: false,
    seenReports: new Set(),
    filters: {
      type: [],
      date: null,
      status: 'all',
      search: ''
    },
    selection: { 
      activeId: null,
      lastUpdated: 0 
    },
    viewport: { 
      locked: false, 
      fitDone: false,
      bounds: null,
      zoom: null
    },
    stats: { 
      loadStartTime: 0,
      loadEndTime: 0,
      total: 0,
      new: 0,
      inProgress: 0,
      resolved: 0,
      lastSync: 0
    }
  };

  // Virtual scroll helper
  let virtualScroll = null;

  // Constants
  const ROW_HEIGHT = 60;
  const VIEWPORT_BUFFER = 5;

  // ===============================
  // Private Functions
  // ===============================

  // Virtual Scroll Management
  function initVirtualScroll() {
    const container = document.querySelector('.virtual-table');
    if (!container) return;
    
    virtualScroll = {
      container,
      content: document.getElementById('virtual-table-content'),
      totalRows: 0,
      visibleRows: 0,
      startIndex: 0,
      endIndex: 0,
      
      init() {
        this.visibleRows = Math.ceil(container.clientHeight / ROW_HEIGHT) + VIEWPORT_BUFFER;
        container.addEventListener('scroll', this.onScroll.bind(this));
        window.addEventListener('resize', this.onResize.bind(this));
      },
      
      onScroll: debounce(function() {
        this.render();
      }, 100),
      
      onResize: debounce(function() {
        this.visibleRows = Math.ceil(this.container.clientHeight / ROW_HEIGHT) + VIEWPORT_BUFFER;
        this.render();
      }, 100),
      
      render() {
        const scrollTop = this.container.scrollTop;
        this.startIndex = Math.floor(scrollTop / ROW_HEIGHT);
        this.endIndex = Math.min(this.startIndex + this.visibleRows, this.totalRows);
        
        this.content.style.height = `${this.totalRows * ROW_HEIGHT}px`;
        this.content.style.transform = `translateY(${this.startIndex * ROW_HEIGHT}px)`;
        
        this.renderVisibleRows();
      },
      
      renderVisibleRows() {
        const fragment = document.createDocumentFragment();
        const reports = Array.from(state.reportsById.values());
        
        for (let i = this.startIndex; i < this.endIndex; i++) {
          const report = reports[i];
          if (report) {
            const row = createReportRow(report);
            fragment.appendChild(row);
            state.rowsById.set(report.id, row);
          }
        }
        
        this.content.innerHTML = '';
        this.content.appendChild(fragment);
      },
      
      updateTotal(total) {
        this.totalRows = total;
        this.render();
      }
    };
    
    virtualScroll.init();
  }

  // Event Listeners
  function initEventListeners() {
    // Filters
    document.getElementById('status-filter')?.addEventListener('change', onFiltersChanged);
    document.getElementById('type-filter')?.addEventListener('change', onFiltersChanged);
    document.getElementById('date-filter')?.addEventListener('change', onFiltersChanged);
    
    // Refresh button
    document.getElementById('refresh-btn')?.addEventListener('click', () => loadInitialData(true));
    
    // Image modal
    const imageModal = document.getElementById('imageModal');
    if (imageModal) {
      imageModal.addEventListener('show.bs.modal', (e) => {
        const button = e.relatedTarget;
        const imageUrl = button.dataset.imageUrl;
        document.getElementById('modal-image').src = imageUrl;
      });
    }
  }

  // Map Initialization
  async function initMap() {
    try {
      // Create map instance
      state.map = L.map('map', {
        center: CONFIG.map.center,
        zoom: CONFIG.map.zoom,
        maxZoom: CONFIG.map.maxZoom,
        minZoom: CONFIG.map.minZoom
      });

      // Add tile layer with backup
      const mainTileLayer = L.tileLayer(CONFIG.map.tileLayer.url, {
        attribution: CONFIG.map.tileLayer.attribution,
        maxZoom: CONFIG.map.maxZoom
      });

      const backupTileLayer = L.tileLayer(CONFIG.map.tileLayer.backup, {
        attribution: CONFIG.map.tileLayer.attribution,
        maxZoom: CONFIG.map.maxZoom
      });

      // Try to add the main tile layer, fall back to backup if it fails
      mainTileLayer.on('tileerror', function(e) {
        console.log('Main tile layer failed, switching to backup');
        state.map.removeLayer(mainTileLayer);
        backupTileLayer.addTo(state.map);
      });

      mainTileLayer.addTo(state.map);

      // Create marker cluster group
      state.clusterGroup = L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 50
      }).addTo(state.map);

      // Enable responsive bounds updates
      state.map.on('moveend', () => {
        if (!state.viewport.locked) {
          updateVisibleReports();
        }
      });

      console.log('Map initialized successfully');
    } catch (error) {
      console.error('Failed to initialize map:', error);
      throw error;
    }
  }

  // SSE Initialization
  function initSSE() {
    if (state.eventSource) {
      state.eventSource.close();
    }
    
    try {
      state.eventSource = new EventSource(API_ROUTES.stream);
      const pendingReports = new Set();
      let updateTimeout = null;
      let processingReports = false;
      
      state.eventSource.addEventListener('report:new', async (e) => {
        const report = JSON.parse(e.data);
        pendingReports.add(report);
        
        if (!updateTimeout && !processingReports) {
          updateTimeout = setTimeout(async () => {
            processingReports = true;
            const reportsToProcess = Array.from(pendingReports);
            pendingReports.clear();
            updateTimeout = null;
            
            try {
              await processPendingReports(reportsToProcess);
            } catch (error) {
              console.error('Error processing reports:', error);
              notify('Error processing new reports', 'error');
            } finally {
              processingReports = false;
              
              if (pendingReports.size > 0) {
                updateTimeout = setTimeout(() => {
                  processPendingReports(Array.from(pendingReports));
                  pendingReports.clear();
                  updateTimeout = null;
                }, CONFIG.batch.debounceTime);
              }
            }
          }, CONFIG.batch.debounceTime);
        }
      });
      
      state.eventSource.onerror = (error) => {
        console.error('SSE connection failed:', error);
        state.eventSource.close();
        notify('Lost connection to server. Retrying in 5s...', 'warning');
        setTimeout(initSSE, 5000);
      };

      state.eventSource.onopen = () => {
        console.log('SSE connection established');
        notify('Connected to real-time updates', 'success');
      };

      console.log('SSE initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SSE:', error);
      notify('Failed to connect to real-time updates', 'error');
    }
  }

  // Process new reports from SSE
  async function processPendingReports(reports) {
    const newMarkers = [];
    const geocodingPromises = [];
    
    for (const report of reports) {
      if (!state.reportsById.has(report.id)) {
        state.reportsById.set(report.id, report);
        if (!report.lat || !report.lng) {
          geocodingPromises.push(getReportCoordinates(report));
        }
      }
    }

    if (geocodingPromises.length > 0) {
      await Promise.allSettled(geocodingPromises);
    }

    requestAnimationFrame(() => {
      for (const report of reports) {
        if (!state.markersById.has(report.id) && report.lat && report.lng) {
          const marker = createReportMarker(report);
          state.markersById.set(report.id, marker);
          newMarkers.push(marker);
        }
      }
      
      if (newMarkers.length > 0) {
        state.clusterGroup.addLayers(newMarkers);
      }
      
      virtualScroll.updateTotal(state.reportsById.size);
      updateStats();
      
      if (reports.length > 0) {
        notify(`${reports.length} new reports received`, 'info');
      }
    });
  }

  // Create map marker
  function createReportMarker(report) {
    if (!report.lat || !report.lng) {
      console.warn('Attempted to create marker without coordinates:', report.id);
      return null;
    }

    const isNewReport = !state.seenReports.has(report.id);
    const reportType = report.type.toLowerCase();
    const statusClass = report.status.toLowerCase();

    const markerHtml = `
      <div class="marker-content ${isNewReport ? 'new-marker' : ''} ${statusClass}-status">
        <div class="marker-icon ${reportType}">
          <i class="fas ${getHazardIcon(reportType)}"></i>
          ${isNewReport ? '<span class="pulse-ring"></span>' : ''}
        </div>
        ${report.severity ? `<span class="severity-indicator ${report.severity}"></span>` : ''}
      </div>
    `;

    const markerIcon = L.divIcon({
      html: markerHtml,
      className: `custom-marker ${reportType}-marker`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      tooltipAnchor: [0, -40]
    });

    const marker = L.marker([report.lat, report.lng], { 
      icon: markerIcon,
      riseOnHover: true,
      title: report.title || report.location
    });
    
    const popupContent = `
      <div class="report-popup ${report.type.toLowerCase()}-popup">
        <div class="popup-header">
          <h6 class="report-type ${report.type.toLowerCase()}">
            <i class="fas ${getHazardIcon(report.type)} me-2"></i>
            ${report.type}
          </h6>
          <span class="badge status-${report.status.toLowerCase()}">${report.status}</span>
        </div>
        
        <div class="popup-body">
          <div class="location-info">
            <p class="report-location">
              <i class="fas fa-map-marker-alt me-2"></i>
              ${report.displayName || report.location}
            </p>
            <p class="report-time">
              <i class="far fa-clock me-2"></i>
              ${formatDate(report.time)}
            </p>
          </div>
          
          ${report.description ? `
            <div class="report-description">
              <p>${report.description}</p>
            </div>
          ` : ''}
          
          ${report.image ? `
            <div class="report-media">
              <img src="${report.image}" 
                   alt="Report image" 
                   class="report-image"
                   loading="lazy"
                   onclick="openImageModal('${report.image}')" />
            </div>
          ` : ''}
          
          ${report.severity ? `
            <div class="severity-indicator ${report.severity.toLowerCase()}">
              <i class="fas fa-exclamation-triangle me-2"></i>
              ${report.severity} severity
            </div>
          ` : ''}
        </div>
        
        <div class="popup-footer">
          <button onclick="focusReport('${report.id}')" class="btn btn-sm btn-primary">
            <i class="fas fa-info-circle me-1"></i> Details
          </button>
          ${report.status === 'new' ? `
            <button onclick="updateReportStatus('${report.id}', 'in-progress')" class="btn btn-sm btn-warning">
              <i class="fas fa-tasks me-1"></i> Start
            </button>
          ` : ''}
        </div>
      </div>
    `;
    
    marker.bindPopup(popupContent, {
      inlineSize: '350px',
      className: `custom-popup ${report.type.toLowerCase()}-popup`,
      autoPan: true,
      closeButton: true,
      closeOnClick: false,
      autoClose: false
    });
    
    marker.on('click', () => {
      if (state.selection.activeId !== report.id) {
        state.selection.activeId = report.id;
        focusReport(report.id);
      }
    });
    
    marker.on('popupopen', () => {
      if (isNewReport) {
        state.seenReports.add(report.id);
        const element = marker.getElement();
        if (element) {
          element.classList.remove('new-marker');
        }
      }
    });

    return marker;
  }

  // Create report row
  function createReportRow(report) {
    const row = document.createElement('div');
    row.className = `report-row ${report.status.toLowerCase()}`;
    row.dataset.id = report.id;
    row.innerHTML = `
      <div class="report-icon ${report.type.toLowerCase()}">
        <i class="fas ${getHazardIcon(report.type)}"></i>
      </div>
      <div class="report-info">
        <div class="report-location">${report.displayName || report.location}</div>
        <div class="report-meta">
          ${report.severity ? `
            <span class="severity-badge ${report.severity.toLowerCase()}">
              ${report.severity}
            </span>
          ` : ''}
          <span class="report-time">${formatDate(report.time)}</span>
        </div>
      </div>
      <div class="report-status">
        <span class="badge status-${report.status.toLowerCase()}">${report.status}</span>
      </div>
    `;

    row.addEventListener('click', () => {
      focusReport(report.id);
    });

    return row;
  }

  // Update visible reports
  function updateVisibleReports() {
    const bounds = state.map.getBounds();
    const visibleReports = Array.from(state.reportsById.values()).filter(report => {
      return bounds.contains([report.lat, report.lng]);
    });

    virtualScroll.updateTotal(visibleReports.length);
    updateStats();
  }

  // Update stats
  function updateStats() {
    const reports = Array.from(state.reportsById.values());
    state.stats.total = reports.length;
    state.stats.new = reports.filter(r => r.status === 'new').length;
    state.stats.inProgress = reports.filter(r => r.status === 'in-progress').length;
    state.stats.resolved = reports.filter(r => r.status === 'resolved').length;
    state.stats.lastSync = Date.now();

    const statsEl = document.getElementById('stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat">
          <div class="stat-value">${state.stats.total}</div>
          <div class="stat-label">Total</div>
        </div>
        <div class="stat">
          <div class="stat-value new">${state.stats.new}</div>
          <div class="stat-label">New</div>
        </div>
        <div class="stat">
          <div class="stat-value in-progress">${state.stats.inProgress}</div>
          <div class="stat-label">In Progress</div>
        </div>
        <div class="stat">
          <div class="stat-value resolved">${state.stats.resolved}</div>
          <div class="stat-label">Resolved</div>
        </div>
      `;
    }
  }

  // Utility Functions
  function getHazardInfo(type) {
    const hazardType = type?.toLowerCase() || 'other';
    return CONFIG.hazardTypes[hazardType] || CONFIG.hazardTypes.other;
  }

  function getHazardIcon(type) {
    return getHazardInfo(type).icon;
  }

  function notify(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} show`;
    toast.innerHTML = `
      <div class="toast-header">
        <i class="fas fa-info-circle me-2"></i>
        <strong class="me-auto">${type.toUpperCase()}</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
      </div>
      <div class="toast-body">${message}</div>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    document.body.appendChild(container);
    return container;
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      const now = new Date();
      const diff = now - date;
      
      if (diff < 24 * 60 * 60 * 1000) {
        const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });
        const hours = Math.floor(diff / (60 * 60 * 1000));
        
        if (hours === 0) {
          const minutes = Math.floor(diff / (60 * 1000));
          return rtf.format(-minutes, 'minute');
        }
        
        return rtf.format(-hours, 'hour');
      }
      
      return date.toLocaleString('he-IL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ===============================
  // Public API
  // ===============================

  // Initialize dashboard
  async function init() {
    try {
      await Promise.all([
        initMap(),
        initEventListeners(),
        initSSE()
      ]);
      initVirtualScroll();
      console.log('Dashboard initialized successfully');
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
      notify('Failed to initialize dashboard', 'error');
      throw error;
    }
  }

  // Get reports from server
  async function getReports() {
    if (state.loadingReports) return;
    
    try {
      state.loadingReports = true;
      state.stats.loadStartTime = Date.now();
      
      const response = await fetch(API_ROUTES.reports);
      if (!response.ok) throw new Error(`Failed to fetch reports: ${response.statusText}`);
      
      const reports = await response.json();
      await processPendingReports(reports);
      
    } catch (error) {
      console.error('Failed to get reports:', error);
      notify('Failed to load reports', 'error');
      throw error;
    } finally {
      state.loadingReports = false;
      state.stats.loadEndTime = Date.now();
    }
  }

  // Update report status
  async function updateReportStatus(reportId, status) {
    try {
      const response = await fetch(`${API_ROUTES.status}/${reportId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) throw new Error(`Failed to update status: ${response.statusText}`);
      
      const report = state.reportsById.get(reportId);
      if (report) {
        report.status = status;
        const marker = state.markersById.get(reportId);
        if (marker) {
          marker.getElement().querySelector('.marker-content')
            .className = `marker-content ${status.toLowerCase()}-status`;
        }
      }

      notify(`Report status updated to ${status}`, 'success');
    } catch (error) {
      console.error('Failed to update report status:', error);
      notify('Failed to update report status', 'error');
      throw error;
    }
  }

  // Apply filters
  function applyFilters() {
    try {
      const activeReports = Array.from(state.reportsById.values()).filter(report => {
        if (state.filters.type.length && !state.filters.type.includes(report.type)) return false;
        if (state.filters.status !== 'all' && report.status !== state.filters.status) return false;
        if (state.filters.date) {
          const reportDate = new Date(report.time);
          if (reportDate < state.filters.date) return false;
        }
        if (state.filters.search) {
          const searchLower = state.filters.search.toLowerCase();
          return report.location.toLowerCase().includes(searchLower) ||
                 report.description?.toLowerCase().includes(searchLower);
        }
        return true;
      });

      state.clusterGroup.clearLayers();
      
      const markers = activeReports
        .map(report => state.markersById.get(report.id))
        .filter(marker => marker);
      
      if (markers.length) {
        state.clusterGroup.addLayers(markers);
      }

      virtualScroll.updateTotal(activeReports.length);
      updateStats();
      
    } catch (error) {
      console.error('Failed to apply filters:', error);
      notify('Failed to apply filters', 'error');
    }
  }

  // Load next batch
  async function loadNextBatch() {
    if (state.loadingReports) return;
    
    try {
      state.loadingReports = true;
      const lastReport = Array.from(state.reportsById.values()).pop();
      
      const response = await fetch(`${API_ROUTES.reports}?after=${lastReport?.time || ''}&limit=${CONFIG.batch.size}`);
      if (!response.ok) throw new Error(`Failed to fetch next batch: ${response.statusText}`);
      
      const reports = await response.json();
      if (reports.length) {
        await processPendingReports(reports);
        notify(`Loaded ${reports.length} more reports`, 'info');
      }
      
    } catch (error) {
      console.error('Failed to load next batch:', error);
      notify('Failed to load more reports', 'error');
      throw error;
    } finally {
      state.loadingReports = false;
    }
  }

  // Focus report in view
  function focusReport(reportId) {
    const report = state.reportsById.get(reportId);
    if (!report) return;

    state.selection.activeId = reportId;
    state.selection.lastUpdated = Date.now();

    const marker = state.markersById.get(reportId);
    if (marker) {
      state.map.setView([report.lat, report.lng], CONFIG.map.maxZoom - 2);
      marker.openPopup();
    }

    const row = state.rowsById.get(reportId);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('highlight');
      setTimeout(() => row.classList.remove('highlight'), 2000);
    }
  }

  // Public API
  const publicAPI = {
    init,
    getReports,
    updateReportStatus,
    applyFilters,
    loadNextBatch,
    focusReport
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init().catch(error => {
      console.error('Failed to initialize on load:', error);
    });
  }

  return publicAPI;
})();

// Export for browser globals
window.RoadGuardian = RoadGuardian;
