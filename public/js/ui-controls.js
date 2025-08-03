// Alias getReports to avoid clashing with any global declarations
import { getReports as fetchAllReports } from './reports-api.js';
import { renderReports } from './modals.js';

export function filterReportsByType(reports, term) {
  const lowered = (term || '').toLowerCase();
  return reports.filter((r) => {
    const type = typeof r.type === 'string' ? r.type.toLowerCase() : '';
    return type.includes(lowered);
  });
}

export function initControls({ toggleHeatmap, centerMap, plotReports, heatLayer } = {}) {
  const searchInput = document.getElementById('report-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const filtered = filterReportsByType(fetchAllReports(), e.target.value);
      renderReports(filtered);
      if (typeof plotReports === 'function') plotReports(filtered);
    });
  }

  const typeFilter = document.getElementById('hazard-type-filter');
  if (typeFilter) {
    typeFilter.addEventListener('change', () => {
      const type = typeFilter.value;
      const filtered = type ? fetchAllReports().filter(r => r.type === type) : fetchAllReports();
      renderReports(filtered);
      if (typeof plotReports === 'function') plotReports(filtered);
    });
  }

  const heatmapBtn = document.getElementById('toggle-heatmap');
  if (heatmapBtn && typeof toggleHeatmap === 'function') {
    heatmapBtn.addEventListener('click', () => toggleHeatmap(heatLayer));
  }

  const centerBtn = document.getElementById('center-map');
  if (centerBtn && typeof centerMap === 'function') {
    centerBtn.addEventListener('click', centerMap);
  }
}
