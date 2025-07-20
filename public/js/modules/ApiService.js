import { API } from './Constants.js';

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
   * Uploads detection data to server (authenticated) - Optimized
   * @param {FormData} formData - Form data containing detection info
   * @param {Object} options - Upload options
   * @returns {Promise} Upload response
   */
  static async uploadDetection(formData, options = {}) {
    const { 
      retries = 3, 
      timeout = 30000,
      onProgress = null,
      signal = null 
    } = options;

    // Validate required fields
    if (!formData.has('file')) {
      throw new Error('File is required for upload');
    }

    const requestOptions = {
      method: "POST",
      body: formData,
      signal,
    };

    // Add timeout if specified
    if (timeout) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      requestOptions.signal = controller.signal;
    }

    try {
      const response = await this.retry(
        () => this.request(API.UPLOAD_DETECTION, requestOptions),
        retries,
        1000
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Validate response structure
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response format from server');
      }

      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Upload timeout - please try again');
      }
      throw error;
    }
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
   * Loads reports from Redis via server - Optimized with caching and sorting
   * @param {Object} options - Load options
   * @returns {Promise} Reports data with Cloudinary image URLs
   */
  static async loadReports(options = {}) {
    const {
      useCache = true,
      cacheTimeout = 5 * 60 * 1000, // 5 minutes
      sortBy = 'time',
      sortOrder = 'desc',
      limit = null,
      offset = 0,
      filters = {}
    } = options;

    // Build query parameters for server-side filtering and sorting
    const queryParams = new URLSearchParams();
    
    if (sortBy) queryParams.append('sortBy', sortBy);
    if (sortOrder) queryParams.append('sortOrder', sortOrder);
    if (limit) queryParams.append('limit', limit.toString());
    if (offset) queryParams.append('offset', offset.toString());
    
    // Add filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        queryParams.append(key, value);
      }
    });

    const cacheKey = `reports_${queryParams.toString()}`;
    
    // Check cache if enabled
    if (useCache && this.cache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      const now = Date.now();
      if (now - cached.timestamp < cacheTimeout) {
        return this.validateCloudinaryImages(cached.data);
      }
    }

    try {
      const url = queryParams.toString() 
        ? `${API.REPORTS}?${queryParams.toString()}`
        : API.REPORTS;
        
      const response = await this.retry(
        () => this.request(url),
        3,
        1000
      );

      if (!response.ok) {
        throw new Error(`Failed to load reports: ${response.status}`);
      }

      const reports = await response.json();
      
      // Validate response
      if (!Array.isArray(reports)) {
        throw new Error('Invalid reports data format');
      }

      // Validate and ensure Cloudinary image URLs are accessible
      const validatedReports = await this.validateCloudinaryImages(reports);

      // Cache the results
      if (useCache) {
        if (!this.cache) {
          this.cache = new Map();
        }
        this.cache.set(cacheKey, {
          data: validatedReports,
          timestamp: Date.now()
        });

        // Clean old cache entries (keep only last 10)
        if (this.cache.size > 10) {
          const entries = Array.from(this.cache.entries());
          entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
          this.cache.clear();
          entries.slice(0, 10).forEach(([key, value]) => {
            this.cache.set(key, value);
          });
        }
      }

      return validatedReports;
    } catch (error) {
      console.error('Failed to load reports:', error);
      throw error;
    }
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
   * Gets detailed user information including role
   * @returns {Promise} User data with role information
   */
  static async getCurrentUser() {
    const response = await this.request("/api/user");
    return response.json();
  }

  /**
   * Gets all users from Redis (admin only)
   * @returns {Promise} Array of users
   */
  static async getAllUsers() {
    const response = await this.request("/api/users");
    return response.json();
  }

  /**
   * Gets user statistics
   * @returns {Promise} User statistics
   */
  static async getUserStats() {
    const response = await this.request("/api/user-stats");
    return response.json();
  }

  /**
   * Checks authentication status
   * @returns {Promise} Authentication status
   */
  static async checkAuth() {
    const response = await this.request("/api/auth/check");
    return response.json();
  }

  /**
   * Updates report status
   * @param {string} reportId - Report ID
   * @param {string} status - New status
   * @returns {Promise} Update response
   */
  static async updateReportStatus(reportId, status) {
    const response = await this.request(`${API.REPORTS}/${reportId}/status`, {
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
    const response = await this.request(`${API.REPORTS}/${reportId}`);
    return response.json();
  }

  /**
   * Update a report (full edit)
   * @param {string|number} reportId
   * @param {Object} updates
   * @returns {Promise} Update response
   */
  static async updateReport(reportId, updates) {
    const response = await this.request(`${API.REPORTS}/${reportId}`, {
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
    const response = await this.request(`${API.REPORTS}/${reportId}`, {
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
    const response = await this.request(`${API.REPORTS}/bulk`, {
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

  /**
   * Upload anonymous detection (AI camera) - Optimized
   * @param {FormData} formData
   * @param {Object} options - Upload options
   * @returns {Promise} Detection response
   */
  static async uploadAnonymousDetection(formData, options = {}) {
    const { 
      retries = 3, 
      timeout = 30000,
      onProgress = null 
    } = options;

    // Validate required fields
    if (!formData.has('file')) {
      throw new Error('File is required for anonymous detection upload');
    }

    // Ensure anonymous flag is set
    formData.set('anonymous', 'true');

    try {
      return await this.uploadDetection(formData, {
        retries,
        timeout,
        onProgress
      });
    } catch (error) {
      console.error('Anonymous detection upload failed:', error);
      throw error;
    }
  }

  /**
   * Clear API cache
   */
  static clearCache() {
    if (this.cache) {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  static getCacheStats() {
    if (!this.cache) {
      return { size: 0, entries: [] };
    }
    
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * Validate Cloudinary image URLs and ensure they're accessible
   * @param {Array} reports - Array of report objects
   * @returns {Promise<Array>} Reports with validated image URLs
   */
  static async validateCloudinaryImages(reports) {
    if (!Array.isArray(reports)) {
      return reports;
    }

    const validatedReports = await Promise.all(
      reports.map(async (report) => {
        if (report.image) {
          try {
            // Quick HEAD request to validate image accessibility
            const response = await fetch(report.image, { 
              method: 'HEAD',
              timeout: 3000 
            });
            
            if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) {
              console.warn(`Invalid image URL for report ${report.id}: ${report.image}`);
              // Keep the URL but mark it as potentially broken
              report.imageStatus = 'error';
            } else {
              report.imageStatus = 'valid';
            }
          } catch (error) {
            console.warn(`Image validation failed for report ${report.id}:`, error.message);
            report.imageStatus = 'error';
          }
        }
        return report;
      })
    );

    return validatedReports;
  }

  /**
   * Save report data to Redis via server with Cloudinary image URL
   * @param {Object} reportData - Report data including Cloudinary image URL
   * @returns {Promise} Save response
   */
  static async saveReportToRedis(reportData) {
    try {
      const response = await this.request(API.REPORTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...reportData,
          timestamp: new Date().toISOString(),
          source: 'web_client'
        })
      });

      const result = await response.json();
      
      // Clear cache after new report is saved
      this.clearCache();
      
      return result;
    } catch (error) {
      console.error('Failed to save report to Redis:', error);
      throw error;
    }
  }

  /**
   * Update existing report in Redis
   * @param {string|number} reportId - Report ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise} Update response
   */
  static async updateReportInRedis(reportId, updates) {
    try {
      const response = await this.request(`${API.REPORTS}/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updates,
          lastModified: new Date().toISOString()
        })
      });

      const result = await response.json();
      
      // Clear cache after update
      this.clearCache();
      
      return result;
    } catch (error) {
      console.error('Failed to update report in Redis:', error);
      throw error;
    }
  }

  /**
   * Get report from Redis by ID
   * @param {string|number} reportId - Report ID
   * @returns {Promise} Report data
   */
  static async getReportFromRedis(reportId) {
    try {
      const response = await this.request(`${API.REPORTS}/${reportId}`);
      const report = await response.json();
      
      // Validate image if present
      if (report.image) {
        const validatedReports = await this.validateCloudinaryImages([report]);
        return validatedReports[0];
      }
      
      return report;
    } catch (error) {
      console.error('Failed to get report from Redis:', error);
      throw error;
    }
  }

  /**
   * Delete report from Redis
   * @param {string|number} reportId - Report ID
   * @returns {Promise} Delete response
   */
  static async deleteReportFromRedis(reportId) {
    try {
      const response = await this.request(`${API.REPORTS}/${reportId}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      // Clear cache after deletion
      this.clearCache();
      
      return result;
    } catch (error) {
      console.error('Failed to delete report from Redis:', error);
      throw error;
    }
  }
}
