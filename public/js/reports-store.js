/**
 * IndexedDB Reports Store
 * Manages offline storage and synchronization of auto-generated reports
 * Provides efficient querying and caching for live detection reports
 */

// Database configuration
const DB_NAME = 'HazardReportsDB';
const DB_VERSION = 1;
const STORE_NAME = 'reports';
const INDEX_NAMES = {
  timestamp: 'timestamp-index',
  source: 'source-index',
  engine: 'engine-index',
  hazardType: 'hazard-type-index',
  location: 'location-index',
  sessionId: 'session-id-index'
};

// Report schema definition
export const REPORT_SCHEMA = {
  // Primary key (auto-generated)
  id: 'string', // UUID v4
  
  // Core data
  timestamp: 'number', // Date.now()
  mediaRef: 'object', // { url, thumbnail, blob }
  detections: 'array', // Array of detection objects
  
  // Source tracking
  source: 'string', // 'live' | 'manual' | 'batch'
  engine: 'string', // 'local-onnx' | 'api-server'
  
  // Metadata
  metadata: 'object', // { confidence, location, sessionId, etc. }
  
  // Sync status
  synced: 'boolean', // Whether uploaded to server
  syncAttempts: 'number', // Number of sync attempts
  lastSyncAttempt: 'number' // Timestamp of last sync attempt
};

// Global database instance
let dbInstance = null;
let dbInitPromise = null;

/**
 * Initialize IndexedDB database with proper schema
 * @returns {Promise<IDBDatabase>} Database instance
 */
async function initializeDatabase() {
  if (dbInstance) {
    return dbInstance;
  }
  
  if (dbInitPromise) {
    return dbInitPromise;
  }
  
  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(new Error(`IndexedDB error: ${request.error}`));
    };
    
    request.onsuccess = () => {
      dbInstance = request.result;
      
      // Handle database closure/version change
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
        dbInitPromise = null;
        console.warn('IndexedDB version changed, reinitializing...');
      };
      
      console.log('✅ IndexedDB reports store initialized');
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Delete existing store if present (for clean upgrades)
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      
      // Create main reports store
      const reportsStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      
      // Create indexes for efficient querying
      reportsStore.createIndex(INDEX_NAMES.timestamp, 'timestamp', { unique: false });
      reportsStore.createIndex(INDEX_NAMES.source, 'source', { unique: false });
      reportsStore.createIndex(INDEX_NAMES.engine, 'engine', { unique: false });
      reportsStore.createIndex(INDEX_NAMES.hazardType, 'metadata.hazardType', { unique: false });
      reportsStore.createIndex(INDEX_NAMES.location, ['metadata.location.latitude', 'metadata.location.longitude'], { unique: false });
      reportsStore.createIndex(INDEX_NAMES.sessionId, 'metadata.sessionId', { unique: false });
      
      console.log('📊 IndexedDB schema created with indexes');
    };
  });
  
  return dbInitPromise;
}

/**
 * Generate UUID v4 for report IDs
 * @returns {string} UUID v4 string
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Store a report in IndexedDB
 * @param {Object} reportData - Report data to store
 * @returns {Promise<string>} Report ID
 */
export async function storeReport(reportData) {
  const db = await initializeDatabase();
  
  const report = {
    id: generateUUID(),
    timestamp: Date.now(),
    mediaRef: reportData.mediaRef || null,
    detections: reportData.detections || [],
    source: reportData.source || 'live',
    engine: reportData.engine || 'local-onnx',
    metadata: {
      sessionId: reportData.metadata?.sessionId || null,
      location: reportData.metadata?.location || null,
      hazardType: reportData.metadata?.hazardType || 'unknown',
      confidence: reportData.metadata?.confidence || 0,
      frameTimestamp: reportData.metadata?.frameTimestamp || Date.now(),
      ...reportData.metadata
    },
    synced: false,
    syncAttempts: 0,
    lastSyncAttempt: null
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.add(report);
    
    request.onsuccess = () => {
      console.log(`📝 Report stored: ${report.id} (${report.source})`);
      resolve(report.id);
    };
    
    request.onerror = () => {
      console.error('Failed to store report:', request.error);
      reject(new Error(`Store error: ${request.error}`));
    };
    
    transaction.onerror = () => {
      console.error('Transaction failed:', transaction.error);
      reject(new Error(`Transaction error: ${transaction.error}`));
    };
  });
}

/**
 * Get reports with filtering and pagination
 * @param {Object} options - Query options
 * @param {string} options.source - Filter by source ('live', 'manual', etc.)
 * @param {string} options.engine - Filter by engine
 * @param {string} options.sessionId - Filter by session ID
 * @param {number} options.since - Timestamp to filter from
 * @param {number} options.limit - Maximum number of results
 * @param {boolean} options.unsyncedOnly - Only return unsynced reports
 * @returns {Promise<Array>} Array of reports
 */
export async function getReports(options = {}) {
  const db = await initializeDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    let request;
    
    if (options.source) {
      const index = store.index(INDEX_NAMES.source);
      request = index.getAll(options.source);
    } else if (options.sessionId) {
      const index = store.index(INDEX_NAMES.sessionId);
      request = index.getAll(options.sessionId);
    } else {
      request = store.getAll();
    }
    
    request.onsuccess = () => {
      let reports = request.result;
      
      // Apply additional filters
      if (options.engine) {
        reports = reports.filter(r => r.engine === options.engine);
      }
      
      if (options.since) {
        reports = reports.filter(r => r.timestamp >= options.since);
      }
      
      if (options.unsyncedOnly) {
        reports = reports.filter(r => !r.synced);
      }
      
      // Sort by timestamp (newest first)
      reports.sort((a, b) => b.timestamp - a.timestamp);
      
      // Apply limit
      if (options.limit) {
        reports = reports.slice(0, options.limit);
      }
      
      resolve(reports);
    };
    
    request.onerror = () => {
      console.error('Failed to get reports:', request.error);
      reject(new Error(`Get error: ${request.error}`));
    };
  });
}

/**
 * Get a single report by ID
 * @param {string} reportId - Report ID
 * @returns {Promise<Object|null>} Report or null if not found
 */
export async function getReport(reportId) {
  const db = await initializeDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.get(reportId);
    
    request.onsuccess = () => {
      resolve(request.result || null);
    };
    
    request.onerror = () => {
      console.error('Failed to get report:', request.error);
      reject(new Error(`Get error: ${request.error}`));
    };
  });
}

/**
 * Update report sync status
 * @param {string} reportId - Report ID
 * @param {boolean} synced - Whether successfully synced
 * @param {string} serverUrl - Server URL if synced
 * @returns {Promise<void>}
 */
export async function updateSyncStatus(reportId, synced, serverUrl = null) {
  const db = await initializeDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const getRequest = store.get(reportId);
    
    getRequest.onsuccess = () => {
      const report = getRequest.result;
      if (!report) {
        reject(new Error(`Report ${reportId} not found`));
        return;
      }
      
      report.synced = synced;
      report.syncAttempts += 1;
      report.lastSyncAttempt = Date.now();
      
      if (synced && serverUrl) {
        report.metadata.serverUrl = serverUrl;
      }
      
      const putRequest = store.put(report);
      
      putRequest.onsuccess = () => {
        console.log(`🔄 Report ${reportId} sync status updated: ${synced}`);
        resolve();
      };
      
      putRequest.onerror = () => {
        reject(new Error(`Update error: ${putRequest.error}`));
      };
    };
    
    getRequest.onerror = () => {
      reject(new Error(`Get error: ${getRequest.error}`));
    };
  });
}

/**
 * Delete old reports to manage storage
 * @param {number} maxAge - Maximum age in milliseconds
 * @param {boolean} syncedOnly - Only delete synced reports
 * @returns {Promise<number>} Number of deleted reports
 */
export async function cleanupOldReports(maxAge = 7 * 24 * 60 * 60 * 1000, syncedOnly = true) {
  const db = await initializeDatabase();
  const cutoffTime = Date.now() - maxAge;
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(INDEX_NAMES.timestamp);
    
    const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
    let deletedCount = 0;
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const report = cursor.value;
        
        if (!syncedOnly || report.synced) {
          cursor.delete();
          deletedCount++;
        }
        
        cursor.continue();
      } else {
        console.log(`🗑️ Cleaned up ${deletedCount} old reports`);
        resolve(deletedCount);
      }
    };
    
    request.onerror = () => {
      console.error('Failed to cleanup reports:', request.error);
      reject(new Error(`Cleanup error: ${request.error}`));
    };
  });
}

/**
 * Get storage statistics
 * @returns {Promise<Object>} Storage statistics
 */
export async function getStorageStats() {
  const db = await initializeDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const countRequest = store.count();
    const getAllRequest = store.getAll();
    
    Promise.all([
      new Promise((res, rej) => {
        countRequest.onsuccess = () => res(countRequest.result);
        countRequest.onerror = () => rej(countRequest.error);
      }),
      new Promise((res, rej) => {
        getAllRequest.onsuccess = () => res(getAllRequest.result);
        getAllRequest.onerror = () => rej(getAllRequest.error);
      })
    ]).then(([totalCount, allReports]) => {
      const syncedCount = allReports.filter(r => r.synced).length;
      const unsyncedCount = totalCount - syncedCount;
      const sourceBreakdown = {};
      const engineBreakdown = {};
      
      allReports.forEach(report => {
        sourceBreakdown[report.source] = (sourceBreakdown[report.source] || 0) + 1;
        engineBreakdown[report.engine] = (engineBreakdown[report.engine] || 0) + 1;
      });
      
      const oldestReport = allReports.length > 0 
        ? Math.min(...allReports.map(r => r.timestamp))
        : null;
      
      const newestReport = allReports.length > 0
        ? Math.max(...allReports.map(r => r.timestamp))
        : null;
      
      resolve({
        totalReports: totalCount,
        syncedReports: syncedCount,
        unsyncedReports: unsyncedCount,
        sourceBreakdown,
        engineBreakdown,
        oldestReport: oldestReport ? new Date(oldestReport).toISOString() : null,
        newestReport: newestReport ? new Date(newestReport).toISOString() : null,
        estimatedSizeMB: (JSON.stringify(allReports).length / 1024 / 1024).toFixed(2)
      });
    }).catch(reject);
  });
}

/**
 * Search reports with advanced criteria
 * @param {Object} criteria - Search criteria
 * @param {Array} criteria.hazardTypes - Array of hazard types to match
 * @param {Object} criteria.locationRadius - { lat, lon, radiusKm }
 * @param {number} criteria.minConfidence - Minimum confidence threshold
 * @param {string} criteria.textQuery - Text search in metadata
 * @returns {Promise<Array>} Matching reports
 */
export async function searchReports(criteria) {
  const reports = await getReports();
  
  return reports.filter(report => {
    // Filter by hazard types
    if (criteria.hazardTypes && criteria.hazardTypes.length > 0) {
      const reportHazardTypes = report.detections.map(d => d.class || d.hazardType);
      if (!criteria.hazardTypes.some(ht => reportHazardTypes.includes(ht))) {
        return false;
      }
    }
    
    // Filter by location radius
    if (criteria.locationRadius && report.metadata.location) {
      const distance = calculateHaversineDistance(
        criteria.locationRadius.lat,
        criteria.locationRadius.lon,
        report.metadata.location.latitude,
        report.metadata.location.longitude
      );
      if (distance > criteria.locationRadius.radiusKm) {
        return false;
      }
    }
    
    // Filter by minimum confidence
    if (criteria.minConfidence) {
      const maxConfidence = Math.max(...report.detections.map(d => d.score || d.confidence || 0));
      if (maxConfidence < criteria.minConfidence) {
        return false;
      }
    }
    
    // Text search in metadata
    if (criteria.textQuery) {
      const searchText = JSON.stringify(report.metadata).toLowerCase();
      if (!searchText.includes(criteria.textQuery.toLowerCase())) {
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Calculate Haversine distance between two coordinates
 * @param {number} lat1 - First latitude
 * @param {number} lon1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lon2 - Second longitude
 * @returns {number} Distance in kilometers
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Export reports data for backup or analysis
 * @param {Object} options - Export options
 * @param {string} options.format - Export format ('json' | 'csv')
 * @param {boolean} options.includeBlobs - Whether to include image blobs
 * @returns {Promise<string|Blob>} Exported data
 */
export async function exportReports(options = { format: 'json', includeBlobs: false }) {
  const reports = await getReports();
  
  if (options.format === 'json') {
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      totalReports: reports.length,
      reports: options.includeBlobs ? reports : reports.map(r => ({
        ...r,
        mediaRef: r.mediaRef ? { ...r.mediaRef, blob: null } : null
      }))
    };
    
    return JSON.stringify(exportData, null, 2);
  }
  
  if (options.format === 'csv') {
    const csvHeaders = [
      'id', 'timestamp', 'source', 'engine', 'hazardType', 
      'confidence', 'latitude', 'longitude', 'sessionId', 'synced'
    ];
    
    const csvRows = reports.map(report => [
      report.id,
      new Date(report.timestamp).toISOString(),
      report.source,
      report.engine,
      report.metadata.hazardType || '',
      report.metadata.confidence || 0,
      report.metadata.location?.latitude || '',
      report.metadata.location?.longitude || '',
      report.metadata.sessionId || '',
      report.synced
    ]);
    
    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
    
    return csvContent;
  }
  
  throw new Error(`Unsupported export format: ${options.format}`);
}

/**
 * Initialize the reports store (call this on app startup)
 * @returns {Promise<void>}
 */
export async function initReportsStore() {
  try {
    await initializeDatabase();
    
    // Cleanup old reports on startup
    await cleanupOldReports();
    
    // Log storage stats
    const stats = await getStorageStats();
    console.log('📊 Reports store statistics:', stats);
    
  } catch (error) {
    console.error('❌ Failed to initialize reports store:', error);
    throw error;
  }
}

// Auto-initialize when module loads
if (typeof window !== 'undefined' && window.indexedDB) {
  // Delay initialization to avoid blocking the main thread
  setTimeout(() => initReportsStore().catch(console.error), 1000);
}