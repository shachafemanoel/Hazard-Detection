// Stub APIs
export async function detectFrame(video){
  // returns dummy detections
  return [{bbox:[50,50,100,100],class:'בור',confidence:0.8}];
}

export async function submitReport(report){
  // simulate network or offline
  if(!navigator.onLine){
    throw new Error('offline');
  }
  await new Promise(r=>setTimeout(r,500));
  return {ok:true,id:Date.now()};
}

export async function loadReports(){
  try {
    const stored = localStorage.getItem('reports') || '[]';
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load reports from localStorage:', error);
    // Return empty array if parsing fails
    return [];
  }
}

export function saveReportLocal(report){
  try {
    const reports = JSON.parse(localStorage.getItem('reports') || '[]');
    reports.push(report);
    localStorage.setItem('reports', JSON.stringify(reports));
    console.log('Report saved to localStorage successfully');
  } catch (error) {
    console.error('Failed to save report to localStorage:', error);
    
    // Try to handle quota exceeded error
    if (error.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, clearing old data...');
      try {
        // Clear some old reports to make space
        const reports = JSON.parse(localStorage.getItem('reports') || '[]');
        const recentReports = reports.slice(-10); // Keep only last 10 reports
        localStorage.setItem('reports', JSON.stringify(recentReports));
        
        // Try to save the new report again
        recentReports.push(report);
        localStorage.setItem('reports', JSON.stringify(recentReports));
        console.log('Report saved after clearing old data');
      } catch (retryError) {
        console.error('Failed to save report even after clearing data:', retryError);
        throw new Error('Unable to save report: storage quota exceeded');
      }
    } else {
      throw error;
    }
  }
}

// Enhanced localStorage utility functions
export function clearOldReports(maxReports = 50) {
  try {
    const reports = JSON.parse(localStorage.getItem('reports') || '[]');
    if (reports.length > maxReports) {
      const recentReports = reports.slice(-maxReports);
      localStorage.setItem('reports', JSON.stringify(recentReports));
      console.log(`Cleaned up localStorage: kept ${maxReports} most recent reports`);
      return reports.length - maxReports; // Return number of deleted reports
    }
    return 0;
  } catch (error) {
    console.error('Failed to clear old reports:', error);
    return 0;
  }
}

export function getStorageInfo() {
  try {
    const reports = JSON.parse(localStorage.getItem('reports') || '[]');
    const reportsSize = new Blob([JSON.stringify(reports)]).size;
    
    // Estimate total localStorage usage
    let totalSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length;
      }
    }
    
    return {
      reportCount: reports.length,
      reportsSize,
      totalStorageSize: totalSize,
      isNearLimit: totalSize > 4 * 1024 * 1024 // 4MB warning threshold
    };
  } catch (error) {
    console.error('Failed to get storage info:', error);
    return {
      reportCount: 0,
      reportsSize: 0,
      totalStorageSize: 0,
      isNearLimit: false
    };
  }
}

export function getSystemStatus(){
  if(!navigator.onLine) return {mode:'offline'};
  // simple stub always cloud
  return {mode:'cloud'};
}

// Import the new model manager
import modelManager from './modelManager.js';

// Legacy compatibility - delegate to new model manager
export async function initializeOnnxRuntime() {
  try {
    return await modelManager.initializeLocalModel();
  } catch (error) {
    console.error('❌ Failed to initialize ONNX Runtime via legacy API:', error);
    throw error;
  }
}

export function getOnnxSession() {
  return modelManager.localSession;
}

export function isOnnxReady() {
  return modelManager.isLocalReady;
}

// New enhanced detection function
export async function detectHazards(input, options = {}) {
  return await modelManager.detectHazards(input, options);
}

// Model manager status
export function getModelStatus() {
  return modelManager.getStatus();
}
