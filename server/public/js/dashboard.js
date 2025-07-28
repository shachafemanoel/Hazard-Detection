let map;
let markers = [];
let heatmapLayer = null;
let reportDetailsBootstrapModal = null;

const hazardTypes = [
    'crack',
    'knocked',
    'pothole',
    'surface_damage'
];

// Mapping old hazard types to new simplified types
const hazardTypeMapping = {
    // Crack-related
    'Alligator Crack': 'crack',
    'Block Crack': 'crack',
    'Construction Joint Crack': 'crack',
    'Longitudinal Crack': 'crack',
    'Transverse Crack': 'crack',
    'Wheel Mark Crack': 'crack',
    'Crack': 'crack',
    
    // Surface damage
    'Crosswalk Blur': 'surface_damage',
    'Lane Blur': 'surface_damage',
    'Patch Repair': 'surface_damage',
    'Surface Damage': 'surface_damage',
    
    // Potholes
    'Pothole': 'pothole',
    
    // Knocked/damaged structures
    'Manhole': 'knocked',
    'Knocked': 'knocked'
};

// Function to normalize hazard type
function normalizeHazardType(type) {
    if (!type) return 'surface_damage'; // default fallback
    return hazardTypeMapping[type] || type.toLowerCase() || 'surface_damage';
}

// Hazard type to marker color mapping (updated for new types)
const hazardMarkerColors = {
    'crack': '#FF0000', // Red
    'knocked': '#FF7F00', // Orange  
    'pothole': '#FFD700', // Gold
    'surface_damage': '#00FF00', // Lime
    'default': '#808080' // Gray for unknown types
};

// Create custom marker icon for Leaflet
function createCustomIcon(hazardType) {
    const color = hazardMarkerColors[hazardType] || hazardMarkerColors['default'];
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            width: 20px;
            height: 20px;
            background-color: ${color};
            border-radius: 50%;
            border: 2px solid #FFFFFF;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

// Global sort state
let currentSort = { field: 'time', order: 'desc' };

// Always use dark mode for the map
// Initialize Leaflet map
function initMap() {
    const defaultCenter = [31.7683, 35.2137]; // Israel coordinates [lat, lng]
    
    // Create map with dark theme
    map = L.map('map', {
        center: defaultCenter,
        zoom: 8,
        zoomControl: true,
        attributionControl: true
    });

    // Add dark theme tile layer from CartoDB
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // Add fallback marker for default location
    const defaultMarker = L.marker(defaultCenter, {
        icon: L.divIcon({
            className: 'default-location-marker',
            html: `<div style="
                width: 20px;
                height: 20px;
                background-color: #4285F4;
                border-radius: 50%;
                border: 2px solid #fff;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        })
    }).addTo(map).bindPopup('Israel');

    // Try to get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLatLng = [position.coords.latitude, position.coords.longitude];
                map.setView(userLatLng, 12);
                
                // Add user location marker
                const userMarker = L.marker(userLatLng, {
                    icon: L.divIcon({
                        className: 'user-location-marker',
                        html: `<div style="
                            width: 24px;
                            height: 24px;
                            background-color: #4285F4;
                            border-radius: 50%;
                            border: 3px solid #fff;
                            box-shadow: 0 0 8px #4285F4;
                            animation: pulse 2s infinite;
                        "></div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    })
                }).addTo(map).bindPopup('Your Location');
                
                loadReports();
            },
            (error) => {
                console.warn("Geolocation not available:", error.message);
                getLocationByIP();
            }
        );
    } else {
        loadReports();
    }

    // Create and add legend
    window.mapLegend = addMapLegend();
    window.mapLegend.style.display = "none";
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

// Initialize the map when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        initMap();
    } catch (error) {
        console.error('Failed to initialize map:', error);
        showToast('Failed to load map. Please refresh the page.', 'error');
    }
});

// Make initMap available globally
window.initMap = initMap;

// Enhanced map controls
let heatmapVisible = false;
let smartHeatmapLayer = null;

// Smart heatmap using marker density visualization
function toggleHeatmap() {
    if (!map || markers.length === 0) {
        showToast('No data available for heatmap visualization', 'warning');
        return;
    }

    if (heatmapVisible) {
        // Hide heatmap
        if (smartHeatmapLayer) {
            map.removeLayer(smartHeatmapLayer);
            smartHeatmapLayer = null;
        }
        heatmapVisible = false;
        showToast('Heatmap hidden', 'info');
    } else {
        // Show smart heatmap
        createSmartHeatmap();
        heatmapVisible = true;
        showToast('Smart heatmap displayed', 'success');
    }
}

// Create smart heatmap using marker clustering and density
function createSmartHeatmap() {
    if (!markers || markers.length === 0) return;

    // Clear existing heatmap
    if (smartHeatmapLayer) {
        map.removeLayer(smartHeatmapLayer);
    }

    // Create layer group for density circles
    smartHeatmapLayer = L.layerGroup();
    const gridSize = 0.01; // Approximately 1km grid
    const densityMap = new Map();

    // Group markers by grid cells
    markers.forEach(marker => {
        const position = marker.getLatLng();
        if (!position) return;

        const lat = position.lat;
        const lng = position.lng;
        const gridKey = `${Math.floor(lat / gridSize)}_${Math.floor(lng / gridSize)}`;
        
        if (!densityMap.has(gridKey)) {
            densityMap.set(gridKey, {
                count: 0,
                lat: 0,
                lng: 0,
                types: new Set()
            });
        }
        
        const cell = densityMap.get(gridKey);
        cell.count++;
        cell.lat += lat;
        cell.lng += lng;
        if (marker.report && marker.report.type) {
            cell.types.add(marker.report.type);
        }
    });

    // Create visual density indicators
    densityMap.forEach((cell, key) => {
        const avgLat = cell.lat / cell.count;
        const avgLng = cell.lng / cell.count;
        
        // Determine color and size based on density
        let color, radius;
        if (cell.count >= 10) {
            color = '#FF0000'; // Red for high density
            radius = 800;
        } else if (cell.count >= 5) {
            color = '#FF8000'; // Orange for medium density
            radius = 600;
        } else if (cell.count >= 2) {
            color = '#FFFF00'; // Yellow for low density
            radius = 400;
        } else {
            return; // Skip single markers
        }

        const circle = L.circle([avgLat, avgLng], {
            color: color,
            fillColor: color,
            fillOpacity: 0.2,
            radius: radius,
            weight: 2,
            opacity: 0.6
        });

        // Add popup with density information
        circle.bindPopup(`
            <div style="padding: 8px;">
                <h6>Hazard Density Cluster</h6>
                <p><strong>Reports:</strong> ${cell.count}</p>
                <p><strong>Types:</strong> ${Array.from(cell.types).join(', ')}</p>
                <p><strong>Density Level:</strong> ${cell.count >= 10 ? 'High' : cell.count >= 5 ? 'Medium' : 'Low'}</p>
            </div>
        `);

        smartHeatmapLayer.addLayer(circle);
    });

    // Add layer group to map
    smartHeatmapLayer.addTo(map);
}

// Center map on user location with IP fallback
function centerMap() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLatLng = [position.coords.latitude, position.coords.longitude];
                map.setView(userLatLng, 12);
                showToast('Map centered on your GPS location', 'success');
                
                // Add user location marker
                addUserLocationMarker(userLatLng, 'GPS Location');
            },
            (error) => {
                console.warn('GPS location failed:', error.message);
                // Fallback to IP location
                centerMapByIP();
            }
        );
    } else {
        console.warn('Geolocation not supported by browser');
        // Fallback to IP location
        centerMapByIP();
    }
}

// Center map using IP-based geolocation
async function centerMapByIP() {
    try {
        showToast('Getting your location...', 'info');
        // Try multiple IP geolocation services for better reliability
        const ipServices = [
            { url: 'https://ipapi.co/json/', parse: (data) => ({ lat: data.latitude, lng: data.longitude, city: data.city, country: data.country }) },
            { url: 'https://ip-api.com/json/', parse: (data) => ({ lat: data.lat, lng: data.lon, city: data.city, country: data.country }) },
            { url: 'https://ipinfo.io/json', parse: (data) => {
                const [lat, lng] = (data.loc || '0,0').split(',').map(Number);
                return { lat, lng, city: data.city, country: data.country };
            }}
        ];
        let locationData = null;
        for (const service of ipServices) {
            try {
                const response = await fetch(service.url, { 
                    timeout: 5000,
                    headers: { 'Accept': 'application/json' }
                });
                if (!response.ok) continue;
                const data = await response.json();
                locationData = service.parse(data);
                if (locationData && locationData.lat && locationData.lng && 
                    !isNaN(locationData.lat) && !isNaN(locationData.lng) &&
                    locationData.lat >= -90 && locationData.lat <= 90 &&
                    locationData.lng >= -180 && locationData.lng <= 180) {
                    break;
                }
            } catch (serviceError) {
                console.warn(`IP service ${service.url} failed:`, serviceError.message);
                continue;
            }
        }
        if (locationData) {
            const ipLatLng = { lat: locationData.lat, lng: locationData.lng };
            map.setView([ipLatLng.lat, ipLatLng.lng], 10);
            const locationText = locationData.city && locationData.country ? 
                `${locationData.city}, ${locationData.country}` : 'IP Location';
            showToast(`Map centered on ${locationText}`, 'success');
            // Add IP location marker
            addUserLocationMarker(ipLatLng, `IP Location: ${locationText}`);
        } else {
            throw new Error('All IP geolocation services failed');
        }
    } catch (error) {
        console.error('IP geolocation failed:', error);
        showToast('Could not determine your location. Using default location.', 'warning');
        // Fallback to default Israel location
        const defaultLocation = { lat: 31.7683, lng: 35.2137 };
        map.setView([defaultLocation.lat, defaultLocation.lng], 8);
    }
}

// Add user location marker to map
function addUserLocationMarker(location, title) {
    // Remove existing user location markers
    markers.forEach((marker, index) => {
        const markerTitle = marker.customTitle || '';
        if (markerTitle.includes('Location') || markerTitle.includes('Your Location')) {
            map.removeLayer(marker);
            markers.splice(index, 1);
        }
    });
    
    // Add new user location marker using Leaflet
    const userMarker = L.marker(location, {
        icon: L.divIcon({
            className: 'user-location-marker',
            html: `<div style="
                width: 24px;
                height: 24px;
                background-color: #4285F4;
                border-radius: 50%;
                border: 3px solid #fff;
                box-shadow: 0 0 12px #4285F4;
                animation: pulse 2s infinite;
            "></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        })
    }).addTo(map).bindPopup(title);
    
    userMarker.customTitle = title;
    markers.push(userMarker);
}

// Bind new control functions
document.addEventListener('DOMContentLoaded', () => {
    const toggleHeatmapBtn = document.getElementById('toggle-heatmap');
    const centerMapBtn = document.getElementById('center-map');
    
    if (toggleHeatmapBtn) {
        toggleHeatmapBtn.addEventListener('click', toggleHeatmap);
    }
    
    if (centerMapBtn) {
        centerMapBtn.addEventListener('click', centerMap);
    }
});

function clearMarkers() {
    markers.forEach(marker => {
        map.removeLayer(marker);
    });
    markers = [];
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
    
    // Check if address is already coordinates (format: "Coordinates: lat, lng")
    const coordMatch = address.match(/Coordinates:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
    if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (!isNaN(lat) && !isNaN(lng)) {
            const location = [lat, lng];
            return createMarkerFromLocation(location, address, report);
        }
    }
    
    // Check if we have cached geocoding result
    const geocodeKey = `geocode_${address}`;
    const cachedLocation = getCachedReports(geocodeKey);
    
    try {
        let location;
        
        if (cachedLocation) {
            location = cachedLocation;
        } else {
            // Use our internal geocoding API (avoids CORS issues)
            const response = await retryRequest(() => 
                fetch(`/api/geocode?address=${encodeURIComponent(address)}`)
            );
            
            const data = await response.json();
            
            if (data.success && data.location) {
                location = data.location;
                setCachedReports(geocodeKey, location);
            } else {
                console.warn(`No geocoding results for address: ${address}`, data.error);
                return null; // Skip this report if geocoding fails
            }
        }
        
        return createMarkerFromLocation(location, address, report);
    } catch (error) {
        console.error('Geocoding failed:', error);
        return null;
    }
}

// Helper function to create marker from location
function createMarkerFromLocation(location, address, report) {
    try {
        // Normalize the hazard type for consistent display
        const normalizedType = normalizeHazardType(report.type);
        const displayType = normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1).replace('_', ' ');
        
        // Create Leaflet marker with custom icon
        const marker = L.marker(location, {
            icon: createCustomIcon(normalizedType)
        }).addTo(map);
        
        // Store custom properties
        marker.reportId = report.id;
        marker.report = report;
        marker.customTitle = `${displayType} - ${address}`;
        
        // Create popup content
        const popupContent = `
            <div class="info-window" style="min-width: 250px;">
                <h5 style="margin-bottom: 10px; color: #333;">${displayType}</h5>
                <p><strong>Location:</strong> ${address}</p>
                <p><strong>Status:</strong> <span class="badge ${report.status === 'Resolved' ? 'bg-success' : 'bg-danger'}" style="padding: 3px 8px; border-radius: 12px; color: white; background-color: ${report.status === 'Resolved' ? '#28a745' : '#dc3545'};">${report.status}</span></p>
                <p><strong>Reported by:</strong> ${report.reportedBy}</p>
                <p><strong>Time:</strong> ${new Date(report.time).toLocaleString()}</p>
                ${report.image ? `<img src="${report.image}" alt="Hazard" style="width:200px;height:150px;object-fit:cover;margin:10px 0;cursor:pointer;border-radius:8px;" onclick="showImageModal('${report.image}')">` : ''}
                <div style="margin-top: 10px;">
                    <button class="btn btn-sm btn-primary" style="margin-right: 8px; padding: 4px 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;" onclick="openEditReportModal(${JSON.stringify(report).replace(/"/g, '&quot;')})">Edit</button>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'custom-popup'
        });
        
        // Handle click events for table row sync
        marker.on('click', () => {
            map.setView(location, Math.max(map.getZoom(), 14));
            openEditReportModal(report);
            // Sync with table
            const rows = document.querySelectorAll('#reports-table tbody tr');
            rows.forEach(row => row.classList.remove('table-active'));
            const targetRow = document.querySelector(`#reports-table tbody tr[data-report-id="${report.id}"]`);
            if (targetRow) {
                targetRow.classList.add('table-active');
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
        
        return marker;
    } catch (error) {
        console.error('Error creating marker:', error);
        return null;
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
    const normalizedType = normalizeHazardType(report.type);
    const displayType = normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1).replace('_', ' ');
    
    const block = document.createElement('div');
    block.className = 'event-log-block d-flex gap-3 align-items-start p-3 rounded shadow-sm bg-white position-relative';
    block.innerHTML = `
        <img src="${report.image}" alt="Hazard image" class="event-block-image" style="width: 80px; height: 80px; object-fit: cover; border-radius: 12px; box-shadow: 0 2px 8px #23294622; border: 2px solid #e9f0fa; background: #f4f7fb;">
        <div class="event-block-details">
            <div class="event-block-title">
                <i class="fas fa-exclamation-triangle"></i> ${displayType}
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
    // Details modal -> פותח עריכה
    block.querySelector('.view-details-btn').addEventListener('click', () => openEditReportModal(report));
    // Admin actions
    block.querySelector('.edit-report-btn').addEventListener('click', () => openEditReportModal(report));
    block.querySelector('.delete-report-btn').addEventListener('click', () => deleteReport(report.id));
    block.querySelector('.status-toggle-btn').addEventListener('click', () => toggleReportStatus(report));
    // לחיצה על כל הבלוק תפתח עריכה
    block.addEventListener('click', (e) => {
        // אל תפתח אם לוחצים על כפתור תמונה
        if (e.target.closest('.view-image-btn')) return;
        openEditReportModal(report);
    });
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

// --- יצירת סמנים עם קיבוץ לפי קואורדינטות ---
// Global pagination state
let currentPage = 1;
let reportsPerPage = 25; // Reasonable default for dashboard
let totalReports = 0;
let allLoadedReports = []; // Store all loaded reports across pages

async function loadReports(filters = {}, page = 1, clearPrevious = true) {
    try {
        showLoadingIndicator();
        
        // Add pagination parameters to filters
        const paginatedFilters = {
            ...filters,
            page: page,
            limit: reportsPerPage
        };
        
        const cacheKey = JSON.stringify(paginatedFilters);
        const cachedData = getCachedReports(cacheKey);
        
        if (cachedData && cachedData.reports) {
            console.log('Using cached reports data');
            const reports = cachedData.reports;
            const pagination = cachedData.pagination;
            
            if (clearPrevious) {
                allLoadedReports = reports;
                lastReports = reports;
            } else {
                allLoadedReports = [...allLoadedReports, ...reports];
                lastReports = allLoadedReports;
            }
            
            updatePaginationInfo(pagination);
            updateDashboardInfo(reports, pagination);
            hideLoadingIndicator();
            return { reports, pagination };
        }
        
        const queryString = Object.entries(paginatedFilters)
            .filter(([_, value]) => value !== undefined && value !== null && value !== '')
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');
            
        console.log('Fetching reports:', queryString);
        
        const response = await fetch(`/api/reports${queryString ? `?${queryString}` : ''}`, {
            method: 'GET',
            credentials: 'include',
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Handle both new paginated format and legacy array format
        let reports, pagination;
        if (data.reports && data.pagination) {
            // New paginated format
            reports = data.reports;
            pagination = data.pagination;
            console.log(`Loaded ${reports.length} reports (Page ${pagination.page}/${pagination.totalPages}, Total: ${pagination.total})`);
        } else if (Array.isArray(data)) {
            // Legacy format - convert to paginated format
            reports = data;
            pagination = {
                page: 1,
                limit: reports.length,
                total: reports.length,
                totalPages: 1,
                hasNext: false,
                hasPrev: false
            };
            console.log(`Loaded ${reports.length} reports (Legacy format)`);
        } else {
            throw new Error('Invalid API response format');
        }
        
        if (!document.body) return { reports: [], pagination };
        
        setCachedReports(cacheKey, { reports, pagination });
        
        // Update global state
        currentPage = pagination.page;
        totalReports = pagination.total;
        
        if (clearPrevious) {
            allLoadedReports = reports;
            lastReports = reports;
        } else {
            allLoadedReports = [...allLoadedReports, ...reports];
            lastReports = allLoadedReports;
        }
        
        // Update map markers (only for current page to avoid performance issues)
        clearMarkers();
        const bounds = L.latLngBounds();
        
        for (const report of reports) {
            try {
                const marker = await geocodeAddress(report.location, report);
                if (marker) {
                    markers.push(marker);
                    const position = marker.getLatLng();
                    bounds.extend(position);
                }
            } catch (error) {
                console.warn('Failed to create marker for report:', report.id, error);
            }
        }
        
        // Fit map to show all markers
        if (markers.length > 0) {
            map.fitBounds(bounds);
            if (map.getZoom() > 16) {
                map.setZoom(16);
            }
        }
        
        updateHeatmap();
        updatePaginationInfo(pagination);
        
        // Update UI with reports from current page
        if (window.filterAndRenderReports) {
            window.filterAndRenderReports();
        } else {
            renderReportBlocksModern(reports);
        }
        
        updateDashboardInfo(reports, pagination);
        hideLoadingIndicator();
        
        return { reports, pagination };
        
    } catch (error) {
        console.error('Error in loadReports:', error);
        if (document.body) {
            handleError(error, 'loadReports');
            hideLoadingIndicator();
            showToast(`Failed to load reports: ${error.message}`, 'error');
        }
        return { reports: [], pagination: null };
    }
}

// Update pagination info display
function updatePaginationInfo(pagination) {
    if (!pagination) return;
    
    const paginationInfo = document.getElementById('reports-pagination-info');
    const paginationControls = document.getElementById('reports-pagination');
    const paginationText = document.getElementById('pagination-text');
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    
    if (pagination.total > 0) {
        // Show pagination elements
        if (paginationInfo) paginationInfo.style.display = 'block';
        if (paginationControls) paginationControls.style.display = 'block';
        
        // Update pagination text
        const startItem = ((pagination.page - 1) * pagination.limit) + 1;
        const endItem = Math.min(startItem + pagination.limit - 1, pagination.total);
        if (paginationText) {
            paginationText.textContent = `Showing ${startItem}-${endItem} of ${pagination.total} reports`;
        }
        
        // Update page info
        if (pageInfo) {
            pageInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
        }
        
        // Update button states
        if (prevBtn) {
            prevBtn.disabled = !pagination.hasPrev;
        }
        if (nextBtn) {
            nextBtn.disabled = !pagination.hasNext;
        }
    } else {
        // Hide pagination elements when no reports
        if (paginationInfo) paginationInfo.style.display = 'none';
        if (paginationControls) paginationControls.style.display = 'none';
    }
}

// Navigation functions
async function goToPage(page) {
    if (page < 1) return;
    
    const currentFilters = getCurrentFilters();
    await loadReports(currentFilters, page, true);
}

async function goToNextPage() {
    await goToPage(currentPage + 1);
}

async function goToPrevPage() {
    await goToPage(currentPage - 1);
}

function getCurrentFilters() {
    const searchInput = document.getElementById('report-search-input');
    const filters = {};
    
    if (searchInput && searchInput.value.trim()) {
        filters.location = searchInput.value.trim();
    }
    
    // Add hazard type filter if selected
    if (window.selectedHazardType && window.selectedHazardType !== '') {
        filters.hazardType = window.selectedHazardType;
    }
    
    return filters;
}

// Update general info blocks
function updateDashboardInfo(reports, pagination = null) {
    // Use pagination total if available, otherwise use reports length
    const totalCount = pagination ? pagination.total : reports.length;
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
    setVal('total-reports-count', totalCount);
    setVal('open-hazards-count', openHazards);
    setVal('resolved-this-month', resolvedThisMonth);
    setVal('active-users', activeUsers);
}

// --- GLOBAL STATE ---
let lastReports = [];
let currentMarker = null;
let selectedReportIds = new Set();

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
  selectAll: document.getElementById('select-all-reports'),
  bulkToolbar: document.getElementById('bulk-actions-toolbar'),
  selectedCount: document.getElementById('selected-count'),
  bulkStatusBtn: document.getElementById('bulk-status-btn'),
  bulkDeleteBtn: document.getElementById('bulk-delete-btn'),
  bulkExportBtn: document.getElementById('bulk-export-btn'),
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
      // Map resize handled automatically by Leaflet
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
      // Map resize handled automatically by Leaflet
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
function generateHazardCheckboxes() {
    const hazardContainer = document.getElementById('hazard-types-container');
    if (!hazardContainer) return;
    
    // Clear existing checkboxes
    hazardContainer.innerHTML = '';
    
    // Create checkboxes for each hazard type
    hazardTypes.forEach(type => {
        const displayType = type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'form-check form-check-inline';
        
        checkboxContainer.innerHTML = `
            <input class="form-check-input" type="checkbox" value="${type}" id="hazard-${type}">
            <label class="form-check-label" for="hazard-${type}">${displayType}</label>
        `;
        
        hazardContainer.appendChild(checkboxContainer);
    });
}

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
    
    // Create debounced search function
    const debouncedSearch = debounce(() => {
        window.filterAndRenderReports();
    }, 300);
    
    function filterAndRenderReports() {
        let filtered = lastReports || [];
        const q = (searchInput?.value || '').toLowerCase().trim();
        
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
            filtered = filtered.filter(r => checkedHazards.includes(normalizeHazardType(r.type)));
        }
        
        // Sort
        if (sortSelect) {
            const [field, order] = sortSelect.value.split('-');
            filtered = sortReports(filtered, field === 'reportedBy' ? 'reportedBy' : field, order);
        }
        
        filtered = mergeDuplicateReports(filtered);
        renderReportBlocks(filtered);
        updateDashboardInfo(filtered);
        
        // Update URL with current filters (for bookmarking)
        updateURLParams({ search: q, sort: sortSelect?.value });
    }
    
    if (searchInput) searchInput.addEventListener('input', debouncedSearch);
    if (sortSelect) sortSelect.addEventListener('change', filterAndRenderReports);
    window.filterAndRenderReports = filterAndRenderReports;
    
    // Load filters from URL on page load
    loadFiltersFromURL();
});

// URL parameter management
function updateURLParams(params) {
    const url = new URL(window.location);
    Object.entries(params).forEach(([key, value]) => {
        if (value) {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
    });
    window.history.replaceState({}, '', url);
}

function loadFiltersFromURL() {
    const url = new URL(window.location);
    const searchParam = url.searchParams.get('search');
    const sortParam = url.searchParams.get('sort');
    
    if (searchParam) {
        const searchInput = document.getElementById('report-search-input');
        if (searchInput) searchInput.value = searchParam;
    }
    
    if (sortParam) {
        const sortSelect = document.getElementById('report-sort-select');
        if (sortSelect) sortSelect.value = sortParam;
    }
}

// --- Report Details Modal Logic ---
function showReportDetails(report) {
  const normalizedType = normalizeHazardType(report.type);
  const displayType = normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1).replace('_', ' ');
  
  document.getElementById("modal-hazard-id").textContent = report.id;
  document.getElementById("modal-type").textContent = displayType;
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
      // Map resize handled automatically by Leaflet
    });
  }
  if (reportsMaxBtn && dom.viewToggleContainer) {
    reportsMaxBtn.addEventListener('click', () => {
      if (dom.viewToggleContainer.classList.contains('reports-maximized')) {
        dom.viewToggleContainer.className = 'normal-view';
      } else {
        dom.viewToggleContainer.className = 'reports-maximized';
      }
      // Map resize handled automatically by Leaflet
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
  renderReportBlocksModern(reports);
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
        // Checkbox for selection
        const checked = selectedReportIds.has(report.id.toString());
        tr.classList.toggle('selected', checked);
        tr.innerHTML = `
            <td style="text-align:center;">
                <input type="checkbox" class="row-select-checkbox" data-report-id="${report.id}" ${checked ? 'checked' : ''} aria-label="Select report">
            </td>
            <td>
                ${report.image ? 
                    `<img src="${report.image}" alt="Hazard" class="hazard-thumbnail" 
                     style="width:56px;height:56px;object-fit:cover;border-radius:10px;
                     box-shadow:0 2px 8px #23294622;cursor:pointer"
                     onclick="showImageModal('${report.image}')" title="View full image">`
                    : '<span class="text-muted">No image</span>'}
            </td>
            <td>${normalizeHazardType(report.type).charAt(0).toUpperCase() + normalizeHazardType(report.type).slice(1).replace('_', ' ')}</td>
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
                ${report._mergedReporters ?
                    `<span class="badge bg-secondary ms-1" title="Multiple reporters">
                        +${report._mergedReporters.size - 1}
                    </span>` 
                    : ''}
            </td>
            <td class="text-center">
                <div class="btn-group" role="group">
                    <button class="btn btn-outline-primary btn-sm" title="Edit/View" 
                            onclick="openEditReportModal(${JSON.stringify(report).replace(/"/g, '&quot;')})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" title="View Image"
                            onclick="showImageModal('${report.image}')"
                            ${!report.image ? 'disabled' : ''}>
                        <i class="fas fa-image"></i>
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
        // Checkbox event
        const checkbox = tr.querySelector('.row-select-checkbox');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                const id = e.target.dataset.reportId;
                if (e.target.checked) {
                    selectedReportIds.add(id);
                } else {
                    selectedReportIds.delete(id);
                }
                updateBulkToolbar();
                updateSelectAllCheckbox();
                tr.classList.toggle('selected', e.target.checked);
            });
        }
        // לחיצה על כל השורה תפתח עריכה (לא על כפתור תמונה)
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.btn-outline-secondary')) return;
            openEditReportModal(report);
        });
    });
    updateBulkToolbar();
    updateSelectAllCheckbox();
}

// Select-all logic
if (dom.selectAll) {
    dom.selectAll.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.row-select-checkbox');
        if (e.target.checked) {
            lastReports.forEach(r => selectedReportIds.add(r.id.toString()));
            checkboxes.forEach(cb => { cb.checked = true; cb.closest('tr').classList.add('selected'); });
        } else {
            selectedReportIds.clear();
            checkboxes.forEach(cb => { cb.checked = false; cb.closest('tr').classList.remove('selected'); });
        }
        updateBulkToolbar();
    });
}

function updateSelectAllCheckbox() {
    if (!dom.selectAll) return;
    const checkboxes = document.querySelectorAll('.row-select-checkbox');
    const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
    dom.selectAll.checked = checked > 0 && checked === checkboxes.length;
    dom.selectAll.indeterminate = checked > 0 && checked < checkboxes.length;
}

function updateBulkToolbar() {
    const count = selectedReportIds.size;
    if (dom.bulkToolbar) {
        dom.bulkToolbar.style.display = count > 0 ? 'flex' : 'none';
    }
    if (dom.selectedCount) {
        dom.selectedCount.textContent = `${count} selected`;
    }
}

// Bulk status update
if (dom.bulkStatusBtn) {
    dom.bulkStatusBtn.addEventListener('click', async () => {
        if (!selectedReportIds.size) return;
        const newStatus = prompt('Enter new status for selected reports (e.g., Open, Resolved):');
        if (!newStatus) return;
        for (const id of selectedReportIds) {
            try {
                await fetch(`/api/reports/${id}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
            } catch (err) {
                console.error('Bulk status update error:', err);
            }
        }
        showToast('Bulk status update complete', 'success');
        await loadReports();
        selectedReportIds.clear();
        updateBulkToolbar();
    });
}

// Bulk delete
if (dom.bulkDeleteBtn) {
    dom.bulkDeleteBtn.addEventListener('click', async () => {
        if (!selectedReportIds.size) return;
        if (!confirm(`Delete ${selectedReportIds.size} selected reports? This cannot be undone.`)) return;
        for (const id of selectedReportIds) {
            try {
                await fetch(`/api/reports/${id}`, { method: 'DELETE' });
            } catch (err) {
                console.error('Bulk delete error:', err);
            }
        }
        showToast('Bulk delete complete', 'success');
        await loadReports();
        selectedReportIds.clear();
        updateBulkToolbar();
    });
}

// Bulk export to CSV
function reportsToCSV(reports) {
    if (!reports.length) return '';
    const fields = ['id','type','location','time','status','reportedBy','image'];
    const csvRows = [fields.join(',')];
    for (const r of reports) {
        const row = fields.map(f => {
            let val = r[f] || '';
            if (typeof val === 'string') val = val.replace(/"/g, '""');
            return '"' + val + '"';
        });
        csvRows.push(row.join(','));
    }
    return csvRows.join('\n');
}

if (dom.bulkExportBtn) {
    dom.bulkExportBtn.addEventListener('click', () => {
        if (!selectedReportIds.size) return;
        const selected = lastReports.filter(r => selectedReportIds.has(r.id.toString()));
        const csv = reportsToCSV(selected);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hazard-reports-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
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
    const marker = markers.find(m => {
        const title = m.customTitle || (m.getTitle && m.getTitle()) || '';
        return title.includes(location);
    });
    if (marker) {
        const position = marker.getLatLng ? marker.getLatLng() : marker.position;
        if (position) {
            map.setView(position, 18);
            highlightMarker(marker.reportId);
            setTimeout(() => unhighlightMarker(marker.reportId), 2100);
            if(marker.report) {
                showReportDetails(marker.report);
            }
        }
    } else {
        console.warn('No marker found for location:', location);
    }
}


// Helper functions for marker highlighting
function highlightMarker(reportId) {
    const marker = markers.find(m => m.reportId === reportId);
    if (marker && marker.setAnimation) {
        // AdvancedMarkerElement does not support setAnimation; use CSS effect
        if (marker.content) {
            marker.content.style.boxShadow = '0 0 16px 4px #FFD700';
            marker.content.style.transform = 'scale(1.2)';
        }
    }
}

function unhighlightMarker(reportId) {
    const marker = markers.find(m => m.reportId === reportId);
    if (marker && marker.setAnimation) {
        if (marker.content) {
            marker.content.style.boxShadow = '';
            marker.content.style.transform = '';
        }
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
            // Close any open confirmation modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'));
            if (modal) modal.hide();
            // Remove marker, reload reports, and show success message
            const markerIndex = markers.findIndex(m => m.reportId === reportId);
            if (markerIndex !== -1) {
                const marker = markers[markerIndex];
                if (marker.map !== undefined) {
                    // AdvancedMarkerElement
                    marker.map = null;
                } else if (marker.setMap) {
                    // Regular marker
                    marker.setMap(null);
                }
                markers.splice(markerIndex, 1);
            }
            await loadReports();
            showToast('Report deleted successfully', 'success');
        } else {
            const errMsg = await response.text();
            throw new Error(`Failed to delete report: ${response.status} ${errMsg}`);
        }
    } catch (error) {
        console.error('Error deleting report:', error);
        showToast(`Failed to delete report: ${error.message}`, 'error');
    }
}

// Add missing openEditReportModal function
function openEditReportModal(report) {
    // Populate modal fields
    document.getElementById('edit-report-id').value = report.id || '';
    document.getElementById('edit-report-type').value = normalizeHazardType(report.type) || '';
    document.getElementById('edit-report-status').value = report.status || 'Open';
    document.getElementById('edit-report-location').value = report.location || '';
    document.getElementById('edit-report-image').value = report.image || '';
    document.getElementById('edit-report-reportedBy').value = report.reportedBy || '';
    // Image preview
    const preview = document.getElementById('edit-report-image-preview');
    if (report.image) {
        preview.src = report.image;
        preview.style.display = 'block';
    } else {
        preview.src = '';
        preview.style.display = 'none';
    }
    // Show modal
    if (window.editReportBootstrapModal) {
        window.editReportBootstrapModal.show();
    } else {
        const modalEl = document.getElementById('editReportModal');
        window.editReportBootstrapModal = new bootstrap.Modal(modalEl, {});
        window.editReportBootstrapModal.show();
    }
}
window.openEditReportModal = openEditReportModal;

// Handle image URL change for preview
const editImageInput = document.getElementById('edit-report-image');
if (editImageInput) {
    editImageInput.addEventListener('input', function() {
        const url = this.value;
        const preview = document.getElementById('edit-report-image-preview');
        if (url) {
            preview.src = url;
            preview.style.display = 'block';
        } else {
            preview.src = '';
            preview.style.display = 'none';
        }
    });
}

// Handle save changes
const editForm = document.getElementById('edit-report-form');
if (editForm) {
    editForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const id = document.getElementById('edit-report-id').value;
        const type = document.getElementById('edit-report-type').value;
        const status = document.getElementById('edit-report-status').value;
        const location = document.getElementById('edit-report-location').value;
        const image = document.getElementById('edit-report-image').value;
        // PATCH request to update report
        try {
            const res = await fetch(`/api/reports/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, status, location, image })
            });
            if (!res.ok) throw new Error('Failed to update report');
            showToast('Report updated successfully', 'success');
            window.editReportBootstrapModal.hide();
            await loadReports();
        } catch (err) {
            showToast('Failed to update report', 'error');
        }
    });
}

// Handle delete
const deleteBtn = document.getElementById('delete-report-btn');
if (deleteBtn) {
    deleteBtn.addEventListener('click', async function() {
        const id = document.getElementById('edit-report-id').value;
        if (!confirm('Are you sure you want to delete this report?')) return;
        try {
            const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete report');
            showToast('Report deleted', 'success');
            window.editReportBootstrapModal.hide();
            await loadReports();
        } catch (err) {
            showToast('Failed to delete report', 'error');
        }
    });
}

// Enhanced toast notification system
function showToast(message, type = 'info') {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast-notification alert alert-${getAlertClass(type)} alert-dismissible fade show`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 300px;
        max-width: 500px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        border-radius: 8px;
        animation: slideIn 0.3s ease-out;
    `;
    
    toast.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${getToastIcon(type)} me-2"></i>
            <div class="flex-grow-1">${message}</div>
            <button type="button" class="btn-close" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

function getAlertClass(type) {
    switch(type) {
        case 'success': return 'success';
        case 'error': return 'danger';
        case 'warning': return 'warning';
        case 'info':
        default: return 'info';
    }
}

function getToastIcon(type) {
    switch(type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-triangle';
        case 'warning': return 'exclamation-circle';
        case 'info':
        default: return 'info-circle';
    }
}

// Add CSS animations for toasts and map elements
const toastStyles = document.createElement('style');
toastStyles.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    @keyframes pulse {
        0% {
            transform: scale(1);
            opacity: 1;
        }
        50% {
            transform: scale(1.2);
            opacity: 0.7;
        }
        100% {
            transform: scale(1);
            opacity: 1;
        }
    }
`;
document.head.appendChild(toastStyles);

// Function to update the smart heatmap overlay
function updateHeatmap() {
    if (heatmapVisible && markers.length > 0) {
        // Recreate heatmap with updated data
        createSmartHeatmap();
        console.log('Smart heatmap updated with current data');
    }
}

// NEW: Expose key functions so that they are accessible from HTML event handlers
window.confirmDeleteReport = confirmDeleteReport;
window.showImageModal = showImageModal;
window.toggleReportStatus = toggleReportStatus;
window.deleteReport = deleteReport;
window.toggleHeatmap = toggleHeatmap;
window.centerMap = centerMap;
window.centerMapByIP = centerMapByIP;
window.createSmartHeatmap = createSmartHeatmap;
window.addUserLocationMarker = addUserLocationMarker;
window.updateDashboardInfo = updateDashboardInfo;
window.focusMapLocation = focusMapLocation;
window.handleError = handleError;
window.showToast = showToast;

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize refresh button
    const refreshBtn = document.getElementById('refresh-info-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            // Clear cache and reload
            reportCache.clear();
            currentPage = 1; // Reset to first page
            loadReports();
            showToast('Dashboard refreshed', 'success');
        });
    }
    
    // Initialize pagination controls
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const perPageSelect = document.getElementById('reports-per-page');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', goToPrevPage);
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', goToNextPage);
    }
    
    if (perPageSelect) {
        perPageSelect.addEventListener('change', async (e) => {
            reportsPerPage = parseInt(e.target.value);
            currentPage = 1; // Reset to first page when changing page size
            const currentFilters = getCurrentFilters();
            await loadReports(currentFilters, 1, true);
            showToast(`Changed to ${reportsPerPage} reports per page`, 'info');
        });
    }
    
    // Initialize keyboard shortcuts
    initializeKeyboardShortcuts();
    
    // Initialize visibility change handler
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Set up periodic cache cleanup
    setInterval(cleanupCache, 60000); // Clean every minute
    
    // Initialize error boundary
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    connectSSE(); // Start SSE connection on load
    requestBrowserNotificationPermission();
    preloadHighPrioritySound();
    
    // Load reports immediately when page loads
    loadReports();
});

// Keyboard shortcuts
function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + R: Refresh dashboard
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            reportCache.clear();
            loadReports();
        }
        
        // Ctrl/Cmd + F: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('report-search-input');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
        // Esc: Close modals
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal.show');
            modals.forEach(modal => {
                const modalInstance = bootstrap.Modal.getInstance(modal);
                if (modalInstance) modalInstance.hide();
            });
        }
    });
}

// Handle visibility change (tab switching)
function handleVisibilityChange() {
    if (document.hidden) {
        // Page is hidden, pause auto-refresh
        if (window.personalizer && window.personalizer.refreshTimer) {
            clearInterval(window.personalizer.refreshTimer);
        }
    } else {
        // Page is visible, resume auto-refresh
        if (window.personalizer && window.personalizer.settings.autoRefresh) {
            window.personalizer.setupAutoRefresh();
        }
    }
}

// Cache cleanup
function cleanupCache() {
    const now = Date.now();
    for (const [key, value] of reportCache.entries()) {
        if (now - value.timestamp > cacheExpiry) {
            reportCache.delete(key);
        }
    }
}

// Global error handlers
function handleGlobalError(event) {
    console.error('Global error:', event.error);
    handleError(event.error, 'global');
}

function handleUnhandledRejection(event) {
    console.error('Unhandled promise rejection:', event.reason);
    handleError(event.reason, 'promise');
}

// Performance monitoring
function measurePerformance(name, fn) {
    return async function(...args) {
        const start = performance.now();
        try {
            const result = await fn.apply(this, args);
            const end = performance.now();
            console.log(`${name} took ${end - start} milliseconds`);
            return result;
        } catch (error) {
            const end = performance.now();
            console.error(`${name} failed after ${end - start} milliseconds:`, error);
            throw error;
        }
    };
}

// Wrap expensive functions with performance monitoring
const originalLoadReports = loadReports;
loadReports = measurePerformance('loadReports', originalLoadReports);

// Utility functions for dashboard state management
const DashboardState = {
    currentView: 'normal',
    filters: {},
    sortConfig: { field: 'time', order: 'desc' },
    
    setView(view) {
        this.currentView = view;
        this.saveState();
    },
    
    setFilters(filters) {
        this.filters = { ...this.filters, ...filters };
        this.saveState();
    },
    
    setSortConfig(config) {
        this.sortConfig = config;
        this.saveState();
    },
    
    saveState() {
        localStorage.setItem('dashboard-state', JSON.stringify({
            currentView: this.currentView,
            filters: this.filters,
            sortConfig: this.sortConfig
        }));
    },
    
    loadState() {
        const saved = localStorage.getItem('dashboard-state');
        if (saved) {
            const state = JSON.parse(saved);
            this.currentView = state.currentView || 'normal';
            this.filters = state.filters || {};
            this.sortConfig = state.sortConfig || { field: 'time', order: 'desc' };
        }
    }
};

// Initialize dashboard state
DashboardState.loadState();

// NEW: Fallback to use IP geolocation to center the map
async function getLocationByIP() {
    try {
        const response = await fetch("https://ipapi.co/json/", { timeout: 5000 });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if(data.latitude && data.longitude && !data.error) {
            const ipLatLng = { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) };
            map.setView([ipLatLng.lat, ipLatLng.lng], 10); // Zoom level for region
            console.log("Using IP-based location:", data.city, data.country);
        } else {
            console.warn("IP geolocation unavailable, using default location");
            // Keep default Israel location
        }
    } catch (err) {
        console.warn("IP geolocation failed, using default location:", err.message);
        // Keep default Israel location
    } finally {
        loadReports();
    }
}

// Performance optimization functions
let reportCache = new Map();
let cacheExpiry = 5 * 60 * 1000; // 5 minutes

function getCachedReports(key) {
    const cached = reportCache.get(key);
    if (cached && Date.now() - cached.timestamp < cacheExpiry) {
        return cached.data;
    }
    return null;
}

function setCachedReports(key, data) {
    reportCache.set(key, {
        data: data,
        timestamp: Date.now()
    });
}

// Loading indicator functions
function showLoadingIndicator() {
    let indicator = document.getElementById('loading-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'loading-indicator';
        indicator.className = 'position-fixed top-50 start-50 translate-middle';
        indicator.innerHTML = `
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        `;
        indicator.style.zIndex = '9999';
        document.body.appendChild(indicator);
    }
    indicator.style.display = 'block';
}

function hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Debounced search function for better performance
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

// Enhanced error handling
function handleError(error, context = '') {
    console.error(`Error in ${context}:`, error);
    
    // Show user-friendly error message
    const errorMessages = {
        'Failed to load reports': 'Unable to load reports. Please check your connection and try again.',
        'Geocoding failed': 'Unable to locate address on map. Please verify the address.',
        'Network error': 'Network connection issue. Please check your internet connection.',
        'Failed to fetch': 'Connection failed. Please check your internet connection.',
        'TypeError': 'A technical error occurred. Please refresh the page.'
    };
    
    let message = errorMessages[error.message] || 'An unexpected error occurred.';
    
    // Add context-specific messages
    if (context === 'loadReports') {
        message += ' Click refresh to try again.';
    } else if (context === 'geocodeAddress') {
        message = 'Unable to locate some addresses on the map.';
    }
    
    showToast(message, 'error');
    
    // Log to analytics/monitoring service if available
    if (window.analytics && window.analytics.track) {
        window.analytics.track('error', {
            error: error.message,
            context: context,
            stack: error.stack
        });
    }
}

// Retry mechanism for failed requests
async function retryRequest(requestFn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await requestFn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
    }
}

// --- SSE Real-Time Notifications ---
let eventSource = null;
let sseReconnectTimer = null;

function connectSSE() {
    if (eventSource) {
        eventSource.close();
    }
    eventSource = new EventSource('/api/events/stream');
    
    eventSource.onopen = () => {
        console.log('[SSE] Connected to /api/events/stream');
        if (sseReconnectTimer) {
            clearTimeout(sseReconnectTimer);
            sseReconnectTimer = null;
        }
        // Optionally update UI to show LIVE
        if (window.setLiveIndicator) window.setLiveIndicator(true);
    };
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleIncomingEvent(data);
        } catch (err) {
            console.warn('[SSE] Failed to parse event:', event.data, err);
        }
    };
    
    eventSource.onerror = (err) => {
        console.error('[SSE] Connection error:', err);
        if (window.setLiveIndicator) window.setLiveIndicator(false);
        // Attempt to reconnect after delay
        if (!sseReconnectTimer) {
            sseReconnectTimer = setTimeout(connectSSE, 5000);
        }
    };
}

function handleIncomingEvent(data) {
    if (data.type === 'new_report' && data.report) {
        showNotificationInCenter({
            title: 'New Hazard Reported',
            body: `${normalizeHazardType(data.report.type).charAt(0).toUpperCase() + normalizeHazardType(data.report.type).slice(1).replace('_', ' ')} at ${data.report.location}`,
            time: data.report.time,
            onClick: () => {
                window.showNotificationCenter();
                focusMapLocation(data.report.location);
            }
        });
        showDesktopNotification({
            title: 'New Hazard Reported',
            body: `${normalizeHazardType(data.report.type).charAt(0).toUpperCase() + normalizeHazardType(data.report.type).slice(1).replace('_', ' ')} at ${data.report.location}`,
            report: data.report,
            onClick: () => {
                window.showNotificationCenter();
                focusMapLocation(data.report.location);
            }
        });
        if (HIGH_PRIORITY_TYPES.includes(normalizeHazardType(data.report.type))) {
            playHighPrioritySound();
        }
    } else if (data.type === 'status_update' && data.report) {
        showNotificationInCenter({
            title: 'Report Status Updated',
            body: `${normalizeHazardType(data.report.type).charAt(0).toUpperCase() + normalizeHazardType(data.report.type).slice(1).replace('_', ' ')} at ${data.report.location} is now ${data.report.status}`,
            time: data.report.time,
            onClick: () => {
                window.showNotificationCenter();
                focusMapLocation(data.report.location);
            }
        });
        showDesktopNotification({
            title: 'Report Status Updated',
            body: `${normalizeHazardType(data.report.type).charAt(0).toUpperCase() + normalizeHazardType(data.report.type).slice(1).replace('_', ' ')} at ${data.report.location} is now ${data.report.status}`,
            report: data.report,
            onClick: () => {
                window.showNotificationCenter();
                focusMapLocation(data.report.location);
            }
        });
    } else {
        // Fallback for other event types
        showNotificationInCenter({
            title: data.type || 'Event',
            body: data.message || '',
            time: data.time || Date.now()
        });
    }
}

// --- Notification Center UI ---
function createNotificationCenter() {
    let center = document.getElementById('notification-center');
    if (center) return center;
    center = document.createElement('div');
    center.id = 'notification-center';
    center.style.position = 'fixed';
    center.style.top = '20px';
    center.style.right = '20px';
    center.style.width = '340px';
    center.style.maxHeight = '60vh';
    center.style.overflowY = 'auto';
    center.style.zIndex = '10000';
    center.style.background = 'rgba(30, 30, 40, 0.98)';
    center.style.borderRadius = '12px';
    center.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)';
    center.style.padding = '0 0 8px 0';
    center.style.display = 'flex';
    center.style.flexDirection = 'column';
    center.style.gap = '0';
    center.innerHTML = `
        <div id="notification-center-header" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px 8px 16px;border-bottom:1px solid #444;">
            <span style="font-weight:bold;font-size:1.1em;color:#fff;letter-spacing:1px;">Notifications <span id="live-indicator" style="margin-left:8px;font-size:0.9em;"></span></span>
            <button id="notification-center-close" style="background:none;border:none;color:#fff;font-size:1.2em;cursor:pointer;">&times;</button>
        </div>
        <div id="notification-list" style="padding:8px 0 0 0;max-height:48vh;overflow-y:auto;"></div>
    `;
    document.body.appendChild(center);
    // Close button
    center.querySelector('#notification-center-close').onclick = () => {
        center.style.display = 'none';
    };
    // Show on click of bell icon (if you add one)
    window.showNotificationCenter = () => {
        center.style.display = 'flex';
    };
    return center;
}

function showNotificationInCenter(notification) {
    const center = createNotificationCenter();
    center.style.display = 'flex';
    const list = center.querySelector('#notification-list');
    if (!list) return;
    // Create notification item
    const item = document.createElement('div');
    item.className = 'notification-item';
    item.style.background = '#232946';
    item.style.color = '#fff';
    item.style.margin = '0 12px 8px 12px';
    item.style.padding = '10px 12px';
    item.style.borderRadius = '8px';
    item.style.boxShadow = '0 2px 8px #23294633';
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '12px';
    item.style.fontSize = '1em';
    item.style.cursor = 'pointer';
    item.innerHTML = `
        <div style="flex:1;">
            <div style="font-weight:bold;">${notification.title || 'New Event'}</div>
            <div style="font-size:0.95em;opacity:0.85;">${notification.body || ''}</div>
            <div style="font-size:0.85em;opacity:0.6;">${notification.time ? new Date(notification.time).toLocaleTimeString() : ''}</div>
        </div>
    `;
    // Optionally, click to focus map or show details
    if (notification.onClick) {
        item.onclick = notification.onClick;
    }
    list.prepend(item);
    // Limit to 10 notifications
    while (list.children.length > 10) {
        list.removeChild(list.lastChild);
    }
}

// --- LIVE Indicator Pulse ---
function setLiveIndicator(isLive) {
    const el = document.getElementById('live-indicator');
    if (!el) return;
    if (isLive) {
        el.innerHTML = '<span class="live-dot"></span>LIVE';
        el.classList.add('live-pulse');
    } else {
        el.innerHTML = '<span class="live-dot" style="background:#888"></span>OFFLINE';
        el.classList.remove('live-pulse');
    }
}
window.setLiveIndicator = setLiveIndicator;

// Add CSS for notification center and pulse
(function addNotificationCenterStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .live-dot {
            display:inline-block;width:10px;height:10px;border-radius:50%;background:#ff5252;margin-right:6px;vertical-align:middle;box-shadow:0 0 8px #ff5252;
        }
        .live-pulse .live-dot {
            animation: livePulse 1.2s infinite;
        }
        @keyframes livePulse {
            0% { box-shadow:0 0 0 0 #ff5252; }
            70% { box-shadow:0 0 0 8px rgba(255,82,82,0); }
            100% { box-shadow:0 0 0 0 #ff5252; }
        }
        #notification-center::-webkit-scrollbar { width: 8px; background: #232946; }
        #notification-center::-webkit-scrollbar-thumb { background: #444; border-radius: 8px; }
        .notification-item:hover { background: #2a2e3a; }
    `;
    document.head.appendChild(style);
})();

// --- Browser Notification Permission ---
let browserNotificationPermission = 'default';

function requestBrowserNotificationPermission() {
    if (!('Notification' in window)) {
        browserNotificationPermission = 'unsupported';
        return;
    }
    Notification.requestPermission().then(permission => {
        browserNotificationPermission = permission;
        console.log('[Notifications] Permission:', permission);
    });
}

function canShowDesktopNotification() {
    return browserNotificationPermission === 'granted';
}

function showDesktopNotification({ title, body, report, onClick }) {
    if (!canShowDesktopNotification()) return;
    const notification = new Notification(title, {
        body: body,
        icon: '/icon.png', // Use your app icon
        tag: report && report.id ? `report-${report.id}` : undefined
    });
    notification.onclick = function(event) {
        event.preventDefault();
        window.focus();
        if (onClick) onClick();
    };
}

// --- Sound Alerts for High-Priority Items ---
const HIGH_PRIORITY_TYPES = ['pothole', 'knocked'];
let highPriorityAudio = null;

function preloadHighPrioritySound() {
    if (!highPriorityAudio) {
        highPriorityAudio = document.createElement('audio');
        highPriorityAudio.src = 'https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae5b2.mp3'; // Free notification sound
        highPriorityAudio.preload = 'auto';
        highPriorityAudio.volume = 0.7;
        document.body.appendChild(highPriorityAudio);
        highPriorityAudio.style.display = 'none';
    }
}

function playHighPrioritySound() {
    if (highPriorityAudio) {
        highPriorityAudio.currentTime = 0;
        highPriorityAudio.play().catch(() => {});
    }
}

class CollapsibleDashboard {
  constructor() {
    this.panels = [];
    this.panelConfigs = [
      { id: 'realtime-overview', title: 'Real-time Overview', icon: 'fa-tachometer-alt', defaultOpen: true },
      { id: 'performance-metrics', title: 'Performance Metrics', icon: 'fa-chart-line', defaultOpen: false },
      { id: 'geographic-analytics', title: 'Geographic Analytics', icon: 'fa-map-marked-alt', defaultOpen: false },
      { id: 'team-performance', title: 'Team Performance', icon: 'fa-users', defaultOpen: false },
      { id: 'predictive-analytics', title: 'Predictive Analytics', icon: 'fa-brain', defaultOpen: false }
    ];
    this.initializePanels();
    this.loadSavedState();
  }

  initializePanels() {
    const container = document.querySelector('.dashboard-accordion');
    if (!container) return;
    this.panelConfigs.forEach(config => {
      const panelContent = container.querySelector(`[id$='${config.id}-content']`);
      if (!panelContent) return;
      const panel = panelContent.parentElement;
      if (config.defaultOpen) {
        panel.classList.add('active');
        panel.querySelector('.accordion-header').setAttribute('aria-expanded', 'true');
      } else {
        panel.classList.remove('active');
        panel.querySelector('.accordion-header').setAttribute('aria-expanded', 'false');
      }
      // Click handler
      panel.querySelector('.accordion-header').addEventListener('click', () => {
        this.togglePanel(config.id);
      });
    });
  }

  togglePanel(panelId) {
    const panelContent = document.getElementById(`${panelId}-content`);
    if (!panelContent) return;
    const panel = panelContent.parentElement;
    const isOpen = panel.classList.contains('active');
    if (isOpen) {
      this.closePanel(panelId);
    } else {
      this.openPanel(panelId);
    }
    this.saveState();
  }

  openPanel(panelId) {
    const panelContent = document.getElementById(`${panelId}-content`);
    if (!panelContent) return;
    const panel = panelContent.parentElement;
    panel.classList.add('active');
    panel.querySelector('.accordion-header').setAttribute('aria-expanded', 'true');
    // Lazy load content if not loaded
    if (!panel.dataset.loaded) {
      this.loadPanelContent(panelId);
      panel.dataset.loaded = 'true';
    }
  }

  closePanel(panelId) {
    const panelContent = document.getElementById(`${panelId}-content`);
    if (!panelContent) return;
    const panel = panelContent.parentElement;
    panel.classList.remove('active');
    panel.querySelector('.accordion-header').setAttribute('aria-expanded', 'false');
  }

  loadPanelContent(panelId) {
    const content = document.getElementById(`${panelId}-content`);
    // Placeholder: Replace with actual content loading logic
    content.innerHTML = `<div class='panel-loading'><div class='spinner-border text-primary' role='status'><span class='visually-hidden'>Loading...</span></div></div>`;
    // TODO: Add chart/component initialization here
  }

  saveState() {
    const openPanels = this.panelConfigs.filter(cfg => {
      const panelContent = document.getElementById(`${cfg.id}-content`);
      if (!panelContent) return false;
      const panel = panelContent.parentElement;
      return panel.classList.contains('active');
    }).map(cfg => cfg.id);
    localStorage.setItem('dashboard-open-panels', JSON.stringify(openPanels));
  }

  loadSavedState() {
    const openPanels = JSON.parse(localStorage.getItem('dashboard-open-panels') || '[]');
    this.panelConfigs.forEach(cfg => {
      const panelContent = document.getElementById(`${cfg.id}-content`);
      if (!panelContent) return;
      const panel = panelContent.parentElement;
      if (openPanels.includes(cfg.id)) {
        panel.classList.add('active');
        panel.querySelector('.accordion-header').setAttribute('aria-expanded', 'true');
      } else {
        panel.classList.remove('active');
        panel.querySelector('.accordion-header').setAttribute('aria-expanded', 'false');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.collapsibleDashboard = new CollapsibleDashboard();
});

document.addEventListener('DOMContentLoaded', () => {
  const sortBtn = document.getElementById('sort-dropdown-btn');
  const sortMenu = document.getElementById('sort-dropdown-menu');
  const sortLabel = document.getElementById('current-sort-label');
  const sortOptions = sortMenu ? sortMenu.querySelectorAll('.sort-option') : [];
  const sortSelect = document.getElementById('report-sort-select');

  if (sortBtn && sortMenu) {
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sortMenu.classList.toggle('active');
    });
    sortOptions.forEach(option => {
      option.addEventListener('click', () => {
        // עדכן תצוגה
        sortLabel.textContent = 'מיון לפי: ' + option.textContent;
        sortOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        sortMenu.classList.remove('active');
        // עדכן מיון בפועל
        if (sortSelect) {
          sortSelect.value = option.dataset.value;
          if (window.filterAndRenderReports) window.filterAndRenderReports();
        }
      });
    });
    // סגירה בלחיצה מחוץ
    document.addEventListener('click', (e) => {
      if (!sortBtn.contains(e.target) && !sortMenu.contains(e.target)) {
        sortMenu.classList.remove('active');
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // --- Hazard type dropdown logic ---
  const hazardBtn = document.getElementById('hazard-type-dropdown-btn');
  const hazardMenu = document.getElementById('hazard-type-dropdown-menu');
  const hazardLabel = document.getElementById('current-hazard-type-label');
  const hazardOptions = hazardMenu ? hazardMenu.querySelectorAll('.hazard-type-option') : [];

  if (hazardBtn && hazardMenu) {
    hazardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hazardMenu.classList.toggle('active');
    });
    hazardOptions.forEach(option => {
      option.addEventListener('click', () => {
        hazardLabel.textContent = option.textContent;
        hazardOptions.forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        hazardMenu.classList.remove('active');
        // עדכן סינון בפועל
        window.selectedHazardType = option.dataset.value;
        if (window.filterAndRenderReports) window.filterAndRenderReports();
      });
    });
    document.addEventListener('click', (e) => {
      if (!hazardBtn.contains(e.target) && !hazardMenu.contains(e.target)) {
        hazardMenu.classList.remove('active');
      }
    });
  }
});

// עדכון filterAndRenderReports לסינון לפי window.selectedHazardType באנגלית
const origFilterAndRender = window.filterAndRenderReports;
window.filterAndRenderReports = function() {
  let filtered = lastReports || [];
  const q = (document.getElementById('report-search-input')?.value || '').toLowerCase().trim();
  if (q) {
    filtered = filtered.filter(r =>
      (r.type && r.type.toLowerCase().includes(q)) ||
      (r.location && r.location.toLowerCase().includes(q)) ||
      (r.status && r.status.toLowerCase().includes(q)) ||
      (r.reportedBy && r.reportedBy.toLowerCase().includes(q))
    );
  }
  // סינון לפי סוג
  if (window.selectedHazardType && window.selectedHazardType !== '') {
    filtered = filtered.filter(r => normalizeHazardType(r.type) === window.selectedHazardType);
  }
  // מיון
  const sortSelect = document.getElementById('report-sort-select');
  if (sortSelect) {
    const [field, order] = sortSelect.value.split('-');
    filtered = sortReports(filtered, field === 'reportedBy' ? 'reportedBy' : field, order);
  }
  filtered = mergeDuplicateReports(filtered);
  renderReportBlocksModern(filtered);
  updateDashboardInfo(filtered);
  updateURLParams({ search: q, sort: sortSelect?.value });
};

// רנדר בלוקים מודרניים במקום שורות טבלה
function renderReportBlocksModern(reports) {
  const container = document.getElementById('reports-blocks-container');
  if (!container) return;
  container.innerHTML = '';
  reports.forEach(report => {
    const normalizedType = normalizeHazardType(report.type);
    const displayType = normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1).replace('_', ' ');
    const statusClass = getStatusBadgeClass(report.status);
    const block = document.createElement('div');
    block.className = 'report-block card-visit d-flex flex-column flex-md-row align-items-stretch gap-3 p-3 mb-3';
    block.innerHTML = `
      <div class="report-block-image-wrap d-flex justify-content-center align-items-center mb-2 mb-md-0" style="min-width:96px;">
        <img src="${report.image || ''}" alt="Hazard image" class="report-block-image" style="width:96px;height:96px;object-fit:cover;border-radius:14px;box-shadow:0 2px 8px #b0b8c122;border:1.5px solid #b0b8c1;background:#fff;">
      </div>
      <div class="report-block-info flex-grow-1 d-flex flex-column justify-content-between">
        <div class="report-block-header d-flex flex-column flex-md-row align-items-md-center gap-2 mb-2">
          <div class="d-flex align-items-center gap-2">
            <span class="badge ${statusClass}" style="font-size:1rem;">${report.status || ''}</span>
            <span class="fw-bold report-block-title" style="color:#3a506b;font-size:1.13rem;"><i class="fas fa-exclamation-triangle me-1"></i>${displayType}</span>
          </div>
        </div>
        <div class="report-block-details-list d-flex flex-wrap gap-3 mb-2 pb-2 border-bottom" style="font-size:0.98rem;">
          <span title="Location" class="d-flex align-items-center gap-1 text-truncate" style="max-width:180px;"><i class="fas fa-map-marker-alt"></i> ${report.location || ''}</span>
          <span title="Date" class="d-flex align-items-center gap-1"><i class="fas fa-calendar-alt"></i> ${report.time ? new Date(report.time).toLocaleString() : ''}</span>
          <span title="Reported By" class="d-flex align-items-center gap-1"><i class="fas fa-user"></i> ${report.reportedBy || ''}</span>
        </div>
        <div class="report-block-actions d-flex gap-2 flex-wrap mt-2">
          <button class="btn btn-outline-primary btn-sm" onclick="openEditReportModal(${JSON.stringify(report).replace(/\"/g, '&quot;')})"><i class="fas fa-info-circle"></i> Details</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="showImageModal('${report.image}')" ${!report.image ? 'disabled' : ''}><i class="fas fa-image"></i> Image</button>
          <button class="btn btn-outline-warning btn-sm" onclick="openEditReportModal(${JSON.stringify(report).replace(/\"/g, '&quot;')})"><i class="fas fa-edit"></i> Edit</button>
          <button class="btn btn-outline-danger btn-sm" onclick="confirmDeleteReport('${report.id}')"><i class="fas fa-trash"></i> Delete</button>
          <button class="btn btn-outline-${report.status === 'Resolved' ? 'danger' : 'success'} btn-sm" onclick="toggleReportStatus('${report.id}', '${report.status}')">${report.status === 'Resolved' ? 'Mark Open' : 'Mark Resolved'}</button>
        </div>
      </div>
    `;
    // לחיצה על כל הבלוק תפתח עריכה (לא על כפתור תמונה)
    block.addEventListener('click', (e) => {
      if (e.target.closest('.btn-outline-secondary')) return;
      openEditReportModal(report);
    });
    container.appendChild(block);
  });
}
