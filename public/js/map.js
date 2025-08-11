// MarkerClusterer will be loaded via script tag in HTML

let map;
let customHeatLayer;
let userLocation;
let markers = [];
let densityPolygons = [];
let mapInitialized = false;
let geocodingCache = new Map(); // Cache for geocoded addresses

const DEFAULT_CENTER = { lat: 31.7683, lng: 35.2137 }; // Israel center (Jerusalem)
const DEFAULT_ZOOM = 8.5; // Zoom level to show most of Israel
const RADIUS_METERS = 30000;

// Custom heatmap implementation since Google's is deprecated
class CustomHeatLayer {
  constructor(options = {}) {
    this.data = [];
    this.map = null;
    this.radius = options.radius || 50;
    this.opacity = options.opacity || 0.6;
    this.canvas = null;
    this.ctx = null;
  }

  setData(data) {
    this.data = data;
    this.draw();
  }

  setMap(map) {
    if (this.map) {
      this.map.getDiv().removeChild(this.canvas);
      this.map.unbind("bounds_changed", this.draw);
      this.map.unbind("zoom_changed", this.draw);
    }

    this.map = map;

    if (map) {
      this.canvas = document.createElement("canvas");
      this.canvas.style.position = "absolute";
      this.canvas.style.top = "0";
      this.canvas.style.left = "0";
      this.canvas.style.pointerEvents = "none";
      this.canvas.style.zIndex = "1";
      this.ctx = this.canvas.getContext("2d");

      map.getDiv().appendChild(this.canvas);

      google.maps.event.addListener(map, "bounds_changed", () => this.draw());
      google.maps.event.addListener(map, "zoom_changed", () => this.draw());

      this.draw();
    }
  }

  getMap() {
    return this.map;
  }

  draw() {
    if (!this.map || !this.canvas || this.data.length === 0) return;

    const bounds = this.map.getBounds();
    if (!bounds) return;

    const projection = this.map.getProjection();
    if (!projection) return;

    const mapDiv = this.map.getDiv();
    this.canvas.width = mapDiv.offsetWidth;
    this.canvas.height = mapDiv.offsetHeight;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Create heat points
    for (const point of this.data) {
      if (bounds.contains(point)) {
        const pixel = projection.fromLatLngToDivPixel(point);
        if (pixel) {
          this.drawHeatPoint(pixel.x, pixel.y);
        }
      }
    }
  }

  drawHeatPoint(x, y) {
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, this.radius);
    gradient.addColorStop(0, `rgba(255, 0, 0, ${this.opacity})`);
    gradient.addColorStop(0.4, `rgba(255, 165, 0, ${this.opacity * 0.7})`);
    gradient.addColorStop(0.7, `rgba(255, 255, 0, ${this.opacity * 0.4})`);
    gradient.addColorStop(1, "rgba(255, 255, 0, 0)");

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.radius, 0, Math.PI * 2);
    this.ctx.fill();
  }
}

function setupMobileMapToolbar() {
  const mapEl = document.getElementById("map");
  const toolbar = document.createElement("div");
  toolbar.className = "mobile-map-toolbar";

  const toggleBtn = document.getElementById("toggle-heatmap");
  const centerBtn = document.getElementById("center-map");

  const zoomIn = document.createElement("button");
  zoomIn.id = "mobile-zoom-in";
  zoomIn.innerHTML = '<i class="fas fa-plus"></i>';
  zoomIn.setAttribute("aria-label", "Zoom in");

  const zoomOut = document.createElement("button");
  zoomOut.id = "mobile-zoom-out";
  zoomOut.innerHTML = '<i class="fas fa-minus"></i>';
  zoomOut.setAttribute("aria-label", "Zoom out");

  if (toggleBtn) toolbar.appendChild(toggleBtn);
  if (centerBtn) toolbar.appendChild(centerBtn);
  toolbar.appendChild(zoomIn);
  toolbar.appendChild(zoomOut);
  mapEl.appendChild(toolbar);

  const mapControls = document.querySelector(".map-controls");
  mapControls?.remove();

  zoomIn.addEventListener("click", () => {
    if (map) {
      const currentZoom = map.getZoom();
      map.setZoom(currentZoom + 1);
    }
  });

  zoomOut.addEventListener("click", () => {
    if (map) {
      const currentZoom = map.getZoom();
      map.setZoom(currentZoom - 1);
    }
  });
}

export function initializeMap() {
  return new Promise((resolve, reject) => {
    if (mapInitialized) {
      resolve();
      return;
    }

    // Wait for Google Maps API to load
    const checkGoogleMaps = () => {
      if (typeof google !== "undefined" && google.maps && google.maps.Map) {
        initGoogleMap()
          .then(() => {
            mapInitialized = true;
            resolve();
          })
          .catch(reject);
      } else {
        setTimeout(checkGoogleMaps, 100);
      }
    };

    checkGoogleMaps();

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!mapInitialized) {
        reject(new Error("Google Maps API failed to load within timeout"));
      }
    }, 15000);
  });
}

async function initGoogleMap() {
  const isMobile = window.innerWidth <= 768;

  // Initialize map
  map = new google.maps.Map(document.getElementById("map"), {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    mapTypeId: "roadmap",
    zoomControl: !isMobile,
    mapTypeControl: false,
    scaleControl: true,
    streetViewControl: false,
    rotateControl: false,
    fullscreenControl: !isMobile,
  });

  // Initialize custom heatmap (replacement for deprecated Google Heatmap)
  customHeatLayer = new CustomHeatLayer({
    radius: 50,
    opacity: 0.6,
  });

  // Initialize MarkerClusterer
  await initMarkerClusterer();

  // Get user location with better error handling
  await getUserLocation();

  if (isMobile) {
    setupMobileMapToolbar();
  }

  console.log("Google Map initialized successfully");
}

async function initMarkerClusterer() {
  try {
    // Wait for MarkerClusterer to be available
    if (typeof markerClusterer === 'undefined') {
      console.warn("MarkerClusterer not loaded, using fallback");
      createFallbackClusterer();
      return;
    }
    
    window.markerClustererInstance = new markerClusterer.MarkerClusterer({
      map,
      markers: [],
      gridSize: 60,
      maxZoom: 15,
    });
    console.log("MarkerClusterer initialized successfully");
  } catch (error) {
    console.warn("Failed to initialize MarkerClusterer:", error);
    createFallbackClusterer();
  }
}

function createFallbackClusterer() {
  window.markerClustererInstance = {
    clearMarkers: () => {
      markers.forEach((marker) => marker.setMap(null));
    },
    addMarkers: (newMarkers) => {
      newMarkers.forEach((marker) => marker.setMap(map));
    },
  };
}

async function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported");
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(DEFAULT_ZOOM);
      resolve();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        console.log("User location found:", userLocation);

        // Center map on user location
        map.setCenter(userLocation);
        map.setZoom(12);

        // Add user location marker using simple Marker
        new google.maps.Marker({
          position: userLocation,
          map,
          title: "Your Location",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: "#4285f4",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 8,
          },
          zIndex: 1000,
        });
        resolve();
      },
      (error) => {
        console.warn("Geolocation failed:", error.message);
        // Fallback to default location
        map.setCenter(DEFAULT_CENTER);
        map.setZoom(DEFAULT_ZOOM);
        resolve();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      },
    );
  });
}

export function toggleHeatmap() {
  if (!map || !customHeatLayer) return;

  if (customHeatLayer.getMap()) {
    customHeatLayer.setMap(null);
  } else {
    customHeatLayer.setMap(map);
  }
}

export function centerMap() {
  if (!map) return;

  // Always center on Israel
  map.setCenter(DEFAULT_CENTER);
  map.setZoom(DEFAULT_ZOOM);
}

export function clearGeocodingCache() {
  const cacheSize = geocodingCache.size;
  geocodingCache.clear();
  console.log(`🗑️ Cleared geocoding cache (${cacheSize} entries)`);
  return cacheSize;
}

export function getGeocodingCacheStats() {
  return {
    size: geocodingCache.size,
    entries: Array.from(geocodingCache.entries()).map(([address, coords]) => ({
      address,
      hasCoords: coords !== null
    }))
  };
}

export async function geocode(address) {
  // Check cache first
  if (geocodingCache.has(address)) {
    console.log(`📋 Using cached geocoding result for: "${address}"`);
    return geocodingCache.get(address);
  }

  return new Promise((resolve) => {
    const geocoder = new google.maps.Geocoder();

    geocoder.geocode({ address: address }, (results, status) => {
      if (status === "OK" && results[0]) {
        const location = results[0].geometry.location;
        const coords = [location.lat(), location.lng()];
        
        // Cache the result
        geocodingCache.set(address, coords);
        console.log(`💾 Cached geocoding result for: "${address}" → ${coords[0]}, ${coords[1]}`);
        
        resolve(coords);
      } else {
        console.error(`Geocoding failed for "${address}":`, status);
        // Cache null result to avoid repeated failed attempts
        geocodingCache.set(address, null);
        resolve(null);
      }
    });
  });
}

export async function plotReports(reports) {
  if (!map || !mapInitialized) {
    console.warn("Map not initialized yet");
    return;
  }

  console.log(`🗺️ Starting to plot ${reports.length} reports on map...`);

  // Clear existing markers and data
  if (
    window.markerClustererInstance &&
    window.markerClustererInstance.clearMarkers
  ) {
    window.markerClustererInstance.clearMarkers();
  }
  markers = [];
  const heatmapData = [];

  // Clear existing density polygons
  densityPolygons.forEach((polygon) => polygon.setMap(null));
  densityPolygons = [];

  for (const report of reports) {
    let coords;
    if (report.coordinates && report.coordinates.lat && report.coordinates.lon) {
      coords = { lat: Number(report.coordinates.lat), lng: Number(report.coordinates.lon) };
    } else if (report.lat && report.lon) {
      coords = { lat: Number(report.lat), lng: Number(report.lon) };
    } else if (
      Array.isArray(report.location) &&
      report.location.length >= 2
    ) {
      const [lat, lon] = report.location;
      coords = { lat: Number(lat), lng: Number(lon) };
    } else if (typeof report.location === "string") {
      // Parse coordinate string format: "Lat: 32.092, Long: 34.822"
      const latMatch = report.location.match(/Lat:\s*([-+]?\d*\.?\d+)/i);
      const lonMatch = report.location.match(/Long:\s*([-+]?\d*\.?\d+)/i);
      
      if (latMatch && lonMatch) {
        const lat = Number(latMatch[1]);
        const lng = Number(lonMatch[1]);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          coords = { lat, lng };
          console.log(`✅ Parsed coordinates for report ${report.id}: ${lat}, ${lng}`);
        } else {
          console.warn(`❌ Invalid coordinates for report ${report.id}: lat=${lat}, lng=${lng}`);
        }
      } else {
        // Try to geocode the address
        console.log(`🌍 Attempting to geocode address for report ${report.id}: "${report.location}"`);
        try {
          const geocodedCoords = await geocode(report.location);
          if (geocodedCoords) {
            coords = { lat: geocodedCoords[0], lng: geocodedCoords[1] };
            console.log(`✅ Geocoded address for report ${report.id}: ${coords.lat}, ${coords.lng}`);
          } else {
            console.warn(`❌ Failed to geocode address for report ${report.id}: "${report.location}"`);
          }
        } catch (geocodeError) {
          console.warn(`❌ Geocoding error for report ${report.id}:`, geocodeError);
        }
      }
    }

    if (coords) {
      // Create marker using simple Marker
      const marker = new google.maps.Marker({
        position: coords,
        map,
        title: `${report.type} - ${report.status}`,
        icon: getMarkerIcon(report.type, report.status),
      });

      // Create info window
      const infoWindow = new google.maps.InfoWindow({
        content: createInfoWindowContent(report),
      });

      marker.addListener("click", () => {
        // Close other info windows
        markers.forEach((m) => {
          if (m.infoWindow) {
            m.infoWindow.close();
          }
        });
        infoWindow.open(map, marker);
      });

      marker.infoWindow = infoWindow;
      markers.push(marker);

      // Add to custom heatmap data
      heatmapData.push(new google.maps.LatLng(coords.lat, coords.lng));
    }
  }

  console.log(`✅ Successfully created ${markers.length} markers from ${reports.length} reports`);

  // Update marker clusterer
  if (
    window.markerClustererInstance &&
    window.markerClustererInstance.addMarkers
  ) {
    window.markerClustererInstance.addMarkers(markers);
    console.log('📍 Added markers to clusterer');
  } else {
    // Set map for all markers if no clusterer
    markers.forEach((marker) => marker.setMap(map));
    console.log('📍 Added markers directly to map (no clusterer)');
  }

  // Update custom heatmap
  if (customHeatLayer) {
    customHeatLayer.setData(heatmapData);
    console.log(`🔥 Updated heatmap with ${heatmapData.length} points`);
  }

  // Create density polygons (disabled for cleaner look)
  // createDensityPolygons(
  //   heatmapData.map((point) => ({ lat: point.lat(), lng: point.lng() })),
  // );

  // Auto-fit map bounds if there are reports
  if (markers.length > 0) {
    const bounds = new google.maps.LatLngBounds();
    markers.forEach((marker) => bounds.extend(marker.getPosition()));

    // Include user location in bounds if available
    if (userLocation) {
      bounds.extend(userLocation);
    }

    map.fitBounds(bounds);

    // Ensure reasonable zoom level for Israel
    google.maps.event.addListenerOnce(map, "bounds_changed", () => {
      if (map.getZoom() > 15) {
        map.setZoom(15);
      } else if (map.getZoom() < 7.5) {
        map.setZoom(7.5);
      }
    });
  }
}

function getMarkerIcon(type, status) {
  // Type-based colors (primary)
  const typeColors = {
    'pothole': '#dc3545',        // Red
    'crack': '#28a745',          // Green  
    'knocked': '#ffc107',        // Yellow
    'surface damage': '#007bff', // Blue
    'surface_damage': '#007bff', // Blue (alternative format)
  };
  
  // Pink color for any other hazard types not specifically defined
  const defaultTypeColor = '#e91e63'; // Pink
  
  // Status-based colors (fallback)
  const statusColors = {
    Open: "#dc3545",
    New: "#dc3545", 
    "In Progress": "#ffc107",
    Resolved: "#28a745",
  };

  // Normalize type for comparison
  const normalizedType = type ? type.toLowerCase().replace(/[\s_]/g, ' ') : '';
  
  // Check if it's any type of crack first
  let color;
  if (normalizedType.includes('crack')) {
    color = typeColors['crack'];
  } else {
    // Use type color first, then status color, then default pink for unknown types
    color = typeColors[normalizedType] || statusColors[status] || defaultTypeColor;
  }
  
  // Create SVG data URL for the marker icon
  const svgIcon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 16 16 24 16 24s16-8 16-24C32 7.163 24.837 0 16 0z" fill="${color}"/>
      <circle cx="16" cy="16" r="8" fill="#fff"/>
      <text x="16" y="20" text-anchor="middle" fill="${color}" font-size="10" font-weight="bold">!</text>
    </svg>
  `)}`;
  
  return {
    url: svgIcon,
    scaledSize: new google.maps.Size(32, 40),
    anchor: new google.maps.Point(16, 40),
  };
}

function createInfoWindowContent(report) {
  const img = report.image
    ? `<div class="mb-2"><img src="${report.image}" alt="${report.type || ""}" style="max-width:200px;max-height:150px;border-radius:4px;"/></div>`
    : "";

  return `
    <div style="max-width: 250px; font-family: 'Poppins', sans-serif; color:#212529; background:#fff;">
      ${img}
      <h6 class="mb-2" style="color:#212529;"><strong>Report #${report.id}</strong></h6>
      <p class="mb-1"><strong>Type:</strong> ${formatType(report.type)}</p>
      <p class="mb-1"><strong>Status:</strong> <span style="background-color:${getStatusColor(report.status)}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${report.status}</span></p>
      <p class="mb-1"><strong>Location:</strong> ${report.location || "Unknown"}</p>
      <p class="mb-0"><strong>Time:</strong> ${report.time ? new Date(report.time).toLocaleString() : "Unknown"}</p>
    </div>
  `;
}

function formatType(type) {
  if (!type) return "Unknown";
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getStatusColor(status) {
  const colors = {
    Open: "#dc3545",
    New: "#dc3545",
    "In Progress": "#ffc107",
    Resolved: "#28a745",
  };
  return colors[status] || "#6c757d";
}

function createDensityPolygons(points, threshold = 5) {
  if (points.length === 0) return;

  const GRID = 0.01; // Grid size for density calculation
  const cells = new Map();

  for (const point of points) {
    const key = `${Math.floor(point.lat / GRID)},${Math.floor(point.lng / GRID)}`;
    cells.set(key, (cells.get(key) || 0) + 1);
  }

  for (const [key, count] of cells.entries()) {
    if (count >= threshold) {
      const [latIdx, lngIdx] = key.split(",").map(Number);
      const latMin = latIdx * GRID;
      const lngMin = lngIdx * GRID;
      const latMax = latMin + GRID;
      const lngMax = lngMin + GRID;

      const polygon = new google.maps.Polygon({
        paths: [
          { lat: latMin, lng: lngMin },
          { lat: latMin, lng: lngMax },
          { lat: latMax, lng: lngMax },
          { lat: latMax, lng: lngMin },
        ],
        strokeColor: "#007bff",
        strokeOpacity: 0.3,
        strokeWeight: 1,
        fillColor: "#007bff",
        fillOpacity: 0.1,
        map: map,
      });

      densityPolygons.push(polygon);
    }
  }
}
