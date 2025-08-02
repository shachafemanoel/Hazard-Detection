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

function showDetails(report) {
  const panel = document.getElementById('report-details-panel');
  panel.innerHTML = `
    <h3>${report.type} Details</h3>
    <p><strong>ID:</strong> ${report.id}</p>
    <p><strong>Location:</strong> ${report.location}</p>
    <p><strong>Time:</strong> ${new Date(report.time).toLocaleString()}</p>
  `;
}
