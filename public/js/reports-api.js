const API_URL = '/api/reports';
let allReports = [];

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

  allReports = reports;
  return { reports, pagination };
}

export function getReports() {
  return allReports;
}
