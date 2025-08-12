import {loadReports} from './utils.js';

let mapLoaded = false;
const section = document.getElementById('map');

async function initMap(){
  if(mapLoaded) return;
  await loadLeaflet();
  const map = L.map('map').setView([31.7767,35.2345], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; OpenStreetMap'
  }).addTo(map);
  const markers = L.markerClusterGroup();
  const reports = await loadReports();
  reports.forEach(r=>{
    if(r.location){
      const marker = L.marker([r.location.lat,r.location.lng]);
      marker.bindPopup(`<b>${r.type}</b><br>${r.severity}`);
      markers.addLayer(marker);
    }
  });
  map.addLayer(markers);
  mapLoaded = true;
}

async function loadLeaflet(){
  if(window.L) return;
  await new Promise(resolve=>{
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-o9N1j7kMCSzU8VKvT+I+uK9XVcv0oP4pQv9g7TNb1SI=';
    script.crossOrigin='';
    script.onload=resolve;
    document.head.appendChild(script);
  });
  await new Promise(resolve=>{
    const script = document.createElement('script');
    script.src='https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
    script.onload=resolve;
    document.head.appendChild(script);
  });
}

document.querySelectorAll('[data-target="map"]').forEach(btn=>btn.addEventListener('click',initMap));
