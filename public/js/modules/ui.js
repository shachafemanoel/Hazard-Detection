// UI management module
export class UIManager {
  constructor() {
    this.toast = new ToastManager();
    this.selectedReports = new Set();
    this.bindEventListeners();
    this.setupBulkActions();
  }

  bindEventListeners() {
    // Filter event listeners
    document.getElementById('type-filter')?.addEventListener('change', e => {
      this.onFilterChange('type', e.target.value || 'all');
    });

    document.getElementById('status-filter')?.addEventListener('change', e => {
      this.onFilterChange('status', e.target.value);
    });

    document.getElementById('search-filter')?.addEventListener('input', e => {
      this.onFilterChange('searchQuery', e.target.value);
    });

    // Date range filters
    const startDate = document.getElementById('date-filter-start');
    const endDate = document.getElementById('date-filter-end');
    if (startDate && endDate) {
      [startDate, endDate].forEach(input => {
        input.addEventListener('change', () => {
          if (startDate.value && endDate.value) {
            this.onFilterChange('dateRange', [startDate.value, endDate.value]);
          }
        });
      });
    }

    // Legend chips for quick type filters
    const legend = document.getElementById('legend-filters');
    if (legend) {
      legend.querySelectorAll('.legend-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          btn.classList.toggle('active');
          // reflect style
          btn.classList.toggle('btn-outline-light');
          btn.classList.toggle('btn-primary');
          const active = Array.from(legend.querySelectorAll('.legend-chip.active')).map(el => el.dataset.type);
          // Sync dropdown: if 0 -> all, if 1 -> set value, else -> clear selection
          const typeSel = document.getElementById('type-filter');
          if (typeSel) {
            if (active.length === 0) typeSel.value = '';
            else if (active.length === 1) typeSel.value = active[0];
            else typeSel.value = '';
          }
          this.broadcastFilters({ types: active, type: active.length === 0 ? 'all' : '' });
        });
      });
    }

    // Clear filters button
    const clearBtn = document.getElementById('clear-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const typeSel = document.getElementById('type-filter');
        const statusSel = document.getElementById('status-filter');
        const startDate = document.getElementById('date-filter-start');
        const endDate = document.getElementById('date-filter-end');
        const search = document.getElementById('search-filter');
        if (typeSel) typeSel.value = '';
        if (statusSel) statusSel.value = '';
        if (startDate) startDate.value = '';
        if (endDate) endDate.value = '';
        if (search) search.value = '';
        // Reset legend chips
        document.querySelectorAll('#legend-filters .legend-chip.active').forEach(el => {
          el.classList.remove('active');
          el.classList.remove('btn-primary');
          el.classList.add('btn-outline-light');
        });
        this.broadcastFilters({ type: 'all', types: [], status: 'all', dateRange: null, searchQuery: '' });
      });
    }
  }

  onFilterChange(key, value) {
    this.broadcastFilters({ [key]: value });
  }

  broadcastFilters(detail) {
    document.dispatchEvent(new CustomEvent('filterChange', { detail }));
  }

  updateStats(stats) {
    const mappings = {
      'total-reports': stats.total,
      'new-reports': stats.new,
      'in-progress-reports': stats.inProgress,
      'resolved-reports': stats.resolved,
      'reports-count': stats.total
    };

    Object.entries(mappings).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
        // Update parent card background if it exists
        const card = element.closest('.card');
        if (card && value > 0) {
          card.classList.add('border-highlight');
        }
      }
    });
  }

  updateTable(reports) {
    const tableBody = document.getElementById('reports-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    reports.forEach(report => {
      const row = document.createElement('tr');
      row.dataset.reportId = report.id;
      const imgUrl = report.imageUrl || report.image || 'placeholder.jpg';
      const address = typeof report.location === 'string' ? report.location : (report.location?.address || 'מיקום לא ידוע');
      const typeBadge = `<span class="badge rounded-pill bg-${this.getTypeColor(report.type)}">${this.getHazardTypeName(report.type)}</span>`;
      const statusBadge = `<span class="badge bg-${this.getStatusColor(report.status)}">${this.getStatusName(report.status)}</span>`;
      row.innerHTML = `
        <td>
          <div class="report-compact d-flex align-items-center gap-3">
            <img src="${imgUrl}" alt="תמונת דיווח" class="report-thumb-sm" data-action="view-image" data-url="${imgUrl}">
            <div class="report-lines flex-grow-1">
              <div class="line-1 d-flex align-items-center gap-2">
                ${typeBadge}
                <div class="address text-truncate" title="${address}">${address}</div>
              </div>
              <div class="line-2 d-flex align-items-center gap-2 text-muted small">
                <i class="far fa-calendar"></i>
                <span>${this.formatDate(report.createdAt || report.time)}</span>
                ${statusBadge}
              </div>
            </div>
            <button class="btn btn-sm btn-outline-danger ms-2" data-action="delete-report" data-id="${report.id}" title="מחק">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>`;
      tableBody.appendChild(row);
    });
  }

  getHazardTypeName(type) {
    const types = {
      'pothole': 'בור',
      'crack': 'סדק',
      'manhole': 'מכסה ביוב',
      'other': 'אחר'
    };
    return types[type] || type;
  }

  getStatusName(status) {
    const statuses = {
      'new': 'חדש',
      'open': 'פתוח',
      'in_progress': 'בטיפול',
      'resolved': 'טופל',
      'closed': 'סגור'
    };
    return statuses[status] || status;
  }

  toggleLoading(show) {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = show ? 'flex' : 'none';
  }

  createReportRow(report) {
    const row = document.createElement('tr');
    row.dataset.reportId = report.id;
    row.innerHTML = `
      <td>
        <div class="form-check">
          <input class="form-check-input report-checkbox" type="checkbox" value="${report.id}">
        </div>
      </td>
      <td>
        <img src="${report.imageUrl || 'placeholder.jpg'}" 
             alt="תמונת דיווח" 
             class="report-thumb img-thumbnail" 
             style="width: 60px; height: 60px; object-fit: cover; cursor: pointer"
             data-bs-toggle="modal" 
             data-bs-target="#imageModal"
             onclick="document.getElementById('modal-image').src='${report.imageUrl}'">
      </td>
      <td>
        <span class="badge rounded-pill bg-${this.getTypeColor(report.type)}">${report.type}</span>
      </td>
      <td>${typeof report.location === 'string' ? report.location : (report.location?.address || 'מיקום לא ידוע')}</td>
      <td>
        <span class="badge bg-${this.getStatusColor(report.status)}">${report.status}</span>
      </td>
      <td>${this.formatDate(report.createdAt)}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="window.dashboard.editReport('${report.id}')" title="ערוך">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-outline-danger" onclick="window.dashboard.deleteReport('${report.id}')" title="מחק">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    return row;
  }

  getTypeColor(type) {
    const colors = {
      'pothole': 'danger',
      'crack': 'warning',
      'manhole': 'info',
      'other': 'secondary'
    };
    return colors[type] || 'secondary';
  }

  getStatusColor(status) {
    const colors = {
      'new': 'primary',
      'open': 'info',
      'in_progress': 'warning',
      'resolved': 'success',
      'closed': 'secondary'
    };
    return colors[status] || 'secondary';
  }

  formatDate(dateString) {
    return new Date(dateString).toLocaleString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  setupBulkActions() {
    const selectAllCheckbox = document.getElementById('select-all-reports');
    const bulkActionsDiv = document.getElementById('bulk-actions');
    const selectedCountSpan = document.getElementById('selected-count');

    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.report-checkbox');
        checkboxes.forEach(checkbox => {
          checkbox.checked = e.target.checked;
          if (e.target.checked) {
            this.selectedReports.add(checkbox.value);
          } else {
            this.selectedReports.delete(checkbox.value);
          }
        });
        this.updateBulkActionsVisibility();
      });
    }

    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('report-checkbox')) {
        if (e.target.checked) {
          this.selectedReports.add(e.target.value);
        } else {
          this.selectedReports.delete(e.target.value);
        }
        this.updateBulkActionsVisibility();
      }
    });

    // Delegate actions inside table
    const tableBody = document.getElementById('reports-table-body');
    if (tableBody) {
      tableBody.addEventListener('click', (e) => {
        const imgBtn = e.target.closest('[data-action="view-image"]');
        if (imgBtn) {
          const url = imgBtn.getAttribute('data-url');
          if (window.dashboard && typeof window.dashboard.showImage === 'function') {
            window.dashboard.showImage(url);
          }
          return;
        }
        const delBtn = e.target.closest('[data-action="delete-report"]');
        if (delBtn) {
          const id = delBtn.getAttribute('data-id');
          if (window.dashboard && typeof window.dashboard.deleteReport === 'function') {
            window.dashboard.deleteReport(id);
          }
        }
      });
    }

    if (bulkActionsDiv) {
      document.getElementById('bulk-delete-btn')?.addEventListener('click', () => {
        if (confirm('האם אתה בטוח שברצונך למחוק את כל הדיווחים הנבחרים?')) {
          this.deleteSelectedReports();
        }
      });
    }
  }

  updateBulkActionsVisibility() {
    const bulkActionsDiv = document.getElementById('bulk-actions');
    const selectedCountSpan = document.getElementById('selected-count');
    
    if (bulkActionsDiv && selectedCountSpan) {
      if (this.selectedReports.size > 0) {
        bulkActionsDiv.style.display = 'block';
        selectedCountSpan.textContent = this.selectedReports.size;
      } else {
        bulkActionsDiv.style.display = 'none';
      }
    }
  }

  async deleteSelectedReports() {
    try {
      for (const reportId of this.selectedReports) {
        await fetch(`/api/reports/${reportId}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        
        const row = document.querySelector(`tr[data-report-id="${reportId}"]`);
        if (row) row.remove();
      }
      
      this.selectedReports.clear();
      this.updateBulkActionsVisibility();
      this.toast.show('הדיווחים נמחקו בהצלחה', 'success');
    } catch (error) {
      console.error('Failed to delete reports:', error);
      this.toast.show('שגיאה במחיקת הדיווחים', 'error');
    }
  }
}

class ToastManager {
  constructor() {
    this.createContainer();
  }

  createContainer() {
    if (!document.getElementById('toast-container')) {
      const container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      document.body.appendChild(container);
    }
  }

  show(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast show bg-${type}`;
    toast.innerHTML = `
      <div class="toast-header">
        <strong class="me-auto">${type.charAt(0).toUpperCase() + type.slice(1)}</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
      </div>
      <div class="toast-body">${message}</div>
    `;

    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }
}
