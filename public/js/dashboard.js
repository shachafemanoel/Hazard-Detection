document.addEventListener("DOMContentLoaded", async () => {
    let map;
    const geocoder = new google.maps.Geocoder(); 

    // פונקציה לטעינת המפה עם קואורדינטות ישראל
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
    }

    // פונקציה להפעלת המודל עם התמונה
    function openModal(imageUrl) {
        const modal = document.getElementById("image-modal");
        const modalImage = document.getElementById("modal-image");
        modal.style.display = "flex"; 
        modalImage.src = imageUrl;
    }

    // פונקציה לסגירת המודל
    function closeModal() {
        document.getElementById("image-modal").style.display = "none";
    }

    // סגירת המודל אם לוחצים מחוץ לתמונה
    window.addEventListener("click", (event) => {
        const modal = document.getElementById("image-modal");
        if (event.target === modal) {
            closeModal();
        }
    });

    // פונקציה להמיר כתובת לקואורדינטות ולהוסיף סמן למפה
    async function geocodeAddress(address) {
        const apiKey = "AIzaSyAXxZ7niDaxuyPEzt4j9P9U0kFzKHO9pZk"; // המפתח שלך
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
        
        try {
            const response = await fetch(geocodeUrl);
            const data = await response.json();
            
            if (data.status === "OK") {
                const location = data.results[0].geometry.location;
                new google.maps.Marker({
                    map: map,
                    position: location,
                    title: address,
                });
                map.setCenter(location);
            } else {
                console.error("Geocode error:", data.status);
            }
        } catch (error) {
            console.error("Error with Geocoding API:", error);
        }
    }

    // טען את הדיווחים מהשרת
    try {
        const response = await fetch('/api/reports');
        
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
                <td>${report.location}</td>
                <td>${new Date(report.time).toLocaleString()}</td> 
                <td><img src="${report.image}" alt="image" width="50" style="cursor:pointer;"></td>
                <td>${report.status}</td>
                <td>${report.reportedBy}</td>
            `;

            const img = row.querySelector('img');
            img.addEventListener('click', () => openModal(report.image));

            tbody.appendChild(row);

            if (report.location) {
                geocodeAddress(report.location); // המר את הכתובת לקואורדינטות
            }
        });

        initMap(); // הפעלת המפה לאחר טעינת הדיווחים

    } catch (error) {
        console.error("Error loading reports:", error);
        alert("שגיאה בטעינת הדיווחים: " + error.message);
    }

    // פונקציות להחלפת תצוגת הדיווחים והגדרת המפה
    const toggleReportsBtn = document.getElementById('toggleBtn');
    const toggleMapBtn = document.getElementById('toggleMapBtn');
    const reportsContainer = document.getElementById('reports');
    const mapContainer = document.getElementById('map');

    // פונקציה להגדלת המפה והסתרת הדיווחים
    toggleMapBtn.addEventListener('click', () => {
        if (mapContainer.style.height !== '100vh') {
            mapContainer.style.height = '100vh';
            mapContainer.style.display = 'block';
            reportsContainer.style.display = 'none'; 
            toggleMapBtn.textContent = 'Minimize Map'; 
            toggleReportsBtn.style.display = 'none'; 
        } else {
            mapContainer.style.height = '60vh';
            reportsContainer.style.display = 'block';
            toggleMapBtn.textContent = 'Maximize Map'; 
            toggleReportsBtn.style.display = 'inline'; 
        }
    });

    // פונקציה להגדלת יומן הדיווחים והסתרת המפה
    toggleReportsBtn.addEventListener('click', () => {
        if (reportsContainer.style.height !== '100vh') {
            reportsContainer.style.height = '100vh';
            reportsContainer.style.display = 'block';
            mapContainer.style.display = 'none'; 
            toggleReportsBtn.textContent = 'Minimize Reports'; 
            toggleMapBtn.style.display = 'none'; 
        } else {
            reportsContainer.style.height = '40vh';
            mapContainer.style.display = 'block';
            toggleReportsBtn.textContent = 'Maximize Reports'; 
            toggleMapBtn.style.display = 'inline'; 
        }
    });
});
