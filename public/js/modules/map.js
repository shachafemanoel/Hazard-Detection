// Map functionality module
export class MapManager {
  constructor(config) {
    this.config = config;
    this.map = null;
    this.markers = [];
    this.markerCluster = null;
    this.nonClusterLayer = null;
    this.useClusters = true;
    this.geocodeCache = this.loadGeocodeCache();
    this.userInteractionUntil = 0;
    this.lastPlottedBounds = null;
    this.didAutoLocate = false;
    // Do not auto-fit to markers; keep user-centric view unless user changes it
    this.fitToMarkers = false;
  }

  init() {
    this.map = L.map('map').setView(this.config.center, this.config.zoom);
    L.tileLayer(this.config.tileLayer, {
      attribution: this.config.attribution
    }).addTo(this.map);

    // Initialize marker cluster group
    this.markerCluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50
    });
    this.map.addLayer(this.markerCluster);

    // Initialize non-cluster layer (hidden by default)
    this.nonClusterLayer = L.layerGroup();

    // Add map controls
    this.addMapControls();

    // Wire up static control buttons if present
    const centerBtn = document.getElementById('center-map');
    if (centerBtn) {
      centerBtn.addEventListener('click', () => {
        this.centerOnUserRadius(1000);
      });
    }

    const toggleBtn = document.getElementById('toggle-clusters');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.useClusters = !this.useClusters;
        this.refreshLayers();
        toggleBtn.classList.toggle('btn-outline-light', !this.useClusters);
        toggleBtn.title = this.useClusters ? 'Disable clustering' : 'Enable clustering';
      });
    }

    // Add scale control for better context
    L.control.scale({ metric: true, imperial: false }).addTo(this.map);

    // Track user interaction to avoid fighting with auto-centering
    const markInteraction = () => (this.userInteractionUntil = Date.now() + 15000);
    this.map.on('movestart zoomstart', markInteraction);

    // Optional locate me control
    const locateBtn = document.getElementById('locate-me');
    if (locateBtn && navigator.geolocation) {
      locateBtn.addEventListener('click', () => {
        locateBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(pos => {
          const { latitude, longitude } = pos.coords;
          this.map.flyTo([latitude, longitude], Math.max(this.map.getZoom(), 15));
          locateBtn.disabled = false;
        }, () => { locateBtn.disabled = false; }, { enableHighAccuracy: true, timeout: 6000 });
      });
    }

    // Initial default: show ~1km around the user (GPS/IP fallback)
    this.centerOnUserRadius(1000);
  }

  addMapControls() {
    // Center map control
    const centerControl = L.Control.extend({
      onAdd: () => {
        const btn = L.DomUtil.create('button', 'btn btn-sm btn-secondary');
        btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
        btn.title = 'מרכז מפה';
        btn.onclick = () => this.map.setView(this.config.center, this.config.zoom);
        return btn;
      }
    });
    
    this.map.addControl(new centerControl({ position: 'bottomright' }));

    // Handle popup action buttons when popup opens
    this.map.on('popupopen', (e) => {
      const root = e?.popup?.getElement();
      if (!root) return;
      root.querySelectorAll('[data-action="view-image"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const url = btn.getAttribute('data-url');
          if (window.dashboard && typeof window.dashboard.showImage === 'function') {
            window.dashboard.showImage(url);
          }
        });
      });
      root.querySelectorAll('[data-action="set-status"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const status = btn.getAttribute('data-status');
          if (window.dashboard && typeof window.dashboard.updateReportStatus === 'function') {
            window.dashboard.updateReportStatus(id, status);
          }
        });
      });
      root.querySelectorAll('[data-action="delete-report"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (window.dashboard && typeof window.dashboard.deleteReport === 'function') {
            window.dashboard.deleteReport(id);
          }
        });
      });
    });
  }

  async plotReports(reports) {
    // Clear existing markers
    this.markerCluster.clearLayers();
    this.nonClusterLayer.clearLayers();
    this.markers = [];

    let resolved = 0;
    for (const report of reports) {
      let pos = this.extractCoordinates(report);
      if (!pos && typeof report.location === 'string') {
        pos = await this.geocodeAddress(report.location);
        if (pos) {
          // enrich report so subsequent renders use cached coords
          report.location = { address: report.location, lat: pos.lat, lng: pos.lng };
        }
      }
      if (!pos) continue;

      const marker = this.createReportMarker({ ...report, __coords: pos });
      if (marker) this.markers.push(marker);
      resolved++;
    }

    // Add to the appropriate layer
    if (this.useClusters) {
      this.markers.forEach(m => this.markerCluster.addLayer(m));
      if (!this.map.hasLayer(this.markerCluster)) this.map.addLayer(this.markerCluster);
      if (this.map.hasLayer(this.nonClusterLayer)) this.map.removeLayer(this.nonClusterLayer);
    } else {
      this.markers.forEach(m => this.nonClusterLayer.addLayer(m));
      if (!this.map.hasLayer(this.nonClusterLayer)) this.map.addLayer(this.nonClusterLayer);
      if (this.map.hasLayer(this.markerCluster)) this.map.removeLayer(this.markerCluster);
    }

    // Optionally fit to markers; disabled by default per requirements
    if (this.fitToMarkers && this.markers.length > 0) {
      const group = L.featureGroup(this.markers);
      const newBounds = group.getBounds();
      this.lastPlottedBounds = newBounds;
      if (this.shouldAutoCenter(newBounds)) {
        this.map.flyToBounds(newBounds, { padding: [50, 50] });
      }
    }
    console.debug('Map plotReports:', { total: reports.length, markers: this.markers.length, resolved });

    // Do not auto-center here; initial centering handled in init via centerOnUserRadius
  }

  refreshLayers() {
    // Re-add current markers to the selected layer
    this.plotReports(this.markers.map(m => m.reportRef).filter(Boolean));
  }

  createReportMarker(report) {
    const pos = report.__coords || this.extractCoordinates(report);
    if (!pos) return null;

    const icon = this.getHazardIcon(Array.isArray(report.type) ? report.type[0] : report.type);
    const marker = L.marker([pos.lat, pos.lng], {
      icon: L.divIcon({
        className: 'custom-marker',
        html: `<div class="marker-icon ${report.status}">${icon}</div>`
      })
    });

    marker.bindPopup(this.createMarkerPopup(report));
    marker.bindTooltip(this.getTooltipText(report), { direction: 'top', sticky: true, opacity: 0.9 });
    // Keep reference to original report for refreshLayers
    marker.reportRef = report;

    // Visual selection on click
    marker.on('click', () => {
      document.querySelectorAll('.marker-icon.selected').forEach(el => el.classList.remove('selected'));
      const el = marker.getElement();
      if (el) el.querySelector('.marker-icon')?.classList.add('selected');
    });
    return marker;
  }

  createMarkerPopup(report) {
    const img = report.imageUrl || report.image || '';
    const id = report.id || '';
    const typeText = Array.isArray(report.type) ? report.type.join(', ') : (report.type || 'Unknown');
    const addr = typeof report.location === 'string' ? report.location : (report.location?.address || '');
    const created = report.createdAt || report.time || '';
    return `
      <div class="popup-content" style="min-width:240px">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <h6 class="m-0">${typeText}</h6>
          <span class="badge bg-secondary">${report.status || ''}</span>
        </div>
        ${img ? `<img src="${img}" alt="report" style="width:100%;max-height:140px;object-fit:cover;border-radius:6px;margin:4px 0;" />` : ''}
        ${addr ? `<div class="small text-muted">${addr}</div>` : ''}
        ${created ? `<div class="small text-muted">${new Date(created).toLocaleString()}</div>` : ''}
        <div class="mt-2 d-flex flex-wrap gap-1">
          ${img ? `<button class="btn btn-sm btn-outline-light" data-action="view-image" data-id="${id}" data-url="${img}"><i class="fas fa-image me-1"></i>Image</button>` : ''}
          <div class="btn-group btn-group-sm" role="group" aria-label="Status">
            <button class="btn btn-outline-primary" data-action="set-status" data-id="${id}" data-status="open">Open</button>
            <button class="btn btn-outline-warning" data-action="set-status" data-id="${id}" data-status="in_progress">In Progress</button>
            <button class="btn btn-outline-success" data-action="set-status" data-id="${id}" data-status="resolved">Resolved</button>
          </div>
          <button class="btn btn-sm btn-outline-danger ms-auto" data-action="delete-report" data-id="${id}"><i class="fas fa-trash me-1"></i>Delete</button>
        </div>
      </div>
    `;
  }

  getHazardIcon(type) {
    const icons = {
      pothole: '🕳️',
      crack: '⚡',
      other: '⚠️'
    };
    return icons[type] || icons.other;
  }

  getTooltipText(report) {
    const type = Array.isArray(report.type) ? report.type.join(', ') : (report.type || 'Hazard');
    const addr = typeof report.location === 'string' ? report.location : (report.location?.address || '');
    return `${type}${addr ? ' – ' + addr : ''}`;
  }

  loadGeocodeCache() {
    try {
      const raw = localStorage.getItem('geocode-cache-v1');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  saveGeocodeCache() {
    try { localStorage.setItem('geocode-cache-v1', JSON.stringify(this.geocodeCache)); } catch {}
  }

  async geocodeAddress(address) {
    if (!address || typeof address !== 'string') return null;
    if (this.geocodeCache[address]) return this.geocodeCache[address];
    // Try server endpoint that uses env geocoding key
    try {
      const resp = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`, { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        if (isFinite(data.lat) && isFinite(data.lng)) {
          const pos = { lat: Number(data.lat), lng: Number(data.lng) };
          this.geocodeCache[address] = pos; this.saveGeocodeCache();
          return pos;
        }
      } else if (resp.status === 401) {
        // not authenticated; fall back to public geocoder
      }
    } catch (e) {
      // network/server error; will fall back to public geocoder
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
          this.geocodeCache[address] = pos; this.saveGeocodeCache();
          return pos;
        }
      }
    } catch (e) {
      console.warn('Geocoding failed for address:', address, e);
    }
    return null;
  }

  extractCoordinates(report) {
    // 1) GeoJSON-style [lng, lat]
    const coords = report?.location?.coordinates;
    if (Array.isArray(coords) && coords.length === 2 && isFinite(coords[0]) && isFinite(coords[1])) {
      return { lat: Number(coords[1]), lng: Number(coords[0]) };
    }
    // 2) location object with lat/lng or latitude/longitude
    const loc = report?.location || {};
    const lat1 = loc.lat ?? loc.latitude;
    const lng1 = loc.lng ?? loc.longitude;
    if (isFinite(lat1) && isFinite(lng1)) {
      return { lat: Number(lat1), lng: Number(lng1) };
    }
    // 3) top-level latitude/longitude
    const lat2 = report.lat ?? report.latitude;
    const lng2 = report.lng ?? report.longitude;
    if (isFinite(lat2) && isFinite(lng2)) {
      return { lat: Number(lat2), lng: Number(lng2) };
    }
    // 4) location string "lat, lng"
    if (typeof report.location === 'string') {
      const m = report.location.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
      if (m) {
        const a = parseFloat(m[1]);
        const b = parseFloat(m[2]);
        if (isFinite(a) && isFinite(b)) {
          return { lat: a, lng: b };
        }
      }
    }
    return null;
  }

  shouldAutoCenter(newBounds) {
    // Skip if user interacted recently
    if (Date.now() < this.userInteractionUntil) return false;
    try {
      const current = this.map.getBounds();
      // If current fully contains new bounds, no need to animate
      if (current.contains(newBounds)) return false;
      // If bounds differ significantly, auto center
      const ar = this.boundsAreaRatio(current, newBounds);
      return ar < 0.67 || ar > 1.5;
    } catch {
      return true;
    }
  }

  boundsAreaRatio(a, b) {
    const area = (bb) => Math.abs((bb.getEast() - bb.getWest()) * (bb.getNorth() - bb.getSouth()));
    const ea = area(a) || 1;
    const eb = area(b) || 1;
    return eb / ea;
  }

  async centerOnUserRadius(radiusMeters = 1000) {
    const centerToBounds = (lat, lng) => {
      try {
        const circle = L.circle([lat, lng], { radius: radiusMeters });
        const bounds = circle.getBounds();
        // Mark that we auto-located so other flows don't override immediately
        this.didAutoLocate = true;
        // Fit bounds with a bit of padding
        this.map.fitBounds(bounds, { padding: [40, 40] });
      } catch (e) { console.warn('Failed to set initial user view:', e); }
    };

    const ipFallback = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) return;
        const j = await res.json();
        const lat = Number(j.latitude);
        const lng = Number(j.longitude);
        if (isFinite(lat) && isFinite(lng)) centerToBounds(lat, lng);
      } catch (e) { /* ignore */ }
    };

    if ('geolocation' in navigator) {
      try {
        navigator.geolocation.getCurrentPosition(
          pos => centerToBounds(pos.coords.latitude, pos.coords.longitude),
          () => ipFallback(),
          { enableHighAccuracy: true, timeout: 4000, maximumAge: 60000 }
        );
      } catch { ipFallback(); }
    } else {
      ipFallback();
    }
  }
}
