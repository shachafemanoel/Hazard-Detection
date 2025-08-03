export function renderReports(reports) {
  const container = document.getElementById('reports-blocks-container');
  container.innerHTML = '';
  reports.forEach(r => {
    const card = document.createElement('div'); card.className = 'report-card';
    card.innerHTML = `
      <img src="${r.image}" class="report-thumb" />
      <div class="report-info">
        <h4>${r.type}</h4>
        <p>${new Date(r.time).toLocaleString()}</p>
        <span class="badge-new">${r.status}</span>
      </div>`;
    card.addEventListener('click', () => showDetails(r));
    container.append(card);
  });
}

/**
 * Populate and display the report details modal.
 *
 * Expects the DOM to contain a Bootstrap modal with id `reportDetailsModal` and
 * the following child elements used to render report fields:
 * - `modal-hazard-id`       – span/div for the hazard id
 * - `modal-type`            – element for the hazard type
 * - `modal-location`        – element for the location text
 * - `modal-time`            – element for the timestamp
 * - `modal-status`          – element for the report status
 * - `modal-user`            – element for the reporting user
 * - `modal-report-image`    – img tag for the report image
 *
 * If any of these elements are missing the function will skip updating them.
 */
function showDetails(report) {
  const modalEl = document.getElementById('reportDetailsModal');
  if (!modalEl) return;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('modal-hazard-id', report.id);
  setText('modal-type', report.type);
  setText('modal-location', report.location);
  setText('modal-time', new Date(report.time).toLocaleString());
  setText('modal-status', report.status);
  setText('modal-user', report.reportedBy || '');

  const imgEl = document.getElementById('modal-report-image');
  if (imgEl) imgEl.src = report.image || '';

  let modal = window.reportDetailsBootstrapModal;
  if (!modal && window.bootstrap) {
    modal = new bootstrap.Modal(modalEl, {});
    window.reportDetailsBootstrapModal = modal;
  }
  if (modal) modal.show();
}
