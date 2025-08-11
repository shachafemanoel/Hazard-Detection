/**
 * EXIF Service
 * High-level interface for EXIF data extraction and geo-tagged reporting
 * Uses Web Worker for performance and integrates with auto-reporting system
 */

import { uploadDetection } from './apiClient.js';

class ExifService {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
    this.pendingRequests = new Map();
    this.requestId = 0;
    this.stats = {
      filesProcessed: 0,
      geoTaggedReportsCreated: 0,
      errors: 0
    };
  }

  /**
   * Initialize the EXIF service
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      // Create worker
      this.worker = new Worker('./exifWorker.js');
      
      // Set up message handling
      this.worker.onmessage = (e) => {
        this.handleWorkerMessage(e);
      };

      this.worker.onerror = (error) => {
        console.error('EXIF Worker error:', error);
        this.stats.errors++;
      };

      // Wait for worker to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('EXIF worker initialization timeout'));
        }, 5000);

        const onWorkerReady = (e) => {
          if (e.data.type === 'worker_ready') {
            clearTimeout(timeout);
            this.worker.removeEventListener('message', onWorkerReady);
            resolve();
          }
        };

        this.worker.addEventListener('message', onWorkerReady);
      });

      this.isInitialized = true;
      console.log('📷 EXIF Service initialized successfully');
      return true;

    } catch (error) {
      console.error('Failed to initialize EXIF service:', error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Handle messages from EXIF worker
   * @param {MessageEvent} e - Worker message event
   */
  handleWorkerMessage(e) {
    const { type, id, payload } = e.data;
    
    if (this.pendingRequests.has(id)) {
      const { resolve, reject } = this.pendingRequests.get(id);
      this.pendingRequests.delete(id);

      switch (type) {
        case 'exif_extracted':
          resolve(payload);
          break;
        case 'stats_response':
          resolve(payload);
          break;
        case 'cache_cleared':
          resolve(payload);
          break;
        case 'error':
          reject(new Error(payload.error));
          break;
        default:
          console.warn('Unknown worker message type:', type);
      }
    }
  }

  /**
   * Extract EXIF data from image file
   * @param {File} file - Image file to process
   * @returns {Promise<Object>} EXIF data and geo-report if applicable
   */
  async extractExifData(file) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      
      this.pendingRequests.set(id, { resolve, reject });

      // Send file to worker for processing
      this.worker.postMessage({
        type: 'extract_exif',
        id: id,
        payload: { file: file }
      });

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('EXIF extraction timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Process image file and create geo-tagged report if GPS data is available
   * @param {File} file - Image file to process
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async processImageFile(file, options = {}) {
    const { 
      autoCreateReport = true, 
      requireGPS = false,
      uploadImmediately = true 
    } = options;

    try {
      // Extract EXIF data
      const result = await this.extractExifData(file);
      const { exifData, geoReport, stats } = result;
      
      this.stats.filesProcessed++;

      // If no GPS data and GPS is required, return early
      if (requireGPS && !exifData.hasGPS) {
        return {
          success: true,
          hasGPS: false,
          exifData: exifData,
          message: 'No GPS data found in image EXIF'
        };
      }

      // Create geo-tagged report if GPS data is available
      if (autoCreateReport && geoReport) {
        try {
          if (uploadImmediately) {
            const uploadResult = await uploadDetection(geoReport);
            this.stats.geoTaggedReportsCreated++;
            
            return {
              success: true,
              hasGPS: true,
              exifData: exifData,
              geoReport: geoReport,
              uploadResult: uploadResult,
              message: `Geo-tagged report created successfully (ID: ${uploadResult.id || 'unknown'})`
            };
          } else {
            return {
              success: true,
              hasGPS: true,
              exifData: exifData,
              geoReport: geoReport,
              message: 'Geo-tagged report prepared but not uploaded'
            };
          }
        } catch (uploadError) {
          console.error('Failed to upload geo-tagged report:', uploadError);
          this.stats.errors++;
          
          return {
            success: false,
            hasGPS: true,
            exifData: exifData,
            geoReport: geoReport,
            error: uploadError,
            message: 'EXIF data extracted but report upload failed'
          };
        }
      }

      // Return EXIF data without creating report
      return {
        success: true,
        hasGPS: exifData.hasGPS,
        exifData: exifData,
        message: exifData.hasGPS 
          ? 'EXIF data extracted with GPS coordinates'
          : 'EXIF data extracted without GPS coordinates'
      };

    } catch (error) {
      console.error('EXIF processing failed:', error);
      this.stats.errors++;
      
      return {
        success: false,
        hasGPS: false,
        error: error,
        message: `EXIF processing failed: ${error.message}`
      };
    }
  }

  /**
   * Check if image file has GPS data without full processing
   * @param {File} file - Image file to check
   * @returns {Promise<boolean>} True if GPS data is present
   */
  async hasGPSData(file) {
    try {
      const result = await this.extractExifData(file);
      return result.exifData.hasGPS;
    } catch (error) {
      console.warn('Failed to check GPS data:', error);
      return false;
    }
  }

  /**
   * Get service statistics
   * @returns {Promise<Object>} Service and worker statistics
   */
  async getStats() {
    const workerStats = await new Promise((resolve, reject) => {
      const id = ++this.requestId;
      
      this.pendingRequests.set(id, { resolve, reject });

      this.worker.postMessage({
        type: 'get_stats',
        id: id
      });

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Stats request timeout'));
        }
      }, 5000);
    });

    return {
      service: this.stats,
      worker: workerStats.stats,
      cache: {
        size: workerStats.cacheSize
      }
    };
  }

  /**
   * Clear worker cache
   * @returns {Promise<void>}
   */
  async clearCache() {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      
      this.pendingRequests.set(id, { resolve, reject });

      this.worker.postMessage({
        type: 'clear_cache',
        id: id
      });

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Cache clear timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Terminate the service and cleanup resources
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    this.pendingRequests.clear();
    this.isInitialized = false;
    
    console.log('📷 EXIF Service terminated');
  }
}

// Singleton instance
let exifServiceInstance = null;

/**
 * Get singleton EXIF service instance
 * @returns {ExifService} EXIF service instance
 */
export function getExifService() {
  if (!exifServiceInstance) {
    exifServiceInstance = new ExifService();
  }
  return exifServiceInstance;
}

/**
 * Convenience function to process image file with EXIF
 * @param {File} file - Image file to process
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
export async function processImageWithExif(file, options = {}) {
  const service = getExifService();
  return await service.processImageFile(file, options);
}

/**
 * Convenience function to check if file has GPS data
 * @param {File} file - Image file to check
 * @returns {Promise<boolean>} True if GPS data is present
 */
export async function hasGPSData(file) {
  const service = getExifService();
  return await service.hasGPSData(file);
}

/**
 * Get EXIF service statistics
 * @returns {Promise<Object>} Service statistics
 */
export async function getExifStats() {
  const service = getExifService();
  return await service.getStats();
}

export default ExifService;