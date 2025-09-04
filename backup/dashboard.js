//
// RoadGuardian Dashboard Application
//
const RoadGuardian = (function() {
  'use strict';

  // Configuration
  const CONFIG = {
    map: {
      center: [32.0853, 34.7818], // Tel Aviv
      zoom: 13,
      tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    api: {
      reports: '/api/reports'
    }
  };

  // Module State
  const state = {
    map: null,
    reports: [],
    markers: [],
    clusterGroup: null,
    nonClusterLayer: null,
    useClusters: true
  };

  // Utility Functions
  async function fetchWithTimeout(url, options = {}) {
    const { timeout = 60000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { ...options, signal: controller.signal, credentials: 'include' });
    clearTimeout(id);
    return response;
  }

  // Map Functions
  function initMap() {
    state.map = L.map('map').setView(CONFIG.map.center, CONFIG.map.zoom);
    L.tileLayer(CONFIG.map.tileLayer, { attribution: CONFIG.map.attribution }).addTo(state.map);

    // Layers for clustered vs non-clustered
    state.clusterGroup = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });
    state.nonClusterLayer = L.layerGroup();
    state.map.addLayer(state.clusterGroup);

    // Static controls
    const centerBtn = document.getElementById('center-map');
    if (centerBtn) {
      centerBtn.addEventListener('click', () => state.map.setView(CONFIG.map.center, CONFIG.map.zoom));
    }
    const toggleBtn = document.getElementById('toggle-clusters');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        state.useClusters = !state.useClusters;
        toggleBtn.classList.toggle('btn-outline-light', !state.useClusters);
        refreshMapLayers();
      });
    }

    // Scale control
    L.control.scale({ metric: true, imperial: false }).addTo(state.map);

    // Track interaction to avoid aggressive auto-center
    state.userInteractionUntil = 0;
    const markInteraction = () => (state.userInteractionUntil = Date.now() + 15000);
    state.map.on('movestart zoomstart', markInteraction);

    // Locate me
    const locateBtn = document.getElementById('locate-me');
    if (locateBtn && navigator.geolocation) {
      locateBtn.addEventListener('click', () => {
        locateBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(pos => {
          const { latitude, longitude } = pos.coords;
          state.map.flyTo([latitude, longitude], Math.max(state.map.getZoom(), 15));
          locateBtn.disabled = false;
        }, () => { locateBtn.disabled = false; }, { enableHighAccuracy: true, timeout: 6000 });
      });
    }
  }

  async function plotReportsOnMap(reports) {
    // Clear layers and markers
    state.clusterGroup.clearLayers();
    state.nonClusterLayer.clearLayers();
    state.markers = [];

    for (const report of reports) {
      let pos = extractCoordinates(report);
      if (!pos && typeof report.location === 'string') {
        pos = await geocodeAddress(report.location);
        if (pos) report.location = { address: report.location, lat: pos.lat, lng: pos.lng };
      }
      if (!pos) continue;

      const icon = getHazardIcon(Array.isArray(report.type) ? report.type[0] : report.type);
      const marker = L.marker([pos.lat, pos.lng], {
        icon: L.divIcon({ className: 'custom-marker', html: `<div class="marker-icon ${report.status}">${icon}</div>` })
      });
      const desc = typeof report.location === 'string' ? report.location : (report.location?.address || 'Unknown');
      marker.bindPopup(`<div class="popup-content"><h6>${formatType(report.type)}</h6><p>${desc}</p><small>Status: ${report.status || 'N/A'}</small></div>`);
      state.markers.push(marker);
      if (state.useClusters) state.clusterGroup.addLayer(marker); else state.nonClusterLayer.addLayer(marker);
    }

    // Toggle visible layer
    if (state.useClusters) {
      if (!state.map.hasLayer(state.clusterGroup)) state.map.addLayer(state.clusterGroup);
      if (state.map.hasLayer(state.nonClusterLayer)) state.map.removeLayer(state.nonClusterLayer);
    } else {
      if (!state.map.hasLayer(state.nonClusterLayer)) state.map.addLayer(state.nonClusterLayer);
      if (state.map.hasLayer(state.clusterGroup)) state.map.removeLayer(state.clusterGroup);
    }

    // Fit bounds to markers
    if (state.markers.length > 0) {
      const group = L.featureGroup(state.markers);
      const newBounds = group.getBounds();
      if (shouldAutoCenter(newBounds)) {
        state.map.flyToBounds(newBounds, { padding: [50, 50] });
      }
    }
  }

  function refreshMapLayers() {
    // Re-plot using the current useClusters flag
    plotReportsOnMap(state.reports || []);
  }

  function extractCoordinates(report) {
    // GeoJSON-style coordinates [lng, lat]
    const c = report?.location?.coordinates;
    if (Array.isArray(c) && c.length === 2 && isFinite(c[0]) && isFinite(c[1])) {
      return { lat: Number(c[1]), lng: Number(c[0]) };
    }
    // location object lat/lng or latitude/longitude
    const loc = report?.location || {};
    const lat1 = loc.lat ?? loc.latitude;
    const lng1 = loc.lng ?? loc.longitude;
    if (isFinite(lat1) && isFinite(lng1)) return { lat: Number(lat1), lng: Number(lng1) };
    // top-level
    const lat2 = report.lat ?? report.latitude;
    const lng2 = report.lng ?? report.longitude;
    if (isFinite(lat2) && isFinite(lng2)) return { lat: Number(lat2), lng: Number(lng2) };
    // string "lat, lng"
    if (typeof report.location === 'string') {
      const m = report.location.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
      if (m) {
        const a = parseFloat(m[1]);
        const b = parseFloat(m[2]);
        if (isFinite(a) && isFinite(b)) return { lat: a, lng: b };
      }
    }
    return null;
  }

  // Simple geocode cache using localStorage
  function getCache() {
    try { return JSON.parse(localStorage.getItem('geocode-cache-v1') || '{}'); } catch { return {}; }
  }
  function setCache(cache) {
    try { localStorage.setItem('geocode-cache-v1', JSON.stringify(cache)); } catch {}
  }

  async function geocodeAddress(address) {
    if (!address || typeof address !== 'string') return null;
    const cache = getCache();
    if (cache[address]) return cache[address];
    // Try server endpoint first (uses env key)
    try {
      const resp = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`, { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        if (isFinite(data.lat) && isFinite(data.lng)) {
          const pos = { lat: Number(data.lat), lng: Number(data.lng) };
          cache[address] = pos; setCache(cache);
          return pos;
        }
      }
    } catch (e) {
      // ignore and fall back
    }
    // Fallback to Nominatim
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const pos = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        if (isFinite(pos.lat) && isFinite(pos.lng)) {
          cache[address] = pos; setCache(cache);
          return pos;
        }
      }
    } catch (e) {
      console.warn('Geocoding failed for address:', address, e);
    }
    return null;
  }

  function formatType(type) {
    if (Array.isArray(type)) return type.join(', ');
    return type || 'Unknown';
  }

  function shouldAutoCenter(newBounds) {
    if (Date.now() < (state.userInteractionUntil || 0)) return false;
    try {
      const current = state.map.getBounds();
      if (current.contains(newBounds)) return false;
      const ratio = boundsAreaRatio(current, newBounds);
      return ratio < 0.67 || ratio > 1.5;
    } catch { return true; }
  }

  function boundsAreaRatio(a, b) {
    const area = (bb) => Math.abs((bb.getEast() - bb.getWest()) * (bb.getNorth() - bb.getSouth()));
    const ea = area(a) || 1; const eb = area(b) || 1; return eb / ea;
  }

  // Public API
  return {
    initMap,
    plotReportsOnMap
  };
})();
