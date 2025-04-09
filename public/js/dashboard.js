let map;

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

async function loadReports() {
    try {
        const response = await fetch('/api/reports', {
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
                geocodeAddress(report.location);
            }
        });

    } catch (error) {
        console.error("Error loading reports:", error);
        alert("שגיאה בטעינת הדיווחים: " + error.message);
    }
}

async function geocodeAddress(address) {
    const apiKey = "AIzaSyAXxZ7niDaxuyPEzt4j9P9U0kFzKHO9pZk";
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
        } else {
            console.error("Geocode error:", data.status);
        }
    } catch (error) {
        console.error("Error with Geocoding API:", error);
    }
}

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

document.addEventListener("DOMContentLoaded", () => {
    const toggleReportsBtn = document.getElementById('toggleBtn');
    const toggleMapBtn = document.getElementById('toggleMapBtn');
    const reportsContainer = document.getElementById('reports');
    const mapContainer = document.getElementById('map');

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
