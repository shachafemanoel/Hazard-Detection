let map;
let markerCluster;
let heatLayer;
let densityPolygons = [];
let userLocation;

const DEFAULT_CENTER = [32, 32];
const DEFAULT_ZOOM = 10; // fallback zoom
const RADIUS_METERS = 30000;

function setupMobileMapToolbar() {
  const mapEl = document.getElementById('map');
  const toolbar = document.createElement('div');
  toolbar.className = 'mobile-map-toolbar';

  const toggleBtn = document.getElementById('toggle-heatmap');
  const centerBtn = document.getElementById('center-map');

  const zoomIn = document.createElement('button');
  zoomIn.id = 'mobile-zoom-in';
  zoomIn.innerHTML = '<i class="fas fa-plus"></i>';
  zoomIn.setAttribute('aria-label', 'Zoom in');

  const zoomOut = document.createElement('button');
  zoomOut.id = 'mobile-zoom-out';
  zoomOut.innerHTML = '<i class="fas fa-minus"></i>';
  zoomOut.setAttribute('aria-label', 'Zoom out');

  if (toggleBtn) toolbar.appendChild(toggleBtn);
  if (centerBtn) toolbar.appendChild(centerBtn);
  toolbar.appendChild(zoomIn);
  toolbar.appendChild(zoomOut);
  mapEl.appendChild(toolbar);

  const mapControls = document.querySelector('.map-controls');
  mapControls?.remove();

  zoomIn.addEventListener('click', () => map.zoomIn());
  zoomOut.addEventListener('click', () => map.zoomOut());
}

export function initializeMap() {
  const isMobile = window.innerWidth <= 768;
  map = L.map('map', { zoomControl: !isMobile }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }).addTo(map);

  markerCluster = L.markerClusterGroup();
  map.addLayer(markerCluster);

  heatLayer = L.heatLayer([], { radius: 25 });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLocation = [pos.coords.latitude, pos.coords.longitude];
        const bounds = L.circle(userLocation, { radius: RADIUS_METERS }).getBounds();
        map.fitBounds(bounds);
      },
      () => map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    );
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }

  if (isMobile) {
    setupMobileMapToolbar();
  }
}

export function toggleHeatmap(layer = heatLayer) {
  if (!map || !layer) return;
  if (map.hasLayer(layer)) {
    map.removeLayer(layer);
  } else {
    map.addLayer(layer);
  }
}

export function centerMap() {
  if (!map) return;
  if (userLocation) {
    const bounds = L.circle(userLocation, { radius: RADIUS_METERS }).getBounds();
    map.fitBounds(bounds);
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }
}

export async function geocode(address) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
    const data = await response.json();
    if (data && data.length > 0) {
      const { lat, lon } = data[0];
      return [Number(lat), Number(lon)];
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export async function plotReports(reports) {
  if (!map || !markerCluster) return;

  markerCluster.clearLayers();
  const heatPoints = [];

  for (const report of reports) {
    let coords;
    if (report.lat && report.lon) {
      coords = [report.lat, report.lon];
    } else if (report.address) {
      coords = await geocode(report.address);
    }

    if (coords) {
      const marker = L.marker(coords);
      const img = report.image ? `<br><img src="${report.image}" alt="${report.type || ''}" style="max-width:150px;max-height:150px;"/>` : '';
      marker.bindPopup(`<b>ID:</b> ${report.id}<br><b>Type:</b> ${report.type}<br><b>Status:</b> ${report.status}${img}`);
      markerCluster.addLayer(marker);
      heatPoints.push(coords);
    }
  }

  heatLayer.setLatLngs(heatPoints);

  densityPolygons.forEach((p) => map.removeLayer(p));
  densityPolygons = createDensityPolygons(heatPoints).map((coords) =>
    L.polygon(coords, { color: '#ff7800', weight: 1, fillOpacity: 0.2 }).addTo(map)
  );
}

function createDensityPolygons(points, threshold = 5) {
  const GRID = 0.3; // approx 30km
  const cells = new Map();
  for (const [lat, lon] of points) {
    const key = `${Math.floor(lat / GRID)},${Math.floor(lon / GRID)}`;
    cells.set(key, (cells.get(key) || 0) + 1);
  }
  const polys = [];
  for (const [key, count] of cells.entries()) {
    if (count >= threshold) {
      const [latIdx, lonIdx] = key.split(',').map(Number);
      const latMin = latIdx * GRID;
      const lonMin = lonIdx * GRID;
      const latMax = latMin + GRID;
      const lonMax = lonMin + GRID;
      polys.push([
        [latMin, lonMin],
        [latMin, lonMax],
        [latMax, lonMax],
        [latMax, lonMin],
      ]);
    }
  }
  return polys;
}