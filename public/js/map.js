import 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

export let map;
export function initMap() {
  const israel = { lat: 31.7683, lng: 35.2137 };
  map = L.map('map', { zoomControl: false }).setView([israel.lat, israel.lng], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

export function toggleHeatmap(heatLayer) {
  if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
  else map.addLayer(heatLayer);
}

export function centerMap() {
  map.setView([31.7683, 35.2137], 8);
}
