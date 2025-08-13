import { initializeMap, plotReports, toggleHeatmap, centerMap, clearGeocodingCache, getGeocodingCacheStats } from "./map.js";
import { BASE_API_URL } from './config.js';
import { fetchWithTimeout } from './utils/fetchWithTimeout.js';
import { ensureOk, getJsonOrThrow } from './utils/http.js';

// Make plotReports available globally for easier access
window.plotReports = plotReports;
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

// Polling configuration for detecting new reports - Reduced frequency to minimize server load
const REPORT_POLL_INTERVAL = 10000; // 10 seconds for near real-time updates
let latestReportTime = null;
let pollTimer = null;
let pollErrorCount = 0;
const MAX_POLL_ERRORS = 3;

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
  
  // Apply search filter (search in multiple fields) - Case insensitive
  if (state.filters.search && state.filters.search.trim()) {
    const searchTerm = state.filters.search.toLowerCase().trim();
    console.log("Searching for:", searchTerm);
    
    filtered = filtered.filter(report => {
      // Search in multiple fields - all converted to lowercase for case-insensitive search
      const locationString = (report.latitude && report.longitude) ? `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}` : "";
      const searchFields = [
        (report.id?.toString() || "").toLowerCase(),
        locationString.toLowerCase(),
        (report.reportedBy || "").toLowerCase(),
        (report.class_name || "").toLowerCase(),
        (report.status || "").toLowerCase(),
        (report.address || "").toLowerCase(),
        (report.user || "").toLowerCase(),
        (report.username || "").toLowerCase(),
        (report.email || "").toLowerCase(),
        (report.description || "").toLowerCase()
      ];
      
      return searchFields.some(field => field.includes(searchTerm));
    });
    
    console.log(`Filtered by search: ${filtered.length} results`);
  }
  
  // Apply status filter - Case insensitive
  if (state.filters.status && state.filters.status !== "") {
    filtered = filtered.filter(report => 
      (report.status || "").toLowerCase() === state.filters.status.toLowerCase()
    );
    console.log(`Filtered by status: ${filtered.length} results`);
  }
  
  // Apply type filter - Case insensitive
  if (state.filters.type && state.filters.type !== "") {
    filtered = filtered.filter(report => 
      (report.class_name || "").toLowerCase() === state.filters.type.toLowerCase()
    );
    console.log(`Filtered by type: ${filtered.length} results`);
  }
  
  // Apply "my reports" filter - Case insensitive matching
  if (state.filters.my_reports) {
    const currentUser = getCurrentUser();
    if (currentUser) {
      console.log("Filtering by current user:", currentUser);
      filtered = filtered.filter(report => {
        // Check multiple fields for user identification - all case insensitive
        const reportUsers = [
          (report.reportedBy || "").toLowerCase(),
          (report.user || "").toLowerCase(),
          (report.username || "").toLowerCase(),
          (report.email || "").toLowerCase(),
          (report.userId || "").toLowerCase(),
          (report.uid || "").toLowerCase()
        ];
        
        const isMyReport = reportUsers.some(user => user === currentUser);
        if (isMyReport) {
          console.log("Found my report:", report.id, "matched user:", reportUsers.find(u => u === currentUser));
        }
        return isMyReport;
      });
      console.log(`Filtered by my reports for user "${currentUser}": ${filtered.length} results`);
    } else {
      console.warn("My Reports filter enabled but no current user found");
      
      // Show notification to user
      if (window.notify) {
        notify("Please log in to view your reports", "warning");
      }
      
      // Automatically uncheck the "My Reports" filter
      if (elements.myReportsFilter) {
        elements.myReportsFilter.checked = false;
        state.filters.my_reports = false;
      }
      
      // Don't filter - show all reports instead of empty list
      console.log("Showing all reports since user is not logged in");
    }
  }
  
  // Apply sorting
  filtered.sort((a, b) => {
    // Map the sort field 'time' to the new 'timestamp' field
    const sortField = state.sort.field === 'time' ? 'timestamp' : state.sort.field;
    let aVal = a[sortField];
    let bVal = b[sortField];
    
    // Handle different data types
    if (sortField === "timestamp") {
      aVal = new Date(aVal || 0);
      bVal = new Date(bVal || 0);
    } else if (sortField === "id") {
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
  
  // Update map with filtered reports
  updateMapWithFilteredReports();
}

// Update map to show only filtered reports
async function updateMapWithFilteredReports() {
  try {
    console.log(`🗺️ Updating map with ${state.filteredReports.length} filtered reports`);
    
    if (typeof window.plotReports === 'function') {
      await window.plotReports(state.filteredReports);
      console.log('✅ Map updated successfully with filtered reports');
    } else if (typeof plotReports === 'function') {
      await plotReports(state.filteredReports);
      console.log('✅ Map updated successfully with filtered reports');
    } else {
      console.warn('❌ plotReports function not available - map not updated');
    }
    
  } catch (error) {
    console.error('❌ Failed to update map with filtered reports:', error);
  }
}

function getCurrentUser() {
  // Try to get current user from various sources
  try {
    // Check localStorage or sessionStorage for different user formats
    const userSources = [
      'currentUser',
      'user', 
      'authUser',
      'firebaseUser',
      'loggedInUser'
    ];
    
    for (const source of userSources) {
      const localUser = localStorage.getItem(source);
      const sessionUser = sessionStorage.getItem(source);
      
      if (localUser) {
        try {
          const parsed = JSON.parse(localUser);
          const userId = parsed.email || parsed.username || parsed.name || parsed.uid || parsed.id;
          if (userId) {
            console.log("Found current user from localStorage:", userId);
            return userId.toLowerCase(); // Make case insensitive
          }
        } catch (e) {
          // If not JSON, maybe it's just a string
          if (localUser.includes('@') || localUser.length > 2) {
            console.log("Found current user (string) from localStorage:", localUser);
            return localUser.toLowerCase();
          }
        }
      }
      
      if (sessionUser) {
        try {
          const parsed = JSON.parse(sessionUser);
          const userId = parsed.email || parsed.username || parsed.name || parsed.uid || parsed.id;
          if (userId) {
            console.log("Found current user from sessionStorage:", userId);
            return userId.toLowerCase();
          }
        } catch (e) {
          if (sessionUser.includes('@') || sessionUser.length > 2) {
            console.log("Found current user (string) from sessionStorage:", sessionUser);
            return sessionUser.toLowerCase();
          }
        }
      }
    }
    
    // Check if there's a global user variable
    if (window.currentUser) {
      const userId = window.currentUser.email || window.currentUser.username || window.currentUser.name;
      if (userId) {
        console.log("Found current user from window.currentUser:", userId);
        return userId.toLowerCase();
      }
    }
    
    // Check for Firebase user
    if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
      const firebaseUser = window.firebase.auth().currentUser;
      const userId = firebaseUser.email || firebaseUser.displayName || firebaseUser.uid;
      if (userId) {
        console.log("Found current user from Firebase:", userId);
        return userId.toLowerCase();
      }
    }
    
    console.warn("No current user found in any storage location");
    return null;
  } catch (e) {
    console.warn("Error getting current user:", e);
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
    elements.totalReportsCount.textContent = total;
    elements.openHazardsCount.textContent = open;
    elements.resolvedThisMonthCount.textContent = resolved;
    elements.activeUsersCount.textContent = uniqueUsers.size;
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
    let filterText = `Showing ${filtered} of ${total} reports`;
    
    // Add info about active filters
    const activeFilters = [];
    if (state.filters.search) activeFilters.push(`search: "${state.filters.search}"`);
    if (state.filters.status) activeFilters.push(`status: ${state.filters.status}`);
    if (state.filters.type) activeFilters.push(`type: ${state.filters.type}`);
    if (state.filters.my_reports) activeFilters.push('my reports');
    
    if (activeFilters.length > 0) {
      filterText += ` (filtered by: ${activeFilters.join(', ')})`;
    }
    
    indicator.textContent = filterText;
  }
  
  // No geocoding issues since all reports have coordinates
  
  // Add some styling based on filter status
  if (filtered < total) {
    indicator.className = 'text-info';
    indicator.style.fontWeight = '500';
  } else {
    indicator.className = 'text-muted';
    indicator.style.fontWeight = 'normal';
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
  return `<span class="badge ${statusMap[status] || "bg-secondary"} status-badge">${status || "Unknown"}</span>`;
};
const formatType = (type) => {
  if (!type) return "Unknown";
  
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const getTypeClass = (type) => {
  if (!type) return "";
  
  // Normalize the type for consistent class names
  const normalizedType = type.toLowerCase().replace(/[\s_]/g, "_");
  
  // Map all crack variations to 'crack' class
  if (normalizedType.includes('crack')) {
    return 'crack';
  }
  
  return normalizedType;
};

function renderStats() {
  const { total, open, resolved, users } = state.metrics;
  const display = (v) =>
    v === null
      ? '<div class="spinner-border spinner-border-sm text-secondary" role="status"></div>'
      : v === 0
        ? "—"
        : v;
  elements.totalReportsCount.textContent = display(total);
  elements.openHazardsCount.textContent = display(open);
  elements.resolvedThisMonthCount.textContent = display(resolved);
  elements.activeUsersCount.textContent = display(users);
}

function renderTable() {
  if (!elements.tableBody) return;

  console.log(`🎨 Rendering table with ${state.filteredReports.length} reports`);
  const startTime = performance.now();

  elements.tableBody.replaceChildren(); // Clear existing rows

  const reportsToRender = state.filteredReports;

  if (reportsToRender.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 7;
    emptyCell.className = 'text-center';
    emptyCell.textContent = 'No reports found.';
    emptyRow.appendChild(emptyCell);
    elements.tableBody.appendChild(emptyRow);
    renderBulkDeleteButton();
    return;
  }

  reportsToRender.forEach((report) => {
    const row = document.createElement("tr");
    row.dataset.reportId = report.id;
    row.classList.toggle("selected", state.selectedReportIds.has(report.id));

    const locationString = (report.latitude && report.longitude) ? `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}` : "No location";

    row.innerHTML = `
      <td><input type="checkbox" class="report-checkbox" data-report-id="${report.id}" ${state.selectedReportIds.has(report.id) ? "checked" : ""}></td>
      <td>${report.id || "N/A"}</td>
      <td><span class="badge type-badge ${getTypeClass(report.class_name)}">${formatType(report.class_name)}</span></td>
      <td>${getStatusBadge(report.status)}</td>
      <td title="${locationString}">${truncate(locationString)}</td>
      <td>${formatTime(report.timestamp)}</td>
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
  
  const endTime = performance.now();
  console.log(`✅ Table rendered in ${Math.round(endTime - startTime)}ms`);
  
  renderBulkDeleteButton();
}

function renderReportCards() {
  if (!elements.blocksContainer) return;

  console.log(`📱 Rendering mobile cards with ${state.filteredReports.length} reports`);
  const startTime = performance.now();

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
    const locationString = (report.latitude && report.longitude) ? `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}` : "No location";
    card.innerHTML = `
        <div class="card-body">
          <div class="d-flex justify-content-between mb-2">
            <span class="badge type-badge ${getTypeClass(report.class_name)}">${formatType(report.class_name)}</span>
            ${getStatusBadge(report.status)}
          </div>
          <h6 class="card-title mb-1">ID: ${report.id || "N/A"}</h6>
          <p class="card-text mb-2" title="${locationString}">${truncate(locationString)}</p>
          <small class="text-muted">${formatTime(report.timestamp)}</small>
        </div>
        <div class="card-footer d-flex justify-content-end gap-2">
          <button class="btn btn-sm btn-outline-info view-report-btn" title="View Details"><i class="fas fa-eye"></i></button>
          <button class="btn btn-sm btn-outline-warning edit-report-btn" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-outline-danger delete-report-btn" title="Delete"><i class="fas fa-trash"></i></button>
        </div>`;
    elements.blocksContainer.appendChild(card);
  });
  
  const endTime = performance.now();
  console.log(`✅ Mobile cards rendered in ${Math.round(endTime - startTime)}ms`);
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
      
      // Re-apply filters (this will also update the map)
      applyFiltersAndSort();
      
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
    
    console.log(`📍 All reports have coordinates - no geocoding needed`);
    
    // Apply current filters if any
    applyFiltersAndSort();
    
    // Render stats (before map update)
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
  
  // Reduce polling frequency and add error handling
  try {
    const params = new URLSearchParams({ limit: 1, sort: 'time', order: 'desc' });
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (state.lastDataFetch) {
      headers['If-Modified-Since'] = state.lastDataFetch.toUTCString();
    }
    const response = await fetchWithTimeout(`/api/reports?${params.toString()}`, {
      mode: 'cors',
      credentials: 'include',
      headers,
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      // Don't throw error for server issues, just log
      console.warn(`Polling failed with status ${response.status}`);
      return;
    }
    
    if (response.status === 304) {
      return;
    }
    const data = await response.json();
    const latest = Array.isArray(data.reports) ? data.reports[0] : null;
    if (latest) {
      const newest = new Date(latest.time);
      if (!latestReportTime || newest > latestReportTime) {
        await updateDashboard({ silent: true });
      }
    }
    
    // Reset error count on successful poll
    pollErrorCount = 0;
  } catch (err) {
    // Don't spam console with polling errors
    if (err.name !== 'AbortError') {
      pollErrorCount++;
      console.warn(`Polling check failed (${pollErrorCount}/${MAX_POLL_ERRORS}):`, err.message);
      
      // If too many errors, stop polling temporarily
      if (pollErrorCount >= MAX_POLL_ERRORS) {
        console.warn("Too many polling errors, stopping polling for 10 minutes");
        clearInterval(pollTimer);
        setTimeout(() => {
          console.log("Resuming polling after error cooldown");
          pollErrorCount = 0;
          startReportPolling();
        }, 600000); // 10 minutes
      }
    }
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
  
  // Map will be updated by applyFiltersAndSort()
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
          
          // Re-apply filters (this will also update the map)
          applyFiltersAndSort();
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
      
      // Re-apply filters (this will also update the map)
      applyFiltersAndSort();
    })
    .catch((err) => notify(`Error: ${err.message}`, "danger"));
}

// --- MODAL HELPERS ---

function showReportDetails(report) {
  const modal = elements.detailsModal;
  const locationString = (report.latitude && report.longitude) ? `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}` : "No location";
  modal.querySelector("#modal-hazard-id").textContent = report.id;
  modal.querySelector("#modal-type").textContent = report.class_name;
  modal.querySelector("#modal-location").textContent = locationString;
  modal.querySelector("#modal-time").textContent = new Date(
    report.timestamp,
  ).toLocaleString();
  modal.querySelector("#modal-status").textContent = report.status;
  modal.querySelector("#modal-user").textContent =
    report.reportedBy || "Unknown";
  modal.querySelector("#modal-report-image").src = report.image_url || "";
  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();
}

function showEditModal(report) {
  const modal = elements.editModal;
  const locationString = (report.latitude && report.longitude) ? `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}` : "No location";
  modal.querySelector("#edit-report-id").value = report.id;
  modal.querySelector("#edit-report-type").value = report.class_name;
  modal.querySelector("#edit-report-status").value = report.status;
  modal.querySelector("#edit-report-location").value = locationString;
  modal.querySelector("#edit-report-image").value = report.image_url || "";
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
      const spinner = document.createElement('i');
      spinner.className = 'fas fa-spinner fa-spin';
      refreshBtn.replaceChildren(spinner, document.createTextNode(' Refreshing...'));
      refreshBtn.disabled = true;
      
      updateDashboard({ forceRefresh: true }).finally(() => {
        const syncIcon = document.createElement('i');
        syncIcon.className = 'fas fa-sync-alt';
        refreshBtn.replaceChildren(syncIcon, document.createTextNode(' Refresh'));
        refreshBtn.disabled = false;
      });
    });
    console.log("✅ Refresh button event listener added");
  } else {
    console.error("❌ Refresh button not found");
  }

  // Clear filters button
  const clearFiltersBtn = document.getElementById("clear-filters-btn");
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      console.log("Clear filters requested");
      
      // Reset all filter values
      if (elements.searchInput) elements.searchInput.value = "";
      if (elements.statusFilter) elements.statusFilter.value = "";
      if (elements.typeFilter) elements.typeFilter.value = "";
      if (elements.myReportsFilter) elements.myReportsFilter.checked = false;
      
      // Reset state filters
      state.filters = {
        search: "",
        status: "",
        type: "",
        my_reports: false,
      };
      
      // Apply filters (will show all reports and update map)
      applyFiltersAndSort();
      
      notify("All filters cleared", "info");
    });
    console.log("✅ Clear filters button event listener added");
  } else {
    console.error("❌ Clear filters button not found");
  }

  // Clear data cache button
  const clearDataCacheBtn = document.getElementById("clear-data-cache-btn");
  if (clearDataCacheBtn) {
    clearDataCacheBtn.addEventListener("click", () => {
      console.log("🗑️ Clearing all data cache...");
      
      // Clear local state
      state.allReports = [];
      state.filteredReports = [];
      state.lastDataFetch = null;
      
      // Clear selected reports
      state.selectedReportIds.clear();
      
      // Clear geocoding cache
      const geocodingCacheSize = clearGeocodingCache();
      
      // Force refresh from server
      updateDashboard({ forceRefresh: true });
      
      notify(`Data cache cleared (${geocodingCacheSize} geocoding entries) - refreshing from server`, "info");
    });
    console.log("✅ Clear data cache button event listener added");
  } else {
    console.error("❌ Clear data cache button not found");
  }

  // Add geocoding cache stats to console for debugging
  const geocodingStats = getGeocodingCacheStats();
  console.log("🗺️ Geocoding cache stats:", geocodingStats);
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
  const barsIcon = document.createElement('i');
  barsIcon.className = 'fas fa-bars';
  toggle.appendChild(barsIcon);
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
    initControls({ toggleHeatmap, centerMap, plotReports: window.plotReports });
    initializeEventListeners();
    setupMobileDrawer();

    await updateDashboard();
    startReportPolling();
    notify("Dashboard loaded - optimized for speed!", "success");
  } catch (err) {
    console.error("Dashboard initialization failed:", err);
    notify("Failed to load dashboard", "danger");
  }
}

document.addEventListener("DOMContentLoaded", init);
