let map;
let markers = [];
let heatmapLayer = null; // NEW: Global heatmap layer
let reportDetailsBootstrapModal = null; // For Bootstrap modal instance
let apiKey = null; // Will be loaded from server
let allReports = []; // Global array to hold all loaded reports

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
    // Deprecated: No longer used with AdvancedMarkerElement
    return null;
}

// NEW: Helper to create marker content for AdvancedMarkerElement
function getMarkerContent(hazardType) {
	const color = hazardMarkerColors[hazardType] || hazardMarkerColors['default'];
	const div = document.createElement('div');
	div.style.width = '20px';
	div.style.height = '20px';
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
        mapId: "4e9a93216ea2103583b8af86" // NEW: Add your Map ID here
    });

    // Add a marker for the default center as a fallback using AdvancedMarkerElement
    if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
        new google.maps.marker.AdvancedMarkerElement({
            map: map,
            position: defaultCenter,
            title: "Israel",
            content: (() => {
                const div = document.createElement('div');
                div.style.width = '20px';
                div.style.height = '20px';
                div.style.backgroundColor = '#4285F4';
                div.style.borderRadius = '50%';
                div.style.border = '2px solid #fff';
                return div;
            })()
        });
    }

    if (navigator.geolocation) {
        // Enhanced geolocation options for better accuracy and timeout
        const geoOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
        };
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLatLng = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                console.log("Got user location:", userLatLng);
                map.setCenter(userLatLng);
                map.setZoom(14); // Higher zoom for better detail
                
                // Use AdvancedMarkerElement for user location
                if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
                    new google.maps.marker.AdvancedMarkerElement({
                        map: map,
                        position: userLatLng,
                        title: "Your Current Location",
                        content: (() => {
                            const div = document.createElement('div');
                            div.style.width = '24px';
                            div.style.height = '24px';
                            div.style.backgroundColor = '#4285F4';
                            div.style.borderRadius = '50%';
                            div.style.border = '3px solid #fff';
                            div.style.boxShadow = '0 0 12px rgba(66, 133, 244, 0.8)';
                            div.style.cursor = 'pointer';
                            return div;
                        })()
                    });
                }
                loadReports();
            },
            (error) => {
                console.warn("Geolocation error:", error.code, error.message);
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        console.log("User denied geolocation request. Using IP fallback.");
                        break;
                    case error.POSITION_UNAVAILABLE:
                        console.log("Location information unavailable. Using IP fallback.");
                        break;
                    case error.TIMEOUT:
                        console.log("Location request timed out. Using IP fallback.");
                        break;
                }
                getLocationByIP();
            },
            geoOptions
        );
    } else {
        console.log("Geolocation not supported by browser. Using IP fallback.");
        getLocationByIP();
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

// Load API key from server
async function loadApiKey() {
    try {
        console.log('Attempting to load API key from server...');
        const response = await fetch('/api/config/maps-key');
        
        if (response.ok) {
            const config = await response.json();
            if (config.apiKey) {
                apiKey = config.apiKey;
                console.log('API key loaded successfully');
                return apiKey;
            } else {
                console.error('API key not found in response:', config);
                return null;
            }
        } else {
            const errorText = await response.text();
            console.error('Failed to load API key:', response.status, errorText);
            return null;
        }
    } catch (error) {
        console.error('Error loading API key:', error);
        return null;
    }
}

// Load Google Maps API dynamically with the correct API key
async function loadGoogleMapsAPI() {
    if (!apiKey) {
        await loadApiKey();
    }
    
    // Fallback to environment variable from window object if server request failed
    if (!apiKey && window.GOOGLE_MAPS_API_KEY) {
        apiKey = window.GOOGLE_MAPS_API_KEY;
        console.log('Using fallback API key from window object');
    }
    
    if (!apiKey) {
        console.error('Failed to load API key');
        showToast('Failed to load map configuration. Please refresh the page.', 'error');
        return;
    }
    
    return new Promise((resolve, reject) => {
        // Check if Google Maps is already loaded
        if (window.google && window.google.maps) {
            resolve();
            return;
        }
        
        // Set up the callback before creating the script
        window.initGoogleMaps = () => {
            resolve();
            initMap();
        };
        
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&v=weekly&callback=initGoogleMaps&loading=async`;
        script.async = true;
        script.defer = true;
        script.onerror = (error) => {
            console.error('Google Maps API failed to load:', error);
            showToast('Failed to load Google Maps. Please refresh the page.', 'error');
            reject(error);
        };
        
        document.head.appendChild(script);
    });
}

// Initialize the map loading process
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadGoogleMapsAPI();
    } catch (error) {
        console.error('Failed to load Google Maps:', error);
        showToast('Failed to load map. Please refresh the page.', 'error');
    }
});

// Make initMap available globally for Google Maps API (fallback)
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
            smartHeatmapLayer.setMap(null);
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
        smartHeatmapLayer.setMap(null);
    }

    // Create density circles around marker clusters
    const densityCircles = [];
    const gridSize = 0.01; // Approximately 1km grid
    const densityMap = new Map();

    // Group markers by grid cells
    markers.forEach(marker => {
        const position = marker.position || marker.getPosition();
        if (!position) return;

        const lat = position.lat || position.lat();
        const lng = position.lng || position.lng();
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

        const circle = new google.maps.Circle({
            strokeColor: color,
            strokeOpacity: 0.6,
            strokeWeight: 2,
            fillColor: color,
            fillOpacity: 0.2,
            map: map,
            center: { lat: avgLat, lng: avgLng },
            radius: radius
        });

        // Add info window with density information
        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div style="padding: 8px;">
                    <h6>Hazard Density Cluster</h6>
                    <p><strong>Reports:</strong> ${cell.count}</p>
                    <p><strong>Types:</strong> ${Array.from(cell.types).join(', ')}</p>
                    <p><strong>Density Level:</strong> ${cell.count >= 10 ? 'High' : cell.count >= 5 ? 'Medium' : 'Low'}</p>
                </div>
            `
        });

        circle.addListener('click', () => {
            infoWindow.setPosition({ lat: avgLat, lng: avgLng });
            infoWindow.open(map);
        });

        densityCircles.push(circle);
    });

    // Store reference for cleanup
    smartHeatmapLayer = {
        setMap: (map) => {
            densityCircles.forEach(circle => circle.setMap(map));
        }
    };
}

// Center map on user location with IP fallback
function centerMap() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLatLng = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                map.setCenter(userLatLng);
                map.setZoom(12);
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
            map.setCenter(ipLatLng);
            map.setZoom(10);
            
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
        map.setCenter(defaultLocation);
        map.setZoom(8);
    }
}

// Add user location marker to map
function addUserLocationMarker(location, title) {
    // Remove existing user location markers
    markers.forEach((marker, index) => {
        const markerTitle = marker.customTitle || (marker.getTitle && marker.getTitle()) || '';
        if (markerTitle.includes('Location') || markerTitle.includes('Your Location')) {
            if (marker.map !== undefined) {
                marker.map = null;
            } else if (marker.setMap) {
                marker.setMap(null);
            }
            markers.splice(index, 1);
        }
    });
    
    // Add new user location marker
    let userMarker;
    if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
        const content = document.createElement('div');
        content.style.width = '24px';
        content.style.height = '24px';
        content.style.backgroundColor = '#4285F4';
        content.style.borderRadius = '50%';
        content.style.border = '3px solid #fff';
        content.style.boxShadow = '0 0 12px #4285F4';
        content.style.animation = 'pulse 2s infinite';
        
        userMarker = new google.maps.marker.AdvancedMarkerElement({
            map: map,
            position: location,
            content: content
        });
        userMarker.customTitle = title;
    } else {
        userMarker = new google.maps.Marker({
            position: location,
            map: map,
            title: title,
            icon: {
                url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#4285F4" stroke="white" stroke-width="3"/><circle cx="12" cy="12" r="3" fill="white"/></svg>`),
                scaledSize: new google.maps.Size(24, 24)
            },
            animation: google.maps.Animation.DROP
        });
    }
    
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
        if (marker.map !== undefined) {
            // AdvancedMarkerElement
            marker.map = null;
        } else if (marker.setMap) {
            // Regular marker
            marker.setMap(null);
        }
    });
    markers = [];
}

// Update map markers to show only filtered reports
function updateMapMarkers(filteredReports) {
    // Clear existing markers
    clearMarkers();
    
    // Add markers for filtered reports
    filteredReports.forEach(report => {
        if (report.coordinates) {
            addMarkerToMap(report);
        }
    });
    
    console.log(`Updated map with ${filteredReports.length} markers`);
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
            const location = { lat, lng };
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
            // Use retry mechanism for geocoding
            const response = await retryRequest(() => 
                fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`)
            );
            
            const data = await response.json();
            
            if (data.status === "OK" && data.results[0]) {
                location = data.results[0].geometry.location;
                setCachedReports(geocodeKey, location);
            } else {
                if (data.status === "ZERO_RESULTS") {
                    console.warn(`No geocoding results for address: ${address}`);
                    // Skip this report rather than failing
                    return null;
                } else if (data.status === "OVER_QUERY_LIMIT") {
                    console.error("Geocoding quota exceeded");
                    handleError(new Error("Geocoding quota exceeded"), 'geocodeAddress');
                    return null;
                } else {
                    console.error("Geocoding failed:", data.status, data.error_message);
                    return null;
                }
            }
        }
        
        return createMarkerFromLocation(location, address, report);
    } catch (error) {
        handleError(error, 'geocodeAddress');
        return null;
    }
}

// Helper function to create marker from location
function createMarkerFromLocation(location, address, report) {
    try {
        
        let marker;
        // Use AdvancedMarkerElement (modern approach) or fallback to regular marker
        if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
            marker = new google.maps.marker.AdvancedMarkerElement({
                map: map,
                position: location,
                content: getMarkerContent(report.type)
            });
            // Store custom properties for AdvancedMarkerElement
            marker.customTitle = `${report.type} - ${address}`;
            marker.position = location;
        } else {
            // Fallback to regular marker
            marker = new google.maps.Marker({
                position: location,
                map: map,
                title: `${report.type} - ${address}`,
                icon: {
                    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${hazardMarkerColors[report.type] || hazardMarkerColors.default}" stroke="white" stroke-width="2"/></svg>`),
                    scaledSize: new google.maps.Size(24, 24)
                }
            });
        }
        
        marker.reportId = report.id;
        marker.report = report;

        // Register first "click" callback to open infowindow and pan/zoom map
        registerMarkerClick(marker, () => {
            markers.forEach(m => m.infoWindow?.close && m.infoWindow.close());
            const infowindow = new google.maps.InfoWindow({
                content: `
                <div class="info-window">
                    <h5>${report.type}</h5>
                    <p><strong>Location:</strong> ${address}</p>
                    <p><strong>Status:</strong> <span class="badge ${report.status === 'Resolved' ? 'bg-success' : 'bg-danger'}">${report.status}</span></p>
                    <p><strong>Reported by:</strong> ${report.reportedBy}</p>
                    <p><strong>Time:</strong> ${new Date(report.time).toLocaleString()}</p>
                    ${report.image ? `<img src="${report.image}" alt="Hazard" style="width:200px;height:150px;object-fit:cover;margin:10px 0;cursor:pointer;" onclick="showImageModal('${report.image}')">` : ''}
                    <div class="mt-2">
                        <button class="btn btn-sm btn-primary me-2" onclick="showReportDetails(${JSON.stringify(report).replace(/"/g, '&quot;')})">Details</button>
                        <button class="btn btn-sm btn-warning" onclick="openEditReportModal(${JSON.stringify(report).replace(/"/g, '&quot;')})">Edit</button>
                    </div>
                </div>`
            });
            marker.infoWindow = infowindow;
            infowindow.open(map, marker);
            map.panTo(location);
            if (map.getZoom() < 14) {
                map.setZoom(14);
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
    } catch (error) {
        handleError(error, 'createMarkerFromLocation');
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

// Helper to create a report block element with profile-like layout
function createReportBlock(report) {
    const block = document.createElement('div');
    block.className = 'report-block';
    
    // Determine status badge class
    const getStatusBadgeClass = (status) => {
        switch(status?.toLowerCase()) {
            case 'resolved': return 'badge-success';
            case 'open': return 'badge-danger';
            case 'in progress': return 'badge-warning';
            default: return 'badge-secondary';
        }
    };
    
    // Format date
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    };
    
    block.innerHTML = `
        <img src="${report.image || ''}" alt="Hazard image" class="report-block-image" onclick="openModal('${report.image || ''}')">
        <div class="report-block-details">
            <div class="report-block-title">
                <i class="fas fa-exclamation-triangle"></i> ${report.type || 'Unknown Type'}
            </div>
            <div class="report-block-meta">
                <span><i class="fas fa-map-marker-alt"></i> ${report.location || 'Unknown Location'}</span>
                <span><i class="fas fa-calendar-alt"></i> ${formatDate(report.time)}</span>
                <span><i class="fas fa-user"></i> ${report.reportedBy || 'Anonymous'}</span>
            </div>
            <div class="report-block-status">
                <span class="badge ${getStatusBadgeClass(report.status)}">${report.status || 'Unknown'}</span>
            </div>
            <div class="report-block-actions">
                <button class="btn btn-primary btn-sm view-details-btn">
                    <i class="fas fa-info-circle"></i> Details
                </button>
                <button class="btn btn-secondary btn-sm view-image-btn">
                    <i class="fas fa-image"></i> View Image
                </button>
                <button class="btn btn-warning btn-sm edit-report-btn">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-danger btn-sm delete-report-btn">
                    <i class="fas fa-trash"></i> Delete
                </button>
                <button class="btn btn-success btn-sm status-toggle-btn">
                    <i class="fas fa-${report.status === 'Resolved' ? 'undo' : 'check'}"></i> 
                    ${report.status === 'Resolved' ? 'Reopen' : 'Resolve'}
                </button>
            </div>
        </div>
    `;
    
    // Event listeners
    const viewImageBtn = block.querySelector('.view-image-btn');
    const viewDetailsBtn = block.querySelector('.view-details-btn');
    const editBtn = block.querySelector('.edit-report-btn');
    const deleteBtn = block.querySelector('.delete-report-btn');
    const statusBtn = block.querySelector('.status-toggle-btn');
    
    if (viewImageBtn) {
        viewImageBtn.addEventListener('click', () => openModal(report.image));
    }
    
    if (viewDetailsBtn) {
        viewDetailsBtn.addEventListener('click', () => showReportDetails(report));
    }
    
    if (editBtn) {
        editBtn.addEventListener('click', () => openEditReportModal(report));
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => deleteReport(report.id));
    }
    
    if (statusBtn) {
        statusBtn.addEventListener('click', () => toggleReportStatus(report));
    }
    
    return block;
}

// Utility for sorting - removed duplicate, enhanced version is defined later

// --- יצירת סמנים עם קיבוץ לפי קואורדינטות ---
async function loadReports(filters = {}) {
    try {
        showLoadingIndicator();
        const cacheKey = JSON.stringify(filters);
        const cachedReports = getCachedReports(cacheKey);
        if (cachedReports) {
            lastReports = cachedReports;
            updateDashboardInfo(cachedReports);
            hideLoadingIndicator();
            return cachedReports;
        }
        const queryString = Object.entries(filters)
            .filter(([_, value]) => value)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');
        const response = await fetch(`/api/reports${queryString ? `?${queryString}` : ''}`, {
            method: 'GET',
            credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to load reports');
        let reports = await response.json();
        if (!document.body) return [];
        setCachedReports(cacheKey, reports);
        lastReports = reports;
        allReports = reports; // Store all reports globally
        clearMarkers();
        const bounds = new google.maps.LatLngBounds();
        // --- קיבוץ דיווחים לפי קואורדינטות ---
        const coordMap = new Map();
        for (const report of reports) {
            let coords = null;
            // ננסה לחלץ קואורדינטות מהכתובת
            const coordMatch = (report.location||'').match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
            if (coordMatch) {
                coords = `${parseFloat(coordMatch[1]).toFixed(5)},${parseFloat(coordMatch[2]).toFixed(5)}`;
            } else {
                // נשתמש בגיאוקוד
                const loc = await geocodeAddress(report.location, report);
                if (loc && loc.position) {
                    coords = `${loc.position.lat.toFixed(5)},${loc.position.lng.toFixed(5)}`;
                }
            }
            if (coords) {
                if (!coordMap.has(coords)) coordMap.set(coords, []);
                coordMap.get(coords).push(report);
            }
        }
        // יצירת סמנים
        for (const [coords, group] of coordMap.entries()) {
            const [lat, lng] = coords.split(',').map(Number);
            const location = { lat, lng };
            const mainReport = group[0];
            let marker;
            // סמן עם מספר אם יש יותר מאחד
            if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
                const div = document.createElement('div');
                div.style.width = '28px';
                div.style.height = '28px';
                div.style.backgroundColor = hazardMarkerColors[mainReport.type] || hazardMarkerColors['default'];
                div.style.borderRadius = '50%';
                div.style.border = '2px solid #fff';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.justifyContent = 'center';
                div.style.color = '#fff';
                div.style.fontWeight = 'bold';
                div.style.fontSize = '1rem';
                if (group.length > 1) {
                    div.textContent = group.length;
                }
                marker = new google.maps.marker.AdvancedMarkerElement({
                    map: map,
                    position: location,
                    content: div
                });
            } else {
                marker = new google.maps.Marker({
                    position: location,
                    map: map,
                    title: `${mainReport.type} - ${mainReport.location}`,
                    label: group.length > 1 ? { text: String(group.length), color: '#fff', fontWeight: 'bold' } : undefined,
                    icon: {
                        url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><circle cx='14' cy='14' r='12' fill='${hazardMarkerColors[mainReport.type] || hazardMarkerColors.default}' stroke='white' stroke-width='2'/></svg>`),
                        scaledSize: new google.maps.Size(28, 28)
                    }
                });
            }
            marker.reportId = mainReport.id;
            marker.reportsGroup = group;
            marker.position = location;
            // בלחיצה: פופאפ עם כל הדיווחים במיקום
            registerMarkerClick(marker, () => {
                markers.forEach(m => m.infoWindow?.close && m.infoWindow.close());
                const infowindow = new google.maps.InfoWindow({
                    content: `
                    <div class="info-window">
                        <h5>Hazards (${group.length})</h5>
                        <ul style="max-height:200px;overflow:auto;padding-left:1em;">
                        ${group.map(r => `
                            <li style='margin-bottom:8px;'>
                                <b>${r.type}</b> <span class='badge ${r.status === 'Resolved' ? 'bg-success' : 'bg-danger'}'>${r.status}</span><br>
                                <small>${new Date(r.time).toLocaleString()}</small><br>
                                <button class='btn btn-sm btn-primary mt-1' onclick='showReportDetails(${JSON.stringify(r).replace(/"/g, "&quot;")})'>Details</button>
                                ${r.image ? `<button class='btn btn-sm btn-secondary mt-1' onclick='showImageModal(\'${r.image}\')'>Image</button>` : ''}
                            </li>
                        `).join('')}
                        </ul>
                    </div>`
                });
                marker.infoWindow = infowindow;
                infowindow.open(map, marker);
                map.panTo(location);
                if (map.getZoom() < 14) map.setZoom(14);
            });
            markers.push(marker);
            bounds.extend(location);
        }
        if (markers.length > 0) {
            map.fitBounds(bounds);
            const listener = google.maps.event.addListener(map, 'idle', function () {
                if (map.getZoom() > 16) map.setZoom(16);
                google.maps.event.removeListener(listener);
            });
        }
        updateHeatmap();
        console.log('loadReports: Loaded', allReports.length, 'reports total');
        if (window.filterAndRenderReports) {
            console.log('loadReports: Calling filterAndRenderReports');
            window.filterAndRenderReports();
        } else {
            console.error('loadReports: filterAndRenderReports function not found');
        }
        updateDashboardInfo(reports);
        hideLoadingIndicator();
        return reports;
    } catch (error) {
        if (document.body) {
            handleError(error, 'loadReports');
            hideLoadingIndicator();
        }
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
        // generateHazardCheckboxes(); // TODO: Function not defined, using dropdown instead
        // Listen for changes on checkboxes to trigger filtering
        hazardContainer.addEventListener('change', () => {
            window.filterAndRenderReports();
        });
    }
    
    // Initialize hazard type dropdown
    const hazardDropdownBtn = document.getElementById('hazard-type-dropdown-btn');
    const hazardDropdownMenu = document.getElementById('hazard-type-dropdown-menu');
    const currentHazardTypeLabel = document.getElementById('current-hazard-type-label');
    
    if (hazardDropdownBtn && hazardDropdownMenu) {
        // Toggle dropdown visibility
        hazardDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hazardDropdownMenu.classList.toggle('active');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            hazardDropdownMenu.classList.remove('active');
        });
        
        // Handle dropdown option selection
        hazardDropdownMenu.addEventListener('click', (e) => {
            if (e.target.classList.contains('hazard-type-option')) {
                const selectedValue = e.target.getAttribute('data-value');
                const selectedText = e.target.textContent;
                
                // Update global selected type
                window.selectedHazardType = selectedValue;
                
                // Update button label
                if (currentHazardTypeLabel) {
                    currentHazardTypeLabel.textContent = selectedText;
                }
                
                // Update visual state
                document.querySelectorAll('.hazard-type-option').forEach(opt => opt.classList.remove('selected'));
                e.target.classList.add('selected');
                
                // Close dropdown
                hazardDropdownMenu.classList.remove('active');
                
                // Trigger filtering
                window.filterAndRenderReports();
            }
        });
    }
    
    const searchInput = document.getElementById('report-search-input');
    const areaSearchInput = document.getElementById('area-search-input');
    const currentLocationBtn = document.getElementById('current-location-btn');
    const sortSelect = document.getElementById('report-sort-select');
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');
    
    // Layout toggle buttons
    const toggleMapBlocks = document.getElementById('toggle-map-blocks');
    const toggleMapTable = document.getElementById('toggle-map-table');
    const toggleBlocksOnly = document.getElementById('toggle-blocks-only');
    const toggleTableOnly = document.getElementById('toggle-table-only');
    const toggleFullscreenTable = document.getElementById('toggle-fullscreen-table');
    
    // Filter collapse button
    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
    const reportsFilters = document.getElementById('reports-filters');
    
    // Filter collapse functionality
    if (toggleFiltersBtn && reportsFilters) {
        toggleFiltersBtn.addEventListener('click', () => {
            // Check if we're in table-only or fullscreen mode - don't allow collapse
            if (window.currentLayoutMode === 'table-only' || window.currentLayoutMode === 'fullscreen-table') {
                return; // Do nothing in table-only or fullscreen mode
            }
            
            const isCollapsed = reportsFilters.classList.contains('collapsed');
            
            if (isCollapsed) {
                // Expand filters
                reportsFilters.classList.remove('collapsed');
                toggleFiltersBtn.classList.remove('collapsed');
                toggleFiltersBtn.querySelector('i').className = 'fas fa-chevron-up';
                toggleFiltersBtn.title = 'Minimize filters';
            } else {
                // Collapse filters
                reportsFilters.classList.add('collapsed');
                toggleFiltersBtn.classList.add('collapsed');
                toggleFiltersBtn.querySelector('i').className = 'fas fa-chevron-down';
                toggleFiltersBtn.title = 'Expand filters';
            }
        });
    }
    
    // Layout toggle functionality
    function setLayoutMode(mode) {
        const mainLayout = document.querySelector('.dashboard-main-layout');
        const blocksContainer = document.getElementById('reports-blocks-container');
        const tableContainer = document.getElementById('reports-table-container');
        const toggleBlocksBtn = document.getElementById('toggle-blocks-view');
        const toggleTableBtn = document.getElementById('toggle-table-view');
        
        // Remove all layout classes
        mainLayout.classList.remove('layout-map-hidden', 'layout-reports-hidden', 'layout-blocks-only', 'layout-table-only', 'layout-map-blocks', 'layout-map-table', 'layout-fullscreen-table');
        
        // Remove any existing exit fullscreen button
        removeExitFullscreenButton();
        
        // Remove active state from all layout buttons
        document.querySelectorAll('.layout-toggle-controls .btn').forEach(btn => btn.classList.remove('active'));
        
        switch(mode) {
            case 'map-blocks':
                mainLayout.classList.add('layout-map-blocks');
                toggleMapBlocks.classList.add('active');
                blocksContainer.style.display = 'flex';
                tableContainer.style.display = 'none';
                toggleBlocksBtn.classList.add('active');
                toggleTableBtn.classList.remove('active');
                break;
                
            case 'map-table':
                mainLayout.classList.add('layout-map-table');
                toggleMapTable.classList.add('active');
                blocksContainer.style.display = 'none';
                tableContainer.style.display = 'block';
                toggleBlocksBtn.classList.remove('active');
                toggleTableBtn.classList.add('active');
                break;
                
            case 'blocks-only':
                mainLayout.classList.add('layout-blocks-only', 'layout-map-hidden');
                toggleBlocksOnly.classList.add('active');
                blocksContainer.style.display = 'flex';
                tableContainer.style.display = 'none';
                toggleBlocksBtn.classList.add('active');
                toggleTableBtn.classList.remove('active');
                break;
                
            case 'table-only':
                mainLayout.classList.add('layout-table-only', 'layout-map-hidden');
                toggleTableOnly.classList.add('active');
                blocksContainer.style.display = 'none';
                tableContainer.style.display = 'block';
                toggleBlocksBtn.classList.remove('active');
                toggleTableBtn.classList.add('active');
                
                // Ensure filters are expanded and visible in table-only mode
                if (reportsFilters && toggleFiltersBtn) {
                    reportsFilters.classList.remove('collapsed');
                    toggleFiltersBtn.classList.remove('collapsed');
                    toggleFiltersBtn.querySelector('i').className = 'fas fa-chevron-up';
                    toggleFiltersBtn.title = 'Filters always visible in table mode';
                    toggleFiltersBtn.style.opacity = '0.5'; // Make it less prominent
                }
                break;
                
            case 'fullscreen-table':
                mainLayout.classList.add('layout-fullscreen-table');
                toggleFullscreenTable.classList.add('active');
                blocksContainer.style.display = 'none';
                tableContainer.style.display = 'block';
                toggleBlocksBtn.classList.remove('active');
                toggleTableBtn.classList.add('active');
                
                // Add exit fullscreen button to filter header
                addExitFullscreenButton();
                
                // Ensure filters are expanded and visible
                if (reportsFilters && toggleFiltersBtn) {
                    reportsFilters.classList.remove('collapsed');
                    toggleFiltersBtn.classList.remove('collapsed');
                    toggleFiltersBtn.querySelector('i').className = 'fas fa-chevron-up';
                    toggleFiltersBtn.title = 'Filters always visible in fullscreen mode';
                    toggleFiltersBtn.style.opacity = '0.3'; // Make it very subtle
                }
                
                // Hide floating menu in fullscreen
                const floatingMenu = document.getElementById('floatingMenu');
                const menuOverlay = document.getElementById('menuOverlay');
                if (floatingMenu) floatingMenu.classList.remove('active');
                if (menuOverlay) menuOverlay.classList.remove('active');
                
                break;
        }
        
        // Store current layout mode
        window.currentLayoutMode = mode;
        
        // Restore filter button functionality for non-table-only modes
        if (mode !== 'table-only' && toggleFiltersBtn) {
            toggleFiltersBtn.style.opacity = '1';
            toggleFiltersBtn.title = 'Minimize/Expand filters';
        }
        
        // Trigger re-rendering if needed
        window.filterAndRenderReports();
    }
    
    // Helper functions for fullscreen mode
    function addExitFullscreenButton() {
        const filterHeader = document.querySelector('.filter-header');
        if (filterHeader && !filterHeader.querySelector('.fullscreen-exit-btn')) {
            const exitBtn = document.createElement('button');
            exitBtn.className = 'fullscreen-exit-btn';
            exitBtn.innerHTML = '<i class="fas fa-times"></i> Exit Fullscreen';
            exitBtn.addEventListener('click', () => setLayoutMode('table-only'));
            filterHeader.appendChild(exitBtn);
        }
    }
    
    function removeExitFullscreenButton() {
        const exitBtn = document.querySelector('.fullscreen-exit-btn');
        if (exitBtn) {
            exitBtn.remove();
        }
    }

    // Add event listeners for layout toggle buttons
    if (toggleMapBlocks) toggleMapBlocks.addEventListener('click', () => setLayoutMode('map-blocks'));
    if (toggleMapTable) toggleMapTable.addEventListener('click', () => setLayoutMode('map-table'));
    if (toggleBlocksOnly) toggleBlocksOnly.addEventListener('click', () => setLayoutMode('blocks-only'));
    if (toggleTableOnly) toggleTableOnly.addEventListener('click', () => setLayoutMode('table-only'));
    if (toggleFullscreenTable) toggleFullscreenTable.addEventListener('click', () => setLayoutMode('fullscreen-table'));
    
    // Update existing blocks/table toggle buttons to work with new layout system
    const toggleBlocksBtn = document.getElementById('toggle-blocks-view');
    const toggleTableBtn = document.getElementById('toggle-table-view');
    
    if (toggleBlocksBtn) {
        toggleBlocksBtn.addEventListener('click', () => {
            const currentMode = window.currentLayoutMode || 'map-blocks';
            if (currentMode.includes('map')) {
                setLayoutMode('map-blocks');
            } else {
                setLayoutMode('blocks-only');
            }
        });
    }
    
    if (toggleTableBtn) {
        toggleTableBtn.addEventListener('click', () => {
            const currentMode = window.currentLayoutMode || 'map-blocks';
            if (currentMode.includes('map')) {
                setLayoutMode('map-table');
            } else {
                setLayoutMode('table-only');
            }
        });
    }
    
    // Set default layout mode
    window.currentLayoutMode = 'map-blocks';
    
    // Add keyboard shortcut to exit fullscreen mode
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && window.currentLayoutMode === 'fullscreen-table') {
            setLayoutMode('table-only');
        }
    });
    
    // Create debounced search function
    const debouncedSearch = debounce(() => {
        window.filterAndRenderReports();
    }, 300);
    
    function filterAndRenderReports() {
        let filtered = allReports || [];
        
        // General search filter
        const q = (searchInput?.value || '').toLowerCase().trim();
        if (q) {
            filtered = filtered.filter(r =>
                (r.type && r.type.toLowerCase().includes(q)) ||
                (r.location && r.location.toLowerCase().includes(q)) ||
                (r.status && r.status.toLowerCase().includes(q)) ||
                (r.reportedBy && r.reportedBy.toLowerCase().includes(q))
            );
        }
        
        // Area/city search filter
        const areaQ = (areaSearchInput?.value || '').toLowerCase().trim();
        if (areaQ) {
            filtered = filtered.filter(r =>
                (r.location && r.location.toLowerCase().includes(areaQ)) ||
                (r.address && r.address.toLowerCase().includes(areaQ)) ||
                (r.city && r.city.toLowerCase().includes(areaQ)) ||
                (r.region && r.region.toLowerCase().includes(areaQ))
            );
        }
        // Filter by selected hazard types (if any)
        const checkedHazards = Array.from(document.querySelectorAll('#hazard-types-container input[type="checkbox"]:checked')).map(el => el.value);
        if (checkedHazards.length > 0) {
            filtered = filtered.filter(r => checkedHazards.includes(r.type));
        }
        // Filter by hazard type dropdown
        if (window.selectedHazardType && window.selectedHazardType !== '') {
          filtered = filtered.filter(r => r.type === window.selectedHazardType);
        }
        // Filter by date range
        const fromDate = dateFromInput && dateFromInput.value ? new Date(dateFromInput.value) : null;
        const toDate = dateToInput && dateToInput.value ? new Date(dateToInput.value) : null;
        if (fromDate) {
          filtered = filtered.filter(r => {
            const t = new Date(r.time);
            return t >= fromDate;
          });
        }
        if (toDate) {
          filtered = filtered.filter(r => {
            const t = new Date(r.time);
            return t <= toDate;
          });
        }
        // Sort
        if (sortSelect) {
            const [field, order] = sortSelect.value.split('-');
            filtered = sortReports(filtered, field === 'reportedBy' ? 'reportedBy' : field, order);
        }
        filtered = mergeDuplicateReports(filtered);
        
        // Update map markers to show only filtered reports
        updateMapMarkers(filtered);
        
        // Check current view mode and render accordingly
        const tableContainer = document.getElementById('reports-table-container');
        const blocksContainer = document.getElementById('reports-blocks-container');
        const isTableView = tableContainer && tableContainer.style.display !== 'none';
        const isBlocksView = blocksContainer && blocksContainer.style.display !== 'none';
        
        console.log('Current layout mode:', window.currentLayoutMode);
        console.log('Current view mode:', isTableView ? 'table' : 'blocks');
        console.log('Filtered reports count:', filtered.length);
        
        // Render based on current display mode
        if (isTableView) {
            renderReportTableRows(filtered);
        }
        if (isBlocksView) {
            renderReportBlocks(filtered);
        }
        
        updateDashboardInfo(filtered);
        updateURLParams({ search: q, sort: sortSelect?.value });
    }
    
    // Current location button functionality
    if (currentLocationBtn) {
        currentLocationBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                currentLocationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                currentLocationBtn.disabled = true;
                
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        try {
                            const lat = position.coords.latitude;
                            const lng = position.coords.longitude;
                            
                            // Use reverse geocoding to get city name
                            const geocoder = new google.maps.Geocoder();
                            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                                if (status === 'OK' && results[0]) {
                                    // Extract city from address components
                                    const addressComponents = results[0].address_components;
                                    let city = '';
                                    
                                    for (let component of addressComponents) {
                                        if (component.types.includes('locality') || 
                                            component.types.includes('administrative_area_level_2') ||
                                            component.types.includes('administrative_area_level_1')) {
                                            city = component.long_name;
                                            break;
                                        }
                                    }
                                    
                                    if (city && areaSearchInput) {
                                        areaSearchInput.value = city;
                                        window.filterAndRenderReports();
                                    }
                                } else {
                                    console.warn('Geocoding failed:', status);
                                }
                                
                                // Reset button state
                                currentLocationBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
                                currentLocationBtn.disabled = false;
                            });
                        } catch (error) {
                            console.error('Error with geocoding:', error);
                            currentLocationBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
                            currentLocationBtn.disabled = false;
                        }
                    },
                    (error) => {
                        console.warn('Geolocation error:', error);
                        currentLocationBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
                        currentLocationBtn.disabled = false;
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 300000
                    }
                );
            }
        });
    }

    if (searchInput) searchInput.addEventListener('input', debouncedSearch);
    if (areaSearchInput) areaSearchInput.addEventListener('input', debouncedSearch);
    if (sortSelect) sortSelect.addEventListener('change', filterAndRenderReports);
    if (dateFromInput) dateFromInput.addEventListener('change', filterAndRenderReports);
    if (dateToInput) dateToInput.addEventListener('change', filterAndRenderReports);
    window.filterAndRenderReports = filterAndRenderReports;
    
    // Load filters from URL on page load
    loadFiltersFromURL();
    
    // Ensure initial rendering happens when data is available
    if (allReports && allReports.length > 0) {
        console.log('Initial rendering of', allReports.length, 'reports');
        filterAndRenderReports();
    }
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
  // Helper function to format date
  const formatDetailedDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Helper function to get status badge class
  const getStatusBadgeClass = (status) => {
    switch(status?.toLowerCase()) {
      case 'resolved': return 'badge-success';
      case 'open': return 'badge-danger';
      case 'in progress': return 'badge-warning';
      default: return 'badge-secondary';
    }
  };
  
  // Basic information
  document.getElementById("modal-hazard-id").textContent = report.id || 'N/A';
  document.getElementById("modal-type").textContent = report.type || 'Unknown Type';
  document.getElementById("modal-location").textContent = report.location || 'Unknown Location';
  document.getElementById("modal-time").textContent = formatDetailedDate(report.time);
  document.getElementById("modal-status").textContent = report.status || 'Unknown';
  document.getElementById("modal-user").textContent = report.reportedBy || 'Anonymous';
  
  // Status badge with appropriate styling
  const statusBadge = document.getElementById("modal-status-badge");
  if (statusBadge) {
    statusBadge.textContent = report.status || 'Unknown';
    statusBadge.className = `badge ${getStatusBadgeClass(report.status)}`;
  }
  
  // Coordinates (extract from location if available)
  const coordinatesEl = document.getElementById("modal-coordinates");
  if (coordinatesEl) {
    const coordMatch = (report.location || '').match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (coordMatch) {
      coordinatesEl.textContent = `${coordMatch[1]}, ${coordMatch[2]}`;
    } else {
      coordinatesEl.textContent = 'Not available';
    }
  }
  
  // Additional details (you can extend these based on your data structure)
  const priorityEl = document.getElementById("modal-priority");
  if (priorityEl) {
    priorityEl.textContent = report.priority || 'Medium';
  }
  
  const descriptionEl = document.getElementById("modal-description");
  if (descriptionEl) {
    descriptionEl.textContent = report.description || 'No additional description provided.';
  }
  
  const categoryEl = document.getElementById("modal-category");
  if (categoryEl) {
    categoryEl.textContent = report.category || 'Road Hazard';
  }
  
  // Handle image
  const modalImageElement = document.getElementById("modal-report-image");
  if (modalImageElement) {
    if (report.image && report.image.trim() !== '') {
      modalImageElement.src = report.image;
      modalImageElement.style.display = "block";
    } else {
      modalImageElement.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZSBBdmFpbGFibGU8L3RleHQ+PC9zdmc+";
      modalImageElement.style.display = "block";
    }
  }
  
  // Show the modal
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

// === VIEW TOGGLE FUNCTIONALITY ===
let currentViewMode = 'blocks'; // 'blocks' or 'table'

// Toggle between blocks and table view
function toggleReportsView(mode) {
    const blocksContainer = document.getElementById('reports-blocks-container');
    const tableContainer = document.getElementById('reports-table-container');
    const blocksBtn = document.getElementById('toggle-blocks-view');
    const tableBtn = document.getElementById('toggle-table-view');
    
    console.log('toggleReportsView called with mode:', mode);
    
    if (!blocksContainer || !tableContainer || !blocksBtn || !tableBtn) {
        console.error('Missing elements for view toggle');
        return;
    }
    
    currentViewMode = mode;
    
    if (mode === 'table') {
        // Show table, hide blocks
        blocksContainer.style.display = 'none';
        tableContainer.style.display = 'block';
        
        // Update button styles
        blocksBtn.classList.remove('active');
        tableBtn.classList.add('active');
        
        // Re-render current data in table format
        if (window.currentFilteredReports) {
            renderReportTableRows(window.currentFilteredReports);
        }
    } else {
        // Show blocks, hide table
        blocksContainer.style.display = 'block';
        tableContainer.style.display = 'none';
        
        // Update button styles
        tableBtn.classList.remove('active');
        blocksBtn.classList.add('active');
        
        // Re-render current data in blocks format
        if (window.currentFilteredReports) {
            renderReportBlocks(window.currentFilteredReports);
        }
    }
}

// Initialize view toggle event listeners
document.addEventListener('DOMContentLoaded', () => {
    const blocksBtn = document.getElementById('toggle-blocks-view');
    const tableBtn = document.getElementById('toggle-table-view');
    const applyMapSortBtn = document.getElementById('apply-map-sort');
    
    // NOTE: These old event listeners are commented out to prevent conflicts with new layout system
    // The new layout system handles these buttons in the main search/filter section
    /*
    if (blocksBtn) {
        blocksBtn.addEventListener('click', () => toggleReportsView('blocks'));
    }
    
    if (tableBtn) {
        tableBtn.addEventListener('click', () => toggleReportsView('table'));
    }
    */
    
    if (applyMapSortBtn) {
        applyMapSortBtn.addEventListener('click', sortMapMarkers);
    }
});

// === MAP SORTING FUNCTIONALITY ===
function sortMapMarkers() {
    const sortSelect = document.getElementById('report-sort-select');
    if (!sortSelect || !map || !markers.length) {
        showToast('No markers to sort or sort option not selected', 'warning');
        return;
    }
    
    const [field, order] = sortSelect.value.split('-');
    const sortedReports = [...(window.currentFilteredReports || allReports)];
    
    // Sort the reports
    const sorted = sortReports(sortedReports, field, order);
    
    // Clear existing markers
    clearMarkers();
    
    // Add markers in sorted order with animation delay
    sorted.forEach((report, index) => {
        setTimeout(() => {
            addMarkerToMap(report);
        }, index * 100); // 100ms delay between each marker for visual effect
    });
    
    showToast(`Map markers sorted by ${field} (${order === 'asc' ? 'ascending' : 'descending'})`, 'success');
}

// Helper function to add individual marker to map with animation
function addMarkerToMap(report) {
    if (!report.coordinates) return;
    
    const position = {
        lat: parseFloat(report.coordinates.lat),
        lng: parseFloat(report.coordinates.lng)
    };
    
    if (isNaN(position.lat) || isNaN(position.lng)) return;
    
    let marker;
    const markerContent = getMarkerContent(report.type);
    
    if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
        marker = new google.maps.marker.AdvancedMarkerElement({
            map: map,
            position: position,
            content: markerContent,
            title: `${report.type} - ${report.location}`
        });
    } else {
        marker = new google.maps.Marker({
            position: position,
            map: map,
            title: `${report.type} - ${report.location}`,
            icon: getMarkerIcon(report.type),
            animation: google.maps.Animation.DROP
        });
    }
    
    // Store report data with marker
    marker.report = report;
    
    // Add click listener for info window
    const clickListener = () => {
        if (window.currentInfoWindow) {
            window.currentInfoWindow.close();
        }
        
        const infoWindow = new google.maps.InfoWindow({
            content: createInfoWindowContent(report)
        });
        
        infoWindow.open(map, marker);
        window.currentInfoWindow = infoWindow;
    };
    
    if (marker.addListener) {
        marker.addListener('click', clickListener);
    } else {
        marker.addEventListener('click', clickListener);
    }
    
    markers.push(marker);
}

// Store current filtered reports for view switching
window.currentFilteredReports = [];

// Update the filter function to store current reports
const originalFilterAndRenderReports = window.filterAndRenderReports;
if (originalFilterAndRenderReports) {
    window.filterAndRenderReports = function() {
        const result = originalFilterAndRenderReports.apply(this, arguments);
        // Store the filtered reports for view switching
        const searchInput = document.getElementById('report-search-input');
        const sortSelect = document.getElementById('report-sort-select');
        const q = searchInput?.value?.toLowerCase() || '';
        
        let filtered = [...allReports];
        if (q) {
            filtered = filtered.filter(r => 
                r.type?.toLowerCase().includes(q) ||
                r.location?.toLowerCase().includes(q) ||
                r.status?.toLowerCase().includes(q) ||
                r.reportedBy?.toLowerCase().includes(q)
            );
        }
        
        if (sortSelect) {
            const [field, order] = sortSelect.value.split('-');
            filtered = sortReports(filtered, field, order);
        }
        
        window.currentFilteredReports = filtered;
        return result;
    };
}

// === ENHANCED SORTING FUNCTIONALITY ===
function sortReports(reports, field, order = 'asc') {
    return reports.sort((a, b) => {
        let aValue, bValue;
        
        switch (field) {
            case 'time':
                aValue = new Date(a.time);
                bValue = new Date(b.time);
                break;
            case 'type':
                aValue = (a.type || '').toLowerCase();
                bValue = (b.type || '').toLowerCase();
                break;
            case 'status':
                aValue = (a.status || '').toLowerCase();
                bValue = (b.status || '').toLowerCase();
                break;
            case 'location':
                aValue = (a.location || '').toLowerCase();
                bValue = (b.location || '').toLowerCase();
                break;
            case 'reportedBy':
                aValue = (a.reportedBy || '').toLowerCase();
                bValue = (b.reportedBy || '').toLowerCase();
                break;
            default:
                return 0;
        }
        
        if (aValue < bValue) return order === 'asc' ? -1 : 1;
        if (aValue > bValue) return order === 'asc' ? 1 : -1;
        return 0;
    });
}

// Add CSS for active button state
const style = document.createElement('style');
style.textContent = `
.view-toggle-controls .btn.active {
    background-color: var(--accent) !important;
    border-color: var(--accent) !important;
    color: white !important;
}
.view-toggle-controls .btn {
    min-width: 80px;
}
.sort-controls .form-select {
    min-width: 150px;
}
`;
document.head.appendChild(style);

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
    const blocksContainer = document.getElementById('reports-blocks-container');
    if (!blocksContainer) {
        console.error("Element with id 'reports-blocks-container' not found.");
        return;
    }
    
    // Clear existing blocks
    blocksContainer.innerHTML = '';
    console.log("Rendering", reports.length, "reports to blocks container");
    
    // Create and append each report block
    reports.forEach(report => {
        const reportBlock = createReportBlock(report);
        blocksContainer.appendChild(reportBlock);
    });
    
    // Show loading message if no reports
    if (reports.length === 0) {
        blocksContainer.innerHTML = '<div class="text-center text-muted p-4"><i class="fas fa-inbox fa-2x mb-2"></i><br>No reports found</div>';
    }
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
                ${report._mergedReporters ?
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
        const position = marker.position || marker.getPosition();
        if (position) {
            map.panTo(position);
            map.setZoom(18);
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
    // Temporary stub – replace with modal integration as needed.
    alert("Opening Edit Report modal for report: " + report.id);
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
            loadReports();
            showToast('Dashboard refreshed', 'success');
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
            map.setCenter(ipLatLng);
            map.setZoom(10); // Zoom level for region
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
            body: `${data.report.type} at ${data.report.location}`,
            time: data.report.time,
            onClick: () => {
                window.showNotificationCenter();
                focusMapLocation(data.report.location);
            }
        });
        showDesktopNotification({
            title: 'New Hazard Reported',
            body: `${data.report.type} at ${data.report.location}`,
            report: data.report,
            onClick: () => {
                window.showNotificationCenter();
                focusMapLocation(data.report.location);
            }
        });
        if (HIGH_PRIORITY_TYPES.includes(data.report.type)) {
            playHighPrioritySound();
        }
    } else if (data.type === 'status_update' && data.report) {
        showNotificationInCenter({
            title: 'Report Status Updated',
            body: `${data.report.type} at ${data.report.location} is now ${data.report.status}`,
            time: data.report.time,
            onClick: () => {
                window.showNotificationCenter();
                focusMapLocation(data.report.location);
            }
        });
        showDesktopNotification({
            title: 'Report Status Updated',
            body: `${data.report.type} at ${data.report.location} is now ${data.report.status}`,
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
        icon: '/public/icon.png', // Use your app icon
        tag: report && report.id ? `report-${report.id}` : undefined
    });
    notification.onclick = function(event) {
        event.preventDefault();
        window.focus();
        if (onClick) onClick();
    };
}

// --- Sound Alerts for High-Priority Items ---
const HIGH_PRIORITY_TYPES = ['Pothole', 'Manhole', 'Transverse Crack'];
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
