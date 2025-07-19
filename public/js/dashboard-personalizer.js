// Personal Dashboard Customization Module
class DashboardPersonalizer {
  constructor() {
    this.settings = this.loadSettings();
    this.init();
  }

  init() {
    this.createPersonalizationPanel();
    this.applySettings();
    this.bindEvents();
  }

  loadSettings() {
    const defaultSettings = {
      theme: "dark",
      chartType: "bar",
      showAnimations: true,
      autoRefresh: true,
      refreshInterval: 30000,
      favoriteLocations: [],
      dashboardLayout: "default",
      notificationPreferences: {
        newReports: true,
        statusUpdates: true,
        summary: true,
      },
    };

    const saved = localStorage.getItem("dashboard-settings");
    return saved
      ? { ...defaultSettings, ...JSON.parse(saved) }
      : defaultSettings;
  }

  saveSettings() {
    localStorage.setItem("dashboard-settings", JSON.stringify(this.settings));
  }

  createPersonalizationPanel() {
    const panelHTML = `
            <div id="personalization-panel" class="dashboard-panel" style="display: none;">
                <h5><i class="fas fa-cog me-2"></i>Personalization Settings</h5>
                
                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="setting-group">
                            <label class="form-label">Theme</label>
                            <select id="theme-select" class="form-select">
                                <option value="dark">Dark Mode</option>
                                <option value="light">Light Mode</option>
                                <option value="auto">Auto (System)</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="col-md-6">
                        <div class="setting-group">
                            <label class="form-label">Chart Type</label>
                            <select id="chart-type-select" class="form-select">
                                <option value="bar">Bar Chart</option>
                                <option value="pie">Pie Chart</option>
                                <option value="line">Line Chart</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="col-md-6">
                        <div class="setting-group">
                            <label class="form-label">Auto Refresh</label>
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="auto-refresh-toggle">
                                <label class="form-check-label" for="auto-refresh-toggle">
                                    Enable auto refresh
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-md-6">
                        <div class="setting-group">
                            <label class="form-label">Refresh Interval (seconds)</label>
                            <input type="number" id="refresh-interval" class="form-control" min="10" max="300" value="30">
                        </div>
                    </div>
                    
                    <div class="col-md-12">
                        <div class="setting-group">
                            <label class="form-label">Favorite Locations</label>
                            <div id="favorite-locations-container">
                                <input type="text" id="new-location" class="form-control mb-2" placeholder="Add a location...">
                                <button type="button" class="btn btn-sm btn-primary" id="add-location-btn">
                                    <i class="fas fa-plus"></i> Add Location
                                </button>
                                <div id="favorite-locations-list" class="mt-2"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-md-12">
                        <div class="setting-group">
                            <label class="form-label">Notifications</label>
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="notify-new-reports">
                                <label class="form-check-label" for="notify-new-reports">
                                    New reports
                                </label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="notify-status-updates">
                                <label class="form-check-label" for="notify-status-updates">
                                    Status updates
                                </label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="notify-summary">
                                <label class="form-check-label" for="notify-summary">
                                    Daily summary
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="mt-3">
                    <button type="button" class="btn btn-primary" id="save-settings-btn">
                        <i class="fas fa-save"></i> Save Settings
                    </button>
                    <button type="button" class="btn btn-secondary" id="reset-settings-btn">
                        <i class="fas fa-undo"></i> Reset to Default
                    </button>
                </div>
            </div>
        `;

    // Add to overview section
    const overviewSection = document.getElementById("overview-section");
    if (overviewSection) {
      overviewSection.insertAdjacentHTML("beforeend", panelHTML);
    }

    // Add personalization toggle button
    const headerButtons = document.querySelector("header .d-flex");
    if (headerButtons) {
      const personalizeBtn = document.createElement("button");
      personalizeBtn.id = "personalize-btn";
      personalizeBtn.className = "btn btn-accent ms-2";
      personalizeBtn.innerHTML = '<i class="fas fa-user-cog"></i> Personalize';
      personalizeBtn.addEventListener("click", () =>
        this.togglePersonalizationPanel(),
      );
      headerButtons.appendChild(personalizeBtn);
    }
  }

  bindEvents() {
    // Save settings button
    document
      .getElementById("save-settings-btn")
      ?.addEventListener("click", () => {
        this.collectSettings();
        this.saveSettings();
        this.applySettings();
        this.showToast("Settings saved successfully!", "success");
      });

    // Reset settings button
    document
      .getElementById("reset-settings-btn")
      ?.addEventListener("click", () => {
        if (
          confirm("Are you sure you want to reset all settings to default?")
        ) {
          localStorage.removeItem("dashboard-settings");
          this.settings = this.loadSettings();
          this.applySettings();
          this.populateSettingsForm();
          this.showToast("Settings reset to default", "info");
        }
      });

    // Add location button
    document
      .getElementById("add-location-btn")
      ?.addEventListener("click", () => {
        const input = document.getElementById("new-location");
        const location = input.value.trim();
        if (location && !this.settings.favoriteLocations.includes(location)) {
          this.settings.favoriteLocations.push(location);
          this.updateFavoriteLocationsList();
          input.value = "";
        }
      });

    // Auto refresh toggle
    document
      .getElementById("auto-refresh-toggle")
      ?.addEventListener("change", (e) => {
        this.settings.autoRefresh = e.target.checked;
        this.setupAutoRefresh();
      });
  }

  collectSettings() {
    this.settings.theme =
      document.getElementById("theme-select")?.value || "dark";
    this.settings.chartType =
      document.getElementById("chart-type-select")?.value || "bar";
    this.settings.autoRefresh =
      document.getElementById("auto-refresh-toggle")?.checked || false;
    this.settings.refreshInterval =
      (document.getElementById("refresh-interval")?.value || 30) * 1000;

    this.settings.notificationPreferences.newReports =
      document.getElementById("notify-new-reports")?.checked || false;
    this.settings.notificationPreferences.statusUpdates =
      document.getElementById("notify-status-updates")?.checked || false;
    this.settings.notificationPreferences.summary =
      document.getElementById("notify-summary")?.checked || false;
  }

  populateSettingsForm() {
    const themeSelect = document.getElementById("theme-select");
    const chartSelect = document.getElementById("chart-type-select");
    const autoRefreshToggle = document.getElementById("auto-refresh-toggle");
    const refreshInterval = document.getElementById("refresh-interval");
    const notifyNewReports = document.getElementById("notify-new-reports");
    const notifyStatusUpdates = document.getElementById(
      "notify-status-updates",
    );
    const notifySummary = document.getElementById("notify-summary");

    if (themeSelect) themeSelect.value = this.settings.theme;
    if (chartSelect) chartSelect.value = this.settings.chartType;
    if (autoRefreshToggle)
      autoRefreshToggle.checked = this.settings.autoRefresh;
    if (refreshInterval)
      refreshInterval.value = this.settings.refreshInterval / 1000;
    if (notifyNewReports)
      notifyNewReports.checked =
        this.settings.notificationPreferences.newReports;
    if (notifyStatusUpdates)
      notifyStatusUpdates.checked =
        this.settings.notificationPreferences.statusUpdates;
    if (notifySummary)
      notifySummary.checked = this.settings.notificationPreferences.summary;

    this.updateFavoriteLocationsList();
  }

  updateFavoriteLocationsList() {
    const container = document.getElementById("favorite-locations-list");
    if (!container) return;

    container.innerHTML = "";
    this.settings.favoriteLocations.forEach((location, index) => {
      const locationDiv = document.createElement("div");
      locationDiv.className =
        "favorite-location-item d-flex justify-content-between align-items-center mt-1";
      locationDiv.innerHTML = `
                <span>${location}</span>
                <button class="btn btn-sm btn-outline-danger" onclick="personalizer.removeFavoriteLocation(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            `;
      container.appendChild(locationDiv);
    });
  }

  removeFavoriteLocation(index) {
    this.settings.favoriteLocations.splice(index, 1);
    this.updateFavoriteLocationsList();
  }

  applySettings() {
    this.applyTheme();
    this.setupAutoRefresh();
    this.populateSettingsForm();
  }

  applyTheme() {
    document.documentElement.setAttribute("data-bs-theme", this.settings.theme);
  }

  setupAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    if (this.settings.autoRefresh) {
      this.refreshTimer = setInterval(() => {
        if (typeof loadReports === "function") {
          loadReports();
        }
      }, this.settings.refreshInterval);
    }
  }

  togglePersonalizationPanel() {
    const panel = document.getElementById("personalization-panel");
    if (panel) {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  }

  showToast(message, type = "info") {
    // Simple toast notification
    const toast = document.createElement("div");
    toast.className = `alert alert-${type === "success" ? "success" : type === "error" ? "danger" : "info"} position-fixed`;
    toast.style.cssText =
      "top: 20px; right: 20px; z-index: 9999; min-width: 250px;";
    toast.innerHTML = `
            ${message}
            <button type="button" class="btn-close ms-2" onclick="this.parentElement.remove()"></button>
        `;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 5000);
  }

  // Export settings for backup
  exportSettings() {
    const dataStr = JSON.stringify(this.settings, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

    const exportFileDefaultName = "dashboard-settings.json";
    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  }

  // Import settings from backup
  importSettings(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedSettings = JSON.parse(e.target.result);
        this.settings = { ...this.settings, ...importedSettings };
        this.saveSettings();
        this.applySettings();
        this.showToast("Settings imported successfully!", "success");
      } catch (error) {
        this.showToast("Error importing settings file", "error");
      }
    };
    reader.readAsText(file);
  }
}

// Initialize personalizer when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.personalizer = new DashboardPersonalizer();
});
