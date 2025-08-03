import { initMap, toggleHeatmap, centerMap, plotReports } from './map.js';
import { fetchReports } from './reports-api.js';
import { initControls } from './ui-controls.js';
import { renderReports } from './modals.js';
import { notify } from './notifications.js';

// Table management state
let currentReports = [];
let filteredReports = [];
let currentPage = 1;
let pageSize = 25;
let sortField = 'time';
let sortDirection = 'desc';

// Update statistics
function updateStatistics(reports) {
  const totalReports = reports.length;
  const openHazards = reports.filter(r => r.status === 'Open' || r.status === 'New').length;
  
  // Calculate resolved this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const resolvedThisMonth = reports.filter(r => 
    r.status === 'Resolved' && new Date(r.time) >= startOfMonth
  ).length;
  
  // Active users (unique reporters this month)
  const activeUsers = new Set(
    reports
      .filter(r => new Date(r.time) >= startOfMonth)
      .map(r => r.reportedBy)
      .filter(user => user && user !== 'אנונימי')
  ).size;

  document.getElementById('total-reports-count').textContent = totalReports;
  document.getElementById('open-hazards-count').textContent = openHazards;
  document.getElementById('resolved-this-month').textContent = resolvedThisMonth;
  document.getElementById('active-users').textContent = activeUsers;
}

// Sort reports
function sortReports(reports, field, direction) {
  return [...reports].sort((a, b) => {
    let aVal = a[field];
    let bVal = b[field];
    
    if (field === 'time') {
      aVal = new Date(aVal);
      bVal = new Date(bVal);
    } else if (field === 'id') {
      aVal = parseInt(aVal) || 0;
      bVal = parseInt(bVal) || 0;
    } else {
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
    }
    
    if (direction === 'asc') {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    } else {
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    }
  });
}

// Filter reports
function filterReports(reports, filters) {
  return reports.filter(report => {
    // Text search
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      const searchableText = [
        report.type,
        report.location,
        report.status,
        report.reportedBy,
        report.id
      ].join(' ').toLowerCase();
      
      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }
    
    // Status filter
    if (filters.status && report.status !== filters.status) {
      return false;
    }
    
    // Type filter
    if (filters.type && report.type !== filters.type) {
      return false;
    }
    
    return true;
  });
}

// Render table
function renderReportsTable(reports) {
  const tbody = document.getElementById('reports-table-body');
  const showingInfo = document.getElementById('table-showing-info');
  const pageInfo = document.getElementById('table-page-info');
  const prevBtn = document.getElementById('table-prev-btn');
  const nextBtn = document.getElementById('table-next-btn');
  
  if (!tbody) return;
  
  // Calculate pagination
  const totalReports = reports.length;
  const totalPages = Math.ceil(totalReports / pageSize);
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalReports);
  const pageReports = reports.slice(startIdx, endIdx);
  
  // Update pagination info
  showingInfo.textContent = `Showing ${startIdx + 1}-${endIdx} of ${totalReports} reports`;
  pageInfo.textContent = `Page ${currentPage} of ${Math.max(totalPages, 1)}`;
  
  // Update pagination buttons
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
  
  // Clear and populate table
  tbody.innerHTML = '';
  
  pageReports.forEach(report => {
    const row = document.createElement('tr');
    
    const formatTime = (timeStr) => {
      try {
        return new Date(timeStr).toLocaleString();
      } catch {
        return timeStr || 'Unknown';
      }
    };
    
    const truncateLocation = (location) => {
      if (!location) return 'Unknown';
      return location.length > 30 ? location.substring(0, 30) + '...' : location;
    };
    
    const getStatusBadge = (status) => {
      const statusMap = {
        'Open': 'badge bg-danger',
        'New': 'badge bg-danger',
        'In Progress': 'badge bg-warning',
        'Resolved': 'badge bg-success'
      };
      const badgeClass = statusMap[status] || 'badge bg-secondary';
      return `<span class="${badgeClass}">${status || 'Unknown'}</span>`;
    };
    
    row.innerHTML = `
      <td><input type="checkbox" class="report-checkbox" data-report-id="${report.id}"></td>
      <td>${report.id || 'N/A'}</td>
      <td><span class="badge bg-primary">${report.type || 'Unknown'}</span></td>
      <td>${getStatusBadge(report.status)}</td>
      <td title="${report.location || 'Unknown'}">${truncateLocation(report.location)}</td>
      <td>${formatTime(report.time)}</td>
      <td>
        <div class="btn-group" role="group">
          <button class="btn btn-sm btn-outline-info view-report-btn" data-report-id="${report.id}" title="View Details">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-sm btn-outline-warning edit-report-btn" data-report-id="${report.id}" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-report-btn" data-report-id="${report.id}" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    
    tbody.appendChild(row);
  });
  
  // Add event listeners for action buttons
  tbody.querySelectorAll('.view-report-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const reportId = e.currentTarget.dataset.reportId;
      const report = currentReports.find(r => r.id == reportId);
      if (report) {
        showReportDetails(report);
      }
    });
  });
  
  tbody.querySelectorAll('.edit-report-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const reportId = e.currentTarget.dataset.reportId;
      const report = currentReports.find(r => r.id == reportId);
      if (report) {
        showEditModal(report);
      }
    });
  });
  
  tbody.querySelectorAll('.delete-report-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const reportId = e.currentTarget.dataset.reportId;
      if (confirm('Are you sure you want to delete this report?')) {
        deleteReport(reportId);
      }
    });
  });
}

// Show report details modal
function showReportDetails(report) {
  const modalEl = document.getElementById('reportDetailsModal');
  if (!modalEl) return;
  
  document.getElementById('modal-hazard-id').textContent = report.id;
  document.getElementById('modal-type').textContent = report.type;
  document.getElementById('modal-location').textContent = report.location;
  document.getElementById('modal-time').textContent = new Date(report.time).toLocaleString();
  document.getElementById('modal-status').textContent = report.status;
  document.getElementById('modal-user').textContent = report.reportedBy || 'Unknown';
  
  const imgEl = document.getElementById('modal-report-image');
  if (imgEl) imgEl.src = report.image || '';
  
  const modal = window.reportDetailsBootstrapModal || new bootstrap.Modal(modalEl);
  modal.show();
}

// Show edit modal
function showEditModal(report) {
  const modalEl = document.getElementById('editReportModal');
  if (!modalEl) return;
  
  document.getElementById('edit-report-id').value = report.id;
  document.getElementById('edit-report-type').value = report.type;
  document.getElementById('edit-report-status').value = report.status;
  document.getElementById('edit-report-location').value = report.location;
  document.getElementById('edit-report-image').value = report.image || '';
  document.getElementById('edit-report-reportedBy').value = report.reportedBy || '';
  
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

// Delete report
async function deleteReport(reportId) {
  try {
    const response = await fetch(`/api/reports/${reportId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (response.ok) {
      notify('Report deleted successfully', 'success');
      // Refresh data
      await refreshDashboard();
    } else {
      notify('Failed to delete report', 'danger');
    }
  } catch (error) {
    console.error('Delete error:', error);
    notify('Error deleting report', 'danger');
  }
}

// Initialize table functionality
function initTable() {
  // Search input
  const searchInput = document.getElementById('table-search-input');
  const statusFilter = document.getElementById('table-status-filter');
  const typeFilter = document.getElementById('table-type-filter');
  const prevBtn = document.getElementById('table-prev-btn');
  const nextBtn = document.getElementById('table-next-btn');
  const pageSizeSelect = document.getElementById('table-page-size');
  const selectAllCheckbox = document.getElementById('select-all-reports');
  
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }
  
  if (statusFilter) {
    statusFilter.addEventListener('change', applyFilters);
  }
  
  if (typeFilter) {
    typeFilter.addEventListener('change', applyFilters);
  }
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderReportsTable(filteredReports);
      }
    });
  }
  
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredReports.length / pageSize);
      if (currentPage < totalPages) {
        currentPage++;
        renderReportsTable(filteredReports);
      }
    });
  }
  
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value);
      currentPage = 1;
      renderReportsTable(filteredReports);
    });
  }
  
  // Sortable headers
  document.querySelectorAll('#reports-management-table .sortable').forEach(header => {
    header.addEventListener('click', () => {
      const newSortField = header.dataset.sort;
      if (sortField === newSortField) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortField = newSortField;
        sortDirection = 'asc';
      }
      
      // Update sort indicators
      document.querySelectorAll('#reports-management-table .sortable i').forEach(icon => {
        icon.className = 'fas fa-sort';
      });
      
      const icon = header.querySelector('i');
      icon.className = sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
      
      applyFilters();
    });
  });
  
  // Select all functionality
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.report-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = e.target.checked;
      });
    });
  }
}

// Apply filters and update table
function applyFilters() {
  const searchInput = document.getElementById('table-search-input');
  const statusFilter = document.getElementById('table-status-filter');
  const typeFilter = document.getElementById('table-type-filter');
  
  const filters = {
    search: searchInput?.value || '',
    status: statusFilter?.value || '',
    type: typeFilter?.value || ''
  };
  
  filteredReports = filterReports(currentReports, filters);
  filteredReports = sortReports(filteredReports, sortField, sortDirection);
  
  currentPage = 1; // Reset to first page
  renderReportsTable(filteredReports);
  
  // Update map and cards with filtered data
  if (typeof plotReports === 'function') {
    plotReports(filteredReports);
  }
  renderReports(filteredReports);
}

// Refresh dashboard data
async function refreshDashboard() {
  try {
    const { reports } = await fetchReports();
    currentReports = reports;
    filteredReports = [...reports];
    
    updateStatistics(reports);
    plotReports(reports);
    renderReports(reports);
    applyFilters(); // This will also render the table
    
    notify('Dashboard refreshed', 'success');
  } catch (error) {
    console.error('Refresh error:', error);
    notify('Failed to refresh dashboard', 'danger');
  }
}

function initModal() {
  const modalEl = document.getElementById('reportDetailsModal');
  if (modalEl && window.bootstrap) {
    window.reportDetailsBootstrapModal = new bootstrap.Modal(modalEl, {});
  }
}

function toggleLegend() {
  const legend = document.getElementById('legend');
  if (legend) {
    legend.classList.toggle('d-none');
  }
}

function initLegendToggle() {
  const legendBtn = document.getElementById('legend-toggle-btn');
  if (legendBtn) {
    legendBtn.addEventListener('click', toggleLegend);
  }
}

function initFabMenu() {
  const fabBtn = document.getElementById('fab-btn');
  const menu = document.getElementById('fab-menu');
  if (fabBtn && menu) {
    fabBtn.addEventListener('click', () => {
      menu.classList.toggle('open');
    });
  }
}

export async function bootstrapDashboard() {
  try {
    initMap();
    initControls({ toggleHeatmap, centerMap, plotReports });
    initTable();
    
    const { reports } = await fetchReports();
    currentReports = reports;
    filteredReports = [...reports];
    
    updateStatistics(reports);
    plotReports(reports);
    renderReports(reports);
    renderReportsTable(filteredReports);
    
    initModal();
    initLegendToggle();
    initFabMenu();
    
    // Add refresh button functionality
    const refreshBtn = document.getElementById('refresh-info-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', refreshDashboard);
    }
    
    notify('Dashboard loaded successfully', 'success');
  } catch (e) {
    console.error(e);
    notify('Failed to load dashboard', 'danger');
  }
}

export { toggleHeatmap, centerMap };

// automatically bootstrap when module is loaded
bootstrapDashboard();
