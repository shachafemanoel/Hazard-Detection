/**
 * API service for handling server communication
 */
export class ApiService {
  /**
   * Makes a fetch request with error handling
   * @param {string} url - Request URL
   * @param {Object} options - Fetch options
   * @returns {Promise} Response promise
   */
  static async request(url, options = {}) {
    try {
      const response = await fetch(url, {
        credentials: "include",
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.error(`API request failed: ${url}`, error);
      throw error;
    }
  }

  /**
   * Uploads detection data to server (authenticated)
   * @param {FormData} formData - Form data containing detection info
   * @returns {Promise} Upload response
   */
  static async uploadDetection(formData) {
    const response = await this.request("/api/detections", {
      method: "POST",
      body: formData,
    });

    return response.json();
  }

  /**
   * Handles user login
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise} Login response
   */
  static async login(email, password) {
    const response = await this.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    return response.json();
  }

  /**
   * Handles user registration
   * @param {string} email - User email
   * @param {string} username - Username
   * @param {string} password - User password
   * @returns {Promise} Registration response
   */
  static async register(email, username, password) {
    const response = await this.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    });

    return response.json();
  }

  /**
   * Handles password reset request
   * @param {string} email - User email
   * @returns {Promise} Password reset response
   */
  static async resetPassword(email) {
    const response = await this.request("/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    return response.json();
  }

  /**
   * Handles user logout
   * @returns {Promise} Logout response
   */
  static async logout() {
    const response = await this.request("/logout", {
      method: "GET",
    });

    return response;
  }

  /**
   * Loads reports from server
   * @returns {Promise} Reports data
   */
  static async loadReports() {
    const response = await this.request("/api/reports");
    return response.json();
  }

  /**
   * Loads Google Maps API key
   * @returns {Promise} API key response
   */
  static async loadGoogleMapsApiKey() {
    const response = await this.request("/api/google-maps-key");
    return response.json();
  }

  /**
   * Gets user information
   * @returns {Promise} User data
   */
  static async getUserInfo() {
    const response = await this.request("/api/user");
    return response.json();
  }

  /**
   * Updates report status
   * @param {string} reportId - Report ID
   * @param {string} status - New status
   * @returns {Promise} Update response
   */
  static async updateReportStatus(reportId, status) {
    const response = await this.request(`/api/reports/${reportId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    return response.json();
  }

  /**
   * Get a single report by ID
   * @param {string|number} reportId
   * @returns {Promise} Report data
   */
  static async getReportById(reportId) {
    const response = await this.request(`/api/reports/${reportId}`);
    return response.json();
  }

  /**
   * Update a report (full edit)
   * @param {string|number} reportId
   * @param {Object} updates
   * @returns {Promise} Update response
   */
  static async updateReport(reportId, updates) {
    const response = await this.request(`/api/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    return response.json();
  }

  /**
   * Deletes a report
   * @param {string} reportId - Report ID
   * @returns {Promise} Delete response
   */
  static async deleteReport(reportId) {
    const response = await this.request(`/api/reports/${reportId}`, {
      method: "DELETE",
    });

    return response.json();
  }

  /**
   * Performs bulk action on reports
   * @param {Array} reportIds - Array of report IDs
   * @param {string} action - Action to perform
   * @returns {Promise} Bulk action response
   */
  static async bulkAction(reportIds, action) {
    const response = await this.request("/api/reports/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportIds, action }),
    });

    return response.json();
  }

  /**
   * Retries a failed request
   * @param {Function} requestFn - Request function to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} delay - Delay between retries in ms
   * @returns {Promise} Retry response
   */
  static async retry(requestFn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await requestFn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;

        console.warn(`Request failed, retrying (${i + 1}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }


}
