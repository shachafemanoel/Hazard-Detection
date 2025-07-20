import { ApiService } from './modules/ApiService.js';

// Core global variables for map functionality
let map;
let markers = [];
let heatmapLayer = null;
let apiKey = null;
let allReports = [];

// State management
let isMapInitialized = false;
let isLoadingReports = false;

const hazardTypes = [
  "Alligator Crack",
  "Block Crack",
  "Construction Joint Crack",
  "Crosswalk Blur",
  "Lane Blur",
  "Longitudinal Crack",
  "Manhole",
  "Patch Repair",
  "Pothole",
  "Transverse Crack",
  "Wheel Mark Crack",
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
  // New style: hide icons for a clean, modern look
  {
    featureType: "all",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
];

// Hazard type to marker color mapping
const hazardMarkerColors = {
  "Alligator Crack": "#FF0000", // Red
  "Block Crack": "#FF7F00", // Orange
  "Construction Joint Crack": "#FFFF00", // Yellow
  "Crosswalk Blur": "#00FF00", // Lime
  "Lane Blur": "#00FFFF", // Aqua
  "Longitudinal Crack": "#0000FF", // Blue
  Manhole: "#8B00FF", // Violet
  "Patch Repair": "#FF00FF", // Fuchsia
  Pothole: "#FF1493", // DeepPink
  "Transverse Crack": "#ADFF2F", // GreenYellow
  "Wheel Mark Crack": "#7FFF00", // Chartreuse
  default: "#808080", // Gray for unknown types
};

function getMarkerIcon(hazardType) {
  // Deprecated: No longer used with AdvancedMarkerElement
  return null;
}

// NEW: Helper to create marker content for AdvancedMarkerElement
function getMarkerContent(hazardType) {
  const color = hazardMarkerColors[hazardType] || hazardMarkerColors["default"];
  const div = document.createElement("div");
  div.style.width = "20px";
  div.style.height = "20px";
  div.style.backgroundColor = color;
  div.style.borderRadius = "50%";
  div.style.border = "2px solid #FFFFFF";
  return div;
}

// Global sort state
let currentSort = { field: 'time', order: 'desc' };

// Retry mechanism for network requests
async function retryRequest(requestFn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await requestFn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      console.warn(`Request failed, retrying... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
}

// Initialize Google Map with dark theme
function initMap() {
  const defaultCenter = { lat: 31.7683, lng: 35.2137 };
  
  try {
    // When using mapId, styles are controlled via Google Cloud Console
    const mapOptions = {
      zoom: 8,
      center: defaultCenter,
      mapId: '4e9a93216ea2103583b8af86'
    };
    
    // Only add styles if no mapId is used (fallback)
    // mapOptions.styles = darkMapStyle;
    
    map = new google.maps.Map(document.getElementById('map'), mapOptions);
    
    console.log('Map initialized successfully');
    
    // Try to get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          
          console.log('User location:', userLocation);
          map.setCenter(userLocation);
          map.setZoom(12);
          
          // Add user location marker
          addUserLocationMarker(userLocation, 'Your Location');
          
          markMapAsReady();
        },
        (error) => {
          console.warn('Geolocation failed:', error.message);
          // Use IP-based location as fallback
          getLocationByIP();
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000
        }
      );
    } else {
      console.log('Geolocation not supported');
      getLocationByIP();
    }
    
  } catch (error) {
    console.error('Error initializing map:', error);
    handleError(error, 'initMap');
  }
}

// NEW: Function to toggle the display of the map legend.
window.toggleLegend = function () {
  if (!window.mapLegend) return;
  if (window.mapLegend.style.display === "none") {
    window.mapLegend.style.display = "block";
  } else {
    window.mapLegend.style.display = "none";
  }
};

// Load API key from server
async function loadApiKey() {
  try {
    console.log("Attempting to load API key from server...");
    const response = await fetch("/api/config/maps-key");

    if (response.ok) {
      const config = await response.json();
      if (config.apiKey) {
        apiKey = config.apiKey;
        console.log("API key loaded successfully");
        return apiKey;
      } else {
        console.error("API key not found in response:", config);
        return null;
      }
    } else {
      const errorText = await response.text();
      console.error("Failed to load API key:", response.status, errorText);
      return null;
    }
  } catch (error) {
    console.error("Error loading API key:", error);
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
    console.log("Using fallback API key from window object");
  }

  if (!apiKey) {
    console.error("Failed to load API key");
    showToast(
      "Failed to load map configuration. Please refresh the page.",
      "error",
    );
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

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&v=weekly&callback=initGoogleMaps&loading=async`;
    script.async = true;
    script.defer = true;
    script.onerror = (error) => {
      console.error("Google Maps API failed to load:", error);
      showToast(
        "Failed to load Google Maps. Please refresh the page.",
        "error",
      );
      reject(error);
    };

    document.head.appendChild(script);
  });
}

// Initialize the map loading process
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadGoogleMapsAPI();
  } catch (error) {
    console.error("Failed to load Google Maps:", error);
    showToast("Failed to load map. Please refresh the page.", "error");
  }
});

// Make functions available globally
window.initMap = initMap;
window.loadReports = loadReports;
window.showReportDetails = showReportDetails;
window.showImageModal = showImageModal;
window.toggleHeatmap = toggleHeatmap;
window.centerMap = centerMap;
window.showToast = showToast;
window.handleError = handleError;
window.allReports = allReports;
window.map = map;
window.markers = markers;

// Enhanced map controls
let heatmapVisible = false;
let smartHeatmapLayer = null;

// Smart heatmap using marker density visualization
function toggleHeatmap() {
  if (!map || markers.length === 0) {
    showToast("No data available for heatmap visualization", "warning");
    return;
  }

  if (heatmapVisible) {
    // Hide heatmap
    if (smartHeatmapLayer) {
      smartHeatmapLayer.setMap(null);
      smartHeatmapLayer = null;
    }
    heatmapVisible = false;
    showToast("Heatmap hidden", "info");
  } else {
    // Show smart heatmap
    createSmartHeatmap();
    heatmapVisible = true;
    showToast("Smart heatmap displayed", "success");
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
  markers.forEach((marker) => {
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
        types: new Set(),
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
      color = "#FF0000"; // Red for high density
      radius = 800;
    } else if (cell.count >= 5) {
      color = "#FF8000"; // Orange for medium density
      radius = 600;
    } else if (cell.count >= 2) {
      color = "#FFFF00"; // Yellow for low density
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
      radius: radius,
    });

    // Add info window with density information
    const infoWindow = new google.maps.InfoWindow({
      content: `
                <div style="padding: 8px;">
                    <h6>Hazard Density Cluster</h6>
                    <p><strong>Reports:</strong> ${cell.count}</p>
                    <p><strong>Types:</strong> ${Array.from(cell.types).join(", ")}</p>
                    <p><strong>Density Level:</strong> ${cell.count >= 10 ? "High" : cell.count >= 5 ? "Medium" : "Low"}</p>
                </div>
            `,
    });

    circle.addListener("click", () => {
      infoWindow.setPosition({ lat: avgLat, lng: avgLng });
      infoWindow.open(map);
    });

    densityCircles.push(circle);
  });

  // Store reference for cleanup
  smartHeatmapLayer = {
    setMap: (map) => {
      densityCircles.forEach((circle) => circle.setMap(map));
    },
  };
}

// Center map on user location with IP fallback
function centerMap() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLatLng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        map.setCenter(userLatLng);
        map.setZoom(12);
        showToast("Map centered on your GPS location", "success");

        // Add user location marker
        addUserLocationMarker(userLatLng, "GPS Location");
      },
      (error) => {
        console.warn("GPS location failed:", error.message);
        // Fallback to IP location
        centerMapByIP();
      },
    );
  } else {
    console.warn("Geolocation not supported by browser");
    // Fallback to IP location
    centerMapByIP();
  }
}

// Center map using IP-based geolocation
async function centerMapByIP() {
  try {
    showToast("Getting your location...", "info");

    // Try multiple IP geolocation services for better reliability
    const ipServices = [
      {
        url: "https://ipapi.co/json/",
        parse: (data) => ({
          lat: data.latitude,
          lng: data.longitude,
          city: data.city,
          country: data.country,
        }),
      },
      {
        url: "https://ip-api.com/json/",
        parse: (data) => ({
          lat: data.lat,
          lng: data.lon,
          city: data.city,
          country: data.country,
        }),
      },
      {
        url: "https://ipinfo.io/json",
        parse: (data) => {
          const [lat, lng] = (data.loc || "0,0").split(",").map(Number);
          return { lat, lng, city: data.city, country: data.country };
        },
      },
    ];

    let locationData = null;

    for (const service of ipServices) {
      try {
        const response = await fetch(service.url, {
          timeout: 5000,
          headers: { Accept: "application/json" },
        });

        if (!response.ok) continue;

        const data = await response.json();
        locationData = service.parse(data);

        if (
          locationData &&
          locationData.lat &&
          locationData.lng &&
          !isNaN(locationData.lat) &&
          !isNaN(locationData.lng) &&
          locationData.lat >= -90 &&
          locationData.lat <= 90 &&
          locationData.lng >= -180 &&
          locationData.lng <= 180
        ) {
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

      const locationText =
        locationData.city && locationData.country
          ? `${locationData.city}, ${locationData.country}`
          : "IP Location";

      showToast(`Map centered on ${locationText}`, "success");

      // Add IP location marker
      addUserLocationMarker(ipLatLng, `IP Location: ${locationText}`);
    } else {
      throw new Error("All IP geolocation services failed");
    }
  } catch (error) {
    console.error("IP geolocation failed:", error);
    showToast(
      "Could not determine your location. Using default location.",
      "warning",
    );

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
    const markerTitle =
      marker.customTitle || (marker.getTitle && marker.getTitle()) || "";
    if (
      markerTitle.includes("Location") ||
      markerTitle.includes("Your Location")
    ) {
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
    const content = document.createElement("div");
    content.style.width = "24px";
    content.style.height = "24px";
    content.style.backgroundColor = "#4285F4";
    content.style.borderRadius = "50%";
    content.style.border = "3px solid #fff";
    content.style.boxShadow = "0 0 12px #4285F4";
    content.style.animation = "pulse 2s infinite";

    userMarker = new google.maps.marker.AdvancedMarkerElement({
      map: map,
      position: location,
      content: content,
    });
    userMarker.customTitle = title;
  } else {
    userMarker = new google.maps.Marker({
      position: location,
      map: map,
      title: title,
      icon: {
        url:
          "data:image/svg+xml;charset=UTF-8," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#4285F4" stroke="white" stroke-width="3"/><circle cx="12" cy="12" r="3" fill="white"/></svg>`,
          ),
        scaledSize: new google.maps.Size(24, 24),
      },
      animation: google.maps.Animation.DROP,
    });
  }

  markers.push(userMarker);
}

// Bind new control functions
document.addEventListener("DOMContentLoaded", () => {
  const toggleHeatmapBtn = document.getElementById("toggle-heatmap");
  const centerMapBtn = document.getElementById("center-map");

  if (toggleHeatmapBtn) {
    toggleHeatmapBtn.addEventListener("click", toggleHeatmap);
  }

  if (centerMapBtn) {
    centerMapBtn.addEventListener("click", centerMap);
  }
});

function clearMarkers() {
  markers.forEach((marker) => {
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
  filteredReports.forEach((report) => {
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
  if (modal && event.target === modal) {
    // Ensure modal exists before checking target
    closeModal();
  }
});

// ממיר כתובת לקואורדינטות ומוסיף סמן
async function geocodeAddress(address, report) {
  if (!address) return;

  // Check if address is already coordinates (format: "Coordinates: lat, lng")
  const coordMatch = address.match(
    /Coordinates:\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/,
  );
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
        fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`,
        ),
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
          handleError(new Error("Geocoding quota exceeded"), "geocodeAddress");
          return null;
        } else {
          console.error("Geocoding failed:", data.status, data.error_message);
          return null;
        }
      }
    }

    return createMarkerFromLocation(location, address, report);
  } catch (error) {
    handleError(error, "geocodeAddress");
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
        content: getMarkerContent(report.type),
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
          url:
            "data:image/svg+xml;charset=UTF-8," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${hazardMarkerColors[report.type] || hazardMarkerColors.default}" stroke="white" stroke-width="2"/></svg>`,
            ),
          scaledSize: new google.maps.Size(24, 24),
        },
      });
    }

    marker.reportId = report.id;
    marker.report = report;

    // Register first "click" callback to open infowindow and pan/zoom map
    registerMarkerClick(marker, () => {
      markers.forEach((m) => m.infoWindow?.close && m.infoWindow.close());
      const infowindow = new google.maps.InfoWindow({
        content: `
                <div class="info-window">
                    <h5>${report.type}</h5>
                    <p><strong>Location:</strong> ${address}</p>
                    <p><strong>Status:</strong> <span class="badge ${report.status === "Resolved" ? "bg-success" : "bg-danger"}">${report.status}</span></p>
                    <p><strong>Reported by:</strong> ${report.reportedBy}</p>
                    <p><strong>Time:</strong> ${new Date(report.time).toLocaleString()}</p>
                    ${report.image || report.url ? `<img src="${report.image || report.url}" alt="Hazard" style="width:200px;height:150px;object-fit:cover;margin:10px 0;cursor:pointer;" onclick="showImageModal('${report.image || report.url}')">` : ""}
                    <div class="mt-2">
                        <button class="btn btn-sm btn-primary me-2" onclick="showReportDetails(${JSON.stringify(report).replace(/"/g, "&quot;")})">Details</button>
                        <button class="btn btn-sm btn-warning" onclick="openEditReportModal(${JSON.stringify(report).replace(/"/g, "&quot;")})">Edit</button>
                    </div>
                </div>`,
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
      const rows = document.querySelectorAll("#reports-table tbody tr");
      rows.forEach((row) => row.classList.remove("table-active"));
      const targetRow = document.querySelector(
        `#reports-table tbody tr[data-report-id="${report.id}"]`,
      );
      if (targetRow) {
        targetRow.classList.add("table-active");
        targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    return marker;
  } catch (error) {
    handleError(error, "createMarkerFromLocation");
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
    await fetch("/api/redis/deleteImage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
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
    const response = await fetch(url, { method: "HEAD" });
    const valid =
      response.ok && response.headers.get("Content-Type")?.startsWith("image/");
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
    const report = await ApiService.getReportById(reportId);
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
  const block = document.createElement("div");
  block.className = "report-block";

  // Determine status badge class
  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case "resolved":
        return "badge-success";
      case "open":
        return "badge-danger";
      case "in progress":
        return "badge-warning";
      default:
        return "badge-secondary";
    }
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const imageUrl = report.image || report.url || "";
  const isCloudinaryImage = imageUrl.includes('cloudinary.com');
  const imageStatusClass = report.imageStatus === 'error' ? 'image-error' : '';
  
  block.innerHTML = `
        <img src="${imageUrl}" alt="Hazard image" class="report-block-image ${imageStatusClass}" onclick="openModal('${imageUrl}')" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <div class="image-placeholder" style="display:none; padding:20px; text-align:center; background:#f8f9fa; border-radius:4px;">
            <i class="fas fa-image text-muted"></i><br>
            <small class="text-muted">Image unavailable</small>
        </div>
        <div class="report-block-details">
            <div class="report-block-title">
                <i class="fas fa-exclamation-triangle"></i> ${report.type || "Unknown Type"}
            </div>
            <div class="report-block-meta">
                <span><i class="fas fa-map-marker-alt"></i> ${report.location || "Unknown Location"}</span>
                <span><i class="fas fa-calendar-alt"></i> ${formatDate(report.time)}</span>
                <span><i class="fas fa-user"></i> ${report.reportedBy || "Anonymous"}</span>
            </div>
            <div class="report-block-status">
                <span class="badge ${getStatusBadgeClass(report.status)}">${report.status || "Unknown"}</span>
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
                    <i class="fas fa-${report.status === "Resolved" ? "undo" : "check"}"></i> 
                    ${report.status === "Resolved" ? "Reopen" : "Resolve"}
                </button>
            </div>
        </div>
    `;

  // Event listeners
  const viewImageBtn = block.querySelector(".view-image-btn");
  const viewDetailsBtn = block.querySelector(".view-details-btn");
  const editBtn = block.querySelector(".edit-report-btn");
  const deleteBtn = block.querySelector(".delete-report-btn");
  const statusBtn = block.querySelector(".status-toggle-btn");

  if (viewImageBtn) {
    viewImageBtn.addEventListener("click", () => openModal(report.image));
  }

  if (viewDetailsBtn) {
    viewDetailsBtn.addEventListener("click", () => showReportDetails(report));
  }

  if (editBtn) {
    editBtn.addEventListener("click", () => openEditReportModal(report));
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => deleteReport(report.id));
  }

  if (statusBtn) {
    statusBtn.addEventListener("click", () => toggleReportStatus(report));
  }

  return block;
}

// Enhanced sorting utilities for dashboard
function sortReports(reports, sortBy = 'time', sortOrder = 'desc') {
  const validSortFields = ['time', 'status', 'type', 'location', 'reportedBy', 'id', 'createdAt'];
  const field = validSortFields.includes(sortBy) ? sortBy : 'time';
  const order = ['asc', 'desc'].includes(sortOrder) ? sortOrder : 'desc';

  return [...reports].sort((a, b) => {
    let aVal = a[field];
    let bVal = b[field];

    // Handle different data types
    if (field === 'time' || field === 'createdAt') {
      aVal = new Date(aVal || 0).getTime();
      bVal = new Date(bVal || 0).getTime();
    } else if (field === 'id') {
      aVal = parseInt(aVal) || 0;
      bVal = parseInt(bVal) || 0;
    } else {
      // String comparison (case insensitive)
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
    }

    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

// Multi-field sorting for complex scenarios
function multiSortReports(reports, sortConfig) {
  return [...reports].sort((a, b) => {
    for (const { field, order = 'desc' } of sortConfig) {
      let aVal = a[field];
      let bVal = b[field];

      // Handle different data types
      if (field === 'time' || field === 'createdAt') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      } else if (field === 'id') {
        aVal = parseInt(aVal) || 0;
        bVal = parseInt(bVal) || 0;
      } else {
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

// Smart sorting based on priority and relevance
function smartSortReports(reports, searchQuery = '') {
  const priorityWeights = {
    'New': 3,
    'Open': 3,
    'In Progress': 2,
    'Pending': 2,
    'Resolved': 1,
    'Closed': 0
  };

  const hazardPriority = {
    'Pothole': 5,
    'Alligator Crack': 4,
    'Block Crack': 3,
    'Transverse Crack': 3,
    'Longitudinal Crack': 2,
    'Patch Repair': 2,
    'Manhole': 1,
    'Lane Blur': 1,
    'Crosswalk Blur': 1
  };

  return [...reports].sort((a, b) => {
    // 1. Relevance score if search query exists
    if (searchQuery) {
      const aRelevance = calculateRelevanceScore(a, searchQuery);
      const bRelevance = calculateRelevanceScore(b, searchQuery);
      if (aRelevance !== bRelevance) return bRelevance - aRelevance;
    }

    // 2. Status priority
    const aStatusWeight = priorityWeights[a.status] || 0;
    const bStatusWeight = priorityWeights[b.status] || 0;
    if (aStatusWeight !== bStatusWeight) return bStatusWeight - aStatusWeight;

    // 3. Hazard type priority
    const aHazardWeight = hazardPriority[a.type] || 0;
    const bHazardWeight = hazardPriority[b.type] || 0;
    if (aHazardWeight !== bHazardWeight) return bHazardWeight - aHazardWeight;

    // 4. Time (most recent first)
    const aTime = new Date(a.time || 0).getTime();
    const bTime = new Date(b.time || 0).getTime();
    return bTime - aTime;
  });
}

// Calculate relevance score for search
function calculateRelevanceScore(report, query) {
  const searchFields = [
    { field: 'type', weight: 3 },
    { field: 'location', weight: 2 },
    { field: 'reportedBy', weight: 1 },
    { field: 'status', weight: 1 }
  ];

  let score = 0;
  const queryLower = query.toLowerCase();

  searchFields.forEach(({ field, weight }) => {
    const fieldValue = String(report[field] || '').toLowerCase();
    if (fieldValue.includes(queryLower)) {
      // Exact match gets full weight
      if (fieldValue === queryLower) {
        score += weight * 2;
      }
      // Starts with query gets 1.5x weight
      else if (fieldValue.startsWith(queryLower)) {
        score += weight * 1.5;
      }
      // Contains query gets normal weight
      else {
        score += weight;
      }
    }
  });

  return score;
}

// Export sorting functions globally for use in other components
window.sortReports = sortReports;
window.multiSortReports = multiSortReports;
window.smartSortReports = smartSortReports;
window.calculateRelevanceScore = calculateRelevanceScore;

// Core function to load and display reports on map
async function loadReports(options = {}) {
  if (isLoadingReports) {
    console.log('Already loading reports, skipping...');
    return;
  }
  
  isLoadingReports = true;
  
  try {
    console.log('Loading reports with options:', options);
    
    // Load reports using optimized ApiService (with Redis/Cloudinary validation)
    const reports = await ApiService.loadReports({
      useCache: true,
      sortBy: options.sortBy || 'time',
      sortOrder: options.sortOrder || 'desc',
      ...options
    });
    
    if (!reports || !Array.isArray(reports)) {
      console.warn('No valid reports received from Redis');
      return [];
    }
    
    // Log Redis and Cloudinary status
    const reportsWithImages = reports.filter(r => r.image);
    const cloudinaryImages = reportsWithImages.filter(r => r.image && r.image.includes('cloudinary.com'));
    console.log(`📊 Loaded ${reports.length} reports from Redis`);
    console.log(`🖼️ Found ${reportsWithImages.length} reports with images (${cloudinaryImages.length} from Cloudinary)`);
    
    allReports = reports;
    
    // Clear existing markers
    clearMarkers();
    
    // Add markers to map if map is ready
    if (map && isMapInitialized) {
      await addMarkersToMap(reports);
    }
    
    // Update dashboard stats
    updateDashboardInfo(reports);
    
    console.log(`Loaded ${reports.length} reports successfully`);
    return reports;
    
  } catch (error) {
    console.error('Error loading reports:', error);
    handleError(error, 'loadReports');
    return [];
  } finally {
    isLoadingReports = false;
  }
}

// Update dashboard statistics
function updateDashboardInfo(reports) {
  if (!reports || !Array.isArray(reports)) {
    console.warn('Invalid reports data for dashboard info update');
    return;
  }
  
  const stats = {
    total: reports.length,
    pending: reports.filter(r => (r.status || '').toLowerCase() === 'pending').length,
    resolved: reports.filter(r => (r.status || '').toLowerCase() === 'resolved').length,
    locations: new Set(reports.map(r => r.location).filter(Boolean)).size
  };
  
  // Update DOM elements with animation
  const updateElement = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
      const currentValue = parseInt(element.textContent) || 0;
      if (currentValue !== value) {
        element.style.transform = 'scale(1.1)';
        element.textContent = value;
        setTimeout(() => {
          element.style.transform = 'scale(1)';
        }, 200);
      }
    }
  };
  
  updateElement('total-reports', stats.total);
  updateElement('pending-reports', stats.pending);
  updateElement('resolved-reports', stats.resolved);
  updateElement('locations-count', stats.locations);
}

// Simplified marker creation for dashboard.html structure
async function addMarkersToMap(reports) {
  if (!map || !reports || !Array.isArray(reports)) {
    console.warn('Cannot add markers: invalid map or reports');
    return;
  }
  
  const bounds = new google.maps.LatLngBounds();
  let markersAdded = 0;
  
  for (const report of reports) {
    try {
      let coordinates = null;
      
      // Try to extract coordinates from location string
      const coordMatch = (report.location || '').match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      if (coordMatch) {
        coordinates = {
          lat: parseFloat(coordMatch[1]),
          lng: parseFloat(coordMatch[2])
        };
      } else if (report.coordinates) {
        coordinates = {
          lat: parseFloat(report.coordinates.lat),
          lng: parseFloat(report.coordinates.lng)
        };
      } else {
        // Try geocoding if needed
        const geocoded = await geocodeAddress(report.location, report);
        if (geocoded && geocoded.position) {
          coordinates = geocoded.position;
        }
      }
      
      if (coordinates && !isNaN(coordinates.lat) && !isNaN(coordinates.lng)) {
        const marker = createMapMarker(coordinates, report);
        if (marker) {
          markers.push(marker);
          bounds.extend(coordinates);
          markersAdded++;
        }
      }
    } catch (error) {
      console.warn('Error creating marker for report:', report.id, error);
    }
  }
  
  // Fit map to show all markers
  if (markersAdded > 0) {
    map.fitBounds(bounds);
    
    // Ensure zoom level is reasonable
    const listener = google.maps.event.addListener(map, 'idle', function() {
      if (map.getZoom() > 16) {
        map.setZoom(16);
      }
      google.maps.event.removeListener(listener);
    });
  }
  
  console.log(`Added ${markersAdded} markers to map`);
}

// Create individual marker
function createMapMarker(position, report) {
  try {
    let marker;
    
    if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
      // Use AdvancedMarkerElement
      const content = getMarkerContent(report.type);
      marker = new google.maps.marker.AdvancedMarkerElement({
        map: map,
        position: position,
        content: content,
        title: `${report.type} - ${report.location}`
      });
    } else {
      // Fallback to regular marker
      marker = new google.maps.Marker({
        position: position,
        map: map,
        title: `${report.type} - ${report.location}`,
        icon: {
          url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' fill='${hazardMarkerColors[report.type] || hazardMarkerColors.default}' stroke='white' stroke-width='2'/></svg>`
          ),
          scaledSize: new google.maps.Size(24, 24)
        }
      });
    }
    
    // Store report data
    marker.reportId = report.id;
    marker.report = report;
    
    // Add click event
    registerMarkerClick(marker, () => {
      showReportDetails(report);
    });
    
    return marker;
  } catch (error) {
    console.error('Error creating marker:', error);
    return null;
  }
}

// Initialize dashboard functionality for simple HTML structure
document.addEventListener('DOMContentLoaded', () => {
  console.log('Dashboard initializing...');
  
  // Initialize map controls
  setupMapControls();
  
  // Initialize sort functionality
  setupSortControls();
  
  // Initialize refresh functionality
  setupRefreshControls();
  
  console.log('Dashboard initialization complete');
});

// Setup map control buttons
function setupMapControls() {
  const heatmapBtn = document.getElementById('toggle-heatmap');
  const centerBtn = document.getElementById('center-map');
  const fullscreenBtn = document.getElementById('fullscreen-map');
  
  if (heatmapBtn) {
    heatmapBtn.addEventListener('click', toggleHeatmap);
  }
  
  if (centerBtn) {
    centerBtn.addEventListener('click', centerMap);
  }
  
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleMapFullscreen);
  }
}

// Setup sort controls
function setupSortControls() {
  const sortSelect = document.getElementById('report-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', handleSortChange);
  }
}

// Setup refresh controls
function setupRefreshControls() {
  const refreshBtn = document.getElementById('refresh-reports');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefreshReports);
  }
}

// Handle sort change
function handleSortChange(event) {
  const [field, order] = event.target.value.split('-');
  const sortedReports = sortReports(allReports, field, order);
  
  // Update map markers
  clearMarkers();
  addMarkersToMap(sortedReports);
  
  // Trigger DashboardUnified to update its view
  if (window.dashboard && window.dashboard.changeSorting) {
    window.dashboard.changeSorting(field, order);
  }
}

// Handle refresh reports
function handleRefreshReports() {
  const btn = document.getElementById('refresh-reports');
  if (btn) {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spin fa-spinner"></i>';
    btn.disabled = true;
    
    loadReports().finally(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    });
  }
}

// Toggle map fullscreen
function toggleMapFullscreen() {
  const mapContainer = document.querySelector('.map-container');
  if (mapContainer) {
    mapContainer.classList.toggle('fullscreen');
    
    // Trigger map resize
    if (map && google && google.maps) {
      setTimeout(() => {
        google.maps.event.trigger(map, 'resize');
      }, 100);
    }
  }
}


// Simple caching system
const reportCache = new Map();
const cacheExpiry = 5 * 60 * 1000; // 5 minutes

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

// Cleanup cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of reportCache.entries()) {
    if (now - value.timestamp > cacheExpiry) {
      reportCache.delete(key);
    }
  }
}, 60000); // Clean every minute

// Ensure map is initialized before any operations
function ensureMapReady() {
  return new Promise((resolve) => {
    if (map && isMapInitialized) {
      resolve();
    } else {
      const checkMap = setInterval(() => {
        if (map && isMapInitialized) {
          clearInterval(checkMap);
          resolve();
        }
      }, 100);
    }
  });
}

// Mark map as initialized
function markMapAsReady() {
  isMapInitialized = true;
  console.log('Map is ready for operations');
  
  // Load initial reports
  loadReports();
}

// Simplified initialization completed

// Essential DOM elements are handled by DashboardUnified.js

// Layout management is handled by DashboardUnified.js

// Filter management is handled by DashboardUnified.js

// Complex layout management removed - handled by DashboardUnified.js

// Simplified debounce function
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


// URL parameter management (simplified)
function updateURLParams(params) {
  try {
    const url = new URL(window.location);
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      } else {
        url.searchParams.delete(key);
      }
    });
    window.history.replaceState({}, '', url);
  } catch (error) {
    console.warn('Error updating URL params:', error);
  }
}

// --- Report Details Modal Logic ---
function showReportDetails(report) {
  // Inject modal HTML if not present
  if (!document.getElementById("reportDetailsModal")) {
    const modalHtml = `
      <div class="modal fade" id="reportDetailsModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-primary text-white">
              <h5 class="modal-title"><i class="fas fa-info-circle me-2"></i>Report Details</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body row g-3">
              <div class="col-md-4 text-center">
                <img id="modal-hazard-image" src="" alt="Hazard Image" class="img-fluid rounded mb-2" style="max-height:220px;object-fit:cover;cursor:pointer;display:none;" />
                <div id="modal-no-image" class="text-muted" style="display:none;">No image</div>
              </div>
              <div class="col-md-8">
                <div class="mb-2"><b>ID:</b> <span id="modal-hazard-id"></span> <button class="btn btn-sm btn-outline-secondary ms-2" id="copy-id-btn" title="Copy ID"><i class="fas fa-copy"></i></button></div>
                <div class="mb-2"><b>Type:</b> <span id="modal-type"></span></div>
                <div class="mb-2"><b>Location:</b> <span id="modal-location"></span></div>
                <div class="mb-2"><b>Status:</b> <span id="modal-status"></span></div>
                <div class="mb-2"><b>User:</b> <span id="modal-user"></span></div>
                <div class="mb-2"><b>Date:</b> <span id="modal-date"></span></div>
                <div class="mb-2"><b>Location Note:</b> <span id="modal-location-note"></span></div>
                <div class="mb-2"><b>Coordinates:</b> <span id="modal-coords"></span></div>
                <div class="mb-2"><b>Created At:</b> <span id="modal-created-at"></span></div>
                <div class="mb-2"><b>Last Modified:</b> <span id="modal-last-modified"></span></div>
                <div class="mt-3" id="modal-admin-actions" style="display:none;">
                  <button class="btn btn-warning btn-sm" id="edit-report-btn"><i class="fas fa-edit"></i> Edit</button>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="fas fa-times"></i> סגור</button>
            </div>
          </div>
        </div>
      </div>
    `;
    let container = document.getElementById("modal-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "modal-container";
      document.body.appendChild(container);
    }
    container.innerHTML = modalHtml;
  }

  // Set modal fields
  document.getElementById("modal-hazard-id").textContent = report.id || "N/A";
  document.getElementById("modal-type").textContent = report.type || "Unknown Type";
  document.getElementById("modal-location").textContent = report.location || "Unknown Location";
  document.getElementById("modal-status").textContent = report.status || "Unknown";
  document.getElementById("modal-user").textContent = report.reportedBy || "Anonymous";
  document.getElementById("modal-date").textContent = report.time ? new Date(report.time).toLocaleString() : "N/A";
  document.getElementById("modal-location-note").textContent = report.locationNote || "-";
  document.getElementById("modal-coords").textContent = report.coordinates ? `${report.coordinates.lat}, ${report.coordinates.lng}` : "-";
  document.getElementById("modal-created-at").textContent = report.createdAt ? new Date(report.createdAt).toLocaleString() : "-";
  document.getElementById("modal-last-modified").textContent = report.lastModified ? new Date(report.lastModified).toLocaleString() : "-";

  // Image logic
  const img = document.getElementById("modal-hazard-image");
  const noImg = document.getElementById("modal-no-image");
  if (report.image || report.url) {
    img.src = report.image || report.url;
    img.style.display = "block";
    noImg.style.display = "none";
    img.onclick = () => window.showImageModal(report.image || report.url);
  } else {
    img.style.display = "none";
    noImg.style.display = "block";
  }

  // Copy ID button
  const copyBtn = document.getElementById("copy-id-btn");
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(report.id || "");
    window.showToast("ID copied!", "success");
  };

  // Admin actions (edit button)
  const adminActions = document.getElementById("modal-admin-actions");
  const editBtn = document.getElementById("edit-report-btn");
  // Simple check: if user is admin (to be replaced with real check)
  if (window.isAdminUser) {
    adminActions.style.display = "block";
    editBtn.onclick = () => window.openEditReportModal(report);
  } else {
    adminActions.style.display = "none";
  }

  // Show the modal using Bootstrap
  const modalEl = document.getElementById("reportDetailsModal");
  modalEl.style.zIndex = 20000;
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  // ודא שה-body לא נשאר עם modal-open לאחר סגירה
  modalEl.addEventListener('hidden.bs.modal', () => {
    document.body.classList.remove('modal-open');
    document.body.style = '';
  });
}

// Expose globally for infowindow and HTML
window.showReportDetails = showReportDetails;

// Expose openModal globally for infowindow and HTML
window.openModal = openModal;

// Performance optimization: Lazy loading for images
function initLazyLoading() {
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove('lazy');
        img.classList.add('loaded');
        observer.unobserve(img);
      }
    });
  });

  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
}

// Performance optimization: Enhanced debounce (using existing function below)

// Performance optimization: Request throttling
const createThrottledRequest = (maxConcurrent = 3) => {
  let activeRequests = 0;
  const requestQueue = [];

  const processQueue = async () => {
    if (requestQueue.length === 0 || activeRequests >= maxConcurrent) return;
    
    activeRequests++;
    const { requestFn, resolve, reject } = requestQueue.shift();
    
    try {
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      activeRequests--;
      processQueue(); // Process next request in queue
    }
  };

  return (requestFn) => {
    return new Promise((resolve, reject) => {
      requestQueue.push({ requestFn, resolve, reject });
      processQueue();
    });
  };
};

const throttledRequest = createThrottledRequest();

// Manual hideReportDetailsModal and its listeners are removed as Bootstrap handles dismissal.

function toggleSidebar() {
  dom.sidebar.classList.toggle("open");
  dom.mainContent.classList.toggle("shifted");
  // UI Enhancement: add smooth opacity transition to sidebar
  dom.sidebar.style.transition = "left 0.3s ease, opacity 0.3s ease";
  dom.sidebar.style.opacity = dom.sidebar.classList.contains("open")
    ? "1"
    : "0.9";
}

// Expose toggleSidebar globally
window.toggleSidebar = toggleSidebar;

// === VIEW TOGGLE FUNCTIONALITY ===
let currentViewMode = "blocks"; // 'blocks', 'cards', or 'table'

// Toggle between blocks, cards, and table view
function toggleReportsView(mode) {
  const blocksContainer = document.getElementById("reports-blocks");
  const cardsContainer = document.getElementById("reports-cards");
  const tableContainer = document.getElementById("reports-table-container");
  const blocksBtn = document.getElementById("layout-blocks-btn");
  const cardsBtn = document.getElementById("layout-cards-btn");
  const tableBtn = document.getElementById("layout-table-btn");

  console.log("toggleReportsView called with mode:", mode);

  if (!blocksContainer || !cardsContainer || !tableContainer) {
    console.error("Missing container elements for view toggle");
    return;
  }

  currentViewMode = mode;

  // Hide all containers first
  blocksContainer.style.display = "none";
  cardsContainer.style.display = "none";
  const tableDiv = tableContainer.querySelector('.table-responsive');
  if (tableDiv) tableDiv.style.display = "none";

  // Remove active class from all buttons
  if (blocksBtn) blocksBtn.classList.remove("active");
  if (cardsBtn) cardsBtn.classList.remove("active");
  if (tableBtn) tableBtn.classList.remove("active");

  // Show selected view
  if (mode === "table") {
    if (tableDiv) tableDiv.style.display = "block";
    if (tableBtn) tableBtn.classList.add("active");
    
    // Re-render current data in table format
    if (window.currentFilteredReports) {
      renderReportTableRows(window.currentFilteredReports);
    }
  } else if (mode === "cards") {
    cardsContainer.style.display = "block";
    if (cardsBtn) cardsBtn.classList.add("active");
    
    // Re-render current data in cards format
    if (window.currentFilteredReports) {
      renderReportCards(window.currentFilteredReports);
    }
  } else {
    // blocks mode
    blocksContainer.style.display = "block";
    if (blocksBtn) blocksBtn.classList.add("active");
    
    // Re-render current data in blocks format
    if (window.currentFilteredReports) {
      renderReportBlocks(window.currentFilteredReports);
    }
  }
}

// Initialize view toggle event listeners
document.addEventListener("DOMContentLoaded", () => {
  const layoutBlocksBtn = document.getElementById("layout-blocks-btn");
  const layoutCardsBtn = document.getElementById("layout-cards-btn");
  const layoutTableBtn = document.getElementById("layout-table-btn");
  const applyMapSortBtn = document.getElementById("apply-map-sort");

  // Add event listeners for new layout buttons
  if (layoutBlocksBtn) {
    layoutBlocksBtn.addEventListener('click', () => toggleReportsView('blocks'));
  }
  
  if (layoutCardsBtn) {
    layoutCardsBtn.addEventListener('click', () => toggleReportsView('cards'));
  }
  
  if (layoutTableBtn) {
    layoutTableBtn.addEventListener('click', () => toggleReportsView('table'));
  }

  if (applyMapSortBtn) {
    applyMapSortBtn.addEventListener("click", sortMapMarkers);
  }
  
  // Add quick filter functionality
  const quickFilterBtns = document.querySelectorAll('.quick-filter-btn');
  quickFilterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = e.target.closest('.quick-filter-btn').dataset.filter;
      handleQuickFilter(filter, e.target.closest('.quick-filter-btn'));
    });
  });
});

// Quick filter handler
function handleQuickFilter(filter, button) {
  const statusFilter = document.getElementById('status-filter');
  const typeFilter = document.getElementById('type-filter');
  const dateFromFilter = document.getElementById('date-from-filter');
  const dateToFilter = document.getElementById('date-to-filter');
  const searchFilter = document.getElementById('search-filter');
  const quickFilterBtns = document.querySelectorAll('.quick-filter-btn');
  
  // Remove active class from all quick filter buttons
  quickFilterBtns.forEach(btn => btn.classList.remove('active'));
  
  const today = new Date().toISOString().split('T')[0];
  
  switch(filter) {
    case 'pending':
      statusFilter.value = 'Pending';
      button.classList.add('active');
      break;
      
    case 'resolved':
      statusFilter.value = 'Resolved';
      button.classList.add('active');
      break;
      
    case 'today':
      dateFromFilter.value = today;
      dateToFilter.value = today;
      button.classList.add('active');
      break;
      
    case 'clear':
      statusFilter.value = '';
      typeFilter.value = '';
      dateFromFilter.value = '';
      dateToFilter.value = '';
      searchFilter.value = '';
      button.classList.add('active');
      setTimeout(() => button.classList.remove('active'), 300);
      break;
  }
  
  // Trigger filter update
  if (window.filterAndRenderReports) {
    window.filterAndRenderReports();
  }
  
  // Show feedback animation
  button.style.transform = 'scale(0.95)';
  setTimeout(() => {
    button.style.transform = '';
  }, 150);
};

// === MAP SORTING FUNCTIONALITY ===
function sortMapMarkers() {
  const sortSelect = document.getElementById("report-sort-select");
  if (!sortSelect || !map || !markers.length) {
    showToast("No markers to sort or sort option not selected", "warning");
    return;
  }

  const [field, order] = sortSelect.value.split("-");
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

  showToast(
    `Map markers sorted by ${field} (${order === "asc" ? "ascending" : "descending"})`,
    "success",
  );
}

// Helper function to add individual marker to map with animation
function addMarkerToMap(report) {
  if (!report.coordinates) return;

  const position = {
    lat: parseFloat(report.coordinates.lat),
    lng: parseFloat(report.coordinates.lng),
  };

  if (isNaN(position.lat) || isNaN(position.lng)) return;

  let marker;
  const markerContent = getMarkerContent(report.type);

  if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
    marker = new google.maps.marker.AdvancedMarkerElement({
      map: map,
      position: position,
      content: markerContent,
      title: `${report.type} - ${report.location}`,
    });
  } else {
    marker = new google.maps.Marker({
      position: position,
      map: map,
      title: `${report.type} - ${report.location}`,
      icon: getMarkerIcon(report.type),
      animation: google.maps.Animation.DROP,
    });
  }

  // Store report data with marker
  marker.report = report;

  // Add click listener for report modal
  const clickListener = () => {
    // Close any existing info window
    if (window.currentInfoWindow) {
      window.currentInfoWindow.close();
    }

    // Show report details modal
    showReportDetails(report);
    
    // Optional: Show a brief info window with basic info
    const infoWindow = new google.maps.InfoWindow({
      content: `<div class="text-center p-2">
        <strong>${report.type}</strong><br>
        <small class="text-muted">${report.location}</small><br>
        <small class="text-info">Opening details...</small>
      </div>`,
    });

    infoWindow.open(map, marker);
    window.currentInfoWindow = infoWindow;
    
    // Auto-close info window after 2 seconds
    setTimeout(() => {
      if (window.currentInfoWindow === infoWindow) {
        infoWindow.close();
      }
    }, 2000);
  };

  if (marker.addListener) {
    marker.addListener("click", clickListener);
  } else {
    marker.addEventListener("click", clickListener);
  }

  markers.push(marker);
}

// Store current filtered reports for view switching
window.currentFilteredReports = [];

// Update the filter function to store current reports
const originalFilterAndRenderReports = window.filterAndRenderReports;
if (originalFilterAndRenderReports) {
  window.filterAndRenderReports = function () {
    const result = originalFilterAndRenderReports.apply(this, arguments);
    // Store the filtered reports for view switching
    const searchInput = document.getElementById("report-search-input");
    const sortSelect = document.getElementById("report-sort-select");
    const q = searchInput?.value?.toLowerCase() || "";

    let filtered = [...allReports];
    if (q) {
      filtered = filtered.filter(
        (r) =>
          r.type?.toLowerCase().includes(q) ||
          r.location?.toLowerCase().includes(q) ||
          r.status?.toLowerCase().includes(q) ||
          r.reportedBy?.toLowerCase().includes(q),
      );
    }

    if (sortSelect) {
      const [field, order] = sortSelect.value.split("-");
      filtered = sortReports(filtered, field, order);
    }

    window.currentFilteredReports = filtered;
    return result;
  };
}


// Add CSS for active button state
const style = document.createElement("style");
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
  const legend = document.createElement("div");
  legend.id = "map-legend";
  legend.style.background = "white";
  legend.style.padding = "10px";
  legend.style.margin = "10px";
  legend.style.fontSize = "14px";
  legend.style.fontFamily = "Arial, sans-serif";
  legend.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
  legend.innerHTML = '<h4 style="margin-top:0;">Key</h4>';
  // Loop through hazard types (excluding the default)
  for (const [hazard, color] of Object.entries(hazardMarkerColors)) {
    if (hazard === "default") continue;
    const item = document.createElement("div");
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.marginBottom = "4px";
    item.innerHTML = `<div style="background: ${color}; width: 16px; height: 16px; margin-right: 8px;"></div><span>${hazard}</span>`;
    legend.appendChild(item);
  }
  return legend;
}

// --- Maximize/Minimize Map/Reports Logic ---
document.addEventListener("DOMContentLoaded", () => {
  const mapMaxBtn = document.getElementById("map-maximize-btn");
  const reportsMaxBtn = document.getElementById("reports-maximize-btn");
  if (mapMaxBtn && dom.viewToggleContainer) {
    mapMaxBtn.addEventListener("click", () => {
      if (dom.viewToggleContainer.classList.contains("map-maximized")) {
        dom.viewToggleContainer.className = "normal-view";
      } else {
        dom.viewToggleContainer.className = "map-maximized";
      }
      if (typeof google !== "undefined" && typeof google.maps !== "undefined") {
        google.maps.event.trigger(map, "resize");
      }
    });
  }
  if (reportsMaxBtn && dom.viewToggleContainer) {
    reportsMaxBtn.addEventListener("click", () => {
      if (dom.viewToggleContainer.classList.contains("reports-maximized")) {
        dom.viewToggleContainer.className = "normal-view";
      } else {
        dom.viewToggleContainer.className = "reports-maximized";
      }
      if (typeof google !== "undefined" && typeof google.maps !== "undefined") {
        google.maps.event.trigger(map, "resize");
      }
    });
  }
});

// --- Deduplication/Merge Logic ---
function mergeDuplicateReports(reports) {
  const merged = [];
  const seenLoc = new Map();
  const seenImg = new Map();
  reports.forEach((r) => {
    // Key: type+location (case-insensitive, trimmed)
    const locKey = `${(r.type || "").toLowerCase().trim()}|${(r.location || "").toLowerCase().trim()}`;
    if (seenLoc.has(locKey)) {
      const existing = seenLoc.get(locKey);
      existing._mergedCount = (existing._mergedCount || 1) + 1;
      existing._mergedIds = existing._mergedIds || [existing.id];
      existing._mergedIds.push(r.id);
      if (!existing._mergedReporters)
        existing._mergedReporters = new Set([existing.reportedBy]);
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
  const blocksContainer = document.getElementById("reports-blocks-container");
  if (!blocksContainer) {
    console.error("Element with id 'reports-blocks-container' not found.");
    return;
  }

  // Clear existing blocks
  blocksContainer.innerHTML = "";
  console.log("Rendering", reports.length, "reports to blocks container");

  // Create and append each report block
  reports.forEach((report) => {
    const reportBlock = createReportBlock(report);
    blocksContainer.appendChild(reportBlock);
  });

  // Show loading message if no reports
  if (reports.length === 0) {
    blocksContainer.innerHTML =
      '<div class="text-center text-muted p-4"><i class="fas fa-inbox fa-2x mb-2"></i><br>No reports found</div>';
  }
}

// --- Render Report Cards ---
const REPORTS_PAGE_SIZE = 12;
let reportsCurrentPage = 1;
let reportsLastData = [];

function renderReportCards(reports, {resetPage = false} = {}) {
  const cardsContainer = document.getElementById("reports-cards");
  const loadMoreBtnId = 'load-more-reports-btn';
  if (!cardsContainer) {
    console.error("Element with id 'reports-cards' not found.");
    return;
  }
  if (resetPage) {
    reportsCurrentPage = 1;
  }
  reportsLastData = reports;
  // Clear existing cards
  cardsContainer.innerHTML = "";
  // Pagination logic
  const startIdx = 0;
  const endIdx = reportsCurrentPage * REPORTS_PAGE_SIZE;
  const pagedReports = reports.slice(startIdx, endIdx);
  // Create and append each report card
  pagedReports.forEach((report, index) => {
    const reportCard = createReportCard(report, index);
    cardsContainer.appendChild(reportCard);
  });
  // Show loading message if no reports
  if (reports.length === 0) {
    cardsContainer.innerHTML =
      '<div class="text-center text-muted p-4"><i class="fas fa-inbox fa-2x mb-2"></i><br>No reports found</div>';
  }
  // Add Load More button if needed
  let loadMoreBtn = document.getElementById(loadMoreBtnId);
  if (endIdx < reports.length) {
    if (!loadMoreBtn) {
      loadMoreBtn = document.createElement('button');
      loadMoreBtn.id = loadMoreBtnId;
      loadMoreBtn.className = 'btn btn-outline-primary w-100 mt-3';
      loadMoreBtn.innerHTML = '<i class="fas fa-plus"></i> טען עוד';
      loadMoreBtn.onclick = () => {
        reportsCurrentPage++;
        renderReportCards(reportsLastData);
      };
      cardsContainer.parentElement.appendChild(loadMoreBtn);
    }
  } else if (loadMoreBtn) {
    loadMoreBtn.remove();
  }
}

// Skeleton loading for reports
function renderReportCardsSkeleton(count = 6) {
  const cardsContainer = document.getElementById("reports-cards");
  if (!cardsContainer) return;
  cardsContainer.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'report-card report-card-skeleton';
    skeleton.innerHTML = `
      <div class="report-image-wrapper skeleton-bg"></div>
      <div class="report-meta skeleton-bg" style="height: 24px; margin: 12px 0;"></div>
      <div class="report-meta skeleton-bg" style="height: 18px; width: 60%;"></div>
    `;
    cardsContainer.appendChild(skeleton);
  }
}

function createReportCard(report, index) {
  const card = document.createElement("div");
  card.className = "carousel-card";
  card.style.animationDelay = `${index * 0.05}s`;
  card.dataset.reportId = report.id;
  const imageUrl = report.image || report.url || '/assets/placeholder-image.png';
  const date = report.time ? new Date(report.time).toLocaleDateString() : '';
  card.innerHTML = `
    <div class="carousel-card-img-wrapper">
      <img src="${imageUrl}" alt="${report.type || ''}" class="carousel-card-img" onerror="this.src='/assets/placeholder-image.png'; this.onerror=null;">
    </div>
    <div class="carousel-card-overlay">
      <div class="carousel-card-details">
        <div class="report-block-title" style="display:flex;align-items:center;gap:0.5rem;">
          <i class="fas fa-exclamation-triangle"></i>
          <h4 style="margin:0;font-size:1.1rem;">${report.type || 'Unknown'}</h4>
        </div>
        <div class="report-block-meta" style="display:flex;flex-direction:column;gap:2px;margin:8px 0 4px 0;">
          <span style="display:flex;align-items:center;gap:0.4em;font-size:0.98em;">
            <i class="fas fa-calendar-alt"></i> ${date}
          </span>
          <span style="display:flex;align-items:center;gap:0.4em;font-size:0.98em;">
            <i class="fas fa-map-marker-alt"></i> ${report.location || '---'}
          </span>
        </div>
        <span class="report-status ${getStatusBadgeClass(report.status)}" style="margin-top:4px;display:inline-block;">
          <i class="fas fa-${report.status === 'Resolved' ? 'check-circle' : report.status === 'Pending' ? 'clock' : 'exclamation-circle'}"></i> ${report.status || ''}
        </span>
      </div>
    </div>
  `;
  card.onclick = () => showReportDetails(report);
  return card;
}

// --- Render Report Table Rows ---
function renderReportTableRows(reports) {
  const tbody = document.getElementById("reports-table-body");
  if (!tbody) {
    console.error("Element with id 'reports-table-body' not found.");
    return;
  }
  tbody.innerHTML = "";
  console.log("Rendering", reports.length, "reports to the table body");
  reports.forEach((report) => {
    const tr = document.createElement("tr");
    tr.dataset.reportId = report.id; // For marker sync if needed
    // Checkbox for selection
    const checked = selectedReportIds.has(report.id.toString());
    tr.classList.toggle("selected", checked);
    tr.innerHTML = `
            <td style="text-align:center;">
                <input type="checkbox" class="row-select-checkbox" data-report-id="${report.id}" ${checked ? "checked" : ""} aria-label="Select report">
            </td>
            <td>
                ${
                  report.image || report.url
                    ? `<img src="${report.image || report.url}" alt="Hazard" class="hazard-thumbnail" 
                     style="width:56px;height:56px;object-fit:cover;border-radius:10px;
                     box-shadow:0 2px 8px #23294622;cursor:pointer"
                     onclick="showImageModal('${report.image || report.url}')" title="View full image">`
                    : '<span class="text-muted">No image</span>'
                }
            </td>
            <td>${report.type}</td>
            <td>
                <a href="#" class="text-info location-link" onclick="focusMapLocation('${report.location}')" title="Locate on map">
                    ${report.location}
                </a>
                ${
                  report._mergedCount
                    ? `<span class="badge bg-info ms-2" title="Multiple reports at this location">
                        +${report._mergedCount - 1}
                    </span>`
                    : ""
                }
            </td>
            <td>${new Date(report.time).toLocaleString()}</td>
            <td>
                <span class="badge ${getStatusBadgeClass(report.status)}">
                    ${report.status}
                </span>
            </td>
            <td>
                ${report.reportedBy}
                ${
                  report._mergedReporters
                    ? `<span class="badge bg-secondary ms-1" title="Multiple reporters">
                        +${report._mergedReporters.size - 1}
                    </span>`
                    : ""
                }
            </td>
            <td class="text-center">
                <div class="btn-group" role="group">
                    <button class="btn btn-outline-primary btn-sm" title="View Details" 
                            onclick="showReportDetails(${JSON.stringify(report)})">
                        <i class="fas fa-info-circle"></i>
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" title="View Image"
                            onclick="showImageModal('${report.image || report.url}')"
                            ${!report.image ? "disabled" : ""}>
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
                    <button class="btn btn-outline-${report.status === "Resolved" ? "danger" : "success"} btn-sm" 
                            title="Toggle Status" onclick="toggleReportStatus('${report.id}', '${report.status}')">
                        ${report.status === "Resolved" ? "Mark Open" : "Mark Resolved"}
                    </button>
                </div>
            </td>
        `;
    tbody.appendChild(tr);

    // Add hover events to sync with map markers
    tr.addEventListener("mouseenter", () => highlightMarker(report.id));
    // Checkbox event
    const checkbox = tr.querySelector(".row-select-checkbox");
    if (checkbox) {
      checkbox.addEventListener("change", (e) => {
        const id = e.target.dataset.reportId;
        if (e.target.checked) {
          selectedReportIds.add(id);
        } else {
          selectedReportIds.delete(id);
        }
        updateBulkToolbar();
        updateSelectAllCheckbox();
        tr.classList.toggle("selected", e.target.checked);
      });
    }
  });
  updateBulkToolbar();
  updateSelectAllCheckbox();
}

// Select-all logic
if (dom.selectAll) {
  dom.selectAll.addEventListener("change", (e) => {
    const checkboxes = document.querySelectorAll(".row-select-checkbox");
    if (e.target.checked) {
      lastReports.forEach((r) => selectedReportIds.add(r.id.toString()));
      checkboxes.forEach((cb) => {
        cb.checked = true;
        cb.closest("tr").classList.add("selected");
      });
    } else {
      selectedReportIds.clear();
      checkboxes.forEach((cb) => {
        cb.checked = false;
        cb.closest("tr").classList.remove("selected");
      });
    }
    updateBulkToolbar();
  });
}

function updateSelectAllCheckbox() {
  if (!dom.selectAll) return;
  const checkboxes = document.querySelectorAll(".row-select-checkbox");
  const checked = Array.from(checkboxes).filter((cb) => cb.checked).length;
  dom.selectAll.checked = checked > 0 && checked === checkboxes.length;
  dom.selectAll.indeterminate = checked > 0 && checked < checkboxes.length;
}

function updateBulkToolbar() {
  const count = selectedReportIds.size;
  if (dom.bulkToolbar) {
    dom.bulkToolbar.style.display = count > 0 ? "flex" : "none";
  }
  if (dom.selectedCount) {
    dom.selectedCount.textContent = `${count} selected`;
  }
}

// Bulk status update
if (dom.bulkStatusBtn) {
  dom.bulkStatusBtn.addEventListener("click", async () => {
    if (!selectedReportIds.size) return;
    const newStatus = prompt(
      "Enter new status for selected reports (e.g., Open, Resolved):",
    );
    if (!newStatus) return;
    for (const id of selectedReportIds) {
      try {
        await ApiService.updateReportStatus(id, newStatus);
      } catch (err) {
        console.error("Bulk status update error:", err);
      }
    }
    showToast("Bulk status update complete", "success");
    await loadReports();
    selectedReportIds.clear();
    updateBulkToolbar();
  });
}

// Bulk delete
if (dom.bulkDeleteBtn) {
  dom.bulkDeleteBtn.addEventListener("click", async () => {
    if (!selectedReportIds.size) return;
    if (
      !confirm(
        `Delete ${selectedReportIds.size} selected reports? This cannot be undone.`,
      )
    )
      return;
    for (const id of selectedReportIds) {
      try {
        await ApiService.deleteReport(id);
      } catch (err) {
        console.error("Bulk delete error:", err);
      }
    }
    showToast("Bulk delete complete", "success");
    await loadReports();
    selectedReportIds.clear();
    updateBulkToolbar();
  });
}

// Bulk export to CSV
function reportsToCSV(reports) {
  if (!reports.length) return "";
  const fields = [
    "id",
    "type",
    "location",
    "time",
    "status",
    "reportedBy",
    "image",
  ];
  const csvRows = [fields.join(",")];
  for (const r of reports) {
    const row = fields.map((f) => {
      let val = r[f] || "";
      if (typeof val === "string") val = val.replace(/"/g, '""');
      return '"' + val + '"';
    });
    csvRows.push(row.join(","));
  }
  return csvRows.join("\n");
}

if (dom.bulkExportBtn) {
  dom.bulkExportBtn.addEventListener("click", () => {
    if (!selectedReportIds.size) return;
    const selected = lastReports.filter((r) =>
      selectedReportIds.has(r.id.toString()),
    );
    const csv = reportsToCSV(selected);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hazard-reports-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  });
}

// Helper function for status badge classes
function getStatusBadgeClass(status) {
  switch (status?.toLowerCase()) {
    case "resolved":
      return "bg-success";
    case "open":
      return "bg-danger";
    case "in progress":
      return "bg-warning text-dark";
    default:
      return "bg-secondary";
  }
}

// Helper function to focus map on location
function focusMapLocation(location) {
  const marker = markers.find((m) => {
    const title = m.customTitle || (m.getTitle && m.getTitle()) || "";
    return title.includes(location);
  });
  if (marker) {
    const position = marker.position || marker.getPosition();
    if (position) {
      map.panTo(position);
      map.setZoom(18);
      highlightMarker(marker.reportId);
      setTimeout(() => unhighlightMarker(marker.reportId), 2100);
      if (marker.report) {
        showReportDetails(marker.report);
      }
    }
  } else {
    console.warn("No marker found for location:", location);
  }
}

// Helper functions for marker highlighting
function highlightMarker(reportId) {
  const marker = markers.find((m) => m.reportId === reportId);
  if (marker && marker.setAnimation) {
    // AdvancedMarkerElement does not support setAnimation; use CSS effect
    if (marker.content) {
      marker.content.style.boxShadow = "0 0 16px 4px #FFD700";
      marker.content.style.transform = "scale(1.2)";
    }
  }
}

function unhighlightMarker(reportId) {
  const marker = markers.find((m) => m.reportId === reportId);
  if (marker && marker.setAnimation) {
    if (marker.content) {
      marker.content.style.boxShadow = "";
      marker.content.style.transform = "";
    }
  }
}

// Function to show full-size image modal
function showImageModal(imageUrl) {
  if (!imageUrl) return;

  const modalHtml = `
        <div class="modal fade" id="imageModal" tabindex="-1" style="z-index:20000;">
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
  const existingModal = document.getElementById("imageModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Add new modal
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  // Show modal
  const modalEl = document.getElementById("imageModal");
  modalEl.style.zIndex = 20000;
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => {
    document.body.classList.remove('modal-open');
    document.body.style = '';
  });
}

// Toggle report status
async function toggleReportStatus(reportId, currentStatus) {
  const newStatus = currentStatus === "Resolved" ? "Open" : "Resolved";
  try {
    const statusResponse = await ApiService.updateReportStatus(reportId, newStatus);
    if (statusResponse && statusResponse.message) {
      await loadReports(); // Reload to update UI
      showToast(`Report marked as ${newStatus}`, "success");
    } else {
      throw new Error("Failed to update status");
    }
  } catch (error) {
    console.error("Error updating status:", error);
    showToast("Failed to update status", "error");
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
  const existingModal = document.getElementById("deleteConfirmModal");
  if (existingModal) {
    existingModal.remove();
  }

  // Add new modal
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  // Show modal
  const modal = new bootstrap.Modal(
    document.getElementById("deleteConfirmModal"),
  );
  modal.show();
}

// Delete report
async function deleteReport(reportId) {
  try {
    const deleteResponse = await ApiService.deleteReport(reportId);
    if (deleteResponse.ok) {
      // Close any open confirmation modal
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("deleteConfirmModal"),
      );
      if (modal) modal.hide();
      // Remove marker, reload reports, and show success message
      const markerIndex = markers.findIndex((m) => m.reportId === reportId);
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
      showToast("Report deleted successfully", "success");
    } else {
      const errMsg = deleteResponse && deleteResponse.status ? await deleteResponse.text() : "";
      throw new Error(`Failed to delete report: ${deleteResponse.status || ''} ${errMsg}`);
    }
  } catch (error) {
    console.error("Error deleting report:", error);
    showToast(`Failed to delete report: ${error.message}`, "error");
  }
}

// Add missing createInfoWindowContent function
function createInfoWindowContent(report) {
  const address = report.address || "Unknown location";
  return `
    <div class="info-window">
        <h5>${report.type}</h5>
        <p><strong>Location:</strong> ${address}</p>
        <p><strong>Status:</strong> <span class="badge ${report.status === "Resolved" ? "bg-success" : "bg-danger"}">${report.status}</span></p>
        <p><strong>Reported by:</strong> ${report.reportedBy}</p>
        <p><strong>Time:</strong> ${new Date(report.time).toLocaleString()}</p>
        ${report.image || report.url ? `<img src="${report.image || report.url}" alt="Hazard" style="width:200px;height:150px;object-fit:cover;margin:10px 0;cursor:pointer;" onclick="showImageModal('${report.image || report.url}')">` : ""}
        <div class="mt-2">
            <button class="btn btn-sm btn-primary me-2" onclick="showReportDetails(${JSON.stringify(report).replace(/"/g, "&quot;")})">Details</button>
            <button class="btn btn-sm btn-warning" onclick="openEditReportModal(${JSON.stringify(report).replace(/"/g, "&quot;")})">Edit</button>
        </div>
    </div>`;
}

// Add missing openEditReportModal function
function openEditReportModal(report) {
  // Temporary stub – replace with modal integration as needed.
  alert("Opening Edit Report modal for report: " + report.id);
}

// Enhanced toast notification system
function showToast(message, type = "info") {
  // Remove existing toasts
  const existingToasts = document.querySelectorAll(".toast-notification");
  existingToasts.forEach((toast) => toast.remove());

  // Create toast element
  const toast = document.createElement("div");
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
      toast.style.animation = "slideOut 0.3s ease-in";
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

function getAlertClass(type) {
  switch (type) {
    case "success":
      return "success";
    case "error":
      return "danger";
    case "warning":
      return "warning";
    case "info":
    default:
      return "info";
  }
}

function getToastIcon(type) {
  switch (type) {
    case "success":
      return "check-circle";
    case "error":
      return "exclamation-triangle";
    case "warning":
      return "exclamation-circle";
    case "info":
    default:
      return "info-circle";
  }
}

// Add CSS animations for toasts and map elements
const toastStyles = document.createElement("style");
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
    console.log("Smart heatmap updated with current data");
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
document.addEventListener("DOMContentLoaded", function () {
  // Initialize refresh button
  const refreshBtn = document.getElementById("refresh-info-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      // Clear cache and reload
      reportCache.clear();
      loadReports();
      showToast("Dashboard refreshed", "success");
    });
  }

  // Initialize refresh reports button
  const refreshReportsBtn = document.getElementById("refresh-reports");
  if (refreshReportsBtn) {
    refreshReportsBtn.addEventListener("click", () => {
      // Clear cache and reload
      reportCache.clear();
      loadReports();
      showToast("Reports refreshed", "success");
    });
  }

  // Initialize keyboard shortcuts
  initializeKeyboardShortcuts();

  // Initialize visibility change handler
  document.addEventListener("visibilitychange", handleVisibilityChange);

  // Set up periodic cache cleanup
  setInterval(cleanupCache, 60000); // Clean every minute

  // Initialize error boundary
  window.addEventListener("error", handleGlobalError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  connectSSE(); // Start SSE connection on load
  requestBrowserNotificationPermission();
  preloadHighPrioritySound();
});

// Keyboard shortcuts
function initializeKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + R: Refresh dashboard
    if ((e.ctrlKey || e.metaKey) && e.key === "r") {
      e.preventDefault();
      reportCache.clear();
      loadReports();
    }

    // Ctrl/Cmd + F: Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      const searchInput = document.getElementById("report-search-input");
      if (searchInput) {
        searchInput.focus();
      }
    }

    // Esc: Close modals
    if (e.key === "Escape") {
      const modals = document.querySelectorAll(".modal.show");
      modals.forEach((modal) => {
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
  console.error("Global error:", event.error);
  handleError(event.error, "global");
}

function handleUnhandledRejection(event) {
  console.error("Unhandled promise rejection:", event.reason);
  handleError(event.reason, "promise");
}

// Performance monitoring
function measurePerformance(name, fn) {
  return async function (...args) {
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
loadReports = measurePerformance("loadReports", originalLoadReports);

// Utility functions for dashboard state management
const DashboardState = {
  currentView: "normal",
  filters: {},
  sortConfig: { field: "time", order: "desc" },

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
    localStorage.setItem(
      "dashboard-state",
      JSON.stringify({
        currentView: this.currentView,
        filters: this.filters,
        sortConfig: this.sortConfig,
      }),
    );
  },

  loadState() {
    const saved = localStorage.getItem("dashboard-state");
    if (saved) {
      const state = JSON.parse(saved);
      this.currentView = state.currentView || "normal";
      this.filters = state.filters || {};
      this.sortConfig = state.sortConfig || { field: "time", order: "desc" };
    }
  },
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
    if (data.latitude && data.longitude && !data.error) {
      const ipLatLng = {
        lat: parseFloat(data.latitude),
        lng: parseFloat(data.longitude),
      };
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

// Loading indicator functions
function showLoadingIndicator() {
  let indicator = document.getElementById("loading-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "loading-indicator";
    indicator.className = "position-fixed top-50 start-50 translate-middle";
    indicator.innerHTML = `
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        `;
    indicator.style.zIndex = "9999";
    document.body.appendChild(indicator);
  }
  indicator.style.display = "block";
}

function hideLoadingIndicator() {
  const indicator = document.getElementById("loading-indicator");
  if (indicator) {
    indicator.style.display = "none";
  }
}


// Enhanced error handling
function handleError(error, context = "") {
  console.error(`Error in ${context}:`, error);

  // Show user-friendly error message
  const errorMessages = {
    "Failed to load reports":
      "Unable to load reports. Please check your connection and try again.",
    "Geocoding failed":
      "Unable to locate address on map. Please verify the address.",
    "Network error":
      "Network connection issue. Please check your internet connection.",
    "Failed to fetch":
      "Connection failed. Please check your internet connection.",
    TypeError: "A technical error occurred. Please refresh the page.",
  };

  let message = errorMessages[error.message] || "An unexpected error occurred.";

  // Add context-specific messages
  if (context === "loadReports") {
    message += " Click refresh to try again.";
  } else if (context === "geocodeAddress") {
    message = "Unable to locate some addresses on the map.";
  }

  showToast(message, "error");

  // Log to analytics/monitoring service if available
  if (window.analytics && window.analytics.track) {
    window.analytics.track("error", {
      error: error.message,
      context: context,
      stack: error.stack,
    });
  }
}


// --- SSE Real-Time Notifications ---
let eventSource = null;
let sseReconnectTimer = null;

function connectSSE() {
  if (eventSource) {
    eventSource.close();
  }
  eventSource = new EventSource("/api/events/stream");

  eventSource.onopen = () => {
    console.log("[SSE] Connected to /api/events/stream");
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
      console.warn("[SSE] Failed to parse event:", event.data, err);
    }
  };

  eventSource.onerror = (err) => {
    console.warn("[SSE] Connection error - server may be unavailable:", err.type || 'unknown');
    if (window.setLiveIndicator) window.setLiveIndicator(false);
    
    // Only attempt to reconnect if the page is still active and visible
    if (document.visibilityState === 'visible' && !sseReconnectTimer) {
      console.log("[SSE] Will attempt to reconnect in 5 seconds...");
      sseReconnectTimer = setTimeout(() => {
        console.log("[SSE] Attempting to reconnect...");
        connectSSE();
      }, 5000);
    }
  };
}

function handleIncomingEvent(data) {
  if (data.type === "new_report" && data.report) {
    showNotificationInCenter({
      title: "New Hazard Reported",
      body: `${data.report.type} at ${data.report.location}`,
      time: data.report.time,
      onClick: () => {
        window.showNotificationCenter();
        focusMapLocation(data.report.location);
      },
    });
    showDesktopNotification({
      title: "New Hazard Reported",
      body: `${data.report.type} at ${data.report.location}`,
      report: data.report,
      onClick: () => {
        window.showNotificationCenter();
        focusMapLocation(data.report.location);
      },
    });
    if (HIGH_PRIORITY_TYPES.includes(data.report.type)) {
      playHighPrioritySound();
    }
  } else if (data.type === "status_update" && data.report) {
    showNotificationInCenter({
      title: "Report Status Updated",
      body: `${data.report.type} at ${data.report.location} is now ${data.report.status}`,
      time: data.report.time,
      onClick: () => {
        window.showNotificationCenter();
        focusMapLocation(data.report.location);
      },
    });
    showDesktopNotification({
      title: "Report Status Updated",
      body: `${data.report.type} at ${data.report.location} is now ${data.report.status}`,
      report: data.report,
      onClick: () => {
        window.showNotificationCenter();
        focusMapLocation(data.report.location);
      },
    });
  } else {
    // Fallback for other event types
    showNotificationInCenter({
      title: data.type || "Event",
      body: data.message || "",
      time: data.time || Date.now(),
    });
  }
}

// --- Notification Center UI ---
function createNotificationCenter() {
  let center = document.getElementById("notification-center");
  if (center) return center;
  center = document.createElement("div");
  center.id = "notification-center";
  center.style.position = "fixed";
  center.style.top = "20px";
  center.style.right = "20px";
  center.style.width = "340px";
  center.style.maxHeight = "60vh";
  center.style.overflowY = "auto";
  center.style.zIndex = "10000";
  center.style.background = "rgba(30, 30, 40, 0.98)";
  center.style.borderRadius = "12px";
  center.style.boxShadow = "0 4px 16px rgba(0,0,0,0.25)";
  center.style.padding = "0 0 8px 0";
  center.style.display = "flex";
  center.style.flexDirection = "column";
  center.style.gap = "0";
  center.innerHTML = `
        <div id="notification-center-header" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px 8px 16px;border-bottom:1px solid #444;">
            <span style="font-weight:bold;font-size:1.1em;color:#fff;letter-spacing:1px;">Notifications <span id="live-indicator" style="margin-left:8px;font-size:0.9em;"></span></span>
            <button id="notification-center-close" style="background:none;border:none;color:#fff;font-size:1.2em;cursor:pointer;">&times;</button>
        </div>
        <div id="notification-list" style="padding:8px 0 0 0;max-height:48vh;overflow-y:auto;"></div>
    `;
  document.body.appendChild(center);
  // Close button
  center.querySelector("#notification-center-close").onclick = () => {
    center.style.display = "none";
  };
  // Show on click of bell icon (if you add one)
  window.showNotificationCenter = () => {
    center.style.display = "flex";
  };
  return center;
}

function showNotificationInCenter(notification) {
  const center = createNotificationCenter();
  center.style.display = "flex";
  const list = center.querySelector("#notification-list");
  if (!list) return;
  // Create notification item
  const item = document.createElement("div");
  item.className = "notification-item";
  item.style.background = "#232946";
  item.style.color = "#fff";
  item.style.margin = "0 12px 8px 12px";
  item.style.padding = "10px 12px";
  item.style.borderRadius = "8px";
  item.style.boxShadow = "0 2px 8px #23294633";
  item.style.display = "flex";
  item.style.alignItems = "center";
  item.style.gap = "12px";
  item.style.fontSize = "1em";
  item.style.cursor = "pointer";
  item.innerHTML = `
        <div style="flex:1;">
            <div style="font-weight:bold;">${notification.title || "New Event"}</div>
            <div style="font-size:0.95em;opacity:0.85;">${notification.body || ""}</div>
            <div style="font-size:0.85em;opacity:0.6;">${notification.time ? new Date(notification.time).toLocaleTimeString() : ""}</div>
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
  const el = document.getElementById("live-indicator");
  if (!el) return;
  if (isLive) {
    el.innerHTML = '<span class="live-dot"></span>LIVE';
    el.classList.add("live-pulse");
  } else {
    el.innerHTML =
      '<span class="live-dot" style="background:#888"></span>OFFLINE';
    el.classList.remove("live-pulse");
  }
}
window.setLiveIndicator = setLiveIndicator;

// Add CSS for notification center and pulse
(function addNotificationCenterStyles() {
  const style = document.createElement("style");
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
let browserNotificationPermission = "default";

function requestBrowserNotificationPermission() {
  if (!("Notification" in window)) {
    browserNotificationPermission = "unsupported";
    return;
  }
  Notification.requestPermission().then((permission) => {
    browserNotificationPermission = permission;
    console.log("[Notifications] Permission:", permission);
  });
}

function canShowDesktopNotification() {
  return browserNotificationPermission === "granted";
}

function showDesktopNotification({ title, body, report, onClick }) {
  if (!canShowDesktopNotification()) return;
  const notification = new Notification(title, {
    body: body,
    icon: "/public/icon.png", // Use your app icon
    tag: report && report.id ? `report-${report.id}` : undefined,
  });
  notification.onclick = function (event) {
    event.preventDefault();
    window.focus();
    if (onClick) onClick();
  };
}

// --- Sound Alerts for High-Priority Items ---
const HIGH_PRIORITY_TYPES = ["Pothole", "Manhole", "Transverse Crack"];
let highPriorityAudio = null;

function preloadHighPrioritySound() {
  if (!highPriorityAudio) {
    highPriorityAudio = document.createElement("audio");
    highPriorityAudio.src =
      "https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae5b2.mp3"; // Free notification sound
    highPriorityAudio.preload = "auto";
    highPriorityAudio.volume = 0.7;
    document.body.appendChild(highPriorityAudio);
    highPriorityAudio.style.display = "none";
  }
}

function playHighPrioritySound() {
  if (highPriorityAudio) {
    highPriorityAudio.currentTime = 0;
    highPriorityAudio.play().catch(() => {});
  }
}

// Add missing openEditReportModal function
window.openEditReportModal = function(report) {
  // TODO: Replace with actual modal logic
  alert("Edit Report: " + (report.id || JSON.stringify(report)));
};

// --- Carousel for Recent Reports ---
let carouselCurrent = 0;
let carouselReports = [];

function setupCarouselArrowEvents() {
  const leftArrow = document.getElementById('carousel-arrow-left');
  const rightArrow = document.getElementById('carousel-arrow-right');
  if (leftArrow && rightArrow) {
    leftArrow.onclick = function() {
      carouselCurrent = (carouselCurrent - 1 + carouselReports.length) % carouselReports.length;
      renderReportsCarousel(carouselReports);
    };
    rightArrow.onclick = function() {
      carouselCurrent = (carouselCurrent + 1) % carouselReports.length;
      renderReportsCarousel(carouselReports);
    };
  }
}

function renderReportsCarousel(reports) {
  carouselReports = reports;
  const carousel = document.getElementById('reports-carousel');
  const dotsContainer = document.getElementById('carousel-dots');
  if (!carousel) return;
  carousel.innerHTML = '';
  dotsContainer.innerHTML = '';
  if (!reports.length) {
    carousel.innerHTML = '<div class="text-center text-muted p-4">No reports found</div>';
    return;
  }
  // Only show 3 cards: left, active, right
  for (let i = 0; i < reports.length; i++) {
    const card = createReportCard(reports[i], i);
    card.classList.add('carousel-card');
    if (i === carouselCurrent) {
      card.classList.add('active');
    } else if (i === (carouselCurrent - 1 + reports.length) % reports.length) {
      card.classList.add('left');
    } else if (i === (carouselCurrent + 1) % reports.length) {
      card.classList.add('right');
    }
    carousel.appendChild(card);
  }
  // Dots
  for (let i = 0; i < reports.length; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot' + (i === carouselCurrent ? ' active' : '');
    dot.onclick = () => { carouselCurrent = i; renderReportsCarousel(carouselReports); };
    dotsContainer.appendChild(dot);
  }
  setupCarouselArrowEvents();
}

// Replace renderReportCards with carousel rendering in relevant place
// Example: after loading reports, call renderReportsCarousel(reports)

// --- Modal חיפוש ---
document.addEventListener('DOMContentLoaded', () => {
  const openSearchBtn = document.getElementById('open-search-modal');
  const searchModal = document.getElementById('search-modal');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  let bsSearchModal = null;
  if (searchModal) {
    bsSearchModal = new bootstrap.Modal(searchModal);
  }
  if (openSearchBtn && bsSearchModal) {
    openSearchBtn.addEventListener('click', () => {
      bsSearchModal.show();
      setTimeout(() => searchInput && searchInput.focus(), 300);
    });
  }
  if (searchModal) {
    searchModal.addEventListener('hidden.bs.modal', () => {
      if (searchInput) searchInput.value = '';
      if (searchResults) searchResults.innerHTML = '';
    });
  }
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) {
        searchResults.innerHTML = '';
        return;
      }
      const filtered = (allReports || []).filter(r =>
        (r.type && r.type.toLowerCase().includes(q)) ||
        (r.location && r.location.toLowerCase().includes(q)) ||
        (r.status && r.status.toLowerCase().includes(q))
      );
      searchResults.innerHTML = filtered.length ?
        filtered.map(r => `<div class="search-result-item" style="padding:8px 0;border-bottom:1px solid #eee;cursor:pointer;" onclick="showReportDetails(${JSON.stringify(r).replace(/"/g, '&quot;')})">
          <b>${r.type || ''}</b> | ${r.location || ''} | <span class="badge ${getStatusBadgeClass(r.status)}">${r.status || ''}</span>
        </div>`).join('') :
        '<div class="text-muted">לא נמצאו תוצאות</div>';
    });
  }
});

// --- Render Report Cards for Images Grid ---
function renderImagesGridCards(reports) {
  const grid = document.getElementById('images-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!reports || !reports.length) {
    grid.innerHTML = '<div class="text-muted">No reports found</div>';
    return;
  }
  reports.forEach((report) => {
    const card = document.createElement('div');
    card.className = 'card glass p-0 d-flex flex-column h-100';
    card.style.overflow = 'hidden';
    card.style.cursor = 'pointer';

    // תמונה
    const imgWrapper = document.createElement('div');
    imgWrapper.style.position = 'relative';
    const img = document.createElement('img');
    img.src = report.image || report.url || '/assets/placeholder-image.png';
    img.alt = report.type || '';
    img.style.width = '100%';
    img.style.height = '180px';
    img.style.objectFit = 'cover';
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      showImageModal(report.image || report.url || '/assets/placeholder-image.png');
    });
    imgWrapper.appendChild(img);
    // באדג' סטטוס
    const badge = document.createElement('span');
    badge.className = `badge ${getStatusBadgeClass(report.status)}`;
    badge.style.position = 'absolute';
    badge.style.top = '12px';
    badge.style.left = '12px';
    badge.textContent = report.status || '';
    imgWrapper.appendChild(badge);
    card.appendChild(imgWrapper);

    // גוף הכרטיס
    const body = document.createElement('div');
    body.className = 'p-3 flex-grow-1 d-flex flex-column justify-content-between';
    // פרטי דיווח
    const details = document.createElement('div');
    details.innerHTML = `
      <div class="fw-bold mb-1 text-accent"><i class="fas fa-exclamation-triangle me-1"></i> ${report.type || ''}</div>
      <div class="text-muted mb-1" style="font-size:0.95em;"><i class="fas fa-map-marker-alt me-1"></i> ${report.location || ''}</div>
      <div class="text-muted mb-1" style="font-size:0.95em;"><i class="fas fa-calendar-alt me-1"></i> ${report.time ? new Date(report.time).toLocaleDateString() : ''}</div>
    `;
    body.appendChild(details);
    // כפתורים
    const btns = document.createElement('div');
    btns.className = 'mt-2 d-flex gap-2';
    // כפתור Details
    const detailsBtn = document.createElement('button');
    detailsBtn.className = 'btn btn-glass btn-sm flex-fill';
    detailsBtn.innerHTML = '<i class="fas fa-info-circle"></i>';
    detailsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showReportDetails(report);
    });
    btns.appendChild(detailsBtn);
    // כפתור תמונה
    const imageBtn = document.createElement('button');
    imageBtn.className = 'btn btn-glass btn-sm flex-fill';
    imageBtn.innerHTML = '<i class="fas fa-image"></i>';
    imageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showImageModal(report.image || report.url || '/assets/placeholder-image.png');
    });
    btns.appendChild(imageBtn);
    body.appendChild(btns);
    card.appendChild(body);
    // כרטיס שלם
    card.addEventListener('click', () => showReportDetails(report));
    grid.appendChild(card);
  });
}

// ודא שהטעינה לגריד מתבצעת אוטומטית כאשר allReports נטען
window.renderImagesGridCards = renderImagesGridCards;

// Function to render reports cards in the new dashboard structure
function renderReportsCards(reports = []) {
  const container = document.getElementById('reports-container');
  if (!container) return;

  // Clear existing content
  container.innerHTML = '';

  if (!reports || reports.length === 0) {
    container.innerHTML = `
      <div class="text-center p-4">
        <i class="fas fa-inbox text-muted mb-3" style="font-size: 3rem;"></i>
        <h4 class="text-muted">No Reports Found</h4>
        <p class="text-secondary">No hazard reports available at the moment.</p>
      </div>
    `;
    return;
  }

  // Show recent reports (limit to 10 for performance)
  const recentReports = reports.slice(0, 10);
  
  recentReports.forEach((report, index) => {
    const card = document.createElement('div');
    card.className = 'report-card animate-fade-in-up';
    card.style.animationDelay = `${index * 0.05}s`;
    
    const statusClass = getStatusClass(report.status || 'pending');
    const hazardIcon = getHazardIcon(report.type || report.hazardType || 'Unknown');
    
    card.innerHTML = `
      <div class="d-flex align-items-start gap-3">
        <div class="report-icon flex-shrink-0">
          <i class="${hazardIcon} text-warning"></i>
        </div>
        <div class="report-content flex-grow-1">
          <h6 class="text-primary mb-1">${report.type || report.hazardType || 'Unknown Hazard'}</h6>
          <p class="text-secondary mb-2 small">${truncateLocation(report.location || 'Unknown Location')}</p>
          <div class="d-flex justify-content-between align-items-center">
            <span class="badge ${statusClass}">${capitalizeFirst(report.status || 'pending')}</span>
            <small class="text-muted">${formatReportDate(report.timestamp || report.date)}</small>
          </div>
        </div>
      </div>
    `;
    
    // Add click handler to show report details
    card.addEventListener('click', () => showReportDetails(report));
    container.appendChild(card);
  });
}

// Helper functions for rendering
function getStatusClass(status) {
  const statusMap = {
    'pending': 'badge-warning',
    'resolved': 'badge-success',
    'in_progress': 'badge-info',
    'rejected': 'badge-danger'
  };
  return statusMap[status.toLowerCase()] || 'badge-warning';
}

function getHazardIcon(hazardType) {
  const iconMap = {
    'Pothole': 'fas fa-exclamation-triangle',
    'Crack': 'fas fa-road',
    'Longitudinal Crack': 'fas fa-road',
    'Transverse Crack': 'fas fa-road',
    'Alligator Crack': 'fas fa-road',
    'Block Crack': 'fas fa-road',
    'Construction Joint Crack': 'fas fa-road',
    'Wheel Mark Crack': 'fas fa-road',
    'Manhole': 'fas fa-circle',
    'Patch Repair': 'fas fa-tools',
    'Lane Blur': 'fas fa-eye-slash',
    'Crosswalk Blur': 'fas fa-walking'
  };
  return iconMap[hazardType] || 'fas fa-exclamation-triangle';
}

function truncateLocation(location, maxLength = 30) {
  if (location.length <= maxLength) return location;
  return location.substring(0, maxLength) + '...';
}

function formatReportDate(dateInput) {
  if (!dateInput) return 'Unknown';
  
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return 'Unknown';
  
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Expose the function globally
window.renderReportsCards = renderReportsCards;

// קריאה לגריד רק אחרי טעינת דיווחים
function tryRenderImagesGridCards() {
  if (window.allReports && Array.isArray(window.allReports) && window.allReports.length > 0) {
    renderImagesGridCards(window.allReports);
    return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', function() {
  // ננסה להאזין לטעינה מאוחרת, אבל רק אם אין דיווחים
  if (!tryRenderImagesGridCards()) {
    let tries = 0;
    const interval = setInterval(() => {
      if (tryRenderImagesGridCards()) {
        clearInterval(interval);
      } else if (++tries > 30) {
        clearInterval(interval);
      }
    }, 300);
  }
});

