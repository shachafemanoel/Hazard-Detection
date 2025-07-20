import { ApiService } from './modules/ApiService.js';

let allReports = [];
let isAdmin = false;
let map = null;
let markers = [];

async function checkAdminAuth() {
  try {
    const response = await fetch('/api/auth/check', {
      method: 'GET',
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.authenticated && data.user) {
        const userResponse = await fetch('/api/user-info', {
          method: 'GET',
          credentials: 'include'
        });
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          isAdmin = userData.type === 'admin';
        }
        
        if (!isAdmin) {
          window.location.href = '/pages/index.html';
          return false;
        }
        return true;
      }
    }
    
    window.location.href = '/pages/login.html';
    return false;
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/pages/login.html';
    return false;
  }
}

async function loadReports() {
  const recentReportsList = document.getElementById('recent-reports-list');
  recentReportsList.innerHTML = `
    <div class="report-card">
      <div class="report-card-header">
        <span class="report-id">Loading...</span>
        <span class="report-type">...</span>
      </div>
      <div class="report-location">
        <i class="fas fa-spinner fa-spin"></i>
        <span>Loading reports...</span>
      </div>
      <div class="report-time">Please wait...</div>
    </div>
  `;
  
  try {
    allReports = await ApiService.loadReports();
    renderRecentReports(allReports);
    updateStats();
    updateMap();
  } catch (err) {
    console.error('Error loading reports:', err);
    recentReportsList.innerHTML = `
      <div class="report-card">
        <div class="report-card-header">
          <span class="report-id">Error</span>
          <span class="report-type">Failed</span>
        </div>
        <div class="report-location">
          <i class="fas fa-exclamation-triangle"></i>
          <span>Failed to load reports</span>
        </div>
        <div class="report-time">Check connection and try again</div>
      </div>
    `;
  }
}

function renderRecentReports(reports) {
  const recentReportsList = document.getElementById('recent-reports-list');
  
  if (!reports.length) {
    recentReportsList.innerHTML = `
      <div class="report-card">
        <div class="report-card-header">
          <span class="report-id">No Reports</span>
          <span class="report-type">Empty</span>
        </div>
        <div class="report-location">
          <i class="fas fa-inbox"></i>
          <span>No reports found</span>
        </div>
        <div class="report-time">Create your first report</div>
      </div>
    `;
    return;
  }
  
  // Show only the 10 most recent reports
  const recentReports = reports.slice(0, 10);
  
  recentReportsList.innerHTML = recentReports.map(report => `
    <div class="report-card" onclick="viewReportDetails('${report.id}')">
      <div class="report-card-header">
        <span class="report-id">#${report.id}</span>
        <span class="report-type">${report.type || 'Unknown'}</span>
      </div>
      <div class="report-location">
        <i class="fas fa-map-marker-alt"></i>
        <span>${(report.location || 'Unknown location').substring(0, 30)}${report.location && report.location.length > 30 ? '...' : ''}</span>
      </div>
      <div class="report-time">${report.time ? new Date(report.time).toLocaleDateString() : ''}</div>
    </div>
  `).join('');
}

function updateStats() {
  const total = allReports.length;
  const open = allReports.filter(r => (r.status || 'Open').toLowerCase() === 'open').length;
  const progress = allReports.filter(r => (r.status || '').toLowerCase() === 'in progress').length;
  const resolved = allReports.filter(r => (r.status || '').toLowerCase() === 'resolved').length;
  
  document.getElementById('total-reports-count').textContent = total;
  document.getElementById('pending-reports-count').textContent = open;
  document.getElementById('progress-reports-count').textContent = progress;
  document.getElementById('resolved-reports-count').textContent = resolved;
}

function filterReports() {
  const searchTerm = document.getElementById('admin-report-search').value.toLowerCase();
  
  if (!searchTerm) {
    renderRecentReports(allReports);
    updateMap(allReports);
    return;
  }
  
  const filtered = allReports.filter(report => 
    (report.type || '').toLowerCase().includes(searchTerm) ||
    (report.location || '').toLowerCase().includes(searchTerm) ||
    (report.reportedBy || '').toLowerCase().includes(searchTerm) ||
    (report.status || '').toLowerCase().includes(searchTerm)
  );
  
  renderRecentReports(filtered);
  updateMap(filtered);
}

function refreshReports() {
  showToast('Refreshing reports...', 'info');
  loadReports();
}

function exportReports() {
  showToast('Export functionality would be implemented here', 'info');
}

function viewReportDetails(reportId) {
  const report = allReports.find(r => r.id == reportId);
  if (!report) return;
  
  // Focus on the report location on the map if coordinates are available
  if (map && report.coordinates) {
    map.setCenter(report.coordinates);
    map.setZoom(16);
  }
  
  showToast(`Viewing report #${reportId} - ${report.type}`, 'info');
}

// Dark map style for admin dashboard
const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "all",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
];

async function initializeMap() {
  try {
    // Load Google Maps API key
    const response = await fetch('/api/config/maps-key', {
      credentials: 'include'
    });
    const { apiKey } = await response.json();
    
    const defaultCenter = { lat: 31.7683, lng: 35.2137 }; // Israel center
    
    // Initialize map with dark style
    map = new google.maps.Map(document.getElementById('admin-map'), {
      zoom: 8,
      center: defaultCenter,
      styles: darkMapStyle,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true
    });
    
    console.log('Admin map initialized successfully');
    
    // Try to get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          map.setCenter(userLocation);
          map.setZoom(12);
        },
        (error) => {
          console.warn('Geolocation failed:', error.message);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000
        }
      );
    }
    
    updateMap();
  } catch (error) {
    console.error('Failed to initialize map:', error);
    const mapContainer = document.getElementById('admin-map');
    mapContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted);">
        <div style="text-align: center;">
          <i class="fas fa-map-marked-alt" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
          <p>Map unavailable</p>
          <small>Check your connection and API key</small>
        </div>
      </div>
    `;
  }
}

function createMarkerContent(hazardType) {
  const hazardColors = {
    'Pothole': '#FF1493',
    'Crack': '#FF0000', 
    'Alligator Crack': '#FF0000',
    'Block Crack': '#FF7F00',
    'Longitudinal Crack': '#0000FF',
    'Transverse Crack': '#ADFF2F',
    'Construction Joint Crack': '#FFFF00',
    'Debris': '#808080',
    'Manhole': '#8B00FF',
    'Patch Repair': '#FF00FF',
    default: '#808080'
  };
  
  const color = hazardColors[hazardType] || hazardColors.default;
  const div = document.createElement('div');
  div.style.width = '20px';
  div.style.height = '20px';
  div.style.backgroundColor = color;
  div.style.borderRadius = '50%';
  div.style.border = '2px solid #FFFFFF';
  div.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
  return div;
}

function updateMap(reports = allReports) {
  if (!map) return;
  
  // Clear existing markers
  markers.forEach(marker => {
    if (marker.map !== undefined) {
      marker.map = null; // AdvancedMarkerElement
    } else if (marker.setMap) {
      marker.setMap(null); // Regular Marker
    }
  });
  markers = [];
  
  const bounds = new google.maps.LatLngBounds();
  let markersAdded = 0;
  
  // Add markers for reports with coordinates
  reports.forEach(report => {
    let coordinates = null;
    
    // Try different coordinate sources
    if (report.coordinates && report.coordinates.lat && report.coordinates.lng) {
      coordinates = {
        lat: parseFloat(report.coordinates.lat),
        lng: parseFloat(report.coordinates.lng)
      };
    } else {
      // Try to extract from location string
      const coordMatch = (report.location || '').match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      if (coordMatch) {
        coordinates = {
          lat: parseFloat(coordMatch[1]),
          lng: parseFloat(coordMatch[2])
        };
      }
    }
    
    if (coordinates && !isNaN(coordinates.lat) && !isNaN(coordinates.lng)) {
      let marker;
      
      // Use AdvancedMarkerElement if available
      if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
        marker = new google.maps.marker.AdvancedMarkerElement({
          map: map,
          position: coordinates,
          content: createMarkerContent(report.type),
          title: `${report.type} - #${report.id}`
        });
      } else {
        // Fallback to regular marker
        marker = new google.maps.Marker({
          position: coordinates,
          map: map,
          title: `${report.type} - #${report.id}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: getStatusColor(report.status),
            fillOpacity: 0.8,
            strokeColor: '#ffffff',
            strokeWeight: 2
          }
        });
      }
      
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="color: #333; min-width: 200px;">
            <h6><strong>Report #${report.id}</strong></h6>
            <p><strong>Type:</strong> ${report.type || 'Unknown'}</p>
            <p><strong>Status:</strong> <span style="color: ${getStatusColor(report.status)}; font-weight: bold;">${report.status || 'Open'}</span></p>
            <p><strong>Location:</strong> ${report.location || 'Unknown'}</p>
            <p><strong>Reporter:</strong> ${report.reportedBy || 'Unknown'}</p>
            <p><strong>Date:</strong> ${report.time ? new Date(report.time).toLocaleDateString() : 'Unknown'}</p>
            ${report.image ? `<div style="margin: 10px 0;"><img src="${report.image}" style="width: 150px; height: 100px; object-fit: cover; border-radius: 4px; cursor: pointer;" onclick="window.open('${report.image}', '_blank')"></div>` : ''}
            <div style="margin-top: 10px;">
              <button onclick="viewReportDetails('${report.id}')" style="background: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px;">View Details</button>
            </div>
          </div>
        `
      });
      
      // Add click listener
      if (marker.addListener) {
        marker.addListener('click', () => {
          // Close other info windows
          markers.forEach(m => m.infoWindow && m.infoWindow.close());
          infoWindow.open(map, marker);
        });
      } else if (marker.addEventListener) {
        marker.addEventListener('click', () => {
          markers.forEach(m => m.infoWindow && m.infoWindow.close());
          infoWindow.open(map, marker);
        });
      }
      
      marker.infoWindow = infoWindow;
      marker.report = report;
      markers.push(marker);
      bounds.extend(coordinates);
      markersAdded++;
    }
  });
  
  // Fit map to show all markers if any were added
  if (markersAdded > 0) {
    map.fitBounds(bounds);
    
    // Ensure reasonable zoom level
    const listener = google.maps.event.addListener(map, 'idle', function() {
      if (map.getZoom() > 16) {
        map.setZoom(16);
      }
      google.maps.event.removeListener(listener);
    });
  }
  
  console.log(`Updated admin map with ${markersAdded} markers`);
}

function getStatusColor(status) {
  switch ((status || 'open').toLowerCase()) {
    case 'resolved': return '#22c55e';
    case 'in progress': return '#f59e0b';
    case 'open': 
    case 'new':
    default: return '#ef4444';
  }
}

// Load Google Maps API
async function loadGoogleMapsApi() {
  try {
    const response = await fetch('/api/config/maps-key', {
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to load API key');
    
    const { apiKey } = await response.json();
    
    return new Promise((resolve) => {
      window.initGoogleMaps = resolve;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initGoogleMaps&libraries=marker`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    });
  } catch (error) {
    console.error('Error loading Google Maps API:', error);
  }
}

function showMapError(message) {
  const mapContainer = document.getElementById('admin-map');
  if (mapContainer) {
    mapContainer.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted);">
        <div style="text-align: center;">
          <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5; color: #f59e0b;"></i>
          <p>${message}</p>
          <button onclick="loadGoogleMapsAPI()" style="background: var(--primary-accent); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Retry</button>
        </div>
      </div>
    `;
  }
}

let currentEditingReport = null;

function editReport(reportId) {
  const report = allReports.find(r => r.id == reportId);
  if (!report) return;
  
  currentEditingReport = reportId;
  
  document.getElementById('edit-report-id').value = report.id;
  document.getElementById('edit-report-type').value = report.type || '';
  document.getElementById('edit-report-status').value = report.status || 'Open';
  document.getElementById('edit-report-location').value = report.location || '';
  document.getElementById('edit-report-user').value = report.reportedBy || '';
  document.getElementById('edit-report-date').value = report.time ? new Date(report.time).toLocaleString() : '';
  
  new bootstrap.Modal(document.getElementById('editReportModal')).show();
}

function deleteReport(reportId) {
  currentEditingReport = reportId;
  document.getElementById('delete-report-id').textContent = reportId;
  new bootstrap.Modal(document.getElementById('confirmDeleteModal')).show();
}

async function saveReportChanges() {
  if (!currentEditingReport) return;
  
  const updates = {
    type: document.getElementById('edit-report-type').value,
    status: document.getElementById('edit-report-status').value,
    location: document.getElementById('edit-report-location').value
  };
  
  try {
    await ApiService.updateReport(currentEditingReport, updates);
    bootstrap.Modal.getInstance(document.getElementById('editReportModal')).hide();
    showToast('Report updated successfully', 'success');
    loadReports();
  } catch (err) {
    console.error('Error updating report:', err);
    showToast('Failed to update report', 'error');
  }
}

async function confirmDeleteReport() {
  if (!currentEditingReport) return;
  
  try {
    await ApiService.deleteReport(currentEditingReport);
    bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal')).hide();
    showToast('Report deleted successfully', 'success');
    loadReports();
  } catch (err) {
    console.error('Error deleting report:', err);
    showToast('Failed to delete report', 'error');
  }
}

function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toast-container');
  const toastId = 'toast-' + Date.now();
  
  const iconMap = {
    error: 'exclamation-triangle',
    success: 'check-circle',
    info: 'info-circle'
  };
  
  const toastHTML = `
    <div class="toast show" id="${toastId}" role="alert">
      <div class="toast-header">
        <i class="fas fa-${iconMap[type] || 'info-circle'}"></i>
        <strong class="ms-2">Notification</strong>
        <button type="button" class="btn-close ms-auto" onclick="removeToast('${toastId}')">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="toast-body">${message}</div>
    </div>
  `;
  
  toastContainer.insertAdjacentHTML('beforeend', toastHTML);
  
  setTimeout(() => removeToast(toastId), 4000);
}

function removeToast(toastId) {
  const toast = document.getElementById(toastId);
  if (toast) {
    toast.remove();
  }
}

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
  const isAuthorized = await checkAdminAuth();
  
  if (isAuthorized) {
    loadReports();
    bindEvents();
    await loadGoogleMapsApi();
    initializeMap();
  }
});

function bindEvents() {
  document.getElementById('admin-report-search').addEventListener('input', filterReports);
  document.getElementById('refresh-admin-reports').addEventListener('click', refreshReports);
  document.getElementById('export-reports').addEventListener('click', exportReports);
  document.getElementById('save-report-changes').addEventListener('click', saveReportChanges);
  document.getElementById('confirm-delete-report').addEventListener('click', confirmDeleteReport);
}

// Make initializeMap available globally for Google Maps callback
window.initializeMap = initializeMap; 