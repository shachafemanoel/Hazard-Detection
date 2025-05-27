let map;
let markers = [];
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
        scale: 16 // Increased size for better visibility
    };
}

// Global sort state
let currentSort = { field: 'time', order: 'desc' };

// Always use dark mode for the map
function initMap() {
    const israel = { lat: 31.7683, lng: 35.2137 };
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 8,
        center: israel,
        styles: darkMapStyle, // Always dark mode
    });

    new google.maps.Marker({
        position: israel,
        map: map,
        title: "Israel",
    });

    // Add the legend to the map (position: RIGHT_BOTTOM)
    const legend = addMapLegend();
    map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(legend);

    // נטען דיווחים רק אחרי שהמפה מוכנה
    loadReports();
}

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
    if (!address || !report) {
        console.warn('Invalid address or report data');
        return;
    }
    const apiKey = "AIzaSyAXxZ7niDaxuyPEzt4j9P9U0kFzKHO9pZk";
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    try {
        const response = await fetch(geocodeUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.status === "OK" && data.results && data.results[0]) {
            const location = data.results[0].geometry.location;
            const marker = new google.maps.Marker({
                map: map,
                position: location,
                title: address,
                icon: getMarkerIcon(report.type)
            });
            marker.report = report;
            markers.push(marker);
            // Updated InfoWindow: now shows report type, id, time and status, plus a thumbnail
            const infowindow = new google.maps.InfoWindow({
                content: `<div>
                    <strong>${report.type}</strong><br>
                    ID: ${report.id}<br>
                    Time: ${new Date(report.time).toLocaleString()}<br>
                    Status: ${report.status}<br>
                    <img src="${report.image}" alt="thumb" style="width:50px; height:50px; cursor:pointer;" onclick="openModal('${report.image}')"><br>
                    <a href="javascript:openReportModal()">More info</a>
                </div>`
            });
            marker.addListener("click", () => {
                currentMarker = marker;
                infowindow.open(map, marker);
                map.setCenter(location);
                map.setZoom(14);
            });
            // הזזת המפה למיקום הנבחר אם נלחץ מיקום בטבלה
            const locationLink = document.querySelector(`.location-link[data-location="${address}"]`);
            if (locationLink) {
                locationLink.addEventListener('click', () => {
                    map.setCenter(location);
                    map.setZoom(14); // זום־אין למיקום
                });
            }
        } else {
            console.error("Geocoding failed:", data.status, data.error_message);
        }
    } catch (error) {
        console.error("Geocoding error:", error);
    }
}

// Add a global function to open the report details modal from a marker
function openReportModal() {
    if (currentMarker && currentMarker.report) {
        showReportDetails(currentMarker.report);
    }
}

// פונקציה לבדיקת תקינות תמונה באמצעות fetch
async function isValidImage(url) {
    if (!url) {
        return false; // אם אין URL, התמונה לא תקינה
    }
    try {
        const response = await fetch(url, { method: 'HEAD' });
        // בדוק אם הבקשה הצליחה (סטטוס 2xx) והאם ה-Content-Type הוא של תמונה
        return response.ok && response.headers.get('Content-Type')?.startsWith('image/');
    } catch (error) {
        // שגיאת רשת או בעיה אחרת (למשל CORS אם התמונה מדומיין אחר ללא הגדרות מתאימות)
        console.warn(`Could not validate image ${url}:`, error);
        return false;
    }
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
        clearMarkers();
        document.getElementById('reports-body').innerHTML = '<tr><td colspan="7" class="text-center">Loading reports...</td></tr>';
        
        const queryParams = new URLSearchParams(filters).toString();
        const response = await fetch(`/api/reports?${queryParams}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            document.getElementById('reports-body').innerHTML = `<tr><td colspan="7" class="text-danger text-center">Error loading reports: ${response.status} ${response.statusText}. ${errorText}</td></tr>`;
            return;
        }

        const reports = await response.json();
        const tbody = document.getElementById('reports-body');
        tbody.innerHTML = '';

        // שלב 1: בדיקת תקינות כל התמונות במקביל
        const imageValidationPromises = reports.map(report => 
            isValidImage(report.image).then(isValid => ({ report, isValid }))
        );
        
        const validationResults = await Promise.all(imageValidationPromises);

        // שלב 2: סינון הדוחות כך שרק אלו עם תמונות תקינות יישארו
        let validReports = validationResults.filter(result => result.isValid).map(result => result.report);

        // מיון לפי בחירת המשתמש
        validReports = sortReports(validReports, currentSort.field, currentSort.order);

        if (validReports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No reports found matching your criteria.</td></tr>';
            // Removed analytics update; only visual info remains.
            return;
        }

        validReports.forEach(report => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${report.id}</td>
                <td>${report.type}</td>
                <td><span class="location-link" data-location="${report.location}">${report.location}</span></td>
                <td>${new Date(report.time).toLocaleString()}</td>
                <td><img src="${report.image}" alt="image" width="50" style="cursor:pointer;" loading="lazy"></td>
                <td>${report.status}</td>
                <td>${report.reportedBy}</td>
            `;

            const img = row.querySelector('img');
            img.addEventListener('click', () => openModal(report.image));

            const locationLink = row.querySelector('.location-link');
            locationLink.addEventListener('click', () => {
                geocodeAddress(report.location, report);
            });

            tbody.appendChild(row);

            if (report.location) {
                geocodeAddress(report.location, report);
            }
        });

        // Removed: updateAnalytics(validReports);
    } catch (error) {
        console.error("Error loading reports:", error);
        document.getElementById('reports-body').innerHTML = `<tr><td colspan="7" class="text-danger text-center">Failed to load reports: ${error.message}</td></tr>`;
    }
}

// מאזין לטעינת המסמך - רק בשביל לחצנים
document.addEventListener("DOMContentLoaded", () => {
    // Cache DOM elements and check existence
    const elements = {
        reportDetailsModal: document.getElementById('reportDetailsModal'),
        filtersPanel: document.getElementById('filters'),
        clearBtn: document.getElementById('clear-filters-btn'),
        searchBtn: document.getElementById('search-btn'),
        toggleFiltersBtn: document.getElementById('toggle-filters-btn'),
        toggleReportsBtn: document.getElementById('toggleReportsBtn'),
        toggleMapBtn: document.getElementById('toggleMapBtn'),
        viewToggleContainer: document.getElementById('view-toggle-container'),
        hazardTypesContainer: document.getElementById('hazard-types-container'),
        toggleHazardTypesBtn: document.getElementById('toggle-hazard-types-btn'),
        closeModalBtn: document.getElementById('close-modal'),
        reportsDiv: document.getElementById('reports'),
        dashboardContainer: document.getElementById('dashboard-container'),
        topButtons: document.getElementById('top-buttons'),
        imageModal: document.getElementById('image-modal'),
        sortSelect: document.getElementById('sort-select')
    };

    // Check if all required elements exist
    const missingElements = Object.entries(elements)
        .filter(([key, element]) => !element)
        .map(([key]) => key);

    if (missingElements.length > 0) {
        console.error('Missing DOM elements:', missingElements);
        return; // Exit if critical elements are missing
    }

    // Initialize Bootstrap modal if element exists
    if (elements.reportDetailsModal) {
        reportDetailsBootstrapModal = new bootstrap.Modal(elements.reportDetailsModal);
    }

    // Generate hazard type checkboxes
    generateHazardCheckboxes();

    // Event Listeners
    if (elements.closeModalBtn) {
        elements.closeModalBtn.addEventListener('click', closeModal);
    }

    if (elements.toggleHazardTypesBtn && elements.hazardTypesContainer) {
        elements.toggleHazardTypesBtn.addEventListener('click', () => {
            elements.hazardTypesContainer.classList.toggle('d-none');
        });
    }

    // Toggle filters panel with error handling
    elements.toggleFiltersBtn.addEventListener('click', () => {
        try {
            elements.filtersPanel.classList.toggle('d-none');
            const icon = elements.toggleFiltersBtn.querySelector('i');
            const span = elements.toggleFiltersBtn.querySelector('span');
            if (!span) return;
            
            span.textContent = elements.filtersPanel.classList.contains('d-none') 
                ? 'Show Filters' 
                : 'Hide Filters';
        } catch (error) {
            console.error('Error toggling filters:', error);
        }
    });
    
    // מאזין לחיפוש
    elements.searchBtn.addEventListener('click', () => {
        // איפוס
        Object.keys(filters).forEach(key => delete filters[key]);

        // סוגי מפגעים
        const hazardTypes = Array.from(document.querySelectorAll('#hazard-types-container input:checked'))
            .map(cb => cb.value);
        if (hazardTypes.length > 0) {
            filters.hazardType = hazardTypes;
        }

        // מיקום
        const locationVal = document.getElementById('location').value.trim();
        if (locationVal) filters.location = locationVal;

        // מילות מפתח - פילטר חדש
        const keywordsVal = document.getElementById('keywords').value.trim();
        if (keywordsVal) filters.keywords = keywordsVal;

        // תאריכים
        const startDateVal = document.getElementById('start-date').value;
        const endDateVal = document.getElementById('end-date').value;
        if (startDateVal) filters.startDate = startDateVal;
        if (endDateVal) filters.endDate = endDateVal;

        // סטטוס
        const statusVal = document.getElementById('status').value;
        if (statusVal) filters.status = statusVal;

        // מדווח
        const reporterVal = document.getElementById('reported-by').value.trim();
        if (reporterVal) filters.reportedBy = reporterVal;

        // שליחת בקשה
        loadReports(filters);
    });

    elements.clearBtn.addEventListener('click', () => {
        // איפוס
        document.getElementById('location').value = '';
        document.getElementById('start-date').value = '';
        document.getElementById('end-date').value = '';
        document.getElementById('status').value = '';
        document.getElementById('reported-by').value = '';

        // איפוס תיבות סימון
        const checkboxes = document.querySelectorAll('#hazard-types-container input');
        checkboxes.forEach(cb => cb.checked = false);

        // איפוס פילטרים
        Object.keys(filters).forEach(key => delete filters[key]);

        // טוען מחדש את הדיווחים
        loadReports();
    });

    // Map / Reports view toggle logic
    elements.toggleMapBtn.addEventListener('click', () => {
        if (elements.viewToggleContainer.classList.contains('map-maximized')) {
            elements.viewToggleContainer.className = 'normal-view'; // Switch to normal view
            elements.toggleMapBtn.innerHTML = '<i class="fas fa-expand-alt"></i> <span>Maximize Map</span>';
            elements.toggleReportsBtn.style.display = 'inline-flex'; // Or 'block' or '' depending on original display
        } else {
            elements.viewToggleContainer.className = 'map-maximized'; // Maximize map
            elements.toggleMapBtn.innerHTML = '<i class="fas fa-compress-alt"></i> <span>Show All</span>';
            elements.toggleReportsBtn.style.display = 'none';
        }
        google.maps.event.trigger(map, 'resize'); // Ensure map resizes correctly
    });

    elements.toggleReportsBtn.addEventListener('click', () => {
        if (elements.viewToggleContainer.classList.contains('reports-maximized')) {
            elements.viewToggleContainer.className = 'normal-view'; // Switch to normal view
            elements.toggleReportsBtn.innerHTML = '<i class="fas fa-table"></i> <span>Maximize Reports</span>';
            elements.toggleMapBtn.style.display = 'inline-flex'; // Or 'block' or ''
        } else {
            elements.viewToggleContainer.className = 'reports-maximized'; // Maximize reports
            elements.toggleReportsBtn.innerHTML = '<i class="fas fa-compress-alt"></i> <span>Show All</span>';
            elements.toggleMapBtn.style.display = 'none';
        }
        // No need to resize map if it's hidden, but good practice if it might become visible
        if (elements.viewToggleContainer.classList.contains('normal-view')) {
            google.maps.event.trigger(map, 'resize');
        }
    });

    // Initial button states based on view (if not normal-view by default)
    if (elements.viewToggleContainer.classList.contains('normal-view')) {
        elements.toggleMapBtn.innerHTML = '<i class="fas fa-expand-alt"></i> <span>Maximize Map</span>';
        elements.toggleReportsBtn.innerHTML = '<i class="fas fa-table"></i> <span>Maximize Reports</span>';
        elements.toggleReportsBtn.style.display = 'inline-flex';
        elements.toggleMapBtn.style.display = 'inline-flex';
    }

    // Ensure filter button text is correct on load
    elements.toggleFiltersBtn.querySelector('span').textContent = elements.filtersPanel.classList.contains('d-none') ? 'Show Filters' : 'Hide Filters';
    
    // הגבלת תאריך סיום לפי תאריך התחלה והפוך
    document.getElementById('start-date').addEventListener('change', (e) => {
        const startDate = e.target.value;
        const endDateInput = document.getElementById('end-date');
        endDateInput.min = startDate;
    });

    document.getElementById('end-date').addEventListener('change', (e) => {
        const endDate = e.target.value;
        const startDateInput = document.getElementById('start-date');
        startDateInput.max = endDate;
    });

    // Remove duplicate sort-dropdown block if already created.
    if (elements.reportsDiv && !document.getElementById('sort-select')) {
        const sortDiv = document.createElement('div');
        sortDiv.className = 'mb-2 d-flex align-items-center gap-2';
        sortDiv.innerHTML = `
            <label for="sort-select" class="form-label mb-0">Sort by:</label>
            <select id="sort-select" class="form-select form-select-sm w-auto">
                <option value="time-desc">Date: Newest First</option>
                <option value="time-asc">Date: Oldest First</option>
                <option value="type-asc">Hazard Type: A-Z</option>
                <option value="type-desc">Hazard Type: Z-A</option>
                <option value="status-asc">Status: A-Z</option>
                <option value="status-desc">Status: Z-A</option>
                <option value="location-asc">Location: A-Z</option>
                <option value="location-desc">Location: Z-A</option>
                <option value="reportedBy-asc">Reported By: A-Z</option>
                <option value="reportedBy-desc">Reported By: Z-A</option>
            </select>
        `;
        elements.reportsDiv.prepend(sortDiv);
    }

    // עיצוב דינמי - שדרוג כותרות, רקעים, כפתורים
    // שדרוג כותרת ראשית
    if (elements.dashboardContainer) {
        elements.dashboardContainer.classList.add('shadow-lg', 'rounded', 'bg-dark', 'bg-gradient', 'p-4');
        const h1 = elements.dashboardContainer.querySelector('h1');
        if (h1) {
            h1.classList.add('display-4', 'fw-bold', 'text-primary', 'mb-4', 'text-center', 'text-shadow');
        }
    }

    // שדרוג כפתורי הטופ
    if (elements.topButtons) {
        elements.topButtons.classList.add('justify-content-center', 'mb-4');
        elements.topButtons.querySelectorAll('button').forEach(btn => {
            btn.classList.add('btn-lg', 'shadow', 'rounded-pill');
        });
    }

    // שדרוג תיבת הפילטרים
    const filtersPanel = document.getElementById('filters');
    if (filtersPanel) {
        filtersPanel.classList.add('bg-secondary', 'bg-opacity-75', 'shadow', 'rounded-4', 'border-0');
        const h3 = filtersPanel.querySelector('h3');
        if (h3) h3.classList.add('fw-bold', 'text-info', 'mb-4');
        filtersPanel.querySelectorAll('label').forEach(label => label.classList.add('fw-semibold', 'text-light'));
        filtersPanel.querySelectorAll('input,select').forEach(input => input.classList.add('shadow-sm'));
    }

    // שדרוג טבלת הדוחות
    if (elements.reportsDiv) {
        elements.reportsDiv.classList.add('bg-dark', 'bg-gradient', 'rounded-4', 'shadow', 'p-3');
        const h2 = elements.reportsDiv.querySelector('h2');
        if (h2) h2.classList.add('fw-bold', 'text-warning', 'mb-4', 'text-center');
        const table = elements.reportsDiv.querySelector('table');
        if (table) table.classList.add('table-dark', 'align-middle', 'rounded-4', 'overflow-hidden');
    }

    // שדרוג מודל תמונה
    if (elements.imageModal) {
        elements.imageModal.classList.add('bg-dark', 'bg-opacity-75', 'backdrop-blur');
        const modalImg = document.getElementById('modal-image');
        if (modalImg) modalImg.classList.add('rounded', 'shadow-lg', 'border', 'border-3', 'border-primary');
    }

    // שדרוג מודל פרטי דיווח
    const reportDetailsModal = document.getElementById('reportDetailsModal');
    if (reportDetailsModal) {
        reportDetailsModal.querySelector('.modal-content').classList.add('bg-dark', 'text-light', 'rounded-4', 'shadow-lg');
        reportDetailsModal.querySelector('.modal-header').classList.add('border-0', 'bg-primary', 'bg-gradient', 'text-light');
        reportDetailsModal.querySelector('.modal-title').classList.add('fw-bold');
        reportDetailsModal.querySelector('.modal-footer').classList.add('border-0', 'bg-secondary', 'bg-opacity-50');
    }

    // שדרוג dropdown של המיון
    if (elements.sortSelect) {
        elements.sortSelect.classList.add('shadow', 'rounded-pill', 'bg-dark', 'text-light', 'border-primary');
    }
});


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

    if (reportDetailsBootstrapModal) {
        reportDetailsBootstrapModal.show();
    }
}
// Manual hideReportDetailsModal and its listeners are removed as Bootstrap handles dismissal.

function toggleSidebar() {
	sidebar.classList.toggle('open');
	mainContent.classList.toggle('shifted');
	// UI Enhancement: add smooth opacity transition to sidebar
	sidebar.style.transition = 'left 0.3s ease, opacity 0.3s ease';
	sidebar.style.opacity = sidebar.classList.contains('open') ? '1' : '0.9';
}

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
    legend.innerHTML = '<h4 style="margin-top:0;">מקרא</h4>';
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
