import { initializeMap, plotReports, toggleHeatmap, centerMap } from './map.js';
import { fetchReports, updateReport, deleteReportById } from './reports-api.js';
import { notify } from './notifications.js';
import { initControls } from './ui-controls.js';

// --- STATE MANAGEMENT ---
const state = {
  reports: [],
  filters: {
    search: '',
    status: '',
    type: '',
  },
  sort: {
    field: 'time',
    direction: 'desc',
  },
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  isLoading: true,
  selectedReportIds: new Set(),
};

// --- DOM ELEMENTS ---
const elements = {
  // Stats
  totalReportsCount: document.getElementById('total-reports-count'),
  openHazardsCount: document.getElementById('open-hazards-count'),
  resolvedThisMonth: document.getElementById('resolved-this-month'),
  activeUsers: document.getElementById('active-users'),
  // Table
  tableBody: document.getElementById('reports-table-body'),
  selectAllCheckbox: document.getElementById('select-all-reports'),
  // Filters & Sort
  searchInput: document.getElementById('report-search-input'),
  statusFilter: document.getElementById('table-status-filter'),
  typeFilter: document.getElementById('hazard-type-filter'),
  sortHeaders: document.querySelectorAll('#reports-management-table .sortable'),
  // Pagination
  showingInfo: document.getElementById('table-showing-info'),
  pageInfo: document.getElementById('table-page-info'),
  prevBtn: document.getElementById('table-prev-btn'),
  nextBtn: document.getElementById('table-next-btn'),
  pageSizeSelect: document.getElementById('table-page-size'),
  // Modals
  editModal: document.getElementById('editReportModal'),
  detailsModal: document.getElementById('reportDetailsModal'),
  // FAB Menu
  fabBtn: document.getElementById('fab-btn'),
  fabMenu: document.getElementById('fab-menu'),
};

// --- RENDER FUNCTIONS ---

function renderStats() {
  if (!state.reports.length) return;

  const total = state.reports.length;
  const open = state.reports.filter(r => r.status === 'Open' || r.status === 'New').length;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const resolved = state.reports.filter(r => r.status === 'Resolved' && new Date(r.time) >= startOfMonth).length;
  const users = new Set(state.reports.filter(r => new Date(r.time) >= startOfMonth).map(r => r.reportedBy).filter(Boolean)).size;

  elements.totalReportsCount.textContent = total;
  elements.openHazardsCount.textContent = open;
  elements.resolvedThisMonth.textContent = resolved;
  elements.activeUsers.textContent = users;
}

function renderTable() {
  if (!elements.tableBody) return;

  elements.tableBody.innerHTML = ''; // Clear existing rows

  const reportsToRender = state.reports;

  if (reportsToRender.length === 0) {
    elements.tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No reports found.</td></tr>';
    return;
  }

  reportsToRender.forEach(report => {
    const row = document.createElement('tr');
    row.dataset.reportId = report.id;
    row.classList.toggle('selected', state.selectedReportIds.has(report.id));

    const formatTime = (timeStr) => timeStr ? new Date(timeStr).toLocaleString() : 'Unknown';
    const truncate = (text, length = 30) => (text && text.length > length) ? text.substring(0, length) + '...' : text || 'Unknown';
    const getStatusBadge = (status) => {
      const statusMap = { 'Open': 'bg-danger', 'New': 'bg-danger', 'In Progress': 'bg-warning', 'Resolved': 'bg-success' };
      return `<span class="badge ${statusMap[status] || 'bg-secondary'}">${status || 'Unknown'}</span>`;
    };

    row.innerHTML = `
      <td><input type="checkbox" class="report-checkbox" data-report-id="${report.id}" ${state.selectedReportIds.has(report.id) ? 'checked' : ''}></td>
      <td>${report.id || 'N/A'}</td>
      <td><span class="badge bg-primary">${report.type || 'Unknown'}</span></td>
      <td>${getStatusBadge(report.status)}</td>
      <td title="${report.location || ''}">${truncate(report.location)}</td>
      <td>${formatTime(report.time)}</td>
      <td>
        <div class="btn-group" role="group">
          <button class="btn btn-sm btn-outline-info view-report-btn" title="View Details"><i class="fas fa-eye"></i></button>
          <button class="btn btn-sm btn-outline-warning edit-report-btn" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-outline-danger delete-report-btn" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    `;
    elements.tableBody.appendChild(row);
  });
}

function renderPagination() {
    const { currentPage, pageSize, total } = state.pagination;
    const totalPages = Math.ceil(total / pageSize);
    const startIdx = (currentPage - 1) * pageSize + 1;
    const endIdx = Math.min(startIdx + pageSize - 1, total);

    elements.showingInfo.textContent = total > 0 ? `Showing ${startIdx}-${endIdx} of ${total} reports` : 'No reports';
    elements.pageInfo.textContent = `Page ${currentPage} of ${Math.max(totalPages, 1)}`;
    elements.prevBtn.disabled = currentPage <= 1;
    elements.nextBtn.disabled = currentPage >= totalPages;
}

function renderAll() {
  renderStats();
  renderTable();
  renderPagination();
  plotReports(state.reports);
}

// --- API & DATA HANDLING ---

async function updateDashboard() {
  state.isLoading = true;
  const loadingToast = notify('Loading reports...', 'info', true);
  try {
    const params = {
      ...state.filters,
      page: state.pagination.currentPage,
      limit: state.pagination.pageSize,
      sort: state.sort.field,
      order: state.sort.direction,
    };
    const { reports, pagination } = await fetchReports(params);
    state.reports = reports;
    state.pagination.total = pagination.total;
    await plotReports(reports);
  } catch (error) {
    console.error('Failed to update dashboard:', error);
    notify('Could not load reports. Please try again.', 'danger');
    state.reports = [];
    state.pagination.total = 0;
  } finally {
    state.isLoading = false;
    loadingToast.remove();
    renderAll();
  }
}

// --- EVENT HANDLERS ---

function handleFilterChange() {
  state.filters.search = elements.searchInput.value;
  state.filters.status = elements.statusFilter.value;
  state.filters.type = elements.typeFilter.value;
  state.pagination.currentPage = 1;
  updateDashboard();
}

function handleSortChange(e) {
  const newSortField = e.currentTarget.dataset.sort;
  if (state.sort.field === newSortField) {
    state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.sort.field = newSortField;
    state.sort.direction = 'desc';
  }
  
  elements.sortHeaders.forEach(h => h.querySelector('i').className = 'fas fa-sort');
  e.currentTarget.querySelector('i').className = `fas fa-sort-${state.sort.direction === 'asc' ? 'up' : 'down'}`;
  
  updateDashboard();
}

function handlePaginationChange(direction) {
  const totalPages = Math.ceil(state.pagination.total / state.pagination.pageSize);
  if (direction === 'next' && state.pagination.currentPage < totalPages) {
    state.pagination.currentPage++;
  } else if (direction === 'prev' && state.pagination.currentPage > 1) {
    state.pagination.currentPage--;
  }
  updateDashboard();
}

function handlePageSizeChange(e) {
  state.pagination.pageSize = parseInt(e.target.value, 10);
  state.pagination.currentPage = 1;
  updateDashboard();
}

function handleTableAction(e) {
    const target = e.target.closest('button');
    if (!target) return;

    const row = e.target.closest('tr');
    const reportId = row.dataset.reportId;
    const report = state.reports.find(r => r.id == reportId);

    if (!report) return;

    if (target.classList.contains('view-report-btn')) {
        showReportDetails(report);
    } else if (target.classList.contains('edit-report-btn')) {
        showEditModal(report);
    } else if (target.classList.contains('delete-report-btn')) {
        if (confirm(`Are you sure you want to delete report #${report.id}?`)) {
            deleteReportById(report.id).then(() => {
                notify('Report deleted successfully.', 'success');
                updateDashboard();
            }).catch(err => notify(`Error: ${err.message}`, 'danger'));
        }
    }
}

function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const reportId = form.querySelector('#edit-report-id').value;
    const updatedData = {
        type: form.querySelector('#edit-report-type').value,
        status: form.querySelector('#edit-report-status').value,
        location: form.querySelector('#edit-report-location').value,
        image: form.querySelector('#edit-report-image').value,
    };

    updateReport(reportId, updatedData).then(() => {
        notify('Report updated successfully.', 'success');
        const modal = bootstrap.Modal.getInstance(elements.editModal);
        modal.hide();
        updateDashboard();
    }).catch(err => notify(`Error: ${err.message}`, 'danger'));
}

// --- MODAL HELPERS ---

function showReportDetails(report) {
    const modal = elements.detailsModal;
    modal.querySelector('#modal-hazard-id').textContent = report.id;
    modal.querySelector('#modal-type').textContent = report.type;
    modal.querySelector('#modal-location').textContent = report.location;
    modal.querySelector('#modal-time').textContent = new Date(report.time).toLocaleString();
    modal.querySelector('#modal-status').textContent = report.status;
    modal.querySelector('#modal-user').textContent = report.reportedBy || 'Unknown';
    modal.querySelector('#modal-report-image').src = report.image || '';
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

function showEditModal(report) {
    const modal = elements.editModal;
    modal.querySelector('#edit-report-id').value = report.id;
    modal.querySelector('#edit-report-type').value = report.type;
    modal.querySelector('#edit-report-status').value = report.status;
    modal.querySelector('#edit-report-location').value = report.location;
    modal.querySelector('#edit-report-image').value = report.image || '';
    modal.querySelector('#edit-report-reportedBy').value = report.reportedBy || '';
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

// --- INITIALIZATION ---

function initializeEventListeners() {
  elements.searchInput?.addEventListener('input', handleFilterChange);
  elements.statusFilter?.addEventListener('change', handleFilterChange);
  elements.typeFilter?.addEventListener('change', handleFilterChange);
  elements.pageSizeSelect?.addEventListener('change', handlePageSizeChange);
  elements.prevBtn?.addEventListener('click', () => handlePaginationChange('prev'));
  elements.nextBtn?.addEventListener('click', () => handlePaginationChange('next'));
  elements.sortHeaders.forEach(h => h.addEventListener('click', handleSortChange));
  elements.tableBody?.addEventListener('click', handleTableAction);
  
  const editForm = document.getElementById('edit-report-form');
  editForm?.addEventListener('submit', handleFormSubmit);

  elements.fabBtn?.addEventListener('click', () => elements.fabMenu?.classList.toggle('open'));
}

function setupMobileDrawer() {
  if (window.innerWidth > 768) return;
  const sidebar = document.querySelector('.dashboard-right');
  if (!sidebar) return;
  const toggle = document.createElement('button');
  toggle.id = 'mobile-drawer-toggle';
  toggle.innerHTML = '<i class="fas fa-bars"></i>';
  document.body.appendChild(toggle);
  toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
}

  async function init() {
    const { heatLayer } = initializeMap();
    initControls({ toggleHeatmap, centerMap, plotReports, heatLayer });
    initializeEventListeners();
    setupMobileDrawer();
    try {
      await updateDashboard();
      notify('Dashboard loaded.', 'success');
    } catch (err) {
      notify('Failed to load dashboard', 'danger');
    }
  }

document.addEventListener('DOMContentLoaded', init);
