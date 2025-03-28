document.addEventListener("DOMContentLoaded", async () => {
    // פונקציה לטעינת המפה עם קואורדינטות ישראל
    function initMap() {
        const israel = { lat: 31.7683, lng: 35.2137 }; // Coordinates of Israel
        const map = new google.maps.Map(document.getElementById("map"), {
            zoom: 8,
            center: israel,
        });

        // הוספת סמן למפה
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
        modal.style.display = "flex"; // Use flex to center it
        modalImage.src = imageUrl;
    }

    // פונקציה לסגירת המודל
    function closeModal() {
        const modal = document.getElementById("image-modal");
        modal.style.display = "none";
    }

    // סגירת המודל אם לוחצים מחוץ לתמונה
    window.addEventListener("click", (event) => {
        const modal = document.getElementById("image-modal");
        if (event.target === modal) {
            closeModal();
        }
    });

    // טען את הדיווחים מהשרת
    try {
        const response = await fetch('/api/reports');
        
        if (!response.ok) {
            console.error("Error fetching reports:", response.statusText);
            return;
        }

        const reports = await response.json();
        
        const tbody = document.getElementById('reports-body');
        tbody.innerHTML = ''; // Clear the existing rows

        reports.forEach(report => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${report.id}</td>
                <td>${report.type}</td>
                <td>${report.location}</td>
                <td>${new Date(report.time).toLocaleString()}</td> <!-- Convert the time to a readable format -->
                <td><img src="${report.image}" alt="image" width="50" style="cursor:pointer;"></td>
                <td>${report.status}</td>
                <td>${report.reportedBy}</td>
            `;

            // מוסיף מאזין אירועים על התמונה
            const img = row.querySelector('img');
            img.addEventListener('click', () => openModal(report.image));

            tbody.appendChild(row);
        });

        // הפעלת המפה אחרי טעינת הדיווחים
        initMap();

    } catch (error) {
        console.error("Error loading reports:", error);
        alert("שגיאה בטעינת הדיווחים: " + error.message);
    }

    // פונקציה להחלפת התצוגה של הדיווחים
    const toggleReportsBtn = document.getElementById('toggleBtn');
    const toggleMapBtn = document.getElementById('toggleMapBtn');
    const reportsContainer = document.getElementById('reports');
    const mapContainer = document.getElementById('map');

    // הפונקציה להגדלת המפה והסתרת הדיווחים
    toggleMapBtn.addEventListener('click', () => {
        if (mapContainer.style.height !== '100vh') {
            // מעבר למצב של מפה מוגדלת
            mapContainer.style.height = '100vh';
            mapContainer.style.display = 'block';
            reportsContainer.style.display = 'none'; // הסתרת הדיווחים
            toggleMapBtn.textContent = 'Minimize Map'; 
            toggleReportsBtn.style.display = 'none'; // הסתרת כפתור הדיווחים
        } else {
            // החזרת שני האלמנטים
            mapContainer.style.height = '60vh';
            reportsContainer.style.display = 'block';
            toggleMapBtn.textContent = 'Maximize Map'; 
            toggleReportsBtn.style.display = 'inline'; // החזרת כפתור הדיווחים
        }
    });

    // הפונקציה להגדלת יומן הדיווחים והסתרת המפה
    toggleReportsBtn.addEventListener('click', () => {
        if (reportsContainer.style.height !== '100vh') {
            // מעבר למצב של יומן דיווחים מוגדל
            reportsContainer.style.height = '100vh';
            reportsContainer.style.display = 'block';
            mapContainer.style.display = 'none'; // הסתרת המפה
            toggleReportsBtn.textContent = 'Minimize Reports'; 
            toggleMapBtn.style.display = 'none'; // הסתרת כפתור המפה
        } else {
            // החזרת שני האלמנטים
            reportsContainer.style.height = '40vh';
            mapContainer.style.display = 'block';
            toggleReportsBtn.textContent = 'Maximize Reports'; 
            toggleMapBtn.style.display = 'inline'; // החזרת כפתור המפה
        }
    });
});
