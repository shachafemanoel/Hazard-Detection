const API_URL = '/api/reports';
let allReports = [];

export async function fetchReports(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, value);
    }
  });
  const query = params.toString();
  const res = await fetch(`${API_URL}${query ? `?${query}` : ''}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load reports');
  const data = await res.json();
  // The API returns an object with a `reports` array and pagination info.
  allReports = Array.isArray(data.reports) ? data.reports : [];
  return { reports: allReports, pagination: data.pagination };
}

export function getReports() {
  return allReports;
}
