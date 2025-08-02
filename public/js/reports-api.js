const API_URL = '/api/reports';
let allReports = [];

export async function fetchReports(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  const res = await fetch(`${API_URL}?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load reports');
  allReports = await res.json();
  return allReports;
}

export function getReports() {
  return allReports;
}
