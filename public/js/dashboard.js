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
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.selectedReportIds.add(report.id);
      } else {
        state.selectedReportIds.delete(report.id);
      }
      renderBulkDeleteButton();
    });
    elements.tableBody.appendChild(row);
  });
  renderBulkDeleteButton();
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
      for (const id of state.selectedReportIds) {
        try {
          await deleteReportById(id);
        } catch (err) {
          notify(`Error deleting report #${id}: ${err.message}`, 'danger');
        }
      }
      state.selectedReportIds.clear();
      updateDashboard();
    });
  }
  btn.style.display = state.selectedReportIds.size > 0 ? '' : 'none';
}

// --- API & DATA HANDLING ---

async function loadReportsForTable() {
  try {
    const params = {
      ...state.filters,
      limit: 10000, // Fetch all reports
      sort: state.sort.field,
      order: state.sort.direction,
    };
    const { reports, metrics } = await fetchReports(params);
    state.reports = reports;
    state.metrics = metrics;
    if (reports.length > 0) {
      latestReportTime = reports.reduce((latest, r) => {
        const time = new Date(r.time);
        return !latest || time > latest ? time : latest;
      }, null);
    }
    renderAll();
    await plotReports(reports);
  } catch (error) {
    console.error("Failed to load reports:", error);
    notify("Failed to load report data", "danger");
  }
}

async function updateDashboard({ silent = false } = {}) {
  state.isLoading = true;
  if (!silent) showMetricsLoading();
  const loadingToast = silent ? null : notify("Loading reports...", "info", true);

  try {
    await loadReportsForTable();
  } catch (error) {
    console.error("Failed to update dashboard:", error);
    notify("Failed to load dashboard", "danger");
    state.reports = [];
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
