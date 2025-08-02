export let map;
let heatLayer;
let markersLayer;

export function initMap() {
  const israel = { lat: 31.7683, lng: 35.2137 };
  map = L.map('map', { zoomControl: false }).setView([israel.lat, israel.lng], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  heatLayer = L.heatLayer([], { radius: 25, blur: 15 });
  markersLayer = L.layerGroup().addTo(map);
}

function parseCoords(loc) {
  if (!loc) return null;
  if (Array.isArray(loc) && loc.length === 2) {
    const [lat, lng] = loc.map(Number);
    if (isFinite(lat) && isFinite(lng)) return [lat, lng];
  }
  if (typeof loc === 'object') {
    const { lat, lng } = loc;
    if (isFinite(lat) && isFinite(lng)) return [lat, lng];
  }
  if (typeof loc === 'string') {
    try {
      const obj = JSON.parse(loc);
      return parseCoords(obj);
    } catch {
      const parts = loc.split(',').map(p => parseFloat(p));
      if (parts.length === 2 && parts.every(isFinite)) return parts;
    }
  }
  return null;
}

export function plotReports(reports = []) {
  if (!map || !markersLayer || !heatLayer) return;
  markersLayer.clearLayers();
  heatLayer.setLatLngs([]);

  const bounds = [];

  reports.forEach((r) => {
    const coords = parseCoords(r.location);
    if (!coords) return;
    const marker = L.marker(coords);
    const time = r.time ? new Date(r.time).toLocaleString() : '';
    marker.bindPopup(`<strong>${r.type || ''}</strong><br>${time}`);
    marker.addTo(markersLayer);

    heatLayer.addLatLng(coords);
    bounds.push(coords);
  });

  if (bounds.length) {
    map.fitBounds(bounds);
  }
}

export function toggleHeatmap() {
  if (!map || !heatLayer) return;
  if (map.hasLayer(heatLayer)) heatLayer.remove();
  else heatLayer.addTo(map);
}

export function centerMap() {
  map.setView([31.7683, 35.2137], 8);
}
