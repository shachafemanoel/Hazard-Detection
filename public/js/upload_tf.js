// upload_tf_fixed.js
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { storage } from "./firebaseConfig.js";

document.addEventListener("DOMContentLoaded", () => {
  // UI Elements
  const startBtn = document.getElementById("start-camera");
  const stopBtn = document.getElementById("stop-camera");
  const switchBtn = document.getElementById("switch-camera");
  const video = document.getElementById("camera-stream");
  const canvas = document.getElementById("overlay-canvas");
  const ctx = canvas.getContext("2d");
  
  // New Professional UI Elements
  const cameraWrapper = document.querySelector('.camera-wrapper');
  const connectionStatus = document.getElementById('connection-status');
  const statusText = connectionStatus.querySelector('.status-text');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  const loadingProgressBar = document.getElementById('loading-progress-bar');
  const sensitivitySlider = document.getElementById('sensitivity-slider');
  const settingsPanel = document.getElementById('settings-panel');
  const notificationsContainer = document.getElementById('notifications-container');
  const hazardAlertModal = document.getElementById('hazard-alert-modal');
  const alertDescription = document.getElementById('alert-description');
  const alertClose = document.getElementById('alert-close');
  
  // Performance and detection displays
  const fpsDisplay = document.getElementById('fps-display');
  const processingTime = document.getElementById('processing-time');
  const frameCountDisplay = document.getElementById('frame-count');
  const currentDetections = document.getElementById('current-detections');
  const sessionDetections = document.getElementById('session-detections');
  const hazardTypesList = document.getElementById('hazard-types-list');

  // Sound notification setup
  let detectionSound = null;
  try {
    detectionSound = new Audio('mixkit-elevator-tone-2863.wav');
    detectionSound.preload = 'auto';
    detectionSound.volume = 0.7; // Set volume to 70%
  } catch (error) {
    console.warn('Could not load detection sound:', error);
  }

  // Professional UI Management Functions
  function updateConnectionStatus(status, message) {
    if (connectionStatus && statusText) {
      const indicator = connectionStatus.querySelector('.status-indicator');
      statusText.textContent = message || status;
      
      // Remove existing status classes
      connectionStatus.classList.remove('connected', 'disconnected', 'processing');
      indicator.classList.remove('connected', 'disconnected', 'processing');
      
      // Add new status class
      connectionStatus.classList.add(status);
      indicator.classList.add(status);
    }
  }

  function showLoadingOverlay(message = 'Loading...', progress = null) {
    if (loadingOverlay) {
      loadingOverlay.style.display = 'flex';
      if (loadingStatus) loadingStatus.textContent = message;
      if (loadingProgressBar && progress !== null) {
        loadingProgressBar.style.width = `${progress}%`;
      }
    }
  }

  function hideLoadingOverlay() {
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
  }

  function createNotification(message, type = 'info', duration = 5000) {
    if (!notificationsContainer) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <i class="fas ${getNotificationIcon(type)}"></i>
        <span>${message}</span>
      </div>
      <button class="notification-close" onclick="this.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    `;

    notificationsContainer.appendChild(notification);

    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentElement) {
          notification.style.animation = 'slideOut 0.3s ease-in';
          setTimeout(() => notification.remove(), 300);
        }
      }, duration);
    }

    return notification;
  }

  // Sound notification function
  function playDetectionSound() {
    if (detectionSound) {
      try {
        // Reset the audio to beginning in case it was played recently
        detectionSound.currentTime = 0;
        detectionSound.play().catch(err => {
          console.warn('Could not play detection sound:', err);
        });
      } catch (error) {
        console.warn('Error playing detection sound:', error);
      }
    }
  }

  function getNotificationIcon(type) {
    switch (type) {
      case 'success': return 'fa-check-circle';
      case 'warning': return 'fa-exclamation-triangle';
      case 'error': return 'fa-times-circle';
      case 'info': return 'fa-info-circle';
      default: return 'fa-bell';
    }
  }

  function showHazardAlert(hazardType, confidence, location) {
    if (!hazardAlertModal || !alertDescription) return;

    const alertContent = `
      <strong>Hazard Detected: ${hazardType}</strong><br>
      Confidence: ${(confidence * 100).toFixed(1)}%<br>
      ${location ? `Location: ${location}` : 'Location: Unknown'}
    `;

    alertDescription.innerHTML = alertContent;
    hazardAlertModal.style.display = 'flex';

    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (hazardAlertModal.style.display === 'flex') {
        hazardAlertModal.style.display = 'none';
      }
    }, 10000);
  }

  function updatePerformanceDisplays() {
    if (fpsDisplay) fpsDisplay.textContent = currentFps;
    if (frameCountDisplay) frameCountDisplay.textContent = frameCount.toLocaleString();
    if (currentDetections) currentDetections.textContent = detectedObjectCount;
    if (sessionDetections) sessionDetections.textContent = sessionStats.totalDetections || sessionDetectionCount;
    if (processingTime && frameTimes.length > 0) {
      const avgTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const modeIndicator = inferenceMode === 'backend' ? '🌐' : '💻';
      processingTime.textContent = `${avgTime.toFixed(1)}ms ${modeIndicator}`;
    }
    if (hazardTypesList && uniqueHazardTypes.length > 0) {
      hazardTypesList.innerHTML = uniqueHazardTypes.map(type => 
        `<span class="hazard-type-tag">${type}</span>`
      ).join('');
    }
    
    // Update detection info badges
    const detectionCountBadge = document.getElementById('detection-count-badge');
    const fpsBadge = document.getElementById('fps-badge');
    if (detectionCountBadge) {
      const count = persistentDetections.length || detectedObjectCount;
      detectionCountBadge.textContent = `${count} hazard${count !== 1 ? 's' : ''}`;
    }
    if (fpsBadge) {
      fpsBadge.textContent = `${currentFps} FPS`;
    }
    
    // Update connection status with inference mode details
    if (detecting) {
      const sessionInfo = currentSessionId ? ` | Session: ${currentSessionId.substring(0, 8)}...` : '';
      const modeText = inferenceMode === 'backend' ? 
        `Backend Inference Active${sessionInfo}` : 
        'Local Inference Active (Offline Mode)';
      updateConnectionStatus('connected', modeText);
    }
  }
  
  function updateSessionUI() {
    // Update session-related UI elements
    const sessionStatsEl = document.getElementById('session-stats');
    if (sessionStatsEl && sessionStats) {
      sessionStatsEl.innerHTML = `
        <div class="stat-item">Unique Hazards: ${sessionStats.uniqueHazards || 0}</div>
        <div class="stat-item">Pending Reports: ${sessionStats.pendingReports || 0}</div>
      `;
    }
  }
  
  function showNewReportsNotification(newReports) {
    if (newReports.length === 0) return;
    
    const hazardTypes = newReports.map(r => r.detection.class_name).join(', ');
    const message = `New hazard${newReports.length > 1 ? 's' : ''} detected: ${hazardTypes}`;
    createNotification(message, 'warning', 5000);
    
    // Update UI to show pending reports
    updateSessionUI();
  }
  
  function showSessionSummary(summary) {
    if (!summary || !summary.reports) return;
    
    const reportsHtml = summary.reports.map(report => {
      const hasImage = report.frame_info && report.frame_info.has_image;
      const imageHtml = hasImage ? 
        `<div class="report-image">
          <img src="data:image/jpeg;base64,${report.image_data}" 
               alt="Detection frame" 
               class="detection-frame"
               onclick="showFullImage('${report.report_id}', '${report.image_data}')" />
          <div class="image-overlay">
            <span class="image-size">${(report.frame_info.image_size / 1024).toFixed(1)}KB</span>
          </div>
        </div>` : 
        '<div class="no-image">No frame captured</div>';
      
      return `
        <div class="report-item ${report.status}" data-report-id="${report.report_id}">
          <div class="report-content">
            <div class="report-header">
              <span class="hazard-type">${report.detection.class_name}</span>
              <span class="confidence">${(report.detection.confidence * 100).toFixed(1)}%</span>
              <span class="status">${report.status}</span>
            </div>
            <div class="report-details">
              <p><strong>Location:</strong> (${Math.round(report.location.center[0])}, ${Math.round(report.location.center[1])})</p>
              <p><strong>Size:</strong> ${Math.round(report.detection.width)}×${Math.round(report.detection.height)} px</p>
              <p><strong>Time:</strong> ${new Date(report.timestamp).toLocaleTimeString()}</p>
            </div>
            <div class="report-actions">
              <button onclick="confirmReport('${report.report_id}')" ${report.status === 'confirmed' ? 'disabled' : ''}>
                ✓ Confirm
              </button>
              <button onclick="dismissReport('${report.report_id}')" ${report.status === 'dismissed' ? 'disabled' : ''}>
                ✗ Dismiss
              </button>
            </div>
          </div>
          ${imageHtml}
        </div>
      `;
    }).join('');
    
    const modalHtml = `
      <div id="session-summary-modal" class="modal" style="display: flex;">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Detection Session Summary</h2>
            <button onclick="closeSessionSummary()" class="close-btn">×</button>
          </div>
          <div class="modal-body">
            <div class="session-overview">
              <p><strong>Total Detections:</strong> ${summary.detection_count}</p>
              <p><strong>Unique Hazards:</strong> ${summary.unique_hazards}</p>
              <p><strong>Reports Generated:</strong> ${summary.reports.length}</p>
              <p><strong>With Frames:</strong> ${summary.reports.filter(r => r.frame_info?.has_image).length}</p>
            </div>
            <div class="reports-list">
              <h3>Review Detection Reports</h3>
              ${reportsHtml || '<p>No reports generated</p>'}
            </div>
            <div class="modal-actions">
              <button onclick="submitConfirmedReports()" class="primary-btn">Submit Confirmed Reports</button>
              <button onclick="closeSessionSummary()" class="secondary-btn">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('session-summary-modal');
    if (existingModal) existingModal.remove();
    
    // Add new modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }
  
  // Function to show full-size image
  function showFullImage(reportId, imageData) {
    const fullImageModal = `
      <div id="full-image-modal" class="modal" style="display: flex; z-index: 20000;">
        <div class="modal-content" style="max-width: 90vw; max-height: 90vh;">
          <div class="modal-header">
            <h3>Detection Frame - Report ${reportId.substring(0, 8)}</h3>
            <button onclick="closeFullImage()" class="close-btn">×</button>
          </div>
          <div class="modal-body" style="text-align: center; padding: 20px;">
            <img src="data:image/jpeg;base64,${imageData}" 
                 alt="Full detection frame" 
                 style="max-width: 100%; max-height: 70vh; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);" />
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', fullImageModal);
  }
  
  function closeFullImage() {
    const modal = document.getElementById('full-image-modal');
    if (modal) modal.remove();
  }

  // Close modal handlers
  if (alertClose) {
    alertClose.addEventListener('click', () => {
      if (hazardAlertModal) hazardAlertModal.style.display = 'none';
    });
  }

  // Click outside modal to close
  if (hazardAlertModal) {
    hazardAlertModal.addEventListener('click', (e) => {
      if (e.target === hazardAlertModal) {
        hazardAlertModal.style.display = 'none';
      }
    });
  }

  // Report management functions
  async function confirmReport(reportId) {
    if (!currentSessionId) return;
    
    try {
      const response = await fetch(`${backendUrl}/session/${currentSessionId}/report/${reportId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        createNotification('Report confirmed for submission', 'success', 3000);
        // Update UI
        const reportEl = document.querySelector(`[data-report-id="${reportId}"]`);
        if (reportEl) {
          reportEl.classList.add('confirmed');
          reportEl.querySelector('.status').textContent = 'confirmed';
        }
      }
    } catch (error) {
      console.warn('Failed to confirm report:', error);
      createNotification('Failed to confirm report', 'error', 3000);
    }
  }
  
  async function dismissReport(reportId) {
    if (!currentSessionId) return;
    
    try {
      const response = await fetch(`${backendUrl}/session/${currentSessionId}/report/${reportId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        createNotification('Report dismissed', 'info', 3000);
        // Update UI
        const reportEl = document.querySelector(`[data-report-id="${reportId}"]`);
        if (reportEl) {
          reportEl.classList.add('dismissed');
          reportEl.querySelector('.status').textContent = 'dismissed';
        }
      }
    } catch (error) {
      console.warn('Failed to dismiss report:', error);
      createNotification('Failed to dismiss report', 'error', 3000);
    }
  }
  
  function closeSessionSummary() {
    const modal = document.getElementById('session-summary-modal');
    if (modal) modal.remove();
  }
  
  function submitConfirmedReports() {
    createNotification('Confirmed reports will be submitted to the main system', 'success', 4000);
    closeSessionSummary();
  }
  
  // Manual inference mode toggle (for testing and debugging)
  function toggleInferenceMode() {
    if (inferenceMode === 'backend') {
      inferenceMode = 'frontend';
      backendAvailable = false;
      // End current session when switching to frontend
      if (currentSessionId) {
        endDetectionSession();
      }
      updateConnectionStatus('connected', 'Switched to Frontend Inference');
      createNotification('Switched to local inference mode', 'info', 3000);
    } else {
      // Try to switch back to backend
      checkBackendHealth().then(success => {
        if (success) {
          createNotification('Switched to backend inference mode', 'success', 3000);
          // Start new session when switching to backend
          startDetectionSession();
        } else {
          createNotification('Backend not available - staying in local mode', 'warning', 3000);
        }
      });
    }
  }
  
  // Make functions globally available for HTML onclick handlers
  window.confirmReport = confirmReport;
  window.dismissReport = dismissReport;
  window.closeSessionSummary = closeSessionSummary;
  window.submitConfirmedReports = submitConfirmedReports;
  window.showFullImage = showFullImage;
  window.closeFullImage = closeFullImage;

  // Enhanced debugging and testing functions
  
  // Comprehensive system diagnostics
  async function runSystemDiagnostics() {
    console.log('🔧 Running system diagnostics...');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        hardwareConcurrency: navigator.hardwareConcurrency
      },
      webgl: {
        supported: !!window.WebGLRenderingContext,
        version: null
      },
      onnx: {
        loaded: !!window.ort,
        version: window.ort?.version || 'unknown'
      },
      backend: {
        url: backendUrl,
        available: backendAvailable,
        lastCheck: lastBackendCheck,
        mode: inferenceMode
      },
      frontend: {
        sessionLoaded: !!session,
        modelPath: './object_detecion_model/model_18_7.onnx'
      },
      performance: {
        currentFps: currentFps,
        frameCount: frameCount,
        avgProcessingTime: frameTimes.length > 0 ? 
          (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length).toFixed(2) + 'ms' : 'N/A'
      }
    };
    
    // Test WebGL
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        diagnostics.webgl.version = gl.getParameter(gl.VERSION);
        diagnostics.webgl.vendor = gl.getParameter(gl.VENDOR);
        diagnostics.webgl.renderer = gl.getParameter(gl.RENDERER);
      }
    } catch (webglError) {
      diagnostics.webgl.error = webglError.message;
    }
    
    // Test model file accessibility
    try {
      const modelResponse = await fetch('./object_detecion_model/model_18_7.onnx', { method: 'HEAD' });
      diagnostics.frontend.modelAccessible = modelResponse.ok;
      diagnostics.frontend.modelSize = modelResponse.headers.get('content-length');
    } catch (modelError) {
      diagnostics.frontend.modelError = modelError.message;
    }
    
    // Test backend connectivity
    if (backendUrl) {
      try {
        const healthResponse = await fetch(`${backendUrl}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000) 
        });
        diagnostics.backend.healthCheck = {
          status: healthResponse.status,
          ok: healthResponse.ok,
          data: healthResponse.ok ? await healthResponse.json() : null
        };
      } catch (backendError) {
        diagnostics.backend.healthError = backendError.message;
      }
    }
    
    console.table(diagnostics);
    console.log('📊 Full diagnostics object:', diagnostics);
    
    // Display diagnostics in modal
    const diagnosticsHtml = `
      <div id="diagnostics-modal" class="modal" style="display: flex; z-index: 30000;">
        <div class="modal-content" style="max-width: 90vw; max-height: 90vh; overflow-y: auto;">
          <div class="modal-header">
            <h3>System Diagnostics</h3>
            <button onclick="closeDiagnostics()" class="close-btn">×</button>
          </div>
          <div class="modal-body" style="font-family: monospace; font-size: 12px;">
            <pre>${JSON.stringify(diagnostics, null, 2)}</pre>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', diagnosticsHtml);
    
    return diagnostics;
  }
  
  function closeDiagnostics() {
    const modal = document.getElementById('diagnostics-modal');
    if (modal) modal.remove();
  }
  
  // Make functions globally available
  window.runSystemDiagnostics = runSystemDiagnostics;
  window.closeDiagnostics = closeDiagnostics;
  
  // Enhanced keyboard shortcuts for debugging
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      runSystemDiagnostics();
    } else if (e.ctrlKey && e.key === 'i') {
      e.preventDefault();
      toggleInferenceMode();
    } else if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      console.clear();
      console.log('🧽 Console cleared - System ready for debugging');
    }
  });

  // Enhanced backend health check with better error handling
  async function checkBackendHealth() {
    const candidates = getBackendUrlCandidates();
    let lastError = null;
    
    console.log(`🔍 Testing ${candidates.length} backend URL candidates...`);
    
    for (let i = 0; i < candidates.length; i++) {
      const candidateUrl = candidates[i];
      try {
        console.log(`🔗 [${i + 1}/${candidates.length}] Trying backend URL: ${candidateUrl}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          console.log(`⏰ Timeout for ${candidateUrl}`);
        }, 10000); // 10 second timeout
        
        const startTime = performance.now();
        
        const response = await fetch(`${candidateUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          mode: 'cors',
          credentials: 'omit',
          redirect: 'follow'
        });
        
        const responseTime = Math.round(performance.now() - startTime);
        clearTimeout(timeoutId);
        
        console.log(`📡 Response from ${candidateUrl}: ${response.status} (${responseTime}ms)`);
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          let data;
          try {
            const responseText = await response.text();
            console.log(`📄 Raw response from ${candidateUrl}:`, responseText.substring(0, 200) + '...');
            data = JSON.parse(responseText);
          } catch (parseError) {
            console.error(`❌ Failed to parse JSON response from ${candidateUrl}:`, parseError);
            lastError = new Error(`Invalid JSON response from ${candidateUrl}`);
            continue;
          }
          
          console.log(`📊 Health data from ${candidateUrl}:`, data);
          
          const isHealthy = data.status === 'healthy' && data.model_status === 'loaded';
          
          if (isHealthy) {
            // Success! Update global backend URL and status
            backendUrl = candidateUrl;
            backendAvailable = true;
            lastBackendCheck = Date.now();
            inferenceMode = 'backend';
            
            const statusMessage = `Backend Inference (${getShortUrl(backendUrl)}) - ${responseTime}ms`;
            updateConnectionStatus('connected', statusMessage);
            console.log(`✅ Backend inference available at: ${candidateUrl} (${responseTime}ms)`);
            console.log(`📋 Backend info:`, {
              device: data.device_info?.device,
              model_path: data.device_info?.model_path,
              environment: data.environment?.deployment_env
            });
            
            // Store successful URL for future use
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('lastWorkingBackendUrl', candidateUrl);
              console.log(`💾 Saved working backend URL to localStorage`);
            }
            
            return true;
          } else {
            console.warn(`⚠️ Backend at ${candidateUrl} is not ready:`, {
              status: data.status,
              model_status: data.model_status,
              full_response: data
            });
            lastError = new Error(`Backend model not ready: status=${data.status}, model_status=${data.model_status}`);
          }
        } else {
          const responseText = await response.text().catch(() => 'Unable to read response');
          console.warn(`⚠️ Backend at ${candidateUrl} responded with status ${response.status}:`, responseText);
          lastError = new Error(`Backend responded with status: ${response.status} - ${responseText}`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to connect to backend at ${candidateUrl}:`, {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n')[0]
        });
        
        // Provide more specific error messages
        if (error.name === 'AbortError') {
          lastError = new Error(`Connection timeout to ${candidateUrl}`);
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
          lastError = new Error(`Network error connecting to ${candidateUrl} - check if server is running`);
        } else {
          lastError = error;
        }
      }
    }
    
    // All candidates failed
    backendAvailable = false;
    lastBackendCheck = Date.now();
    console.error('❌ All backend URL candidates failed. Last error:', lastError?.message);
    
    // Switch to frontend inference
    if (session) {
      inferenceMode = 'frontend';
      updateConnectionStatus('connected', 'Frontend Inference (Offline Mode)');
      createNotification('Using local inference - backend unavailable', 'warning', 4000);
    }
    
    return false;
  }
  
  // Helper function to shorten URLs for display
  function getShortUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}${urlObj.port ? ':' + urlObj.port : ''}`;
    } catch {
      return url;
    }
  }

  // Session management functions
  async function startDetectionSession() {
    if (currentSessionId) return currentSessionId; // Session already active
    
    try {
      const response = await fetch(`${backendUrl}/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        currentSessionId = data.session_id;
        sessionReports = [];
        sessionStats = { totalDetections: 0, uniqueHazards: 0, pendingReports: 0 };
        console.log('✅ Detection session started:', currentSessionId);
        return currentSessionId;
      }
    } catch (error) {
      console.warn('Failed to start session:', error);
    }
    return null;
  }
  
  async function endDetectionSession() {
    if (!currentSessionId) return null;
    
    try {
      const response = await fetch(`${backendUrl}/session/${currentSessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('📊 Session ended with summary:', data.summary);
        showSessionSummary(data.summary);
        currentSessionId = null;
        return data.summary;
      }
    } catch (error) {
      console.warn('Failed to end session:', error);
    }
    currentSessionId = null;
    return null;
  }
  
  // Enhanced backend detection function with session support
  async function runBackendInference(imageBlob) {
    try {
      // Ensure we have an active session
      if (!currentSessionId) {
        await startDetectionSession();
      }
      
      if (!currentSessionId) {
        // If session creation failed, fall back to legacy endpoint
        return await runLegacyBackendInference(imageBlob);
      }
      
      const formData = new FormData();
      formData.append('file', imageBlob, 'frame.jpg');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${backendUrl}/detect/${currentSessionId}`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Backend detection failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.detections) {
        // Update session stats
        if (result.session_stats) {
          sessionStats = result.session_stats;
          updateSessionUI();
        }
        
        // Process new reports
        if (result.new_reports && result.new_reports.length > 0) {
          sessionReports.push(...result.new_reports);
          showNewReportsNotification(result.new_reports);
        }
        
        return {
          success: true,
          detections: result.detections,
          processingTime: result.processing_time_ms,
          source: 'backend-enhanced',
          newReports: result.new_reports || [],
          sessionStats: result.session_stats
        };
      } else {
        throw new Error('Invalid backend response format');
      }
    } catch (error) {
      console.warn('Enhanced backend inference failed:', error.message);
      
      // Try legacy endpoint as fallback
      try {
        return await runLegacyBackendInference(imageBlob);
      } catch (legacyError) {
        // Mark backend as unavailable and switch to frontend
        backendAvailable = false;
        inferenceMode = 'frontend';
        updateConnectionStatus('connected', 'Frontend Inference (Backend Failed)');
        throw error;
      }
    }
  }
  
  // Legacy backend detection for compatibility
  async function runLegacyBackendInference(imageBlob) {
    const formData = new FormData();
    formData.append('file', imageBlob, 'frame.jpg');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`${backendUrl}/detect`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Legacy backend detection failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.detections) {
      return {
        success: true,
        detections: result.detections,
        processingTime: result.processing_time_ms,
        source: 'backend-legacy'
      };
    } else {
      throw new Error('Invalid legacy backend response format');
    }
  }

  // Convert backend detections to frontend format
  function convertBackendDetections(backendDetections, videoWidth, videoHeight) {
    const boxes = [];
    const scores = [];
    const classes = [];
    
    for (const detection of backendDetections) {
      const [x1, y1, x2, y2] = detection.bbox;
      
      // Scale coordinates to video dimensions
      const scaleX = videoWidth / 640; // Assuming backend processes at 640px
      const scaleY = videoHeight / 640;
      
      boxes.push([
        x1 * scaleX,
        y1 * scaleY, 
        x2 * scaleX,
        y2 * scaleY
      ]);
      scores.push(detection.confidence);
      classes.push(detection.class_id);
    }
    
    return { boxes, scores, classes };
  }
  
  const FIXED_SIZE = 720; // increased resolution for better accuracy
  let stream = null;
  let detecting = false;
  let session = null;
  let frameCount = 0;
  let lastSaveTime = 0;
  let _lastCoords = null;
  let _watchId    = null;
  let videoDevices = [];
  let currentCamIndex = 0;
  let prevImageData = null;
  const DIFF_THRESHOLD = 30000; // Optimized for better motion detection
  let skipFrames = 1;                       // Balanced for performance
  const targetFps = 15;                     // Increased target FPS for better responsiveness
  const frameTimes = [];                    // Frame time history
  const maxHistory = 8;                     // Increased for better averaging    
  let detectedObjectCount = 0; // Initialize object count
  let sessionDetectionCount = 0; // Total detections in session
  let uniqueHazardTypes = []; // Initialize array for unique hazard types
  let trackedObjects = new Map(); // Object tracker
  let nextObjectId = 1;
  let fpsCounter = 0;
  let lastFpsTime = Date.now();
  let currentFps = 0;
  
  // Enhanced detection persistence
  let persistentDetections = []; // Keep detections visible longer
  let detectionDisplayDuration = 5000; // Show detections for 5 seconds (increased)
  let lastDetectionTime = 0;
  let detectionHistory = new Map(); // Track detection history for better persistence
  
  // Backend inference configuration
  let backendAvailable = false;
  let useBackendInference = true;
  let lastBackendCheck = 0;
  let backendCheckInterval = 30000; // Check backend every 30 seconds
  let inferenceMode = 'unknown'; // 'backend', 'frontend', 'unknown'
  
  // Enhanced backend URL detection with better debugging
  function getBackendUrl() {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;
    
    console.log('🔍 Current location:', { hostname, protocol, port });
    
    // If we're on localhost, use localhost backend
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      const backendUrl = 'http://localhost:8000';
      console.log('🏠 Using localhost backend:', backendUrl);
      return backendUrl;
    }
    
    // If we're on a deployed domain, construct backend URL
    // For Render.com deployments, typically the backend is on a different subdomain or port
    if (hostname.includes('render.com') || hostname.includes('onrender.com')) {
      // Replace 'www' or frontend subdomain with 'api' or use same domain with different port
      const backendHost = hostname.replace('www.', '').replace('-frontend', '-backend');
      const backendUrl = `${protocol}//${backendHost}`;
      console.log('☁️ Using cloud backend:', backendUrl);
      return backendUrl;
    }
    
    // For other deployments, try same domain with common backend ports
    const backendUrl = `${protocol}//${hostname}:8000`; // Default fallback
    console.log('🌐 Using default backend:', backendUrl);
    return backendUrl;
  }

  // Generate multiple backend URL candidates with enhanced debugging
  function getBackendUrlCandidates() {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;
    const candidates = [];
    
    console.log('🔍 Generating backend URL candidates for:', { hostname, protocol, port });
    
    // First, try the last working URL from localStorage
    if (typeof localStorage !== 'undefined') {
      const lastWorkingUrl = localStorage.getItem('lastWorkingBackendUrl');
      if (lastWorkingUrl && lastWorkingUrl !== 'undefined') {
        candidates.push(lastWorkingUrl);
        console.log(`🔄 Adding last working URL: ${lastWorkingUrl}`);
      }
    }
    
    // Local development - add multiple localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      const localCandidates = [
        'http://localhost:8000',
        'http://127.0.0.1:8000',
        'http://0.0.0.0:8000'
      ];
      
      localCandidates.forEach(url => {
        if (!candidates.includes(url)) {
          candidates.push(url);
          console.log(`🏠 Adding local candidate: ${url}`);
        }
      });
      
      console.log(`📋 Total local candidates: ${candidates.length}`);
      return [...new Set(candidates)];
    }
    
    // Render.com specific patterns
    if (hostname.includes('render.com') || hostname.includes('onrender.com')) {
      // Try backend subdomain variations
      const backendHost1 = hostname.replace('-frontend', '-backend');
      const backendHost2 = hostname.replace('www.', 'api.');
      const backendHost3 = hostname.replace('app.', 'api.');
      const backendHost4 = hostname.replace('frontend', 'backend');
      
      candidates.push(`${protocol}//${backendHost1}`);
      candidates.push(`${protocol}//${backendHost2}`);
      candidates.push(`${protocol}//${backendHost3}`);
      candidates.push(`${protocol}//${backendHost4}`);
      
      // Try same domain with different paths (for single service deployments)
      candidates.push(`${protocol}//${hostname}/api`);
      candidates.push(`${protocol}//${hostname}/backend`);
      
      // Try different ports (for non-standard deployments)
      if (protocol === 'https:') {
        candidates.push(`https://${hostname}:8000`);
        candidates.push(`https://${hostname}:3001`);
        candidates.push(`https://${hostname}:5000`);
      }
    }
    
    // Generic deployment patterns
    candidates.push(`${protocol}//${hostname}:8000`);
    candidates.push(`${protocol}//${hostname}:3001`);
    candidates.push(`${protocol}//${hostname}:5000`);
    candidates.push(`${protocol}//api.${hostname}`);
    candidates.push(`${protocol}//backend.${hostname}`);
    candidates.push(`${protocol}//${hostname}/api`);
    candidates.push(`${protocol}//${hostname}/backend`);
    
    // HTTPS variants for mobile compatibility (force HTTPS for secure contexts)
    if (protocol === 'http:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      candidates.push(`https://${hostname}:8000`);
      candidates.push(`https://${hostname}:3001`);
      candidates.push(`https://${hostname}/api`);
      candidates.push(`https://${hostname}/backend`);
      candidates.push(`https://api.${hostname}`);
      candidates.push(`https://backend.${hostname}`);
    }
    
    // Environment-specific URLs from window object (if set by deployment)
    if (typeof window !== 'undefined' && window.BACKEND_URL) {
      candidates.unshift(window.BACKEND_URL); // Add to beginning
    }
    
    return [...new Set(candidates)]; // Remove duplicates
  }
  
  let backendUrl = getBackendUrl();
  console.log(`🔗 Backend URL detected: ${backendUrl}`);
  
  // Alternative backend URLs to try if primary fails
  const fallbackUrls = [
    backendUrl,
    `${window.location.protocol}//${window.location.hostname}:8000`,
    `${window.location.protocol}//${window.location.hostname}:3001`,
    `${window.location.protocol}//${window.location.hostname}:5000`
  ];
  
  // Remove duplicates from fallback URLs
  const uniqueFallbackUrls = [...new Set(fallbackUrls)];
  
  // Enhanced session management
  let currentSessionId = null;
  let sessionReports = [];
  let sessionStats = {
    totalDetections: 0,
    uniqueHazards: 0,
    pendingReports: 0
  };
  // ────────────────────────────────────────────────────────────────────────────────
  //  📸  Enumerate devices once on load
  // ────────────────────────────────────────────────────────────────────────────────
  (async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter((d) => d.kind === "videoinput");
      if (videoDevices.length > 1) {
        switchBtn.style.display = "inline-block";
      }
    } catch (err) {
      console.warn("⚠️ Could not enumerate video devices:", err);
    }

    // --- Enhanced inference system initialization with comprehensive error handling ---
    (async () => {
      try {
        showLoadingOverlay('Initializing AI Detection System...', 10);
        updateConnectionStatus('processing', 'System Starting...');
        
        console.log('🚀 Starting inference system initialization...');
        console.log('🌐 Environment info:', {
          hostname: window.location.hostname,
          protocol: window.location.protocol,
          userAgent: navigator.userAgent.substring(0, 100),
          hardwareConcurrency: navigator.hardwareConcurrency
        });
        
        // First, try to connect to backend
        showLoadingOverlay('Checking backend inference...', 25);
        updateConnectionStatus('processing', 'Checking Backend...');
        
        console.log('🔍 Checking backend health...');
        const backendSuccess = await checkBackendHealth();
        
        if (backendSuccess) {
          console.log("✅ Backend inference system ready");
          showLoadingOverlay('Backend Connected Successfully', 90);
          createNotification('Backend AI inference system ready', 'success', 3000);
          
          setTimeout(() => {
            hideLoadingOverlay();
          }, 1000);
          return;
        }
        
        // Backend failed, load frontend model as fallback
        console.log('⚠️ Backend unavailable, initializing frontend model...');
        showLoadingOverlay('Loading local AI model (fallback)...', 50);
        updateConnectionStatus('processing', 'Loading Local Model...');
        
        const modelLoadStart = performance.now();
        await loadModel();
        const modelLoadTime = Math.round(performance.now() - modelLoadStart);
        
        console.log(`✅ Frontend model loaded successfully in ${modelLoadTime}ms`);
        inferenceMode = 'frontend';
        showLoadingOverlay('Local Model Ready', 95);
        updateConnectionStatus('connected', 'Frontend Inference Ready');
        createNotification(`Local AI inference ready (offline mode) - loaded in ${modelLoadTime}ms`, 'info', 4000);
        
        setTimeout(() => {
          hideLoadingOverlay();
        }, 1000);
        
      } catch (err) {
        console.error("❌ Inference system initialization failed:", {
          message: err.message,
          name: err.name,
          stack: err.stack?.split('\n').slice(0, 5)
        });
        
        updateConnectionStatus('disconnected', 'Inference System Failed');
        
        // Provide specific error messages based on error type
        let errorMessage = 'AI inference system failed. ';
        if (err.message.includes('fetch') || err.message.includes('network')) {
          errorMessage += 'Network connectivity issue. Check your internet connection.';
        } else if (err.message.includes('WebAssembly') || err.message.includes('WASM')) {
          errorMessage += 'Browser compatibility issue. Try updating your browser or use Chrome/Firefox.';
        } else if (err.message.includes('model') || err.message.includes('ONNX')) {
          errorMessage += 'Model loading failed. The AI model may be corrupted or incompatible.';
        } else {
          errorMessage += 'Unknown error occurred. Please refresh the page and try again.';
        }
        
        createNotification(errorMessage, 'error', 0);
        showLoadingOverlay('Inference System Failed - Please Refresh', null);
        
        if (startBtn) {
          startBtn.disabled = true;
          startBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>System Failed</span>';
          startBtn.classList.add('error');
        }
        
        return;
      }
    })();
  })();

  const offscreen = document.createElement("canvas");
  offscreen.width = FIXED_SIZE;
  offscreen.height = FIXED_SIZE;
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });

  // allocate preprocessing buffers once to avoid per-frame allocations
  const floatData = new Float32Array(FIXED_SIZE * FIXED_SIZE * 3);
  const chwData   = new Float32Array(3 * FIXED_SIZE * FIXED_SIZE);

  let letterboxParams = null;

  const classNames = [
    'crack',
    'knocked',
    'pothole',
    'surface_damage'
  ];

  // Object tracking function
  function findOrCreateTrackedObject(x, y, hazardType, area) {
    const threshold = 100; // Distance threshold for matching objects
    let bestMatch = null;
    let bestDistance = Infinity;
    
    // Find closest existing object of same type
    for (let [key, obj] of trackedObjects) {
      if (obj.hazardType === hazardType) {
        const distance = Math.sqrt(Math.pow(x - obj.x, 2) + Math.pow(y - obj.y, 2));
        if (distance < threshold && distance < bestDistance) {
          bestMatch = key;
          bestDistance = distance;
        }
      }
    }
    
    if (bestMatch) {
      // Update existing object position
      const obj = trackedObjects.get(bestMatch);
      obj.x = x;
      obj.y = y;
      obj.lastSeen = Date.now();
      obj.area = area;
      return bestMatch;
    } else {
      // Create new tracked object
      const newKey = `obj_${nextObjectId++}`;
      trackedObjects.set(newKey, {
        id: newKey,
        x: x,
        y: y,
        hazardType: hazardType,
        area: area,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        isNew: true
      });
      return newKey;
    }
  }
  
  // Clean up old tracked objects periodically
  function cleanupTrackedObjects() {
    const now = Date.now();
    const timeout = 3000; // 3 seconds
    
    for (let [key, obj] of trackedObjects) {
      if (now - obj.lastSeen > timeout) {
        trackedObjects.delete(key);
      }
    }
  }

  

/**
 * Enhanced location tracking with improved fallback system
 * Tries GPS -> Browser permissions -> IP location
 */
function initLocationTracking() {
  return new Promise(async (resolve) => {
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported by browser");
      await tryIPLocation();
      return resolve(_lastCoords);
    }

    // Check if location permission is already granted
    if (navigator.permissions) {
      try {
        const permission = await navigator.permissions.query({name: 'geolocation'});
        if (permission.state === 'denied') {
          console.warn("Location permission denied, trying IP fallback");
          await tryIPLocation();
          return resolve(_lastCoords);
        }
      } catch (err) {
        console.warn("Permission API not supported");
      }
    }

    let done = false;
    function handleCoords(coords, source = 'GPS') {
      if (done) return;
      done = true;
      _lastCoords = coords;
      console.log(`📍 Location obtained from ${source}:`, coords);
      resolve(coords);
    }

    // 1️⃣ Try High-Accuracy GPS
    navigator.geolocation.getCurrentPosition(
      pos => handleCoords(pos.coords, 'High-Accuracy GPS'),
      async (err) => {
        console.warn("High-Accuracy GPS failed:", err.code, err.message);
        
        if (err.code === err.PERMISSION_DENIED) {
          console.log("Permission denied, trying IP fallback");
          await tryIPLocation();
          return resolve(_lastCoords);
        }
        
        // 2️⃣ Try Low-Accuracy GPS
        navigator.geolocation.getCurrentPosition(
          pos2 => handleCoords(pos2.coords, 'Low-Accuracy GPS'),
          async (err2) => {
            console.warn("Low-Accuracy GPS failed:", err2.code, err2.message);
            // 3️⃣ Final fallback to IP
            await tryIPLocation();
            resolve(_lastCoords);
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // 4️⃣ Setup continuous location tracking if GPS is available
    if (!done) {
      setTimeout(() => {
        if (_lastCoords) {
          _watchId = navigator.geolocation.watchPosition(
            pos => {
              _lastCoords = pos.coords;
              console.log("📍 Location updated:", pos.coords);
            },
            err => {
              console.warn("watchPosition error:", err.code, err.message);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
          );
        }
      }, 1000);
    }
  });
}

/**
 * Try to get location from IP address
 */
async function tryIPLocation() {
  try {
    console.log("Attempting IP-based location...");
    const response = await fetch("https://ipapi.co/json/");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (data.latitude && data.longitude) {
      _lastCoords = {
        latitude: data.latitude,
        longitude: data.longitude,
        source: 'IP'
      };
      console.log("📍 IP-based location obtained:", _lastCoords);
      return true;
    }
  } catch (error) {
    console.warn("IP location failed:", error);
    try {
      // Fallback to another IP service
      const response = await fetch("https://api.ipify.org?format=json");
      const ipData = await response.json();
      console.log("Using fallback IP service for:", ipData.ip);
      // Could implement additional IP geolocation service here
    } catch (fallbackError) {
      console.warn("All location methods failed:", fallbackError);
    }
  }
  return false;
}

/**
 * Returns Promise with the latest location (or rejects if not available)
 */
function getLatestLocation() {
  return new Promise((resolve, reject) => {
    if (_lastCoords && _lastCoords.latitude && _lastCoords.longitude) {
      const lat = parseFloat(_lastCoords.latitude);
      const lng = parseFloat(_lastCoords.longitude);
      
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        resolve(JSON.stringify({ lat: lat, lng: lng }));
      } else {
        reject("Invalid coordinates");
      }
    } else {
      reject("No location available yet");
    }
  });
}

/**
 * מפסיק את ה־watchPosition
 */
function stopLocationTracking() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
}


/**
 * מחזירה את המיקום האחרון (או נדחתת אם אין עדיין)
 */


  
  

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.color = "white";
    toast.style.padding = "12px 20px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    toast.style.zIndex = 9999;
    toast.style.fontSize = "14px";
    toast.style.fontWeight = "500";
    toast.style.maxWidth = "300px";
    toast.style.wordWrap = "break-word";
    toast.style.transition = "all 0.3s ease";
    toast.style.transform = "translateY(100%)";
    toast.style.opacity = "0";
    
    // Set colors based on type
    if (type === "success") {
      toast.style.backgroundColor = "#4caf50";
    } else if (type === "error") {
      toast.style.backgroundColor = "#f44336";
    } else if (type === "warning") {
      toast.style.backgroundColor = "#ff9800";
    } else if (type === "info") {
      toast.style.backgroundColor = "#2196f3";
    }
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
      toast.style.transform = "translateY(0)";
      toast.style.opacity = "1";
    }, 10);
    
    // Remove after delay
    setTimeout(() => {
      toast.style.transform = "translateY(100%)";
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function showSuccessToast(message = "💾 Detected and saved!") {
    createNotification(message, "success", 3000);
  }

  async function saveDetection(canvas, label = "Unknown", retryCount = 0) {
    let geoData;
    let locationNote;
  
    // Try to get current location
    if (_lastCoords && _lastCoords.latitude && _lastCoords.longitude) {
      // Validate coordinates are reasonable
      const lat = parseFloat(_lastCoords.latitude);
      const lng = parseFloat(_lastCoords.longitude);
      
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        geoData = JSON.stringify({ 
          lat: lat, 
          lng: lng 
        });
        locationNote = _lastCoords.source === 'IP' ? "Approximate (IP)" : "GPS";
        console.log(`📍 Using ${locationNote} location for detection save:`, {lat, lng});
      } else {
        console.warn("Invalid coordinates:", {lat, lng});
        geoData = null;
        locationNote = "Invalid coordinates";
      }
    } else {
      // Final attempt to get location if not available
      console.log("No location available, attempting final location fetch...");
      await tryIPLocation();
      
      if (_lastCoords && _lastCoords.latitude && _lastCoords.longitude) {
        const lat = parseFloat(_lastCoords.latitude);
        const lng = parseFloat(_lastCoords.longitude);
        
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          geoData = JSON.stringify({ 
            lat: lat, 
            lng: lng 
          });
          locationNote = "Approximate (IP)";
        } else {
          geoData = null;
          locationNote = "Invalid IP coordinates";
        }
      } else {
        console.warn("No location available for detection save");
        geoData = null;
        locationNote = "Location unavailable";
      }
    }
  
    // Save detection with location data
    canvas.toBlob(async blob => {
      if (!blob) return console.error("❌ Failed to get image blob");
  
      const file = new File([blob], "detection.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);
      
      // Only append geoData if we have valid coordinates
      if (geoData) {
        formData.append("geoData", geoData);
      }
      
      formData.append("hazardTypes", label);
      formData.append("locationNote", locationNote);
      formData.append("timestamp", new Date().toISOString());
  
      try {
        const res = await fetch("/upload-detection", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error("Server error:", errorText);
          throw new Error(errorText);
        }
        
        const result = await res.json();
        console.log("✅ Detection saved:", result.message);
        createNotification(`Detection saved successfully (${locationNote})`, "success", 3000);
      } catch (err) {
        console.error("❌ Failed to save detection:", err);
        
        // Retry logic for network errors
        if (retryCount < 2 && (err.message.includes("network") || err.message.includes("timeout"))) {
          console.log(`Retrying save detection... (${retryCount + 1}/2)`);
          createNotification(`Retrying save... (${retryCount + 1}/2)`, "warning", 2000);
          setTimeout(() => saveDetection(canvas, label, retryCount + 1), 1000);
          return;
        }
        
        // Try to parse error message for better user feedback
        let errorMessage = "Failed to save detection";
        if (err.message) {
          try {
            const errorObj = JSON.parse(err.message);
            errorMessage = errorObj.error || errorMessage;
          } catch (parseErr) {
            errorMessage = err.message;
          }
        }
        
        createNotification(errorMessage, "error", 5000);
      }
    }, "image/jpeg", 0.9);
  }
  
  
  

  
  // Enhanced ONNX Runtime configuration with proper error handling
  async function loadModel() {
    const ort = window.ort;
    if (!ort) {
      throw new Error('ONNX Runtime not loaded. Please check ort.min.js import.');
    }
    
    try {
      // Configure ONNX Runtime environment for better stability
      ort.env.wasm.simd = true;
      ort.env.wasm.wasmPaths = './ort/';  // Fixed path without leading slash
      ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 4);
      ort.env.wasm.proxy = false; // Disable proxy mode for better compatibility
      
      // Set memory limits to prevent WebAssembly errors
      ort.env.wasm.initTimeout = 30000; // 30 second timeout
      
      // Execution providers in order of preference
      const EPs = [];
      
      // Check WebGL support
      if (ort.env.webgl?.isSupported) {
        EPs.push('webgl');
        console.log('✅ WebGL execution provider available');
      }
      
      // Always add WASM as fallback
      EPs.push('wasm');
      console.log('✅ WASM execution provider available');
      
      console.log('🔄 Loading ONNX model with execution providers:', EPs);
      
      // Fixed model path (corrected typo and removed spaces)
      const modelPath = './object_detection_model/model_18_7.onnx';
      
      // Create session with enhanced error handling
      session = await ort.InferenceSession.create(modelPath, {
        executionProviders: EPs,
        graphOptimizationLevel: 'all',
        executionMode: 'sequential',
        enableCpuMemArena: true,
        enableMemPattern: true,
        logId: 'hazard-detection-model',
        logSeverityLevel: 0  // Only errors
      });
      
      console.log('✅ ONNX model loaded successfully');
      console.log('Model input names:', session.inputNames);
      console.log('Model output names:', session.outputNames);
      
      // Validate model inputs/outputs
      if (session.inputNames.length === 0) {
        throw new Error('Model has no input layers');
      }
      if (session.outputNames.length === 0) {
        throw new Error('Model has no output layers');
      }
      
    } catch (error) {
      console.error('❌ ONNX model loading failed:', error);
      
      // Provide specific error messages for common issues
      if (error.message.includes('fetch')) {
        throw new Error(`Model file not found. Please check if the model exists at the specified path. Original error: ${error.message}`);
      } else if (error.message.includes('WebAssembly')) {
        throw new Error(`WebAssembly error - this may be due to memory constraints or browser compatibility. Try refreshing the page. Original error: ${error.message}`);
      } else if (error.message.includes('onnx')) {
        throw new Error(`ONNX model format error - the model file may be corrupted or incompatible. Original error: ${error.message}`);
      }
      
      throw error;
    }
  }

  function computeLetterboxParams() {
    const scale = Math.min(FIXED_SIZE / video.videoWidth, FIXED_SIZE / video.videoHeight);
    const newW = Math.round(video.videoWidth * scale);
    const newH = Math.round(video.videoHeight * scale);
    const offsetX = Math.floor((FIXED_SIZE - newW) / 2);
    const offsetY = Math.floor((FIXED_SIZE - newH) / 2);
    letterboxParams = { scale, newW, newH, offsetX, offsetY };
  }



async function detectLoop() {
  if (!detecting) return;

  // Only resize canvas if video dimensions changed
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  
  // Always draw video frame for smooth preview
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  frameCount++;
  const shouldRunDetection = frameCount % skipFrames === 0;
  if (!shouldRunDetection) {
    // Continue smooth preview without detection
    requestAnimationFrame(detectLoop);
    return;
  }

  // Periodic backend health check
  const now = Date.now();
  if (now - lastBackendCheck > backendCheckInterval && useBackendInference) {
    checkBackendHealth().catch(() => {}); // Silent check
  }

  const t0 = performance.now();
  
  // Prepare image data for inference
  if (!letterboxParams) computeLetterboxParams();
  offCtx.fillStyle = 'black';
  offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
  offCtx.filter = 'none';

  // Draw video frame into letterboxed area
  offCtx.drawImage(
    video,
    0, 0, video.videoWidth, video.videoHeight,
    letterboxParams.offsetX, letterboxParams.offsetY,
    letterboxParams.newW, letterboxParams.newH
  );

  const curr = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);

  // Enhanced motion detection for better performance
  if (prevImageData) {
    let sum = 0;
    const d1 = curr.data, d2 = prevImageData.data;
    const step = 12; // Smaller step for better motion detection
    
    for (let i = 0; i < d1.length; i += step) {
      sum += Math.abs(d1[i] - d2[i]) + Math.abs(d1[i+1] - d2[i+1]) + Math.abs(d1[i+2] - d2[i+2]);
    }
    
    const adjustedThreshold = DIFF_THRESHOLD / 3;
    
    // More nuanced motion-based frame skipping
    if (sum < adjustedThreshold / 3) {
      // Very little motion - skip more frames but still update display
      skipFrames = Math.min(skipFrames + 1, 4);
      if (frameCount % 3 !== 0) {
        prevImageData = curr;
        requestAnimationFrame(detectLoop);
        return;
      }
    } else if (sum > adjustedThreshold * 2) {
      // High motion - process more frames
      skipFrames = 1;
    } else {
      // Medium motion - balanced approach
      skipFrames = 2;
    }
  }

  prevImageData = curr;

  let boxes = [];
  let scores = [];
  let classes = [];

  try {
    // Try backend inference first if available
    if (backendAvailable && useBackendInference && inferenceMode === 'backend') {
      try {
        // Convert canvas to blob for backend
        const imageBlob = await new Promise(resolve => {
          offscreen.toBlob(resolve, 'image/jpeg', 0.8);
        });
        
        const backendResult = await runBackendInference(imageBlob);
        const converted = convertBackendDetections(backendResult.detections, video.videoWidth, video.videoHeight);
        
        boxes = converted.boxes;
        scores = converted.scores;
        classes = converted.classes;
        
        // Handle enhanced backend features
        if (backendResult.source === 'backend-enhanced') {
          // Process new reports from enhanced backend
          if (backendResult.newReports && backendResult.newReports.length > 0) {
            console.log(`📄 Generated ${backendResult.newReports.length} new reports`);
          }
          
          // Update session statistics
          if (backendResult.sessionStats) {
            sessionStats = backendResult.sessionStats;
          }
        }
        
        const modeLabel = backendResult.source === 'backend-enhanced' ? 'Enhanced' : 'Legacy';
        console.log(`🌐 Backend inference (${modeLabel}): ${boxes.length} detections in ${backendResult.processingTime}ms`);
        
      } catch (backendError) {
        console.warn('Backend inference failed, falling back to frontend:', backendError.message);
        
        // Fallback to frontend inference
        if (!session) {
          // If no session, try to load model now
          try {
            await loadModel();
            inferenceMode = 'frontend';
            updateConnectionStatus('connected', 'Frontend Inference (Backend Failed)');
          } catch (modelError) {
            console.error('Failed to load frontend model:', modelError);
            requestAnimationFrame(detectLoop);
            return;
          }
        }
        
        // Run frontend inference
        const frontendResult = await runFrontendInference(curr);
        boxes = frontendResult.boxes;
        scores = frontendResult.scores;
        classes = frontendResult.classes;
      }
    } else {
      // Use frontend inference
      if (!session) {
        requestAnimationFrame(detectLoop);
        return;
      }
      
      const frontendResult = await runFrontendInference(curr);
      boxes = frontendResult.boxes;
      scores = frontendResult.scores;
      classes = frontendResult.classes;
    }
  } catch (error) {
    console.error('Inference error:', error);
    requestAnimationFrame(detectLoop);
    return;
  }

  // Clear canvas and redraw video
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Process detections
  detectedObjectCount = 0;
  const frameHazardTypes = [];

  for (let i = 0; i < boxes.length; i++) {
    const [x1, y1, x2, y2] = boxes[i];
    const score = scores[i];
    const cls = classes[i];

    let left, top, right, bottom;

    // Handle coordinate transformation based on inference mode
    if (inferenceMode === 'backend') {
      // Backend already provides coordinates in video space
      left = x1;
      top = y1;
      right = x2;
      bottom = y2;
    } else {
      // Frontend inference needs letterbox scaling
      left = (x1 - letterboxParams.offsetX) / letterboxParams.scale;
      top = (y1 - letterboxParams.offsetY) / letterboxParams.scale;
      right = (x2 - letterboxParams.offsetX) / letterboxParams.scale;
      bottom = (y2 - letterboxParams.offsetY) / letterboxParams.scale;
    }

    const w = right - left;
    const h = bottom - top;

    // Ensure coordinates are within bounds
    if (left < 0 || top < 0 || right > video.videoWidth || bottom > video.videoHeight) {
      continue;
    }
    
    detectedObjectCount++;
    const hazardIdx = Math.floor(cls);
    const hazardName = (hazardIdx >= 0 && hazardIdx < classNames.length) ? classNames[hazardIdx] : `Unknown Class ${hazardIdx}`;
    
    // Track unique objects
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const objectKey = findOrCreateTrackedObject(centerX, centerY, hazardName, w * h);
    
    if (hazardName && !frameHazardTypes.includes(hazardName)) {
      frameHazardTypes.push(hazardName);
    }
    if (hazardName && !uniqueHazardTypes.includes(hazardName)) {
      uniqueHazardTypes.push(hazardName);
    }

    // Enhanced detection labeling with better visibility
    const trackingInfo = currentSessionId ? ` [Session]` : '';
    const confidenceText = `${(score * 100).toFixed(1)}%`;
    const label = `${hazardName} ${confidenceText}${trackingInfo}`;
    
    // Ensure positive width and height
    const drawW = Math.max(w, 1);
    const drawH = Math.max(h, 1);
    
    // Enhanced color coding for different modes with better visibility
    let strokeColor, fillColor, shadowColor;
    if (inferenceMode === 'backend' && currentSessionId) {
      strokeColor = '#FF6B35'; // Orange for enhanced backend with session
      fillColor = '#FF6B35';
      shadowColor = 'rgba(255, 107, 53, 0.5)';
    } else if (inferenceMode === 'backend') {
      strokeColor = '#00FFFF'; // Cyan for regular backend
      fillColor = '#00FFFF';
      shadowColor = 'rgba(0, 255, 255, 0.5)';
    } else {
      strokeColor = '#00FF00'; // Green for frontend
      fillColor = '#00FF00';
      shadowColor = 'rgba(0, 255, 0, 0.5)';
    }
    
    // Add detection to persistent list for better visibility
    const detectionKey = `${hazardName}_${Math.round(centerX)}_${Math.round(centerY)}`;
    const existingIndex = persistentDetections.findIndex(d => d.key === detectionKey);
    const detectionData = {
      key: detectionKey,
      bbox: [left, top, right, bottom],
      hazardName,
      score,
      inferenceMode,
      timestamp: Date.now(),
      isNew: existingIndex === -1
    };
    
    if (existingIndex !== -1) {
      persistentDetections[existingIndex] = detectionData;
    } else {
      persistentDetections.push(detectionData);
    }
    
    // Draw enhanced bounding box with shadow
    ctx.save();
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = currentSessionId ? 5 : 4; // Thicker border for better visibility
    ctx.strokeRect(Math.max(0, left), Math.max(0, top), drawW, drawH);
    ctx.restore();

    // Draw enhanced label with better readability
    ctx.save();
    ctx.font = 'bold 14px Inter, Arial, sans-serif';
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = 16;
    const padding = 6;
    const labelY = top > 30 ? top - 30 : top + drawH + 30;
    
    // Draw label background with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(Math.max(0, left), labelY - textHeight, textWidth + padding * 2, textHeight + padding);
    
    // Draw label border
    ctx.strokeStyle = fillColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.max(0, left), labelY - textHeight, textWidth + padding * 2, textHeight + padding);
    
    // Draw label text
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 2;
    ctx.fillStyle = fillColor;
    ctx.fillText(label, Math.max(padding, left + padding), labelY - 4);
    ctx.restore();

    // Save detection only for new tracked objects
    if (trackedObjects.get(objectKey).isNew) {
      trackedObjects.get(objectKey).isNew = false;
      
      // Only save to Firebase if not using enhanced backend (which handles its own reporting)
      if (!currentSessionId) {
        sessionDetectionCount++;
        await saveDetection(canvas, hazardName);
      }
    }
  }
  
  // Always draw persistent detections for better visibility
  drawPersistentDetections();
  
  // Update camera wrapper class for visual effects
  const cameraWrapper = document.getElementById('camera-wrapper');
  if (cameraWrapper) {
    if (persistentDetections.length > 0) {
      cameraWrapper.classList.add('detecting');
    } else {
      cameraWrapper.classList.remove('detecting');
    }
  }

  // Update FPS counter
  fpsCounter++;
  if (now - lastFpsTime >= 1000) {
    currentFps = Math.round((fpsCounter * 1000) / (now - lastFpsTime));
    fpsCounter = 0;
    lastFpsTime = now;
    
    // Update professional UI displays
    updatePerformanceDisplays();
  }

  // Show hazard alert for new high-confidence detections
  if (detectedObjectCount > 0 && frameHazardTypes.length > 0) {
    const highConfidenceHazards = [];
    for (let i = 0; i < boxes.length; i++) {
      if (scores[i] > 0.8) {
        const hazardIdx = Math.floor(classes[i]);
        const hazardName = (hazardIdx >= 0 && hazardIdx < classNames.length) ? classNames[hazardIdx] : `Unknown`;
        if (!highConfidenceHazards.includes(hazardName)) {
          highConfidenceHazards.push(hazardName);
          showHazardAlert(hazardName, scores[i], _lastCoords ? 'GPS Available' : 'Location Unknown');
        }
      }
    }
  }

  const t1 = performance.now();
  const elapsed = t1 - t0;
  frameTimes.push(elapsed);
  if (frameTimes.length > maxHistory) frameTimes.shift();
  const avgTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  const idealInterval = 1000 / targetFps;
  
  // Enhanced dynamic frame skipping based on performance
  if (avgTime > idealInterval * 1.8) {
    skipFrames = Math.min(skipFrames + 1, 6);
  } else if (avgTime < idealInterval * 0.6) {
    skipFrames = Math.max(skipFrames - 1, 1);
  }
  
  // Adaptive quality based on device performance
  if (avgTime > idealInterval * 2.5 && frameCount > 100) {
    // Reduce quality for very slow devices
    if (canvas.width > 640) {
      canvas.width = Math.max(640, canvas.width * 0.8);
      canvas.height = Math.max(480, canvas.height * 0.8);
      computeLetterboxParams();
    }
  }

  // Cleanup old tracked objects periodically
  if (frameCount % 30 === 0) {
    cleanupTrackedObjects();
  }

  // Enhanced detection loop continuation with error recovery
  if (detecting) {
    try {
      // Use the most efficient animation method available
      if (video.requestVideoFrameCallback && typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => {
          try {
            detectLoop();
          } catch (loopError) {
            console.error('🔄 Detection loop error:', loopError);
            requestAnimationFrame(detectLoop); // Fallback
          }
        });
      } else if (window.requestIdleCallback && avgTime < idealInterval * 0.5) {
        // Use idle callback for very efficient systems
        requestAnimationFrame(() => {
          try {
            detectLoop();
          } catch (loopError) {
            console.error('🔄 Detection loop error (idle):', loopError);
            setTimeout(detectLoop, 50); // Delayed fallback
          }
        });
      } else {
        requestAnimationFrame(() => {
          try {
            detectLoop();
          } catch (loopError) {
            console.error('🔄 Detection loop error (standard):', loopError);
            setTimeout(detectLoop, 100); // Delayed fallback
          }
        });
      }
    } catch (schedulingError) {
      console.error('🔄 Loop scheduling error:', schedulingError);
      // Last resort fallback
      setTimeout(() => {
        if (detecting) {
          detectLoop();
        }
      }, 200);
    }
  }
}

// Draw persistent detections function with enhanced visibility
function drawPersistentDetections() {
  const now = Date.now();
  
  // Clean up old detections first
  persistentDetections = persistentDetections.filter(detection => {
    const age = now - detection.timestamp;
    return age <= detectionDisplayDuration;
  });
  
  for (const detection of persistentDetections) {
    const age = now - detection.timestamp;
    
    // Enhanced fade effect - detections stay more visible longer
    const fadeRatio = Math.max(0, 1 - (age / detectionDisplayDuration));
    const alpha = 0.5 + (fadeRatio * 0.5); // Fade from 1.0 to 0.5 (more visible)
    
    const [left, top, right, bottom] = detection.bbox;
    const w = right - left;
    const h = bottom - top;
    
    // Enhanced detection labeling with age info
    const trackingInfo = currentSessionId ? ` [S]` : '';
    const ageInfo = age > 2000 ? ` (${Math.round(age/1000)}s)` : '';
    const confidenceText = `${(detection.score * 100).toFixed(1)}%`;
    const label = `${detection.hazardName} ${confidenceText}${trackingInfo}${ageInfo}`;
    
    // Ensure positive width and height
    const drawW = Math.max(w, 1);
    const drawH = Math.max(h, 1);
    
    // Enhanced color coding with pulsing effect for new detections
    let strokeColor, fillColor, shadowColor;
    if (detection.inferenceMode === 'backend' && currentSessionId) {
      strokeColor = '#FF6B35';
      fillColor = '#FF6B35';
      shadowColor = 'rgba(255, 107, 53, 0.6)';
    } else if (detection.inferenceMode === 'backend') {
      strokeColor = '#00FFFF';
      fillColor = '#00FFFF';
      shadowColor = 'rgba(0, 255, 255, 0.6)';
    } else {
      strokeColor = '#00FF00';
      fillColor = '#00FF00';
      shadowColor = 'rgba(0, 255, 0, 0.6)';
    }
    
    // Apply alpha for fading effect
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Enhanced bounding box with glow effect
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = detection.isNew ? 12 : 6;
    ctx.strokeStyle = strokeColor;
    
    // Dynamic line width based on age and newness
    let lineWidth = currentSessionId ? 5 : 4;
    if (detection.isNew && age < 1000) {
      lineWidth += 2; // Extra thick for new detections
      // Pulsing effect for very new detections
      const pulsePhase = (age / 200) % 1;
      const pulseSize = 1 + Math.sin(pulsePhase * Math.PI * 2) * 0.3;
      lineWidth *= pulseSize;
    }
    
    ctx.lineWidth = lineWidth;
    
    // Dashed pattern for older detections
    if (age > 2000) {
      ctx.setLineDash([8, 4]);
    } else if (detection.isNew && age < 500) {
      ctx.setLineDash([12, 6]);
    }
    
    ctx.strokeRect(Math.max(0, left), Math.max(0, top), drawW, drawH);
    ctx.setLineDash([]); // Reset line dash
    
    // Enhanced label with better visibility
    ctx.font = 'bold 13px Inter, Arial, sans-serif';
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = 15;
    const padding = 5;
    const labelY = top > 35 ? top - 35 : top + drawH + 35;
    
    // Enhanced label background
    ctx.shadowBlur = 6;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(Math.max(0, left), labelY - textHeight, textWidth + padding * 2, textHeight + padding);
    
    // Label border with detection color
    ctx.strokeStyle = fillColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.max(0, left), labelY - textHeight, textWidth + padding * 2, textHeight + padding);
    
    // Label text with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 3;
    ctx.fillStyle = fillColor;
    ctx.fillText(label, Math.max(padding, left + padding), labelY - 3);
    
    ctx.restore();
    
    // Mark as no longer new after 1 second
    if (age > 1000) {
      detection.isNew = false;
    }
  }
}

// Enhanced frontend inference function with comprehensive error handling
async function runFrontendInference(imageData) {
  if (!session) {
    throw new Error('ONNX session not initialized. Please load the model first.');
  }
  
  const { data, width, height } = imageData;
  const inv255 = 1.0 / 255.0;
  
  let inputTensor = null;
  let results = null;
  
  try {
    // Validate input dimensions
    if (width !== FIXED_SIZE || height !== FIXED_SIZE) {
      throw new Error(`Invalid input dimensions: expected ${FIXED_SIZE}x${FIXED_SIZE}, got ${width}x${height}`);
    }
    
    // Convert to CHW format with error checking
    console.log(`🔄 Converting image data: ${width}x${height} -> CHW format`);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        const outputIndex = y * width + x;
        
        // Bounds checking
        if (pixelIndex + 2 >= data.length) {
          throw new Error(`Pixel index out of bounds: ${pixelIndex} >= ${data.length}`);
        }
        
        chwData[outputIndex] = data[pixelIndex] * inv255; // R
        chwData[width * height + outputIndex] = data[pixelIndex + 1] * inv255; // G
        chwData[2 * width * height + outputIndex] = data[pixelIndex + 2] * inv255; // B
      }
    }

    // Create input tensor with proper shape
    const tensorShape = [1, 3, height, width];
    console.log(`🧮 Creating input tensor with shape: [${tensorShape.join(', ')}]`);
    
    inputTensor = new ort.Tensor('float32', chwData, tensorShape);
    
    // Validate tensor
    if (!inputTensor || inputTensor.dims.length !== 4) {
      throw new Error('Failed to create valid input tensor');
    }
    
    // Run inference with timeout
    console.log(`🚀 Running ONNX inference...`);
    const inferenceStart = performance.now();
    
    // Get the correct input name from the model
    const inputName = session.inputNames[0] || 'images';
    console.log(`📥 Using input name: ${inputName}`);
    
    results = await session.run({ [inputName]: inputTensor });
    
    const inferenceTime = Math.round(performance.now() - inferenceStart);
    console.log(`⚡ ONNX inference completed in ${inferenceTime}ms`);
    
    if (!results || Object.keys(results).length === 0) {
      throw new Error('ONNX inference returned no results');
    }
    
    // Get output data
    const outputName = Object.keys(results)[0];
    console.log(`📤 Using output name: ${outputName}`);
    
    const outputTensor = results[outputName];
    if (!outputTensor || !outputTensor.data) {
      throw new Error('Invalid output tensor from ONNX inference');
    }
    
    const outputData = outputTensor.data;
    console.log(`📊 Output tensor shape: [${outputTensor.dims.join(', ')}], data length: ${outputData.length}`);
    
    // Parse detections with validation
    const boxes = [];
    const scores = [];
    const classes = [];
    const threshold = 0.5;
    const maxDetections = 50;
    
    console.log(`🔍 Parsing detections with threshold: ${threshold}`);
    
    // Handle different output formats
    let stride = 6; // Default for [x, y, w, h, conf, class]
    if (outputData.length % 6 !== 0) {
      // Try alternative formats
      if (outputData.length % 7 === 0) {
        stride = 7; // Format: [x, y, w, h, conf, class, extra]
      } else if (outputData.length % 5 === 0) {
        stride = 5; // Format: [x, y, w, h, class] (no confidence)
      } else {
        console.warn(`⚠️ Unexpected output format: length=${outputData.length}, trying stride=6`);
      }
    }
    
    for (let i = 0; i < outputData.length && boxes.length < maxDetections; i += stride) {
      if (i + 4 >= outputData.length) break;
      
      let score = 1.0; // Default confidence
      let classIdx = 0;
      
      if (stride >= 6) {
        score = outputData[i + 4];
        classIdx = outputData[i + 5];
      } else if (stride === 5) {
        classIdx = outputData[i + 4];
      }
      
      if (score >= threshold && isFinite(score)) {
        const box = [outputData[i], outputData[i + 1], outputData[i + 2], outputData[i + 3]];
        
        // Validate box coordinates
        if (box.every(coord => isFinite(coord) && coord >= 0)) {
          boxes.push(box);
          scores.push(score);
          classes.push(classIdx);
        }
      }
    }
    
    console.log(`✅ Frontend inference completed: ${boxes.length} detections found`);
    return { boxes, scores, classes };
    
  } catch (err) {
    console.error("❌ ONNX inference error:", {
      name: err.name,
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 3)
    });
    
    // Provide helpful error messages for common issues
    if (err.message.includes('WebAssembly')) {
      throw new Error(`WebAssembly error in ONNX Runtime. This may be due to memory constraints. Try refreshing the page. Details: ${err.message}`);
    } else if (err.message.includes('tensor')) {
      throw new Error(`Tensor operation failed. Check input data format. Details: ${err.message}`);
    } else if (err.message.includes('out of bounds')) {
      throw new Error(`Array index error during inference. Check image dimensions. Details: ${err.message}`);
    }
    
    throw err;
  } finally {
    // Clean up resources
    if (inputTensor) {
      try {
        inputTensor.dispose?.();
      } catch (disposeError) {
        console.warn('Failed to dispose input tensor:', disposeError);
      }
    }
    
    if (results) {
      try {
        Object.values(results).forEach(tensor => {
          if (tensor && typeof tensor.dispose === 'function') {
            tensor.dispose();
          }
        });
      } catch (disposeError) {
        console.warn('Failed to dispose output tensors:', disposeError);
      }
    }
  }
}



  startBtn.addEventListener("click", async () => {
    showLoadingOverlay('Initializing Camera System...', 25);
    updateConnectionStatus('processing', 'Starting Camera...');
    
    // Wait for the initial location to be found
    try {
      const initialCoords = await initLocationTracking();
      if (initialCoords) {
        console.log("📍 Location preloaded:", initialCoords);
        createNotification('Location tracking enabled', 'success', 2000);
      } else {
        console.warn("⚠️ Could not get initial location. Detections may not be saved.");
        createNotification('Location unavailable - detections will be saved without GPS', 'warning', 4000);
      }
    } catch (err) {
      console.warn("Location error:", err);
      createNotification('Location services unavailable', 'warning', 3000);
    }

    try {
      showLoadingOverlay('Accessing Camera...', 50);
      
      // Re-check cameras on each start
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter((d) => d.kind === "videoinput");

      const selectedDeviceId = videoDevices[currentCamIndex]?.deviceId;
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          frameRate: { ideal: 30, max: 30 },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: selectedDeviceId ? undefined : "environment"
        }
      });

      showLoadingOverlay('Initializing Detection...', 75);

      video.srcObject = stream;
      startBtn.style.display = "none";
      stopBtn.style.display = "inline-block";
      switchBtn.style.display = videoDevices.length > 1 ? "inline-block" : "none";

      // Reset counters and start session if backend available
      detectedObjectCount = 0;
      sessionDetectionCount = 0;
      uniqueHazardTypes = [];
      frameCount = 0;
      fpsCounter = 0;
      lastFpsTime = Date.now();
      currentFps = 0;
      
      // Start detection session if using backend
      if (inferenceMode === 'backend' && backendAvailable) {
        try {
          await startDetectionSession();
          createNotification('Detection session started - tracking unique hazards', 'success', 3000);
        } catch (error) {
          console.warn('Failed to start session, using legacy mode:', error);
        }
      }

      video.addEventListener(
        "loadeddata",
        () => {
          computeLetterboxParams();
          detecting = true;
          
          const modeText = inferenceMode === 'backend' ? 
            'Live Detection Active (Backend)' : 
            'Live Detection Active (Offline)';
          
          updateConnectionStatus('connected', modeText);
          createNotification(`Live hazard detection started (${inferenceMode} mode)`, 'success', 3000);
          hideLoadingOverlay();
          detectLoop();
        },
        { once: true }
      );
    } catch (err) {
      console.error("❌ Camera access error:", err);
      updateConnectionStatus('disconnected', 'Camera Access Failed');
      createNotification('Unable to access camera. Please check browser permissions.', 'error', 0);
      hideLoadingOverlay();
    }
  });

  
  
  switchBtn.addEventListener("click", async () => {
    try {
      if (!videoDevices.length || videoDevices.length < 2) return;

      updateConnectionStatus('processing', 'Switching Camera...');
      showLoadingOverlay('Switching to next camera...', null);

      // Stop current stream
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      // Switch to next camera
      currentCamIndex = (currentCamIndex + 1) % videoDevices.length;
      const newDeviceId = videoDevices[currentCamIndex].deviceId;

      // Request new camera
      stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: newDeviceId } },
      });

      // Attach video to new stream
      video.srcObject = stream;
      letterboxParams = null; // Recalculate on next frame

      updateConnectionStatus('connected', 'Live Detection Active');
      createNotification(`Switched to camera ${currentCamIndex + 1}`, 'info', 2000);
      hideLoadingOverlay();
      
      console.log(`📷 Switched to camera index ${currentCamIndex}`);
    } catch (err) {
      console.error("❌ Failed to switch camera:", err);
      updateConnectionStatus('disconnected', 'Camera Switch Failed');
      createNotification('Unable to switch camera. Check permissions.', 'error', 4000);
      hideLoadingOverlay();
    }
  });

  stopBtn.addEventListener("click", async () => {
    detecting = false;
    updateConnectionStatus('processing', 'Stopping Detection...');
    
    // End detection session if active
    if (currentSessionId) {
      try {
        showLoadingOverlay('Ending detection session...', 50);
        await endDetectionSession();
      } catch (error) {
        console.warn('Failed to properly end session:', error);
        createNotification('Session data may not be saved', 'warning', 3000);
      }
    }
    
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    
    video.srcObject = null;
    startBtn.style.display = "inline-block";
    stopBtn.style.display = "none";
    switchBtn.style.display = "none";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stopLocationTracking();
    
    // Memory cleanup
    prevImageData = null;
    frameTimes.length = 0;
    detectedObjectCount = 0;
    sessionDetectionCount = 0;
    uniqueHazardTypes = [];
    trackedObjects.clear();
    nextObjectId = 1;
    fpsCounter = 0;
    lastFpsTime = Date.now();
    currentFps = 0;
    
    // Reset session data
    sessionStats = { totalDetections: 0, uniqueHazards: 0, pendingReports: 0 };
    sessionReports = [];
    
    // Update professional UI displays
    updatePerformanceDisplays();
    updateSessionUI();
    if (hazardTypesList) hazardTypesList.innerHTML = '';
    
    updateConnectionStatus('disconnected', 'Detection Stopped');
    hideLoadingOverlay();
    createNotification('Detection system stopped', 'info', 2000);
    console.log("Camera stopped and memory cleaned");
  });
});