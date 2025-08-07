const API_BASE_URL = '/api/reports';

let allReports = [];

// Note: Geocoding removed since all reports now have locations

export function getReports() {
  return allReports;
}

// Legacy geocoding functions - no longer needed
export function clearGeocodingCache() {
  console.log('Geocoding cache clear requested - not needed anymore');
}

export function getGeocodingStats() {
  return {
    cacheSize: 0,
    errorCount: 0,
    maxErrors: 0
  };
}

// Geocoding removed - all reports now have coordinates

// Fetch reports with filters and pagination - optimized for speed
export async function fetchReports(filters = {}) {
  const params = new URLSearchParams(filters);
  let response;
  
  console.log(`🚀 Fetching reports...`);
  const startTime = performance.now();
  
  try {
    response = await fetch(`${API_BASE_URL}?${params.toString()}`, {
      mode: 'cors',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // Add compression headers for faster transfer
        'Accept-Encoding': 'gzip, deflate, br',
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(10000) // 10 seconds
    });
    
    if (!response.ok) {
      throw new Error(`Failed to load reports: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Fetch reports error:', error);
    throw error;
  }

  const data = await response.json();
  const parseTime = performance.now();
  
  const reports = Array.isArray(data.reports) ? data.reports : [];
  const pagination = data.pagination || {
    total: reports.length,
    page: 1,
    limit: reports.length,
    totalPages: 1,
  };
  const metrics = {
    total: data.totalReports ?? pagination.total,
    open: data.openHazards ?? 0,
    resolved: data.resolvedThisMonth ?? 0,
    users: data.activeUsers ?? 0,
  };
  
  console.log(`📊 Data received: ${reports.length} reports, ${Math.round((parseTime - startTime))}ms`);

  // Process reports - no geocoding needed since all reports have locations
  const processedReports = reports.map(report => {
    let processedReport = { ...report };
    
    // If the report already has lat/lon, keep as is
    if (report.lat && report.lon) {
      return processedReport;
    }

    // If location is provided as [lat, lon]
    if (Array.isArray(report.location) && report.location.length >= 2) {
      const [lat, lon] = report.location;
      processedReport = { ...processedReport, lat: Number(lat), lon: Number(lon) };
    }

    return processedReport;
  });

  allReports = processedReports;
  
  const endTime = performance.now();
  const totalTime = Math.round(endTime - startTime);
  const dataSize = JSON.stringify(allReports).length;
  const dataSizeKB = Math.round(dataSize / 1024);
  
  console.log(`✅ Reports processed: ${allReports.length} reports, ${dataSizeKB}KB, ${totalTime}ms total`);
  
  return { reports: allReports, pagination, metrics };
};

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

// Browser compatibility - expose functions to the global scope
if (typeof window !== 'undefined') {
  window.fetchReports = fetchReports;
  window.getReports = getReports;
  window.updateReport = updateReport;
  window.deleteReportById = deleteReportById;
}
