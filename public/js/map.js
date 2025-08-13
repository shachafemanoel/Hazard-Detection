import {loadReports} from './utils.js';
import {showToast} from './ui.js';

let mapLoaded = false;
let mapInstance = null;
const section = document.getElementById('map');

async function initMap(){
  if(mapLoaded && mapInstance) return mapInstance;
  
  try {
    showToast('Loading map...', 'info');
    
    await loadLeaflet();
    
    // Check if map container exists
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
      throw new Error('Map container not found');
    }
    
    // Initialize map
    const map = L.map('map').setView([31.7767, 35.2345], 13);
    mapInstance = map;
    
    // Add tile layer with error handling
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      timeout: 10000
    });
    
    tileLayer.on('tileerror', (e) => {
      console.warn('Tile loading error:', e);
      showToast('Map tiles failed to load. Check internet connection.', 'warning');
    });
    
    tileLayer.addTo(map);
    
    // Initialize marker cluster group
    const markers = L.markerClusterGroup({
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true
    });
    
    // Load and display reports
    try {
      const reports = await loadReports();
      let validReports = 0;
      
      reports.forEach(r => {
        if (r.location && r.location.lat && r.location.lng) {
          try {
            const marker = L.marker([r.location.lat, r.location.lng]);
            const popupContent = `
              <div>
                <b>${r.type || 'Unknown hazard'}</b><br>
                <span>Severity: ${r.severity || 'Not specified'}</span><br>
                <small>${r.timestamp || 'Date unknown'}</small>
              </div>
            `;
            marker.bindPopup(popupContent);
            markers.addLayer(marker);
            validReports++;
          } catch (markerError) {
            console.warn('Failed to create marker for report:', r, markerError);
          }
        }
      });
      
      map.addLayer(markers);
      mapLoaded = true;
      
      showToast(`Map loaded with ${validReports} hazard markers`, 'success');
      
      // Fit bounds if we have markers
      if (validReports > 0) {
        map.fitBounds(markers.getBounds(), { padding: [20, 20] });
      }
      
    } catch (reportsError) {
      console.warn('Failed to load reports for map:', reportsError);
      showToast('Map loaded but reports unavailable', 'warning');
      mapLoaded = true; // Still mark as loaded since map itself works
    }
    
    return map;
    
  } catch (mapError) {
    console.error('Failed to initialize map:', mapError);
    showToast(`Map initialization failed: ${mapError.message}`, 'error');
    
    // Show fallback message
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
      mapContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; text-align: center; color: #666;">
          <div>
            <p>Map unavailable</p>
            <button onclick="window.location.reload()" style="margin-top: 10px; padding: 8px 16px;">Retry</button>
          </div>
        </div>
      `;
    }
    
    throw mapError;
  }
}

async function loadLeaflet(){
  if(window.L) return;
  
  try {
    // Load main Leaflet library
    await loadScript({
      src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      integrity: 'sha256-o9N1j7kMCSzU8VKvT+I+uK9XVcv0oP4pQv9g7TNb1SI=',
      crossOrigin: '',
      timeout: 10000
    });
    
    // Load marker cluster plugin
    await loadScript({
      src: 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
      timeout: 10000
    });
    
    // Verify Leaflet loaded correctly
    if (!window.L || !window.L.markerClusterGroup) {
      throw new Error('Leaflet libraries failed to load properly');
    }
    
    console.log('✅ Leaflet libraries loaded successfully');
    
  } catch (error) {
    console.error('❌ Failed to load Leaflet libraries:', error);
    throw new Error(`Map libraries unavailable: ${error.message}`);
  }
}

function loadScript({ src, integrity, crossOrigin, timeout = 10000 }) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    
    if (integrity) script.integrity = integrity;
    if (crossOrigin !== undefined) script.crossOrigin = crossOrigin;
    
    script.onload = () => {
      clearTimeout(timeoutId);
      resolve();
    };
    
    script.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to load script: ${src}`));
    };
    
    const timeoutId = setTimeout(() => {
      script.remove();
      reject(new Error(`Script loading timeout: ${src}`));
    }, timeout);
    
    document.head.appendChild(script);
  });
}

document.querySelectorAll('[data-target="map"]').forEach(btn=>btn.addEventListener('click',initMap));
