import { getReports } from './reports-api.js';
import { renderReports } from './modals.js';

export function filterReportsByType(reports, term) {
  const lowered = (term || '').toLowerCase();
  return reports.filter((r) => {
    const type = typeof r.type === 'string' ? r.type.toLowerCase() : '';
    return type.includes(lowered);
  });
}

export function initControls({ toggleHeatmap, centerMap, plotReports } = {}) {
  const searchInput = document.getElementById('report-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const filtered = filterReportsByType(getReports(), e.target.value);
      renderReports(filtered);
      if (typeof plotReports === 'function') plotReports(filtered);
    });
  }

  const hazardDropdownBtn = document.getElementById('hazard-type-dropdown-btn');
  const hazardDropdownMenu = document.getElementById('hazard-type-dropdown-menu');
  if (hazardDropdownBtn && hazardDropdownMenu) {
    hazardDropdownBtn.addEventListener('click', () => {
      hazardDropdownMenu.classList.toggle('active');
    });

    hazardDropdownMenu.querySelectorAll('.hazard-type-option').forEach(option => {
      option.addEventListener('click', () => {
        const type = option.dataset.value;
        const label = document.getElementById('current-hazard-type-label');
        if (label) label.textContent = option.textContent;
        hazardDropdownMenu.classList.remove('active');
        const filtered = type ? getReports().filter(r => r.type === type) : getReports();
        renderReports(filtered);
        if (typeof plotReports === 'function') plotReports(filtered);
      });
    });
  }

  const heatmapBtn = document.getElementById('toggle-heatmap');
  if (heatmapBtn && typeof toggleHeatmap === 'function') {
    heatmapBtn.addEventListener('click', toggleHeatmap);
  }

  const centerBtn = document.getElementById('center-map');
  if (centerBtn && typeof centerMap === 'function') {
    centerBtn.addEventListener('click', centerMap);
  }
}
