import { initializeMap, plotReports, toggleHeatmap, centerMap } from "./map.js";
import { fetchReports, updateReport, deleteReportById } from "./reports-api.js";
import { initControls } from "./ui-controls.js";

// --- STATE MANAGEMENT ---
const state = {
  reports: [],
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
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  isLoading: true,
  selectedReportIds: new Set(),
};

// Polling configuration for detecting new reports
const REPORT_POLL_INTERVAL = 60000; // 1 minute
let latestReportTime = null;
let pollTimer = null;

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
  // Pagination
  showingInfo: document.getElementById("table-showing-info"),
  pageInfo: document.getElementById("table-page-info"),
  prevBtn: document.getElementById("table-prev-btn"),
  nextBtn: document.getElementById("table-next-btn"),
  pageSizeSelect: document.getElementById("table-page-size"),
  // Modals
  editModal: document.getElementById("editReportModal"),
  detailsModal: document.getElementById("reportDetailsModal"),
};

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

  const reportsToRender = state.reports;

  if (reportsToRender.length === 0) {
    elements.tableBody.innerHTML =
      '<tr><td colspan="7" class="text-center">No reports found.</td></tr>';
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
    elements.tableBody.appendChild(row);
  });
}

function renderReportCards() {
  if (!elements.blocksContainer) return;

  elements.blocksContainer.innerHTML = "";

  const reportsToRender = state.reports;

  if (reportsToRender.length === 0) {
    elements.blocksContainer.innerHTML =
      '<p class="text-center">No reports found.</p>';
    return;
  }

  reportsToRender.forEach((report) => {
    const col = document.createElement("div");
    col.className = "col";
    col.innerHTML = `
      <div class="card report-card h-100" data-report-id="${report.id}">
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
        </div>
      </div>`;
    elements.blocksContainer.appendChild(col);
  });
}

function renderPagination() {
  const { currentPage, pageSize, total } = state.pagination;
  const totalPages = Math.ceil(total / pageSize);
  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(startIdx + pageSize - 1, total);

  elements.showingInfo.textContent =
    total > 0
      ? `Showing ${startIdx}-${endIdx} of ${total} reports`
      : "No reports";
  elements.pageInfo.textContent = `Page ${currentPage} of ${Math.max(totalPages, 1)}`;
  elements.prevBtn.disabled = currentPage <= 1;
  elements.nextBtn.disabled = currentPage >= totalPages;
}

function renderAll() {
  renderStats();
  renderTable();
  renderReportCards();
  renderPagination();
}

// --- API & DATA HANDLING ---

// Load all reports for stats and map (without pagination)
async function loadAllReportsForStatsAndMap() {
  try {
    const params = {
      ...state.filters,
      limit: 10000, // Very large number to get all reports
      sort: state.sort.field,
      order: state.sort.direction,
    };
    const { reports, metrics } = await fetchReports(params);
    state.metrics = metrics;
    if (reports.length > 0) {
      latestReportTime = reports.reduce((latest, r) => {
        const time = new Date(r.time);
        return !latest || time > latest ? time : latest;
      }, null);
    }
    await plotReports(reports);
    renderStats();
  } catch (error) {
    console.error("Failed to load all reports for stats/map:", error);
    notify("Failed to load complete data", "warning");
  }
}

// Load paginated reports for table display
async function loadPaginatedReports() {
  try {
    const params = {
      ...state.filters,
      page: state.pagination.currentPage,
      limit: state.pagination.pageSize,
      sort: state.sort.field,
      order: state.sort.direction,
    };
    const { reports, pagination } = await fetchReports(params);

    // Ensure current page is within range
    const totalPages = Math.max(
      Math.ceil((pagination.total || 0) / state.pagination.pageSize),
      1,
    );
    if (state.pagination.currentPage > totalPages) {
      state.pagination.currentPage = totalPages;
      return loadPaginatedReports();
    }

    state.reports = reports;
    state.pagination.total = pagination.total;
    renderTable();
    renderReportCards();
    renderPagination();
  } catch (error) {
    console.error("Failed to load paginated reports:", error);
    notify("Failed to load table data", "danger");
    state.reports = [];
    state.pagination.total = 0;
  }
}

async function updateDashboard({ silent = false } = {}) {
  state.isLoading = true;
  if (!silent) showMetricsLoading();
  const loadingToast = silent ? null : notify("Loading reports...", "info", true);

  try {
    // Load all reports for stats and map
    await loadAllReportsForStatsAndMap();
    // Load paginated reports for table
    await loadPaginatedReports();
  } catch (error) {
    console.error("Failed to update dashboard:", error);
    notify("Failed to load dashboard", "danger");
    state.reports = [];
    state.pagination.total = 0;
    state.metrics = { total: null, open: null, resolved: null, users: null };
    renderAll();
  } finally {
    state.isLoading = false;
    if (loadingToast) loadingToast.remove();
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

function handleFilterChange() {
  state.filters.search = elements.searchInput.value;
  state.filters.status = elements.statusFilter.value;
  state.filters.type = elements.typeFilter.value;
  state.filters.my_reports = elements.myReportsFilter.checked;
  state.pagination.currentPage = 1;
  updateDashboard();
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

  updateDashboard();
}

function handlePaginationChange(direction) {
  const totalPages = Math.ceil(
    state.pagination.total / state.pagination.pageSize,
  );
  if (direction === "next" && state.pagination.currentPage < totalPages) {
    state.pagination.currentPage++;
  } else if (direction === "prev" && state.pagination.currentPage > 1) {
    state.pagination.currentPage--;
  }
  // Only reload table data for pagination changes
  loadPaginatedReports();
}

function handlePageSizeChange(e) {
  state.pagination.pageSize = parseInt(e.target.value, 10);
  state.pagination.currentPage = 1;
  // Only reload table data for page size changes
  loadPaginatedReports();
}

function handleReportAction(e) {
  const target = e.target.closest("button");
  if (!target) return;
  const container = e.target.closest("tr, .report-card");
  if (!container) return;
  const reportId = container.dataset.reportId;
  const report = state.reports.find((r) => r.id == reportId);

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
          updateDashboard();
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
      updateDashboard();
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
  elements.searchInput?.addEventListener("input", handleFilterChange);
  elements.statusFilter?.addEventListener("change", handleFilterChange);
  elements.typeFilter?.addEventListener("change", handleFilterChange);
  elements.myReportsFilter?.addEventListener("change", handleFilterChange);
  elements.pageSizeSelect?.addEventListener("change", handlePageSizeChange);
  elements.prevBtn?.addEventListener("click", () =>
    handlePaginationChange("prev"),
  );
  elements.nextBtn?.addEventListener("click", () =>
    handlePaginationChange("next"),
  );
  elements.sortHeaders.forEach((h) =>
    h.addEventListener("click", handleSortChange),
  );
  elements.tableBody?.addEventListener("click", handleReportAction);
  elements.blocksContainer?.addEventListener("click", handleReportAction);

  const editForm = document.getElementById("edit-report-form");
  editForm?.addEventListener("submit", handleFormSubmit);
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

async function init() {
  if (typeof window.initializeNotifications === "function") {
    window.initializeNotifications();
  }

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
