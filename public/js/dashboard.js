let map;

const hazardTypes = [
    'Alligator Crack', 'Block Crack', 'Construction Joint Crack', 'Crosswalk Blur',
    'Lane Blur', 'Longitudinal Crack', 'Manhole', 'Patch Repair', 'Pothole',
    'Transverse Crack', 'Wheel Mark Crack'
];

function initMap() {
    const israel = { lat: 31.7683, lng: 35.2137 };
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 8,
        center: israel,
    });

    new google.maps.Marker({
        position: israel,
        map: map,
        title: "Israel",
    });

    // נטען דיווחים רק אחרי שהמפה מוכנה
    loadReports();
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

// יצירת כפתור להעלאת סוגי המפגעים
document.getElementById('toggle-hazard-types-btn').addEventListener('click', () => {
    const container = document.getElementById('hazard-types-container');
    container.style.display = (container.style.display === 'none') ? 'block' : 'none';
});

// הפעלת יצירת תיבות סימון עם טעינת העמוד
window.onload = generateHazardCheckboxes;

// פותח את מודל התמונה
function openModal(imageUrl) {
    const modal = document.getElementById("image-modal");
    const modalImage = document.getElementById("modal-image");
    modal.style.display = "flex";
    modalImage.src = imageUrl;
}

function closeModal() {
    document.getElementById("image-modal").style.display = "none";
}

window.addEventListener("click", (event) => {
    const modal = document.getElementById("image-modal");
    if (event.target === modal) {
        closeModal();
    }
});

// ממיר כתובת לקואורדינטות ומוסיף סמן
async function geocodeAddress(address, report) {
    const apiKey = "AIzaSyAXxZ7niDaxuyPEzt4j9P9U0kFzKHO9pZk";
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

    try {
        const response = await fetch(geocodeUrl);
        const data = await response.json();

        if (data.status === "OK") {
            const location = data.results[0].geometry.location;
            const marker = new google.maps.Marker({
                map: map,
                position: location,
                title: address,
            });

            marker.addListener("click", () => {
                showReportDetails(report);
                map.setCenter(location);
                map.panTo(location);
                map.setZoom(14); // משנה את הזום למיקום של הדיווח
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
            console.error("Geocode error:", data.status);
        }
    } catch (error) {
        console.error("Error with Geocoding API:", error);
    }
}

// טוען דיווחים מהשרת ומכניס לטבלה ולמפה
async function loadReports(filters = {}) {
    try {
        // הוספת הפילטרים לשאילתה
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
            console.error("Error fetching reports:", response.statusText);
            return;
        }

        const reports = await response.json();
        const tbody = document.getElementById('reports-body');
        tbody.innerHTML = '';

        reports.forEach(report => {
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
                // על הלחיצה על הכתובת, נזיז את המפה לאותו מיקום
                geocodeAddress(report.location, report);
            });

            tbody.appendChild(row);

            if (report.location) {
                geocodeAddress(report.location, report);
            }
        });
    } catch (error) {
        console.error("Error loading reports:", error);
        alert("שגיאה בטעינת הדיווחים: " + error.message);
    }
}


// מאזין לטעינת המסמך - רק בשביל לחצנים
document.addEventListener("DOMContentLoaded", () => {
    const filters = {};

    const clearBtn = document.getElementById('clear-filters-btn');
    const searchBtn = document.getElementById('search-btn');
    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
    const toggleReportsBtn = document.getElementById('toggleBtn');
    const toggleMapBtn = document.getElementById('toggleMapBtn');
    const reportsContainer = document.getElementById('reports');
    const mapContainer = document.getElementById('map');
    const filtersPanel = document.getElementById('filters');

    
    // פתיחה/סגירה של הפאנל
    toggleFiltersBtn.addEventListener('click', () => {
        const isHidden = getComputedStyle(filtersPanel).display === 'none';
        filtersPanel.style.display = isHidden ? 'block' : 'none';
    });
    
    // מאזין לחיפוש
    searchBtn.addEventListener('click', () => {
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

    clearBtn.addEventListener('click', () => {
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

    // מפת / דיווחים - תצוגה מתחלפת
    toggleMapBtn.addEventListener('click', () => {
        const isFull = mapContainer.style.height === '100vh';
        mapContainer.style.height = isFull ? '60vh' : '100vh';
        mapContainer.style.display = 'block';
        reportsContainer.style.display = isFull ? 'block' : 'none';
        toggleMapBtn.textContent = isFull ? 'Maximize Map' : 'Minimize Map';
        toggleReportsBtn.style.display = isFull ? 'inline' : 'none';
    });

    toggleReportsBtn.addEventListener('click', () => {
        const isFull = reportsContainer.style.height === '100vh';
        reportsContainer.style.height = isFull ? '40vh' : '100vh';
        reportsContainer.style.display = 'block';
        mapContainer.style.display = isFull ? 'block' : 'none';
        toggleReportsBtn.textContent = isFull ? 'Maximize Reports' : 'Minimize Reports';
        toggleMapBtn.style.display = isFull ? 'inline' : 'none';
    });

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
});


function showReportDetails(report) {
    document.getElementById("sidebar-hazard-id").textContent = report.id;
    document.getElementById("sidebar-type").textContent = report.type;
    document.getElementById("sidebar-location").textContent = report.location;
    document.getElementById("sidebar-time").textContent = new Date(report.time).toLocaleString();
    document.getElementById("sidebar-status").textContent = report.status;
    document.getElementById("sidebar-user").textContent = report.reportedBy;
    document.getElementById("sidebar-image").src = report.image;
    document.getElementById("report-sidebar").style.display = "block";
}

function closeSidebar() {
    const sidebar = document.getElementById("report-sidebar");
    sidebar.style.display = "none";
  }
