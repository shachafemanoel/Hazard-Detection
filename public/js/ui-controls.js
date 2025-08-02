import { fetchReports, getReports } from './reports-api.js';
import { renderReports } from './modals.js';

export function initControls() {
  document.getElementById('report-search-input').addEventListener('input', async (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = getReports().filter(r => r.type.toLowerCase().includes(term));
    renderReports(filtered);
  });

  document.getElementById('hazard-type-filter').addEventListener('change', async (e) => {
    const type = e.target.value;
    const filtered = type ? getReports().filter(r => r.type === type) : getReports();
    renderReports(filtered);
  });

  document.getElementById('toggle-heatmap').addEventListener('click', () => {
    import('./dashboard.js').then(mod => mod.toggleHeatmap());
  });

  document.getElementById('center-map').addEventListener('click', () => {
    import('./dashboard.js').then(mod => mod.centerMap());
  });
}
