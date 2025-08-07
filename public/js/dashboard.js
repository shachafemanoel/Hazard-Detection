import { initializeMap, plotReports, toggleHeatmap, centerMap } from "./map.js";
import { fetchReports, updateReport, deleteReportById } from "./reports-api.js";
import { initControls } from "./ui-controls.js";

// --- STATE MANAGEMENT ---
const state = {
  allReports: [], // Store all reports from server
  filteredReports: [], // Store filtered reports for display
  metrics: { total: null, open: null, resolved: null, users: null },
  filters: {
    search: "",
    status: "",
    type: "",
    my_reports: false,
  },
  sort: {
    field: "time",
    direction: "desc",
  },
  isLoading: true,
  selectedReportIds: new Set(),
  lastDataFetch: null, // Track when we last fetched data
};

// Polling configuration for detecting new reports
const REPORT_POLL_INTERVAL = 60000; // 1 minute
let latestReportTime = null;
let pollTimer = null;

// Debouncing for search
let searchDebounceTimer = null;
const SEARCH_DEBOUNCE_DELAY = 300; // 300ms

// --- DOM ELEMENTS ---
const elements = {
  // Stats
  totalReportsCount: document.getElementById("total-reports-count"),
  openHazardsCount: document.getElementById("open-hazards-count"),
  resolvedThisMonthCount: document.getElementById("resolved-this-month-count"),
  activeUsersCount: document.getElementById("active-users-count"),
  // Table
  tableBody: document.getElementById("reports-table-body"),
  blocksContainer: document.getElementById("reports-blocks-container"),
  selectAllCheckbox: document.getElementById("select-all-reports"),
  // Filters & Sort
  searchInput: document.getElementById("report-search-input"),
  statusFilter: document.getElementById("table-status-filter"),
  typeFilter: document.getElementById("hazard-type-filter"),
  myReportsFilter: document.getElementById("my-reports-filter"),
  sortHeaders: document.querySelectorAll("#reports-management-table .sortable"),
  // Modals
  editModal: document.getElementById("editReportModal"),
  detailsModal: document.getElementById("reportDetailsModal"),
};

// --- FILTERING & SEARCH FUNCTIONS ---

function applyFiltersAndSort() {
  console.log("Applying filters and sort...");
  console.log("Current filters:", state.filters);
  
  let filtered = [...state.allReports];
  
  // Apply search filter (search in multiple fields)
  if (state.filters.search && state.filters.search.trim()) {
    const searchTerm = state.filters.search.toLowerCase().trim();
    console.log("Searching for:", searchTerm);
    
    filtered = filtered.filter(report => {
      // Search in multiple fields
      const searchFields = [
        report.id?.toString() || "",
        report.location || "",
        report.reportedBy || "",
        report.type || "",
        report.status || "",
        report.address || "",
        report.user || "",
        report.username || ""
      ];
      
      return searchFields.some(field => 
        field.toLowerCase().includes(searchTerm)
      );
    });
    
    console.log(`Filtered by search: ${filtered.length} results`);
  }
  
  // Apply status filter
  if (state.filters.status && state.filters.status !== "") {
    filtered = filtered.filter(report => report.status === state.filters.status);
    console.log(`Filtered by status: ${filtered.length} results`);
  }
  
  // Apply type filter
  if (state.filters.type && state.filters.type !== "") {
    filtered = filtered.filter(report => report.type === state.filters.type);
    console.log(`Filtered by type: ${filtered.length} results`);
  }
  
  // Apply "my reports" filter
  if (state.filters.my_reports) {
    // Get current user (you might need to adjust this based on your auth system)
    const currentUser = getCurrentUser(); // We'll implement this
    if (currentUser) {
      filtered = filtered.filter(report => 
        report.reportedBy === currentUser || 
        report.user === currentUser ||
        report.username === currentUser
      );
      console.log(`Filtered by my reports: ${filtered.length} results`);
    }
  }
  
  // Apply sorting
  filtered.sort((a, b) => {
    let aVal = a[state.sort.field];
    let bVal = b[state.sort.field];
    
    // Handle different data types
    if (state.sort.field === "time") {
      aVal = new Date(aVal || 0);
      bVal = new Date(bVal || 0);
    } else if (state.sort.field === "id") {
      aVal = parseInt(aVal) || 0;
      bVal = parseInt(bVal) || 0;
    } else {
      aVal = (aVal || "").toString().toLowerCase();
      bVal = (bVal || "").toString().toLowerCase();
    }
    
    if (state.sort.direction === "asc") {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });
  
  state.filteredReports = filtered;
  console.log(`Final filtered results: ${state.filteredReports.length}`);
  
  // Update display
  renderTable();
  renderReportCards();
  updateFilteredMetrics();
  updateReportsCountIndicator();
}

function getCurrentUser() {
  // Try to get current user from various sources
  try {
    // Check localStorage or sessionStorage
    const user = localStorage.getItem('currentUser') || 
                 sessionStorage.getItem('currentUser') ||
                 localStorage.getItem('user') ||
                 sessionStorage.getItem('user');
    
    if (user) {
      const parsed = JSON.parse(user);
      return parsed.email || parsed.username || parsed.name || parsed.uid;
    }
    
    // Check if there's a global user variable
    if (window.currentUser) {
      return window.currentUser.email || window.currentUser.username || window.currentUser.name;
    }
    
    return null;
  } catch (e) {
    console.warn("Could not get current user:", e);
    return null;
  }
}

function updateFilteredMetrics() {
  const filtered = state.filteredReports;
  const total = filtered.length;
  const open = filtered.filter(r => r.status === 'Open' || r.status === 'New').length;
  
  // Calculate resolved this month
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);
  
  const resolved = filtered.filter(r => {
    if (r.status !== 'Resolved') return false;
    const reportDate = new Date(r.time);
    return reportDate >= thisMonth;
  }).length;
  
  // Count unique users
  const uniqueUsers = new Set();
  filtered.forEach(r => {
    if (r.reportedBy) uniqueUsers.add(r.reportedBy);
    if (r.user) uniqueUsers.add(r.user);
    if (r.username) uniqueUsers.add(r.username);
  });
  
  // Update metrics display (but don't overwrite if we're showing all data)
  if (state.filters.search || state.filters.status || state.filters.type || state.filters.my_reports) {
    elements.totalReportsCount.innerHTML = total;
    elements.openHazardsCount.innerHTML = open;
    elements.resolvedThisMonthCount.innerHTML = resolved;
    elements.activeUsersCount.innerHTML = uniqueUsers.size;
  }
}

function updateReportsCountIndicator() {
  const indicator = document.getElementById('reports-count-indicator');
  if (!indicator) return;
  
  const filtered = state.filteredReports.length;
  const total = state.allReports.length;
  
  if (filtered === total) {
    indicator.textContent = `Showing all ${total} reports`;
  } else {
    indicator.textContent = `Showing ${filtered} of ${total} reports`;
  }
  
  // Add some styling based on filter status
  if (filtered < total) {
    indicator.className = 'text-info';
  } else {
    indicator.className = 'text-muted';
  }
}

// --- RENDER FUNCTIONS ---

const formatTime = (timeStr) =>
  timeStr ? new Date(timeStr).toLocaleString() : "Unknown";
const truncate = (text, length = 30) =>
  text && text.length > length ? text.substring(0, length) + "..." : text || "Unknown";
const getStatusBadge = (status) => {
  const statusMap = {
    Open: "bg-danger",
    New: "bg-danger",
    "In Progress": "bg-warning",
    Resolved: "bg-success",
  };
  return `<span class="badge ${statusMap[status] || "bg-secondary"}">${status || "Unknown"}</span>`;
};
const formatType = (type) =>
  type
    ? type
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "Unknown";

function renderStats() {
  const { total, open, resolved, users } = state.metrics;
  const display = (v) =>
    v === null
      ? '<div class="spinner-border spinner-border-sm text-secondary" role="status"></div>'
      : v === 0
        ? "—"
        : v;
  elements.totalReportsCount.innerHTML = display(total);
  elements.openHazardsCount.innerHTML = display(open);
  elements.resolvedThisMonthCount.innerHTML = display(resolved);
  elements.activeUsersCount.innerHTML = display(users);
}

function renderTable() {
  if (!elements.tableBody) return;

  elements.tableBody.innerHTML = ""; // Clear existing rows

  const reportsToRender = state.filteredReports;

  if (reportsToRender.length === 0) {
    elements.tableBody.innerHTML =
      '<tr><td colspan="7" class="text-center">No reports found.</td></tr>';
    renderBulkDeleteButton();
    return;
  }

  reportsToRender.forEach((report) => {
    const row = document.createElement("tr");
    row.dataset.reportId = report.id;
    row.classList.toggle("selected", state.selectedReportIds.has(report.id));

    

    row.innerHTML = `
      <td><input type="checkbox" class="report-checkbox" data-report-id="${report.id}" ${state.selectedReportIds.has(report.id) ? "checked" : ""}></td>
      <td>${report.id || "N/A"}</td>
      <td><span class="badge bg-primary type-badge">${formatType(report.type)}</span></td>
      <td>${getStatusBadge(report.status)}</td>
      <td title="${report.location || ""}">${truncate(report.location)}</td>
      <td>${formatTime(report.time)}</td>
      <td>
        <div class="btn-group" role="group">
          <button class="btn btn-sm btn-outline-info view-report-btn" title="View Details"><i class="fas fa-eye"></i></button>
          <button class="btn btn-sm btn-outline-warning edit-report-btn" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-outline-danger delete-report-btn" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    `;
    // Checkbox event
    const checkbox = row.querySelector('.report-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        console.log('Report checkbox clicked:', report.id);
        if (e.target.checked) {
          state.selectedReportIds.add(report.id);
          console.log('Report selected:', report.id);
        } else {
          state.selectedReportIds.delete(report.id);
          console.log('Report deselected:', report.id);
        }
        renderBulkDeleteButton();
      });
      
      // Make sure checkbox is clickable
      checkbox.style.pointerEvents = 'auto';
      checkbox.style.cursor = 'pointer';
      checkbox.style.position = 'relative';
      checkbox.style.zIndex = '10';
    } else {
      console.error('Checkbox not found for report:', report.id);
    }
    elements.tableBody.appendChild(row);
  });
  renderBulkDeleteButton();
}

function renderReportCards() {
  if (!elements.blocksContainer) return;

  elements.blocksContainer.innerHTML = "";

  const reportsToRender = state.filteredReports;

  if (reportsToRender.length === 0) {
    elements.blocksContainer.innerHTML =
      '<p class="text-center">No reports found.</p>';
    return;
  }

  reportsToRender.forEach((report) => {
    const card = document.createElement("div");
    card.className = "card mb-3";
    card.dataset.id = report.id;
    card.innerHTML = `
        <div class="card-body">
          <div class="d-flex justify-content-between mb-2">
            <span class="badge bg-primary">${formatType(report.type)}</span>
            ${getStatusBadge(report.status)}
          </div>
          <h6 class="card-title mb-1">ID: ${report.id || "N/A"}</h6>
          <p class="card-text mb-2" title="${report.location || ""}">${truncate(report.location)}</p>
          <small class="text-muted">${formatTime(report.time)}</small>
        </div>
        <div class="card-footer d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-outline-info view-report-btn" title="View Details"><i class="fas fa-eye"></i></button>
          <button class="btn btn-sm btn-outline-warning edit-report-btn" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-outline-danger delete-report-btn" title="Delete"><i class="fas fa-trash"></i></button>
        </div>`;
    elements.blocksContainer.appendChild(card);
  });
}

function renderAll() {
  renderStats();
  renderTable();
  renderReportCards();
}

// Add bulk delete button above the table
function renderBulkDeleteButton() {
  let btn = document.getElementById('bulk-delete-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'bulk-delete-btn';
    btn.className = 'btn btn-danger mb-2';
    btn.textContent = 'Delete Selected Reports';
    btn.style.display = 'none';
    elements.tableBody.parentElement.parentElement.insertBefore(btn, elements.tableBody.parentElement);
    btn.addEventListener('click', async () => {
      if (state.selectedReportIds.size === 0) return;
      if (!confirm(`Delete ${state.selectedReportIds.size} selected reports?`)) return;
      
      const deletedIds = [];
      
      for (const id of state.selectedReportIds) {
        try {
          await deleteReportById(id);
          deletedIds.push(id);
        } catch (err) {
          notify(`Error deleting report #${id}: ${err.message}`, 'danger');
        }
      }
      
      // Remove deleted reports from local cache
      state.allReports = state.allReports.filter(r => !deletedIds.includes(r.id));
      state.selectedReportIds.clear();
      
      // Re-apply filters
      applyFiltersAndSort();
      
      // Update map
      if (window.plotReports) {
        plotReports(state.filteredReports);
      }
      
      if (deletedIds.length > 0) {
        notify(`Successfully deleted ${deletedIds.length} reports`, 'success');
      }
    });
  }
  btn.style.display = state.selectedReportIds.size > 0 ? '' : 'none';
}

// --- API & DATA HANDLING ---

async function loadReportsFromServer() {
  try {
    console.log("Loading reports from server...");
    const params = {
      limit: 10000, // Fetch all reports without filters - we'll filter client-side
      sort: 'time',
      order: 'desc',
    };
    const { reports, metrics } = await fetchReports(params);
    
    state.allReports = reports;
    state.filteredReports = reports; // Initially show all reports
    state.metrics = metrics;
    state.lastDataFetch = new Date();
    
    if (reports.length > 0) {
      latestReportTime = reports.reduce((latest, r) => {
        const time = new Date(r.time);
        return !latest || time > latest ? time : latest;
      }, null);
    }
    
    console.log(`Loaded ${reports.length} reports from server`);
    
    // Apply current filters if any
    applyFiltersAndSort();
    
    // Update map
    await plotReports(state.filteredReports);
    
    // Render stats
    renderStats();
    
  } catch (error) {
    console.error("Failed to load reports:", error);
    notify("Failed to load report data", "danger");
  }
}

async function updateDashboard({ silent = false, forceRefresh = false } = {}) {
  // Only load from server if we don't have data or force refresh is requested
  const needsServerData = !state.lastDataFetch || forceRefresh || 
                         (Date.now() - state.lastDataFetch.getTime()) > 300000; // 5 minutes
  
  if (needsServerData) {
    state.isLoading = true;
    if (!silent) showMetricsLoading();
    const loadingToast = silent ? null : notify("Loading reports...", "info", true);

    try {
      await loadReportsFromServer();
    } catch (error) {
      console.error("Failed to update dashboard:", error);
      notify("Failed to load dashboard", "danger");
      state.allReports = [];
      state.filteredReports = [];
      state.metrics = { total: null, open: null, resolved: null, users: null };
      renderAll();
    } finally {
      state.isLoading = false;
      if (loadingToast) loadingToast.remove();
    }
  } else {
    // Just apply filters and re-render with existing data
    console.log("Using cached data, applying filters...");
    applyFiltersAndSort();
  }
}

// Periodically check for newly added reports
async function pollForNewReports() {
  if (state.isLoading) return;
  try {
    const params = new URLSearchParams({ limit: 1, sort: 'time', order: 'desc' });
    const response = await fetch(`/api/reports?${params.toString()}`, {
      mode: 'cors',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) throw new Error('Failed to check reports');
    const data = await response.json();
    const latest = Array.isArray(data.reports) ? data.reports[0] : null;
    if (latest) {
      const newest = new Date(latest.time);
      if (!latestReportTime || newest > latestReportTime) {
        await updateDashboard({ silent: true });
      }
    }
  } catch (err) {
    console.error('Failed to check for new reports:', err);
  }
}

function startReportPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollForNewReports, REPORT_POLL_INTERVAL);
}

// --- EVENT HANDLERS ---

function handleSearchInput() {
  console.log("Search input detected, debouncing...");
  
  // Clear existing timer
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  
  // Set new timer
  searchDebounceTimer = setTimeout(() => {
    console.log("Search debounce completed, applying filter");
    handleFilterChange();
  }, SEARCH_DEBOUNCE_DELAY);
}

function handleFilterChange() {
  console.log("Filter change event triggered!");
  
  const oldFilters = { ...state.filters };
  
  state.filters.search = elements.searchInput?.value || "";
  state.filters.status = elements.statusFilter?.value || "";
  state.filters.type = elements.typeFilter?.value || "";
  state.filters.my_reports = elements.myReportsFilter?.checked || false;
  
  console.log("Old filters:", oldFilters);
  console.log("New filters:", state.filters);
  
  // Apply filters immediately without server call
  applyFiltersAndSort();
  
  // Update map with filtered results
  if (window.plotReports) {
    plotReports(state.filteredReports);
  }
}

function handleSortChange(e) {
  const newSortField = e.currentTarget.dataset.sort;
  if (state.sort.field === newSortField) {
    state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
  } else {
    state.sort.field = newSortField;
    state.sort.direction = "desc";
  }

  elements.sortHeaders.forEach(
    (h) => (h.querySelector("i").className = "fas fa-sort"),
  );
  e.currentTarget.querySelector("i").className =
    `fas fa-sort-${state.sort.direction === "asc" ? "up" : "down"}`;

  // Apply sort immediately without server call
  applyFiltersAndSort();
}

function handleReportAction(e) {
  const target = e.target.closest("button");
  if (!target) return;
  const container = e.target.closest("tr, .report-card");
  if (!container) return;
  const reportId = container.dataset.reportId;
  const report = state.allReports.find((r) => r.id == reportId);

  if (!report) return;

  if (target.classList.contains("view-report-btn")) {
    showReportDetails(report);
  } else if (target.classList.contains("edit-report-btn")) {
    showEditModal(report);
  } else if (target.classList.contains("delete-report-btn")) {
    if (confirm(`Are you sure you want to delete report #${report.id}?`)) {
      deleteReportById(report.id)
        .then(() => {
          notify("Report deleted successfully.", "success");
          
          // Remove from local cache
          state.allReports = state.allReports.filter(r => r.id !== report.id);
          state.selectedReportIds.delete(report.id);
          
          // Re-apply filters
          applyFiltersAndSort();
          
          // Update map
          if (window.plotReports) {
            plotReports(state.filteredReports);
          }
        })
        .catch((err) => notify(`Error: ${err.message}`, "danger"));
    }
  }
}

function handleFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const reportId = form.querySelector("#edit-report-id").value;
  const updatedData = {
    type: form.querySelector("#edit-report-type").value,
    status: form.querySelector("#edit-report-status").value,
    location: form.querySelector("#edit-report-location").value,
    image: form.querySelector("#edit-report-image").value,
  };

  updateReport(reportId, updatedData)
    .then(() => {
      notify("Report updated successfully.", "success");
      const modal = bootstrap.Modal.getInstance(elements.editModal);
      modal.hide();
      
      // Update local cache
      const reportIndex = state.allReports.findIndex(r => r.id == reportId);
      if (reportIndex !== -1) {
        state.allReports[reportIndex] = { ...state.allReports[reportIndex], ...updatedData };
      }
      
      // Re-apply filters
      applyFiltersAndSort();
      
      // Update map
      if (window.plotReports) {
        plotReports(state.filteredReports);
      }
    })
    .catch((err) => notify(`Error: ${err.message}`, "danger"));
}

// --- MODAL HELPERS ---

function showReportDetails(report) {
  const modal = elements.detailsModal;
  modal.querySelector("#modal-hazard-id").textContent = report.id;
  modal.querySelector("#modal-type").textContent = report.type;
  modal.querySelector("#modal-location").textContent = report.location;
  modal.querySelector("#modal-time").textContent = new Date(
    report.time,
  ).toLocaleString();
  modal.querySelector("#modal-status").textContent = report.status;
  modal.querySelector("#modal-user").textContent =
    report.reportedBy || "Unknown";
  modal.querySelector("#modal-report-image").src = report.image || "";
  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();
}

function showEditModal(report) {
  const modal = elements.editModal;
  modal.querySelector("#edit-report-id").value = report.id;
  modal.querySelector("#edit-report-type").value = report.type;
  modal.querySelector("#edit-report-status").value = report.status;
  modal.querySelector("#edit-report-location").value = report.location;
  modal.querySelector("#edit-report-image").value = report.image || "";
  modal.querySelector("#edit-report-reportedBy").value =
    report.reportedBy || "";
  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();
}

// --- INITIALIZATION ---

function initializeEventListeners() {
  // Debug logging for filter elements
  console.log("Initializing event listeners...");
  console.log("Search input:", elements.searchInput);
  console.log("Status filter:", elements.statusFilter);
  console.log("Type filter:", elements.typeFilter);
  console.log("My reports filter:", elements.myReportsFilter);
  console.log("Select all checkbox:", elements.selectAllCheckbox);

  // Add event listeners with debug logging and debouncing for search
  if (elements.searchInput) {
    elements.searchInput.addEventListener("input", handleSearchInput);
    elements.searchInput.addEventListener("keyup", handleSearchInput);
    // Make sure it's clickable
    elements.searchInput.style.pointerEvents = 'auto';
    elements.searchInput.style.cursor = 'text';
    console.log("✅ Search input event listener added");
  } else {
    console.error("❌ Search input not found");
  }
  
  if (elements.statusFilter) {
    elements.statusFilter.addEventListener("change", handleFilterChange);
    elements.statusFilter.addEventListener("click", handleFilterChange);
    // Make sure it's clickable
    elements.statusFilter.style.pointerEvents = 'auto';
    elements.statusFilter.style.cursor = 'pointer';
    console.log("✅ Status filter event listener added");
  } else {
    console.error("❌ Status filter not found");
  }
  
  if (elements.typeFilter) {
    elements.typeFilter.addEventListener("change", handleFilterChange);
    elements.typeFilter.addEventListener("click", handleFilterChange);
    // Make sure it's clickable
    elements.typeFilter.style.pointerEvents = 'auto';
    elements.typeFilter.style.cursor = 'pointer';
    console.log("✅ Type filter event listener added");
  } else {
    console.error("❌ Type filter not found");
  }
  
  if (elements.myReportsFilter) {
    elements.myReportsFilter.addEventListener("change", handleFilterChange);
    elements.myReportsFilter.addEventListener("click", handleFilterChange);
    // Make sure it's clickable
    elements.myReportsFilter.style.pointerEvents = 'auto';
    elements.myReportsFilter.style.cursor = 'pointer';
    console.log("✅ My reports filter event listener added");
  } else {
    console.error("❌ My reports filter not found");
  }

  // Select all checkbox
  if (elements.selectAllCheckbox) {
    elements.selectAllCheckbox.addEventListener("change", (e) => {
      console.log('Select all checkbox clicked:', e.target.checked);
      const checkboxes = document.querySelectorAll('.report-checkbox');
      console.log('Found checkboxes:', checkboxes.length);
      
      checkboxes.forEach(checkbox => {
        checkbox.checked = e.target.checked;
        const reportId = checkbox.dataset.reportId;
        if (e.target.checked) {
          state.selectedReportIds.add(reportId);
        } else {
          state.selectedReportIds.delete(reportId);
        }
      });
      
      console.log('Selected report IDs:', Array.from(state.selectedReportIds));
      renderBulkDeleteButton();
    });
    
    // Make sure it's clickable
    elements.selectAllCheckbox.style.pointerEvents = 'auto';
    elements.selectAllCheckbox.style.cursor = 'pointer';
    elements.selectAllCheckbox.style.position = 'relative';
    elements.selectAllCheckbox.style.zIndex = '10';
    
    console.log("✅ Select all checkbox event listener added");
  } else {
    console.error("❌ Select all checkbox not found");
  }

  elements.sortHeaders.forEach((h) =>
    h.addEventListener("click", handleSortChange),
  );
  elements.tableBody?.addEventListener("click", handleReportAction);
  elements.blocksContainer?.addEventListener("click", handleReportAction);

  const editForm = document.getElementById("edit-report-form");
  editForm?.addEventListener("submit", handleFormSubmit);

  // Refresh button
  const refreshBtn = document.getElementById("refresh-reports-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      console.log("Manual refresh requested");
      refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
      refreshBtn.disabled = true;
      
      updateDashboard({ forceRefresh: true }).finally(() => {
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        refreshBtn.disabled = false;
      });
    });
    console.log("✅ Refresh button event listener added");
  } else {
    console.error("❌ Refresh button not found");
  }
}

function showMetricsLoading() {
  [
    elements.totalReportsCount,
    elements.openHazardsCount,
    elements.resolvedThisMonthCount,
    elements.activeUsersCount,
  ].forEach((el) => {
    if (el)
      el.innerHTML =
        '<div class="spinner-border spinner-border-sm" role="status"></div>';
  });
}

function setupMobileDrawer() {
  if (window.innerWidth > 768) return;
  const sidebar = document.querySelector(".dashboard-right");
  if (!sidebar) return;
  const toggle = document.createElement("button");
  toggle.id = "mobile-drawer-toggle";
  toggle.innerHTML = '<i class="fas fa-bars"></i>';
  document.body.appendChild(toggle);
  toggle.addEventListener("click", () => sidebar.classList.toggle("open"));
}

// Add global click listener for debugging
function addGlobalDebugListener() {
  document.addEventListener('click', (e) => {
    console.log('Global click detected:', e.target);
    console.log('Target classes:', e.target.className);
    console.log('Target id:', e.target.id);
    
    // Check if click is on filter controls
    if (e.target.id === 'report-search-input' || 
        e.target.id === 'table-status-filter' || 
        e.target.id === 'hazard-type-filter' || 
        e.target.id === 'my-reports-filter' ||
        e.target.id === 'select-all-reports') {
      console.log('🎯 Click on filter control detected:', e.target.id);
    }
    
    // Check if click is on report checkbox
    if (e.target.classList.contains('report-checkbox')) {
      console.log('🎯 Click on report checkbox detected');
    }
  });
  
  // Also listen for change events
  document.addEventListener('change', (e) => {
    console.log('Global change detected:', e.target);
    if (e.target.id === 'report-search-input' || 
        e.target.id === 'table-status-filter' || 
        e.target.id === 'hazard-type-filter' || 
        e.target.id === 'my-reports-filter' ||
        e.target.id === 'select-all-reports') {
      console.log('🎯 Change on filter control detected:', e.target.id);
    }
  });
}

async function init() {
  if (typeof window.initializeNotifications === "function") {
    window.initializeNotifications();
  }

  // Add global debug listener
  addGlobalDebugListener();

  try {
    // Wait for Google Maps to initialize
    await initializeMap();
    initControls({ toggleHeatmap, centerMap, plotReports });
    initializeEventListeners();
    setupMobileDrawer();

    await updateDashboard();
    startReportPolling();
    notify("Dashboard loaded.", "success");
  } catch (err) {
    console.error("Dashboard initialization failed:", err);
    notify("Failed to load dashboard", "danger");
  }
}

document.addEventListener("DOMContentLoaded", init);
