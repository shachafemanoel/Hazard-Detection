// Data management module
export class DataManager {
  constructor() {
    this.reports = [];
    this.filters = {
      type: 'all', // single select fallback
      types: [],   // multi-select via legend chips
      status: 'all',
      dateRange: null,
      searchQuery: '',
      sort: 'newest' // newest | oldest | nearest
    };
    this.userLocation = null; // { lat, lng }
  }

  async fetchReports() {
    try {
      const currentOrigin = window.location.origin || '';
      const defaultOrigin = 'http://localhost:3000';
      const apiOrigin = currentOrigin.startsWith('http') ? currentOrigin : (window.__API_BASE__ || defaultOrigin);
      const apiUrl = `${apiOrigin}/api/reports`;
      console.log('🔄 Fetching reports from:', apiUrl);

      const response = await fetch(apiUrl, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = '';
        
        try {
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || `HTTP Error ${response.status}`;
          } else {
            errorMessage = await response.text();
          }
        } catch (parseError) {
          errorMessage = `HTTP Error ${response.status}`;
        }

        if (response.status === 401) {
          console.log('🔒 User not authenticated, redirecting to login...');
          const loginUrl = `${apiOrigin}/login.html`;
          window.location.href = loginUrl;
          throw new Error('Authentication required. Please log in.');
        }

        console.error('❌ API Error:', {
          status: response.status,
          statusText: response.statusText,
          message: errorMessage
        });

        throw new Error(`Failed to fetch reports: ${errorMessage}`);
      }
      
      const data = await response.json();
      console.log('✅ Successfully fetched', data.length, 'reports');
      
      this.reports = data;
      return this.reports;
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        console.error('❌ Network error: Server might be down or unreachable');
        throw new Error('Cannot connect to server. Please check your internet connection.');
      }
      
      console.error('❌ Error in fetchReports:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  }

  getFilteredReports() {
    const fType = (this.filters.type ?? 'all').toString().toLowerCase();
    const fTypes = Array.isArray(this.filters.types) ? this.filters.types.map(t => t.toString().toLowerCase()) : [];
    const fStatus = (this.filters.status || 'all').toString().toLowerCase().replace(/\s+/g, '_');
    const q = (this.filters.searchQuery || '').toLowerCase().trim();

    const filtered = this.reports.filter(report => {
      // normalize type
      const types = Array.isArray(report.type) ? report.type : [report.type];
      const typeValues = types.filter(Boolean).map(t => t.toString().toLowerCase());
      const matchesType = (
        (fTypes.length === 0 && (fType === 'all' || typeValues.includes(fType))) ||
        (fTypes.length > 0 && fTypes.some(ft => typeValues.includes(ft)))
      );

      // normalize status
      const rStatus = (report.status || '').toString().toLowerCase().replace(/\s+/g, '_');
      const matchesStatus = fStatus === 'all' || rStatus === fStatus;

      // search in description, address, and raw location string
      const addr = typeof report.location === 'string' ? report.location : (report.location?.address || '');
      const matchesSearch = !q ||
        (report.description && report.description.toLowerCase().includes(q)) ||
        (addr && addr.toLowerCase().includes(q));

      if (!matchesType || !matchesStatus || !matchesSearch) return false;

      // date range
      if (this.filters.dateRange) {
        const [start, end] = this.filters.dateRange;
        const reportDate = new Date(report.createdAt || report.time || 0);
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (isFinite(reportDate) && (reportDate < startDate || reportDate > endDate)) return false;
      }

      return true;
    });

    // Sorting (pinned first always)
    const sortKey = (this.filters.sort || 'newest').toLowerCase();
    const getDate = (r) => new Date(r.createdAt || r.time || 0).getTime() || 0;
    const getCoords = (r) => {
      const loc = r.location || {};
      if (typeof loc === 'object') {
        const lat = loc.lat ?? loc.latitude;
        const lng = loc.lng ?? loc.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
      }
      if (typeof r.lat === 'number' && typeof r.lng === 'number') return { lat: r.lat, lng: r.lng };
      return null;
    };
    const haversine = (a, b) => {
      const toRad = (x) => x * Math.PI / 180;
      const R = 6371000; // meters
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const la1 = toRad(a.lat);
      const la2 = toRad(b.lat);
      const h = Math.sin(dLat/2)**2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng/2)**2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    const pinCmp = (a,b) => ((b.pinned?1:0) - (a.pinned?1:0));

    if (sortKey === 'newest') {
      return filtered.sort((a,b) => pinCmp(a,b) || (getDate(b) - getDate(a)));
    } else if (sortKey === 'oldest') {
      return filtered.sort((a,b) => pinCmp(a,b) || (getDate(a) - getDate(b)));
    } else if (sortKey === 'nearest' && this.userLocation) {
      return filtered.slice().sort((a,b) => {
        const ca = getCoords(a);
        const cb = getCoords(b);
        const da = ca ? haversine(this.userLocation, ca) : Number.POSITIVE_INFINITY;
        const db = cb ? haversine(this.userLocation, cb) : Number.POSITIVE_INFINITY;
        return pinCmp(a,b) || (da - db);
      });
    }

    // Fallback
    return filtered;
  }

  updateFilters(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
  }

  setUserLocation(coords) {
    if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
      this.userLocation = { lat: coords.lat, lng: coords.lng };
    }
  }

  getStats() {
    const stats = {
      total: this.reports.length,
      new: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0
    };

    this.reports.forEach(report => {
      switch (report.status?.toLowerCase()) {
        case 'new': stats.new++; break;
        case 'open': stats.open++; break;
        case 'in_progress': case 'in progress': stats.inProgress++; break;
        case 'resolved': stats.resolved++; break;
        case 'closed': stats.closed++; break;
        default: console.warn('Unknown status:', report.status);
      }
    });

    return stats;
  }
}
