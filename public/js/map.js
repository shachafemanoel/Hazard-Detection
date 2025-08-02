let map;
let markerCluster;
let heatLayer;

function setupMobileMapToolbar() {
  const mapEl = document.getElementById('map');
  const toolbar = document.createElement('div');
  toolbar.className = 'mobile-map-toolbar';

  const toggleBtn = document.getElementById('toggle-heatmap');
  const centerBtn = document.getElementById('center-map');

  const zoomIn = document.createElement('button');
  zoomIn.id = 'mobile-zoom-in';
  zoomIn.innerHTML = '<i class="fas fa-plus"></i>';

  const zoomOut = document.createElement('button');
  zoomOut.id = 'mobile-zoom-out';
  zoomOut.innerHTML = '<i class="fas fa-minus"></i>';

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
  map = L.map('map', { zoomControl: !isMobile }).setView([32.0853, 34.7818], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  markerCluster = L.markerClusterGroup();
  map.addLayer(markerCluster);

  heatLayer = L.heatLayer([], { radius: 25 });

  if (isMobile) {
    setupMobileMapToolbar();
  }

  return { heatLayer };
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
  if (map) map.setView([32.0853, 34.7818], 13);
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
      marker.bindPopup(`<b>ID:</b> ${report.id}<br><b>Type:</b> ${report.type}<br><b>Status:</b> ${report.status}`);
      markerCluster.addLayer(marker);
      heatPoints.push(coords);
    }
  }

  heatLayer.setLatLngs(heatPoints);
}