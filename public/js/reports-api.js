const API_BASE_URL = '/api/reports';

let allReports = [];

export function getReports() {
  return allReports;
}

// Geocoding utility using Nominatim (OpenStreetMap)
async function geocode(address) {
  if (!address || typeof address !== 'string') return null;
  try {
    const response = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
    const data = await response.json();
    if (data.success && data.location) {
      return { lat: data.location[0], lon: data.location[1], display_name: data.display_name };
    }
    return null;
  } catch (error) {
    console.warn('Geocoding failed:', error);
    return null;
  }
}

// Fetch reports with filters and pagination
export async function fetchReports(filters = {}) {
  const params = new URLSearchParams(filters);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}?${params.toString()}`, { 
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`Failed to load reports: ${response.statusText}`);
  } catch (error) {
    console.error('Fetch reports error:', error);
    throw error;
  }

  const data = await response.json();
  const reports = Array.isArray(data.reports) ? data.reports : [];
  const pagination = data.pagination || { total: reports.length, page: 1, limit: reports.length, totalPages: 1 };
  const metrics = {
    total: data.totalReports ?? pagination.total,
    open: data.openHazards ?? 0,
    resolved: data.resolvedThisMonth ?? 0,
    users: data.activeUsers ?? 0,
  };

  const geocodedReports = await Promise.all(reports.map(async (report) => {
    if (typeof report.location === 'string' && !report.lat && !report.lon) {
      const coords = await geocode(report.location);
      if (coords) return { ...report, lat: coords.lat, lon: coords.lon };
    }
    return report;
  }));

  allReports = geocodedReports;
  return { reports: allReports, pagination, metrics };
}

// Update a report by ID
export async function updateReport(reportId, updatedData) {
  try {
    const response = await fetch(`${API_BASE_URL}/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updatedData),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update report');
    }
    return await response.json();
  } catch (error) {
    console.error('Update report error:', error);
    throw error;
  }
}

// Delete a report by ID
export async function deleteReportById(reportId) {
  try {
    const response = await fetch(`${API_BASE_URL}/${reportId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete report');
    }
    return await response.json();
  } catch (error) {
    console.error('Delete report error:', error);
    throw error;
  }
}