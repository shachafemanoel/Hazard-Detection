let map;
let markers = [];

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

            markers.push(marker);

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
        clearMarkers();
        
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

        if (reports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No reports found.</td></tr>';
            return;
        }

        reports.forEach(report => {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer'; // רמז ללחיצה

            // הצגת פרטים חיוניים בטבלה
            row.innerHTML = `
                <td>${report.id}</td>
                <td>${report.type}</td>
                <td>
                    ${report.location_note === 'GPS' && report.geo_data ?
                        `${parseFloat(report.geo_data.lat).toFixed(3)}, ${parseFloat(report.geo_data.lng).toFixed(3)}` :
                        (report.address || report.location || report.location_note || 'N/A')
                    }
                </td>
                <td>${new Date(report.time).toLocaleDateString()}</td>
                <td><img src="${report.image}" alt="${report.type}" style="width:50px; height:50px; object-fit:cover;" class="img-thumbnail"></td>
                <td></td> <!-- Placeholder for status badge -->
                <td class="d-none d-md-table-cell">${report.locationNote || 'N/A'}</td>
                <td>${report.reportedBy || 'N/A'}</td>
            `;

            // הוספת Badge לסטטוס
            const statusCell = row.cells[5]; // התא השישי (אינדקס 5)
            const statusBadge = document.createElement('span');
            statusBadge.classList.add('badge');
            switch (report.status.toLowerCase()) {
                case 'new':
                    statusBadge.classList.add('bg-primary');
                    break;
                case 'in progress':
                    statusBadge.classList.add('bg-warning', 'text-dark');
                    break;
                case 'resolved':
                    statusBadge.classList.add('bg-success');
                    break;
                default:
                    statusBadge.classList.add('bg-secondary');
            }
            statusBadge.textContent = report.status;
            statusCell.appendChild(statusBadge);

            // Event listener לתמונה המוקטנת לפתיחת מודל
            const img = row.querySelector('img');
            img.addEventListener('click', (event) => {
                event.stopPropagation(); // מניעת פתיחת הסיידבר בלחיצה על התמונה
                openModal(report.image);
            });

            // Event listener ללחיצה על שורה לפתיחת הסיידבר
            row.addEventListener('click', () => {
                showReportDetails(report);
            });

            // Event listener לקישור המיקום (אם עדיין רלוונטי לאחר שינוי התצוגה)
            const locationLink = row.querySelector('.location-link');
            if (locationLink) { // אם עדיין יש לך אלמנט עם קלאס זה
                locationLink.addEventListener('click', (event) => {
                    event.stopPropagation(); // מניעת פתיחת הסיידבר
                    geocodeAddress(report.location || (report.geo_data ? `${report.geo_data.lat},${report.geo_data.lng}` : report.location_note), report);
                });
            }

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
    // const toggleFiltersBtn = document.getElementById('toggle-filters-btn'); // Bootstrap מטפל בזה
    const toggleReportsBtn = document.getElementById('toggleReportsBtn'); // שימוש ב-ID המעודכן
    const toggleMapBtn = document.getElementById('toggleMapBtn');
    const reportsContainer = document.getElementById('reports-container'); // שימוש ב-ID המעודכן של עוטף הדוחות
    const mapContainer = document.getElementById('map');
    // const filtersPanel = document.getElementById('filtersCollapse'); // Bootstrap מטפל בזה

    
    // פתיחה/סגירה של הפאנל
    // Bootstrap מטפל בזה דרך data-bs-toggle="collapse" בכפתור toggle-filters-btn
    // אם רוצים לבצע פעולות נוספות בעת פתיחה/סגירה, אפשר להאזין לאירועים של Bootstrap Collapse
    // const filtersPanelElement = document.getElementById('filtersCollapse');
    // if (filtersPanelElement) {
    //     filtersPanelElement.addEventListener('show.bs.collapse', function () {
    //         // פעולה כאשר הפילטרים נפתחים
    //     });
    //     filtersPanelElement.addEventListener('hide.bs.collapse', function () {
    //         // פעולה כאשר הפילטרים נסגרים
    //     });
    // }
    
    // מאזין לחיפוש
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            // איפוס
            Object.keys(filters).forEach(key => delete filters[key]);

            // סוגי מפגעים
            const hazardTypesCheckboxes = document.querySelectorAll('#hazard-types-container input:checked');
            const selectedHazardTypes = Array.from(hazardTypesCheckboxes).map(cb => cb.value);
            if (selectedHazardTypes.length > 0) {
                filters.hazardType = selectedHazardTypes.join(','); // שליחה כמחרוזת מופרדת בפסיקים
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
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
        // איפוס
            const locationInput = document.getElementById('location');
            if (locationInput) locationInput.value = '';
            const startDateInput = document.getElementById('start-date');
            if (startDateInput) startDateInput.value = '';
            const endDateInput = document.getElementById('end-date');
            if (endDateInput) endDateInput.value = '';
            const statusSelect = document.getElementById('status');
            if (statusSelect) statusSelect.value = '';
            const reportedByInput = document.getElementById('reported-by');
            if (reportedByInput) reportedByInput.value = '';

            // איפוס תיבות סימון
            const checkboxes = document.querySelectorAll('#hazard-types-container input');
            checkboxes.forEach(cb => cb.checked = false);

            // איפוס פילטרים
            Object.keys(filters).forEach(key => delete filters[key]);

            // טוען מחדש את הדיווחים
            loadReports();
        });
    }

    // מפת / דיווחים - תצוגה מתחלפת
    if (toggleMapBtn && mapContainer && reportsContainer && toggleReportsBtn) {
        toggleMapBtn.addEventListener('click', () => {
            const mapCol = mapContainer.closest('.col-lg-7'); // מציאת עמודת המפה
            const reportsCol = reportsContainer.closest('.col-lg-5'); // מציאת עמודת הדוחות

            if (mapCol.classList.contains('col-lg-12')) { // אם המפה ממוקסמת
                mapCol.classList.remove('col-lg-12');
                mapCol.classList.add('col-lg-7');
                reportsCol.style.display = 'block';
                mapContainer.style.height = '60vh'; // גובה ברירת מחדל
                toggleMapBtn.textContent = 'Maximize Map';
            } else { // אם המפה לא ממוקסמת
                mapCol.classList.remove('col-lg-7');
                mapCol.classList.add('col-lg-12');
                reportsCol.style.display = 'none';
                mapContainer.style.height = '85vh'; // גובה מוגדל
                toggleMapBtn.textContent = 'Minimize Map';
            }
            // יש לרענן את המפה של גוגל לאחר שינוי גודל הקונטיינר שלה
            if (map) google.maps.event.trigger(map, 'resize');
        });
    }

    if (toggleReportsBtn && reportsContainer && mapContainer && toggleMapBtn) {
        toggleReportsBtn.addEventListener('click', () => {
            const mapCol = mapContainer.closest('.col-lg-7');
            const reportsCol = reportsContainer.closest('.col-lg-5');

            if (reportsCol.classList.contains('col-lg-12')) {
                reportsCol.classList.remove('col-lg-12');
                reportsCol.classList.add('col-lg-5');
                mapCol.style.display = 'block';
                toggleReportsBtn.textContent = 'Maximize Reports';
            } else {
                reportsCol.classList.remove('col-lg-5');
                reportsCol.classList.add('col-lg-12');
                mapCol.style.display = 'none';
                toggleReportsBtn.textContent = 'Minimize Reports';
            }
             // יש לרענן את המפה של גוגל אם היא חוזרת להיות מוצגת
            if (map && mapCol.style.display === 'block') google.maps.event.trigger(map, 'resize');
        });
    }

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
    // מילוי הסיידבר בפרטים המלאים
    document.getElementById("sidebar-hazard-id").textContent = report.id;
    document.getElementById("sidebar-type").textContent = report.type;

    let fullLocation = 'N/A';
    if (report.location_note === 'GPS' && report.geo_data) {
        fullLocation = `Lat: ${report.geo_data.lat}, Lng: ${report.geo_data.lng}`;
        if (report.address) {
            fullLocation += ` (${report.address})`;
        }
    } else if (report.address) {
        fullLocation = report.address;
    } else {
        fullLocation = report.location_note || report.location || 'N/A'; // שימוש ב-report.location אם קיים
    }
    document.getElementById("sidebar-location").textContent = fullLocation;

    document.getElementById("sidebar-time").textContent = new Date(report.time).toLocaleString();
    document.getElementById("sidebar-status").textContent = report.status;
    document.getElementById("sidebar-precision").textContent    = report.locationNote || 'Unknown';
    document.getElementById("sidebar-user").textContent = report.reportedBy;
    document.getElementById("sidebar-image").src = report.image;
    document.getElementById("report-sidebar").style.width = "300px"; // או הערך הרצוי לפתיחה
}

function closeSidebar() {
    const sidebar = document.getElementById("report-sidebar");
    sidebar.style.width = "0"; // סגירת הסיידבר
  }
