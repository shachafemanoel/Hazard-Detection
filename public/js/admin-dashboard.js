import { ApiService } from './modules/ApiService.js';

let allReports = [];

async function loadReports() {
  const tbody = document.getElementById('admin-reports-tbody');
  tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>`;
  try {
    allReports = await ApiService.loadReports();
    renderTable(allReports);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-danger">Failed to load reports</td></tr>`;
  }
}

function renderTable(reports) {
  const tbody = document.getElementById('admin-reports-tbody');
  if (!reports.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No reports found</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  for (const r of reports) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${r.type || ''}</td>
      <td>${r.location || ''}</td>
      <td><span class="badge ${getStatusClass(r.status)}">${r.status || ''}</span></td>
      <td>${r.reportedBy || ''}</td>
      <td>${r.time ? new Date(r.time).toLocaleString() : ''}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary me-1" title="Edit" data-action="edit" data-id="${r.id}"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-outline-danger me-1" title="Delete" data-action="delete" data-id="${r.id}"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function getStatusClass(status) {
  switch ((status||'').toLowerCase()) {
    case 'resolved': return 'bg-success';
    case 'open': return 'bg-danger';
    case 'in progress': return 'bg-warning text-dark';
    default: return 'bg-secondary';
  }
}

// חיפוש
const searchInput = document.getElementById('admin-report-search');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    const filtered = allReports.filter(r =>
      (r.type||'').toLowerCase().includes(q) ||
      (r.location||'').toLowerCase().includes(q) ||
      (r.status||'').toLowerCase().includes(q) ||
      (r.reportedBy||'').toLowerCase().includes(q)
    );
    renderTable(filtered);
  });
}

// רענון
const refreshBtn = document.getElementById('refresh-admin-reports');
if (refreshBtn) {
  refreshBtn.addEventListener('click', loadReports);
}

// מחיקה
const tbody = document.getElementById('admin-reports-tbody');
tbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  if (btn.dataset.action === 'delete') {
    if (confirm('Delete report #' + id + '?')) {
      try {
        await ApiService.deleteReport(id);
        loadReports();
      } catch (err) {
        alert('Failed to delete report');
      }
    }
  } else if (btn.dataset.action === 'edit') {
    // פתח modal עריכה
    const report = allReports.find(r => r.id == id);
    if (!report) return;
    document.getElementById('edit-report-id').value = report.id;
    document.getElementById('edit-report-type').value = report.type || '';
    document.getElementById('edit-report-status').value = report.status || 'Open';
    document.getElementById('edit-report-location').value = report.location || '';
    document.getElementById('edit-report-user').value = report.reportedBy || '';
    document.getElementById('edit-report-date').value = report.time ? new Date(report.time).toLocaleString() : '';
    const modal = new bootstrap.Modal(document.getElementById('editReportModal'));
    modal.show();
  }
});

// שמירת עריכה
const saveBtn = document.getElementById('save-report-btn');
saveBtn.addEventListener('click', async () => {
  const id = document.getElementById('edit-report-id').value;
  const type = document.getElementById('edit-report-type').value;
  const status = document.getElementById('edit-report-status').value;
  const location = document.getElementById('edit-report-location').value;
  try {
    await ApiService.updateReport(id, { type, status, location });
    const modal = bootstrap.Modal.getInstance(document.getElementById('editReportModal'));
    if (modal) modal.hide();
    loadReports();
    alert('Report updated successfully');
  } catch (err) {
    alert('Failed to update report');
  }
});

// טען בהתחלה
loadReports(); 