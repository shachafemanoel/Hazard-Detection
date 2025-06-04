let map;
let markers = [];
let heatmapLayer = null; // NEW: Global heatmap layer
let reportDetailsBootstrapModal = null; // For Bootstrap modal instance

const hazardTypes = [
    'Alligator Crack', 'Block Crack', 'Construction Joint Crack', 'Crosswalk Blur',
    'Lane Blur', 'Longitudinal Crack', 'Manhole', 'Patch Repair', 'Pothole',
    'Transverse Crack', 'Wheel Mark Crack'
];

// Google Maps Dark Style
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
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
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
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
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
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
    {
        featureType: "transit.station",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
    },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
    {
        featureType: "water",
        elementType: "labels.text.stroke",
        stylers: [{ color: "#17263c" }],
    },
    // New style: hide icons for a clean, modern look
    { featureType: "all", elementType: "labels.icon", stylers: [{ visibility: "off" }] }
];

// Hazard type to marker color mapping
const hazardMarkerColors = {
    'Alligator Crack': '#FF0000', // Red
    'Block Crack': '#FF7F00', // Orange
    'Construction Joint Crack': '#FFFF00', // Yellow
    'Crosswalk Blur': '#00FF00', // Lime
    'Lane Blur': '#00FFFF', // Aqua
    'Longitudinal Crack': '#0000FF', // Blue
    'Manhole': '#8B00FF', // Violet
    'Patch Repair': '#FF00FF', // Fuchsia
    'Pothole': '#FF1493', // DeepPink
    'Transverse Crack': '#ADFF2F', // GreenYellow
    'Wheel Mark Crack': '#7FFF00', // Chartreuse
    'default': '#808080' // Gray for unknown types
};

function getMarkerIcon(hazardType) {
    const color = hazardMarkerColors[hazardType] || hazardMarkerColors['default'];
    return {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 0.9,
        strokeColor: '#FFFFFF', // White border for better visibility
        strokeWeight: 2,
        scale: 10 // Reduced scale for smaller marker
    };
}

// NEW: Helper to create marker content for AdvancedMarkerElement
function getMarkerContent(hazardType) {
	const color = hazardMarkerColors[hazardType] || hazardMarkerColors['default'];
	const div = document.createElement('div');
	div.style.width = '20px';      // Reduced width
	div.style.height = '20px';     // Reduced height
	div.style.backgroundColor = color;
	div.style.borderRadius = '50%';
	div.style.border = '2px solid #FFFFFF';
	return div;
}

// Global sort state
let currentSort = { field: 'time', order: 'desc' };

// Always use dark mode for the map
function initMap() {
    const defaultCenter = { lat: 31.7683, lng: 35.2137 };
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 8,
        center: defaultCenter,
        styles: darkMapStyle,
    });

    // Add a marker for the default center as a fallback
    new google.maps.Marker({
        position: defaultCenter,
        map: map,
        title: "Israel",
    });

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLatLng = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                map.setCenter(userLatLng);
                map.setZoom(12);
                new google.maps.Marker({
                    position: userLatLng,
                    map: map,
                    title: "Your Location",
                    icon: {
                        url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path fill="#4285F4" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>`),
                        scaledSize: new google.maps.Size(40, 40)
                    }
                });
                loadReports();
            },
            (error) => {
                console.error("Error using geolocation:", error);
                loadReports();
            }
        );
    } else {
        loadReports();
    }

    // NEW: Create the legend but do not add it to map controls.
    window.mapLegend = addMapLegend();
    window.mapLegend.style.display = "none";
    // Position the legend as an overlay on the map container.
    window.mapLegend.style.position = "absolute";
    window.mapLegend.style.bottom = "20px";
    window.mapLegend.style.left = "20px";
    document.getElementById("map").appendChild(window.mapLegend);
}

// NEW: Function to toggle the display of the map legend.
window.toggleLegend = function() {
    if (!window.mapLegend) return;
    if (window.mapLegend.style.display === "none") {
        window.mapLegend.style.display = "block";
    } else {
        window.mapLegend.style.display = "none";
    }
};

// NEW: If geolocation is available, recenter map and show user's location
//     if (navigator.geolocation) {
//         navigator.geolocation.getCurrentPosition(
//             (position) => {
//                 const userLatLng = {
//                     lat: position.coords.latitude,
//                     lng: position.coords.longitude
//                 };
//                 // Center and zoom the map on the user's location
//                 map.setCenter(userLatLng);
//                 map.setZoom(12);
//                 // NEW: Place a distinct marker for the user's location using a custom SVG icon
//                 new google.maps.Marker({
//                     position: userLatLng,
//                     map: map,
//                     title: "Your Location",
//                     icon: {
//                         url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path fill="#4285F4" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>`),
//                         scaledSize: new google.maps.Size(40, 40)
//                     }
//                 });
//                 // Load reports after recentering the map
//                 loadReports();
//             },
//             (error) => {
//                 console.error("Error using geolocation:", error);
//                 loadReports();
//             }
//         );
//     } else {
//         loadReports();
//     }

//     // Add the legend to the map
//     const legend = addMapLegend();
//     map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(legend);

//     // נטען דיווחים רק אחרי שהמפה מוכנה
//     loadReports();
// }

// Make initMap available globally for Google Maps API
window.initMap = initMap;

function clearMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];
}

// יצירת תיבות סימון לסוגי מפגעים
function generateHazardCheckboxes() {
    const container = document.getElementById('hazard-types-container');
    hazardTypes.forEach(hazard => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.innerHTML = `
            <input type="checkbox" id="hazard-${hazard.toLowerCase().replace(/ /g, '-')}" value="${hazard}">
            <label for="hazard-${hazard.toLowerCase().replace(/ /g, '-')}" class="hazard-label">${hazard}</label>
        `;
        container.appendChild(checkboxDiv);
    });
}

// פותח את מודל התמונה
function openModal(imageUrl) {
    const modal = document.getElementById("image-modal");
    const modalImage = document.getElementById("modal-image");
    if (modal && modalImage) {
        modal.style.display = "flex"; // CSS for .image-modal-overlay handles alignment
        modalImage.src = imageUrl;
    }
}

function closeModal() {
    const modal = document.getElementById("image-modal");
    if (modal) {
        modal.style.display = "none";
    }
}

window.addEventListener("click", (event) => {
    const modal = document.getElementById("image-modal");
    if (modal && event.target === modal) { // Ensure modal exists before checking target
        closeModal();
    }
});

// ממיר כתובת לקואורדינטות ומוסיף סמן
async function geocodeAddress(address, report) {
    if (!address) return;
    
    try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=AIzaSyA9qkNEaiu9vpTB0bzqhw_Ei55Mt2UqN3A`);
        const data = await response.json();
        
        if (data.status === "OK" && data.results[0]) {
            const location = data.results[0].geometry.location;
            let marker;
            // NEW: Use AdvancedMarkerElement if available, otherwise fallback to standard Marker
            if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
                marker = new google.maps.marker.AdvancedMarkerElement({
                    map: map,
                    position: location,
                    title: `${report.type} - ${address}`,
                    content: getMarkerContent(report.type)
                });
            } else {
                marker = new google.maps.Marker({
                    map: map,
                    position: location,
                    title: `${report.type} - ${address}`,
                    icon: getMarkerIcon(report.type)
                });
            }
            marker.reportId = report.id;
            
            // Register first "click" callback to open infowindow and pan/zoom map
            registerMarkerClick(marker, () => {
                markers.forEach(m => m.infoWindow?.close());
                const infowindow = new google.maps.InfoWindow({
                    content: `
                    <div class="info-window">
                        <h5>${report.type}</h5>
                        <p><strong>Location:</strong> ${address}</p>
                        <p><strong>Status:</strong> <span class="badge ${report.status === 'Resolved' ? 'bg-success' : 'bg-danger'}">${report.status}</span></p>
                        <p><strong>Reported by:</strong> ${report.reportedBy}</p>
                        <p><strong>Time:</strong> ${new Date(report.time).toLocaleString()}</p>
                        ${report.image ? `<img src="${report.image}" alt="Hazard" style="width:200px;height:150px;object-fit:cover;margin:10px 0;">` : ''}
                        <div class="mt-2">
                            <button class="btn btn-sm btn-primary me-2" onclick="showReportDetails(${JSON.stringify(report)})">Details</button>
                            <button class="btn btn-sm btn-warning" onclick="openEditReportModal(${JSON.stringify(report)})">Edit</button>
                        </div>
                    </div>`
                });
                marker.infoWindow = infowindow;
                infowindow.open(map, marker);
                map.panTo(location);
                if (map.getZoom() < 14 && map.animateToZoom) {
                    map.animateToZoom(14);
                }
            });
            
            // Register a second "click" callback to sync the table row highlighting
            registerMarkerClick(marker, () => {
                const rows = document.querySelectorAll('#reports-table tbody tr');
                rows.forEach(row => row.classList.remove('table-active'));
                const targetRow = document.querySelector(`#reports-table tbody tr[data-report-id="${report.id}"]`);
                if (targetRow) {
                    targetRow.classList.add('table-active');
                    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
            return marker;
        } else {
            console.error("Geocoding failed:", data.status, data.error_message);
            return null;
        }
    } catch (error) {
        console.error("Geocoding error:", error);
        return null;
    }
}

// NEW: Helper function to register click events for both marker types
function registerMarkerClick(marker, callback) {
    if (marker.addEventListener) {
        marker.addEventListener("click", callback);
    } else if (marker.addListener) {
        marker.addListener("click", callback);
    }
}

// NEW: Function to delete an image key from Redis if its link is not available
async function deleteImageFromRedis(url) {
    try {
        await fetch('/api/redis/deleteImage', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
    } catch (error) {
        console.error(`Failed to delete image ${url} from Redis:`, error);
    }
}

// Modify isValidImage to call deleteImageFromRedis when validation fails
async function isValidImage(url) {
    if (!url) {
        return false;
    }
    try {
        const response = await fetch(url, { method: 'HEAD' });
        const valid = response.ok && response.headers.get('Content-Type')?.startsWith('image/');
        if (!valid) {
            deleteImageFromRedis(url);
        }
        return valid;
    } catch (error) {
        deleteImageFromRedis(url);
        console.warn(`Could not validate image ${url}:`, error);
        return false;
    }
}

// NEW: Function to fetch report by ID and open the Edit Report modal
async function editMarkerReport(reportId) {
    try {
        const response = await fetch(`/api/reports/${reportId}`, {
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch report with id ${reportId}`);
        }
        const report = await response.json();
        openEditReportModal(report);
    } catch (err) {
        console.error("Error fetching report for edit:", err);
        alert("Failed to load report for editing.");
    }
}

// Add a global function to open the report details modal from a marker
function openReportModal() {
    if (currentMarker && currentMarker.report) {
        showReportDetails(currentMarker.report);
    }
}

// Helper to create a report block element
function createReportBlock(report) {
    const block = document.createElement('div');
    block.className = 'event-log-block d-flex gap-3 align-items-start p-3 rounded shadow-sm bg-white position-relative';
    block.innerHTML = `
        <img src="${report.image}" alt="Hazard image" class="event-block-image" style="width: 80px; height: 80px; object-fit: cover; border-radius: 12px; box-shadow: 0 2px 8px #23294622; border: 2px solid #e9f0fa; background: #f4f7fb;">
        <div class="event-block-details">
            <div class="event-block-title">
                <i class="fas fa-exclamation-triangle"></i> ${report.type}
            </div>
            <div class="event-block-meta">
                <span><i class="fas fa-map-marker-alt"></i> ${report.location}</span>
                <span><i class="fas fa-calendar-alt"></i> ${new Date(report.time).toLocaleString()}</span>
                <span><i class="fas fa-user"></i> ${report.reportedBy}</span>
            </div>
            <div class="event-block-status mt-1">
                <span class="status-badge badge ${report.status === 'Resolved' ? 'bg-success' : report.status === 'Open' ? 'bg-danger' : 'bg-warning text-dark'}">${report.status}</span>
            </div>
            <div class="event-block-actions mt-2 d-flex gap-2 flex-wrap">
                <button class="btn btn-outline-primary btn-sm view-details-btn"><i class="fas fa-info-circle"></i> Details</button>
                <button class="btn btn-outline-secondary btn-sm view-image-btn"><i class="fas fa-image"></i> Image</button>
                <button class="btn btn-outline-warning btn-sm edit-report-btn"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn btn-outline-danger btn-sm delete-report-btn"><i class="fas fa-trash"></i> Delete</button>
                <button class="btn btn-outline-success btn-sm status-toggle-btn">${report.status === 'Resolved' ? 'Mark Open' : 'Mark Resolved'}</button>
            </div>
        </div>
    `;
    // Image modal
    block.querySelector('.view-image-btn').addEventListener('click', () => openModal(report.image));
    // Details modal
    block.querySelector('.view-details-btn').addEventListener('click', () => showReportDetails(report));
    // Admin actions
    block.querySelector('.edit-report-btn').addEventListener('click', () => openEditReportModal(report));
    block.querySelector('.delete-report-btn').addEventListener('click', () => deleteReport(report.id));
    block.querySelector('.status-toggle-btn').addEventListener('click', () => toggleReportStatus(report));
    return block;
}

// Utility for sorting
function sortReports(reports, sortField, sortOrder) {
    return reports.slice().sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (sortField === 'time') {
            valA = new Date(valA);
            valB = new Date(valB);
        }
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });
}

// טוען דיווחים מהשרת ומכניס לטבלה ולמפה
async function loadReports(filters = {}) {
    try {
        const queryString = Object.entries(filters)
            .filter(([_, value]) => value)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');

        const response = await fetch(`/api/reports${queryString ? `?${queryString}` : ''}`, {
            method: 'GET',
            credentials: 'include',
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Fetch error details:', {
                status: response.status,
                message: errorText,
            });
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        let reports = await response.json();
        console.log('Reports received:', reports.length);

        // סינון תמונות שגויות
        if (reports && reports.length) {
            const validationResults = await Promise.all(
                reports.map(async (r) => {
                    if (r.image) return await isValidImage(r.image) ? r : null;
                    return null;
                })
            );
            reports = validationResults.filter(Boolean);
        }

        lastReports = reports;
        clearMarkers();
        const bounds = new google.maps.LatLngBounds();

        const markerPromises = reports.map(async report => {
            const marker = await geocodeAddress(report.location, report);
            if (marker) bounds.extend(marker.getPosition());
            return marker;
        });

        const newMarkers = (await Promise.all(markerPromises)).filter(Boolean);
        if (newMarkers.length > 0) {
            map.fitBounds(bounds);
            const listener = google.maps.event.addListener(map, 'idle', function () {
                if (map.getZoom() > 16) map.setZoom(16);
                google.maps.event.removeListener(listener);
            });
        }

        markers = newMarkers;
        updateHeatmap();
        if (window.filterAndRenderReports) {
            window.filterAndRenderReports();
        }
        updateDashboardInfo(reports);
        return reports;
    } catch (error) {
        console.error('Error loading reports:', error);
        showToast('Failed to load reports', 'error');
        return [];
    }
}


// Update general info blocks
function updateDashboardInfo(reports) {
    // New Reports: total count
    const newReports = reports.length;
    // Open Hazards: status 'Open' (case-insensitive)
    const openHazards = reports.filter(r => (r.status || '').toLowerCase() === 'open').length;
    // Resolved This Month: status 'Resolved' and time in current month
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const resolvedThisMonth = reports.filter(r => {
        if ((r.status || '').toLowerCase() !== 'resolved') return false;
        const t = new Date(r.time);
        return t.getMonth() === thisMonth && t.getFullYear() === thisYear;
    }).length;
    // Active Users: unique reportedBy
    const users = new Set(reports.map(r => r.reportedBy).filter(Boolean));
    const activeUsers = users.size;
    // Update DOM
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setVal('new-reports-count', newReports);
    setVal('open-hazards-count', openHazards);
    setVal('resolved-this-month', resolvedThisMonth);
    setVal('active-users', activeUsers);
}

// --- GLOBAL STATE ---
let lastReports = [];
let currentMarker = null;

// --- DOM ELEMENTS HOOKUP FOR NEW LAYOUT ---
const dom = {
  sidebar: document.querySelector('.dashboard-sidebar'),
  mainContent: document.querySelector('.dashboard-main'),
  dashboardContainer: document.body,
  topButtons: document.getElementById('refresh-info-btn'),
  reportsDiv: document.getElementById('reports-widget'),
  sortSelect: document.getElementById('report-sort-select'),
  toggleMapBtn: document.getElementById('map-maximize-btn'),
  toggleReportsBtn: document.getElementById('reports-maximize-btn'),
  imageModal: document.getElementById('image-modal'),
  viewToggleContainer: document.getElementById('view-toggle-container'),
};

// --- BUTTON LOGIC CONNECTIONS ---
document.addEventListener("DOMContentLoaded", () => {
  // Maximize/Minimize Map
  if (dom.toggleMapBtn && dom.viewToggleContainer) {
    dom.toggleMapBtn.addEventListener('click', () => {
      if (dom.viewToggleContainer.classList.contains('map-maximized')) {
        dom.viewToggleContainer.className = 'normal-view';
        dom.toggleMapBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
        if (dom.toggleReportsBtn) dom.toggleReportsBtn.style.display = '';
        if (dom.reportsDiv) dom.reportsDiv.style.display = '';
        if (document.getElementById('map')) document.getElementById('map').style.display = '';
      } else {
        dom.viewToggleContainer.className = 'map-maximized';
        dom.toggleMapBtn.innerHTML = '<i class="fas fa-compress-alt"></i>';
        if (dom.toggleReportsBtn) dom.toggleReportsBtn.style.display = 'none';
        if (dom.reportsDiv) dom.reportsDiv.style.display = 'none';
        if (document.getElementById('map')) document.getElementById('map').style.display = '';
      }
      if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
        google.maps.event.trigger(map, 'resize');
      }
    });
  }

  // Maximize/Minimize Reports
  if (dom.toggleReportsBtn && dom.viewToggleContainer) {
    dom.toggleReportsBtn.addEventListener('click', () => {
      if (dom.viewToggleContainer.classList.contains('reports-maximized')) {
        dom.viewToggleContainer.className = 'normal-view';
        dom.toggleReportsBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
        if (dom.toggleMapBtn) dom.toggleMapBtn.style.display = '';
        if (dom.reportsDiv) dom.reportsDiv.style.display = '';
        if (document.getElementById('map')) document.getElementById('map').style.display = '';
      } else {
        dom.viewToggleContainer.className = 'reports-maximized';
        dom.toggleReportsBtn.innerHTML = '<i class="fas fa-compress-alt"></i>';
        if (dom.toggleMapBtn) dom.toggleMapBtn.style.display = 'none';
        if (dom.reportsDiv) dom.reportsDiv.style.display = '';
        if (document.getElementById('map')) document.getElementById('map').style.display = 'none';
      }
      if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
        google.maps.event.trigger(map, 'resize');
      }
    });
  }

  // Ensure initial button states
  if (dom.viewToggleContainer && dom.toggleMapBtn && dom.toggleReportsBtn) {
    if (dom.viewToggleContainer.classList.contains('normal-view')) {
      dom.toggleMapBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
      dom.toggleReportsBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
      dom.toggleReportsBtn.style.display = '';
      dom.toggleMapBtn.style.display = '';
    }
  }

  // Upgrade sort select style
  if (dom.sortSelect) {
    dom.sortSelect.classList.add('shadow', 'rounded-pill', 'bg-dark', 'text-light', 'border-primary');
  }
});

// --- Search/Sort Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // Initialize hazard type checkboxes
    const hazardContainer = document.getElementById('hazard-types-container');
    if (hazardContainer) {
        generateHazardCheckboxes();
        // Listen for changes on checkboxes to trigger filtering
        hazardContainer.addEventListener('change', () => {
            window.filterAndRenderReports();
        });
    }
    
    const searchInput = document.getElementById('report-search-input');
    const sortSelect = document.getElementById('report-sort-select');
    function filterAndRenderReports() {
        let filtered = lastReports;
        const q = (searchInput?.value || '').toLowerCase();
        if (q) {
            filtered = filtered.filter(r =>
                (r.type && r.type.toLowerCase().includes(q)) ||
                (r.location && r.location.toLowerCase().includes(q)) ||
                (r.status && r.status.toLowerCase().includes(q)) ||
                (r.reportedBy && r.reportedBy.toLowerCase().includes(q))
            );
        }
        // Filter by selected hazard types (if any)
        const checkedHazards = Array.from(document.querySelectorAll('#hazard-types-container input[type="checkbox"]:checked')).map(el => el.value);
        if (checkedHazards.length > 0) {
            filtered = filtered.filter(r => checkedHazards.includes(r.type));
        }
        // Sort
        if (sortSelect) {
            const [field, order] = sortSelect.value.split('-');
            filtered = sortReports(filtered, field === 'reportedBy' ? 'reportedBy' : field, order);
        }
        filtered = mergeDuplicateReports(filtered);
        renderReportBlocks(filtered);
        updateDashboardInfo(filtered);
    }
    if (searchInput) searchInput.addEventListener('input', filterAndRenderReports);
    if (sortSelect) sortSelect.addEventListener('change', filterAndRenderReports);
    window.filterAndRenderReports = filterAndRenderReports;
});

// --- Report Details Modal Logic ---
function showReportDetails(report) {
  document.getElementById("modal-hazard-id").textContent = report.id;
  document.getElementById("modal-type").textContent = report.type;
  document.getElementById("modal-location").textContent = report.location;
  document.getElementById("modal-time").textContent = new Date(report.time).toLocaleString();
  document.getElementById("modal-status").textContent = report.status;
  document.getElementById("modal-user").textContent = report.reportedBy;
  const modalImageElement = document.getElementById("modal-report-image");
  if (report.image) {
    modalImageElement.src = report.image;
    modalImageElement.style.display = "block";
  } else {
    modalImageElement.src = "";
    modalImageElement.style.display = "none";
  }
  if (window.reportDetailsBootstrapModal) {
    window.reportDetailsBootstrapModal.show();
  }
}
// Expose globally for infowindow and HTML
window.showReportDetails = showReportDetails;

// Expose openModal globally for infowindow and HTML
window.openModal = openModal;

// Manual hideReportDetailsModal and its listeners are removed as Bootstrap handles dismissal.

function toggleSidebar() {
	dom.sidebar.classList.toggle('open');
	dom.mainContent.classList.toggle('shifted');
	// UI Enhancement: add smooth opacity transition to sidebar
	dom.sidebar.style.transition = 'left 0.3s ease, opacity 0.3s ease';
	dom.sidebar.style.opacity = dom.sidebar.classList.contains('open') ? '1' : '0.9';
}

// Expose toggleSidebar globally
window.toggleSidebar = toggleSidebar;

// Add a function to create and return a map legend div
function addMapLegend() {
    const legend = document.createElement('div');
    legend.id = 'map-legend';
    legend.style.background = 'white';
    legend.style.padding = '10px';
    legend.style.margin = '10px';
    legend.style.fontSize = '14px';
    legend.style.fontFamily = 'Arial, sans-serif';
    legend.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    legend.innerHTML = '<h4 style="margin-top:0;">Key</h4>';
    // Loop through hazard types (excluding the default)
    for (const [hazard, color] of Object.entries(hazardMarkerColors)) {
        if (hazard === 'default') continue;
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.marginBottom = '4px';
        item.innerHTML = `<div style="background: ${color}; width: 16px; height: 16px; margin-right: 8px;"></div><span>${hazard}</span>`;
        legend.appendChild(item);
    }
    return legend;
}

// --- Maximize/Minimize Map/Reports Logic ---
document.addEventListener('DOMContentLoaded', () => {
  const mapMaxBtn = document.getElementById('map-maximize-btn');
  const reportsMaxBtn = document.getElementById('reports-maximize-btn');
  if (mapMaxBtn && dom.viewToggleContainer) {
    mapMaxBtn.addEventListener('click', () => {
      if (dom.viewToggleContainer.classList.contains('map-maximized')) {
        dom.viewToggleContainer.className = 'normal-view';
      } else {
        dom.viewToggleContainer.className = 'map-maximized';
      }
      if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
        google.maps.event.trigger(map, 'resize');
      }
    });
  }
  if (reportsMaxBtn && dom.viewToggleContainer) {
    reportsMaxBtn.addEventListener('click', () => {
      if (dom.viewToggleContainer.classList.contains('reports-maximized')) {
        dom.viewToggleContainer.className = 'normal-view';
      } else {
        dom.viewToggleContainer.className = 'reports-maximized';
      }
      if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
        google.maps.event.trigger(map, 'resize');
      }
    });
  }
});

// --- Deduplication/Merge Logic ---
function mergeDuplicateReports(reports) {
  const merged = [];
  const seenLoc = new Map();
  const seenImg = new Map();
  reports.forEach(r => {
    // Key: type+location (case-insensitive, trimmed)
    const locKey = `${(r.type||'').toLowerCase().trim()}|${(r.location||'').toLowerCase().trim()}`;
    if (seenLoc.has(locKey)) {
      const existing = seenLoc.get(locKey);
      existing._mergedCount = (existing._mergedCount||1)+1;
      existing._mergedIds = existing._mergedIds || [existing.id];
      existing._mergedIds.push(r.id);
      if (!existing._mergedReporters) existing._mergedReporters = new Set([existing.reportedBy]);
      existing._mergedReporters.add(r.reportedBy);
    } else {
      seenLoc.set(locKey, { ...r });
    }
  });
  // Now check for identical images
  for (const rep of seenLoc.values()) {
    if (rep.image) {
      if (seenImg.has(rep.image)) {
        // Mark as duplicate
        const dupe = seenImg.get(rep.image);
        dupe._duplicateImages = dupe._duplicateImages || [];
        dupe._duplicateImages.push(rep);
      } else {
        seenImg.set(rep.image, rep);
      }
    }
    merged.push(rep);
  }
  return merged;
}

// --- Render Report Blocks ---
function renderReportBlocks(reports) {
  renderReportTableRows(reports);
}

// --- Render Report Table Rows ---
function renderReportTableRows(reports) {
    const tbody = document.getElementById('reports-table-body');
    if (!tbody) {
        console.error("Element with id 'reports-table-body' not found.");
        return;
    }
    tbody.innerHTML = '';
    console.log("Rendering", reports.length, "reports to the table body");
    reports.forEach(report => {
        const tr = document.createElement('tr');
        tr.dataset.reportId = report.id; // For marker sync if needed
        tr.innerHTML = `
            <td>
                ${report.image ? 
                    `<img src="${report.image}" alt="Hazard" class="hazard-thumbnail" 
                     style="width:56px;height:56px;object-fit:cover;border-radius:10px;
                     box-shadow:0 2px 8px #23294622;cursor:pointer"
                     onclick="showImageModal('${report.image}')" title="View full image">`
                    : '<span class="text-muted">No image</span>'}
            </td>
            <td>${report.type}</td>
            <td>
                <a href="#" class="text-info location-link" onclick="focusMapLocation('${report.location}')" title="Locate on map">
                    ${report.location}
                </a>
                ${report._mergedCount ? 
                    `<span class="badge bg-info ms-2" title="Multiple reports at this location">
                        +${report._mergedCount - 1}
                    </span>` 
                    : ''}
            </td>
            <td>${new Date(report.time).toLocaleString()}</td>
            <td>
                <span class="badge ${getStatusBadgeClass(report.status)}">
                    ${report.status}
                </span>
            </td>
            <td>
                ${report.reportedBy}
                ${report._mergedReporters?.size > 1 ? 
                    `<span class="badge bg-secondary ms-1" title="Multiple reporters">
                        +${report._mergedReporters.size - 1}
                    </span>` 
                    : ''}
            </td>
            <td class="text-center">
                <div class="btn-group" role="group">
                    <button class="btn btn-outline-primary btn-sm" title="View Details" 
                            onclick="showReportDetails(${JSON.stringify(report)})">
                        <i class="fas fa-info-circle"></i>
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" title="View Image"
                            onclick="showImageModal('${report.image}')"
                            ${!report.image ? 'disabled' : ''}>
                        <i class="fas fa-image"></i>
                    </button>
                    <button class="btn btn-outline-warning btn-sm" title="Edit Report"
                            onclick="openEditReportModal(${JSON.stringify(report)})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm" title="Delete Report"
                            onclick="confirmDeleteReport('${report.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="btn btn-outline-${report.status === 'Resolved' ? 'danger' : 'success'} btn-sm" 
                            title="Toggle Status" onclick="toggleReportStatus('${report.id}', '${report.status}')">
                        ${report.status === 'Resolved' ? 'Mark Open' : 'Mark Resolved'}
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);

        // Add hover events to sync with map markers
        tr.addEventListener('mouseenter', () => highlightMarker(report.id));
        tr.addEventListener('mouseleave', () => unhighlightMarker(report.id));
    });
}

// Helper function for status badge classes
function getStatusBadgeClass(status) {
    switch(status?.toLowerCase()) {
        case 'resolved': return 'bg-success';
        case 'open': return 'bg-danger';
        case 'in progress': return 'bg-warning text-dark';
        default: return 'bg-secondary';
    }
}

// Helper function to focus map on location
function focusMapLocation(location) {
    const marker = markers.find(m => m.getTitle()?.includes(location));
    if (marker) {
        map.panTo(marker.getPosition());
        map.setZoom(15);
        marker.setAnimation(google.maps.Animation.BOUNCE);
        setTimeout(() => marker.setAnimation(null), 2100);
    }
}

// Helper functions for marker highlighting
function highlightMarker(reportId) {
    const marker = markers.find(m => m.reportId === reportId);
    if (marker) {
        marker.setAnimation(google.maps.Animation.BOUNCE);
    }
}

function unhighlightMarker(reportId) {
    const marker = markers.find(m => m.reportId === reportId);
    if (marker) {
        marker.setAnimation(null);
    }
}

// Function to show full-size image modal
function showImageModal(imageUrl) {
    if (!imageUrl) return;
    
    const modalHtml = `
        <div class="modal fade" id="imageModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content bg-dark">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title text-light">Hazard Image</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body text-center p-0">
                        <img src="${imageUrl}" class="img-fluid" style="max-height:80vh">
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('imageModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add new modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('imageModal'));
    modal.show();
}

// Toggle report status
async function toggleReportStatus(reportId, currentStatus) {
    const newStatus = currentStatus === 'Resolved' ? 'Open' : 'Resolved';
    try {
        const response = await fetch(`/api/reports/${reportId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (response.ok) {
            await loadReports(); // Reload to update UI
            showToast(`Report marked as ${newStatus}`, 'success');
        } else {
            throw new Error('Failed to update status');
        }
    } catch (error) {
        console.error('Error updating status:', error);
        showToast('Failed to update status', 'error');
    }
}

// Confirm and delete report
function confirmDeleteReport(reportId) {
    const modalHtml = `
        <div class="modal fade" id="deleteConfirmModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content bg-dark text-light">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">Confirm Delete</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        Are you sure you want to delete this report? This action cannot be undone.
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-danger" onclick="deleteReport('${reportId}')">Delete</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('deleteConfirmModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add new modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    modal.show();
}

// Delete report
async function deleteReport(reportId) {
    try {
        const response = await fetch(`/api/reports/${reportId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Close the confirmation modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
            modal.hide();

            // Remove the marker from the map
            const markerIndex = markers.findIndex(m => m.reportId === reportId);
            if (markerIndex !== -1) {
                markers[markerIndex].setMap(null);
                markers.splice(markerIndex, 1);
            }

            // Reload reports to update UI
            await loadReports();
            showToast('Report deleted successfully', 'success');
        } else {
            throw new Error('Failed to delete report');
        }
    } catch (error) {
        console.error('Error deleting report:', error);
        showToast('Failed to delete report', 'error');
    }
}

// Add missing openEditReportModal function
function openEditReportModal(report) {
    // Temporary stub – replace with modal integration as needed.
    alert("Opening Edit Report modal for report: " + report.id);
}

// Add missing showToast function for notifications
function showToast(message, type) {
    // Minimal implementation; replace with preferred toast logic.
    alert(message);
}

// NEW: Function to update the heatmap overlay on the map using marker positions
function updateHeatmap() {
    if (!map) return;
    const heatData = markers.map(marker => marker.getPosition());
    if (heatmapLayer) heatmapLayer.setMap(null);
    heatmapLayer = new google.maps.visualization.HeatmapLayer({
        data: heatData,
        radius: 50,      // increased radius for broader heat zones
        opacity: 0.7,
        gradient: [
            'rgba(0, 255, 255, 0)',
            'rgba(0, 255, 255, 1)',
            'rgba(0, 191, 255, 1)',
            'rgba(0, 127, 255, 1)',
            'rgba(0, 63, 255, 1)',
            'rgba(0, 0, 255, 1)',
            'rgba(63, 0, 255, 1)',
            'rgba(127, 0, 255, 1)',
            'rgba(191, 0, 255, 1)',
            'rgba(255, 0, 255, 1)'
        ]
    });
    heatmapLayer.setMap(map);
}

// NEW: Expose key functions so that they are accessible from HTML event handlers
window.confirmDeleteReport = confirmDeleteReport;
window.showImageModal = showImageModal;
window.toggleReportStatus = toggleReportStatus;
window.deleteReport = deleteReport;
