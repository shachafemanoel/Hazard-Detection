let map;
let markerCluster;

export function initializeMap() {
  map = L.map('map').setView([32.0853, 34.7818], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  markerCluster = L.markerClusterGroup();
  map.addLayer(markerCluster);
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
    }
  }
}