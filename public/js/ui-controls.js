// Alias getReports to avoid clashing with any global declarations
import { getReports as fetchAllReports } from './reports-api.js';
import { renderReports } from './reports-modal.js';

export function filterReportsByType(reports, term) {
  const lowered = (term || '').toLowerCase();
  return reports.filter((r) => {
    const type = typeof r.type === 'string' ? r.type.toLowerCase() : '';
    return type.includes(lowered);
  });
}

export function initControls({ toggleHeatmap, centerMap, plotReports } = {}) {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initControls({ toggleHeatmap, centerMap, plotReports }));
    return;
  }

  try {
    const searchInput = document.getElementById('report-search-input');
    if (searchInput && typeof searchInput.addEventListener === 'function') {
      searchInput.addEventListener('input', (e) => {
        const filtered = filterReportsByType(fetchAllReports(), e.target.value);
        renderReports(filtered);
        if (typeof plotReports === 'function') plotReports(filtered);
      });
    }

    const typeFilter = document.getElementById('hazard-type-filter');
    if (typeFilter && typeof typeFilter.addEventListener === 'function') {
      typeFilter.addEventListener('change', () => {
        const type = typeFilter.value;
        const filtered = type ? fetchAllReports().filter(r => r.type === type) : fetchAllReports();
        renderReports(filtered);
        if (typeof plotReports === 'function') plotReports(filtered);
      });
    }

    const heatmapBtn = document.getElementById('toggle-heatmap');
    if (heatmapBtn && typeof heatmapBtn.addEventListener === 'function' && typeof toggleHeatmap === 'function') {
      heatmapBtn.addEventListener('click', toggleHeatmap);
    }

    const centerBtn = document.getElementById('center-map');
    if (centerBtn && typeof centerBtn.addEventListener === 'function' && typeof centerMap === 'function') {
      centerBtn.addEventListener('click', centerMap);
    }
  } catch (error) {
    console.error('🚨 Error initializing UI controls:', error);
    console.log('DOM state:', document.readyState);
  }
}
