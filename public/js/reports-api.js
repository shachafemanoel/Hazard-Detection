const API_URL = '/api/reports';
let allReports = [];

// Geocoding utility using Nominatim (OpenStreetMap)
export async function geocode(address) {
  if (!address || typeof address !== 'string') {
    return null;
  }

  try {
    const response = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
    const data = await response.json();
    
    if (data.success && data.location) {
      return {
        lat: data.location[0],
        lon: data.location[1],
        display_name: data.display_name
      };
    }
    
    return null;
  } catch (error) {
    console.warn('Geocoding failed:', error);
    return null;
  }
}

export async function fetchReports(filters = {}) {
  const baseParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      baseParams.append(key, value);
    }
  });

  async function fetchPage(page) {
    const params = new URLSearchParams(baseParams);
    params.set('page', page);
    const query = params.toString();
    const res = await fetch(`${API_URL}?${query}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load reports');
    return res.json();
  }

  const first = await fetchPage(1);
  let reports = Array.isArray(first.reports) ? first.reports : [];
  const pagination = first.pagination || {};

  if (pagination.totalPages && pagination.totalPages > 1) {
    for (let p = 2; p <= pagination.totalPages; p++) {
      const data = await fetchPage(p);
      if (Array.isArray(data.reports)) {
        reports = reports.concat(data.reports);
      }
    }
  }

  // Geocode any reports that have string locations without coordinates
  const geocodedReports = await Promise.all(reports.map(async (report) => {
    if (typeof report.location === 'string' && !report.lat && !report.lon) {
      const coords = await geocode(report.location);
      if (coords) {
        return { ...report, lat: coords.lat, lon: coords.lon };
      }
    }
    return report;
  }));

  allReports = geocodedReports;
  return { reports: geocodedReports, pagination };
}

export function getReports() {
  return allReports;
}
