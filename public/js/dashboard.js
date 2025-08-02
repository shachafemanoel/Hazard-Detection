import { initMap, toggleHeatmap, centerMap } from './map.js';
import { fetchReports } from './reports-api.js';
import { initControls } from './ui-controls.js';
import { renderReports } from './modals.js';
import { notify } from './notifications.js';

export async function bootstrapDashboard() {
  try {
    initMap();
    initControls({ toggleHeatmap, centerMap });
    const { reports } = await fetchReports();
    renderReports(reports);
    notify('Dashboard loaded successfully', 'success');
  } catch (e) {
    console.error(e);
    notify('Failed to load dashboard', 'danger');
  }
}

export { toggleHeatmap, centerMap };

// automatically bootstrap when module is loaded
bootstrapDashboard();
