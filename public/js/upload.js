import { uploadDetection, startSession, detectSingleWithRetry } from './apiClient.js';
import { mapModelToCanvas, validateMappingAccuracy, modelToCanvasBox, computeContainMapping } from './utils/coordsMap.js';
import { processDetectionForAutoReporting } from './auto-reporting-service.js';
import { DETECTION_CONFIG } from './config.js';

// Import enhanced EXIF service
import { processImageWithExif, hasGPSData } from './exif.js';

const FIXED_SIZE = 480;

// Import inference contract validator
import { 
  validateDetectionResult, 
  convertToContractFormat,
  logContractFailure,
  ContractValidationError 
} from './inference-contract-validator.js';

// Global variables for geolocation and session state
let geoData = null;
let sessionId = null;
let isOnline = navigator.onLine;
let processingStage = 'idle'; // 'idle', 'uploading', 'processing', 'rendering', 'saving'

// Inference worker and detection state
let inferenceWorker = null;
let persistentDetections = [];
let coordinateMapping = null;

// Custom DetectionEvent for integration
class DetectionEvent extends CustomEvent {
  constructor(type, detectionData) {
    super(type, {
      detail: {
        ...detectionData,
        timestamp: Date.now(),
        source: 'upload'
      }
    });
  }
}

// Progress stage management
const PROGRESS_STAGES = {
  UPLOAD: { name: 'Uploading image...', progress: 20 },
  PROCESSING: { name: 'Processing with AI model...', progress: 60 },
  RENDERING: { name: 'Rendering detection results...', progress: 80 },
  SAVING: { name: 'Saving detection report...', progress: 100 }
};

document.addEventListener("DOMContentLoaded", async function () {
  const imageUpload = document.getElementById("image-upload");
  const confidenceSlider = document.getElementById("confidence-slider");
  const confValueSpan = document.getElementById("conf-value");
  const canvas = document.getElementById("preview-canvas");
  let ctx = null; // Will be initialized after setting canvas dimensions
  const logoutBtn = document.getElementById("logout-btn");
  const saveBtn = document.getElementById("save-detection");
  const tooltip = document.getElementById("tooltip");
  const uploadingModal = document.getElementById("uploading-modal");
  const uploadingModalBootstrap = new bootstrap.Modal(document.getElementById('uploading-modal'));
  
  // Initialize inference worker and session
  await initializeInferenceWorker();
  initializeUploadSession();
  
  // Update online status
  window.addEventListener('online', () => {
    isOnline = true;
    console.log('📡 Connection restored - upload workflow can sync to server');
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    console.log('📡 Connection lost - upload workflow will work offline');
  });

  function showUploadingModal() {
    updateProgressModal('UPLOAD');
    uploadingModalBootstrap.show();
  }

  function hideUploadingModal() {
    uploadingModalBootstrap.hide();
  }
  
  // Enhanced progress modal with stages and auto-reporting status
  function updateProgressModal(stage) {
    const modal = document.querySelector('#uploading-modal .modal-body');
    if (modal && PROGRESS_STAGES[stage]) {
      const { name, progress } = PROGRESS_STAGES[stage];
      processingStage = stage.toLowerCase();
      
      // Add auto-reporting status for SAVING stage
      const autoReportingStatus = stage === 'SAVING' && typeof getAutoReportingStats === 'function' 
        ? getAutoReportingStats() : null;
      
      const autoReportingHtml = autoReportingStatus && autoReportingStatus.reportsCreated > 0
        ? `<div class="mt-2 text-success"><small><i class="fas fa-robot"></i> ${autoReportingStatus.reportsCreated} auto-report(s) created</small></div>`
        : '';
      
      modal.innerHTML = `
        <div class="text-center">
          <div class="spinner-border text-primary mb-3" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <div class="progress mb-2" style="height: 4px;">
            <div class="progress-bar" role="progressbar" style="width: ${progress}%"></div>
          </div>
          <p class="mb-0">${name}</p>
          <small class="text-muted">${progress}% complete</small>
          ${autoReportingHtml}
        </div>
      `;
    }
  }
  
  // Initialize inference worker for upload detection
  async function initializeInferenceWorker() {
    try {
      console.log('🔧 Initializing inference worker for upload detection...');
      inferenceWorker = new Worker('/js/inference.worker.js', { type: 'module' });
      
      // Set up worker message handling
      inferenceWorker.onmessage = (event) => {
        const { type, payload } = event.data;
        
        switch (type) {
          case 'init_success':
            console.log('✅ Upload inference worker initialized:', payload);
            break;
          case 'init_error':
            console.error('❌ Upload inference worker failed to initialize:', payload.message);
            break;
          case 'inference_result':
            handleInferenceResult(payload);
            break;
          case 'run_error':
            console.error('❌ Upload inference failed:', payload.message);
            updateProgressModal('RENDERING');
            hideUploadingModal();
            showToast(`❌ Detection failed: ${payload.message}`, "error");
            break;
        }
      };
      
      // Initialize worker with model
      inferenceWorker.postMessage({
        type: 'init',
        payload: {
          modelUrl: '/object_detection_model/best0608.onnx',
          opts: {
            inputSize: FIXED_SIZE,
            threshold: 0.25,
            iou: 0.45
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to initialize inference worker:', error);
      inferenceWorker = null;
    }
  }
  
  // Initialize session for upload workflow
  async function initializeUploadSession() {
    try {
      sessionId = await startSession();
      console.log('📝 Upload session initialized:', sessionId);
    } catch (error) {
      console.warn('⚠️ Failed to initialize upload session:', error.message);
      sessionId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }
  }
  
  // Handle inference results from worker
  function handleInferenceResult(result) {
    console.log('🎯 Received inference result from worker:', result);
    
    // Store detections and update display
    persistentDetections = result.detections || [];
    lastRawBoxes = persistentDetections.map(det => [
      det.x1, det.y1, det.x2, det.y2, det.score, det.classId
    ]);
    
    // Update progress and render results
    updateProgressModal('RENDERING');
    updateAndDrawDetections();
    
    // Emit DetectionEvent for integration with auto-reporting
    emitDetectionEvent(persistentDetections, currentImage);
    
    // Hide loading modal after rendering
    setTimeout(() => {
      hideUploadingModal();
    }, 500);
  }
  
  // Try to get current location for metadata
  async function getCurrentLocation() {
    if (geoData) return JSON.parse(geoData);
    
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 5000,
          enableHighAccuracy: true,
          maximumAge: 300000 // 5 minutes
        });
      });
      
      const locationData = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      
      geoData = JSON.stringify(locationData);
      console.log('📍 Current location obtained:', locationData);
      return locationData;
    } catch (error) {
      console.warn('⚠️ Could not get current location:', error.message);
      // Return default Israel coordinates as fallback
      const fallbackLocation = { lat: 31.7683, lng: 35.2137 };
      geoData = JSON.stringify(fallbackLocation);
      return fallbackLocation;
    }
  }

  function showToast(message, type = 'success') {
    notify(message, type);
  }

  // Update detection modal with current detection results
  function updateDetectionModal(boxes, hazardTypes) {
    const detectionResults = document.getElementById('detection-results');
    
    if (boxes.length === 0) {
      detectionResults.innerHTML = '<p class="text-muted">No detections found in this image.</p>';
      return;
    }

    let html = `
      <div class="detection-summary mb-3">
        <h6>Detection Summary</h6>
        <p><strong>Total Detections:</strong> ${boxes.length}</p>
        <p><strong>Hazard Types:</strong> ${hazardTypes.join(', ')}</p>
      </div>
      <div class="detection-list">
        <h6>Individual Detections</h6>
    `;

    boxes.forEach((box, index) => {
      let [x1, y1, x2, y2, score, classId] = box;
      const classIndex = Math.floor(classId);
      const labelName = classNames[classIndex] || `Unknown Class ${classIndex}`;
      const scorePerc = (score * 100).toFixed(1);

      html += `
        <div class="detection-item border rounded p-2 mb-2">
          <strong>Detection #${index + 1}</strong><br>
          <span class="text-info">${labelName}</span><br>
          <small class="text-muted">Confidence: ${scorePerc}%</small><br>
          <small class="text-muted">Location: (${Math.round(x1)}, ${Math.round(y1)}) to (${Math.round(x2)}, ${Math.round(y2)})</small>
        </div>
      `;
    });

    html += '</div>';
    detectionResults.innerHTML = html;
  }

  



// Enhanced save functionality with proper workflow
  saveBtn.addEventListener("click", async () => {
    if (!canvas) {
      showToast("❌ Canvas element not found.", "error");
      return;
    }

    // Make geoData optional but prefer it when available
    if (!geoData) {
      console.warn("No geolocation data available, using default location");
      // Use default Israel coordinates as fallback
      geoData = JSON.stringify({ lat: 31.7683, lng: 35.2137 });
      showToast("⚠️ Using default location (no GPS data)", "warning");
    }

    // Create composite canvas that includes the original image and the overlay
    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = canvas.width;
    compositeCanvas.height = canvas.height;
    const compositeCtx = compositeCanvas.getContext("2d");

    // Draw the original uploaded image using coordinate mapping
    if (currentImage && coordinateMapping) {
        compositeCtx.fillStyle = "black";
        compositeCtx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
        compositeCtx.drawImage(currentImage, 
          coordinateMapping.offsetX, 
          coordinateMapping.offsetY, 
          coordinateMapping.displayWidth, 
          coordinateMapping.displayHeight
        );
    }

    // Draw the detection overlays with proper coordinate mapping
    if (persistentDetections && persistentDetections.length > 0 && coordinateMapping) {
      // Redraw detections on composite canvas using proper coordinate mapping
      persistentDetections.forEach((detection, index) => {
        const { x1, y1, x2, y2, score, classId } = detection;
        
        // Map from model coordinates to composite canvas coordinates
        const mappedBox = modelToCanvasBox([x1, y1, x2, y2], coordinateMapping, FIXED_SIZE);
        const [mappedX1, mappedY1, mappedX2, mappedY2] = mappedBox;
        
        const label = classNames[classId] || `Class ${classId}`;
        const color = hazardColors[label] || '#00FF00';

        drawProfessionalBoundingBox(compositeCtx, {
            x1: mappedX1, y1: mappedY1, x2: mappedX2, y2: mappedY2,
            label: label, confidence: score, detectionIndex: index + 1, color: color
        });
      });
    } else {
      // Fallback: draw canvas overlay directly if no raw detection data
      compositeCtx.drawImage(canvas, 0, 0);
    }

    updateProgressModal('SAVING');
    showUploadingModal();

    compositeCanvas.toBlob(async (blob) => {
        if (!blob) {
          hideUploadingModal();
          return alert("❌ Failed to get image blob");
        }
  
      // Enhanced report data with detections
      const reportData = {
        sessionId: sessionId,
        imageBlob: blob,
        detections: lastRawBoxes.filter(box => {
          const threshold = Math.max(confidenceThreshold, uploadDetectionConfig.classThresholds[Math.floor(box[5])] || uploadDetectionConfig.minConfidence || 0.25);
          return box[4] >= threshold;
        }).map(box => ({
          bbox: [box[0], box[1], box[2], box[3]],
          class: classNames[Math.floor(box[5])] || `Class ${Math.floor(box[5])}`,
          score: box[4]
        })),
        timestamp: new Date().toISOString(),
        confidenceThreshold: confidenceThreshold,
        location: geoData ? JSON.parse(geoData) : null,
        metadata: {
          source: 'upload',
          processingTime: Date.now(),
          hazardTypes: hazardTypes,
          detectionCount: lastRawBoxes.length,
          canvas: {
            width: canvas.width,
            height: canvas.height
          },
          coordinateMapping: {
            modelInputSize: FIXED_SIZE,
            letterboxParams: letterboxParams,
            canvasSize: { width: canvas.width, height: canvas.height },
            imageSize: currentImage ? { width: currentImage.width, height: currentImage.height } : null
          }
        }
      };

        try {
            // Use the existing uploadDetection API for consistency
            const result = await uploadDetection(reportData);

            // Success handling
            detectionSession.savedReports++;
            updateDetectionSessionSummary();
            
            // Show gallery view with the saved detection
            showGalleryView(result, blob, hazardTypes);
            
            showToast("✅ Detection report saved successfully!", "success");
            
            // Emit save completion event
            const saveEvent = new CustomEvent('detection-saved', {
              detail: {
                reportId: result.id || result.reportId,
                sessionId: sessionId,
                hazardTypes: hazardTypes,
                detectionCount: reportData.detections.length,
                timestamp: Date.now()
              }
            });
            document.dispatchEvent(saveEvent);

        } catch (err) {
            showToast("❌ Failed to save image to server.", "error");
            console.error(err);
        } finally {
            hideUploadingModal();
        }

    }, "image/jpeg", 0.95);
  });
  
  // Gallery view functionality
  function showGalleryView(result, imageBlob, hazardTypes) {
    const galleryModal = createGalleryModal(result, imageBlob, hazardTypes);
    document.body.appendChild(galleryModal);
    
    const galleryModalBootstrap = new bootstrap.Modal(galleryModal);
    galleryModalBootstrap.show();
    
    // Clean up modal after hiding
    galleryModal.addEventListener('hidden.bs.modal', () => {
      document.body.removeChild(galleryModal);
    });
  }
  
  function createGalleryModal(result, imageBlob, hazardTypes) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.setAttribute('tabindex', '-1');
    modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Detection Report Saved</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row">
              <div class="col-md-8">
                <div class="detection-preview">
                  <canvas id="gallery-canvas" class="img-fluid border rounded"></canvas>
                </div>
              </div>
              <div class="col-md-4">
                <div class="detection-summary">
                  <h6>Detection Summary</h6>
                  <div class="mb-2">
                    <strong>Report ID:</strong><br>
                    <small class="text-muted font-monospace">${result.id || result.reportId || 'Generated locally'}</small>
                  </div>
                  <div class="mb-2">
                    <strong>Hazards Detected:</strong><br>
                    <span class="badge bg-warning me-1">${hazardTypes.length} type${hazardTypes.length > 1 ? 's' : ''}</span>
                  </div>
                  <div class="mb-2">
                    <strong>Types:</strong><br>
                    ${hazardTypes.map(type => `<span class="badge bg-secondary me-1">${type}</span>`).join('')}
                  </div>
                  <div class="mb-2">
                    <strong>Confidence:</strong><br>
                    <span class="text-info">${(confidenceThreshold * 100).toFixed(0)}% threshold</span>
                  </div>
                  <div class="mb-2">
                    <strong>Session:</strong><br>
                    <small class="text-muted">${sessionId || 'Local session'}</small>
                  </div>
                  <div class="mb-2">
                    <strong>Timestamp:</strong><br>
                    <small class="text-muted">${new Date().toLocaleString()}</small>
                  </div>
                  ${geoData ? `
                  <div class="mb-2">
                    <strong>Location:</strong><br>
                    <small class="text-muted">📍 ${JSON.parse(geoData).lat.toFixed(4)}, ${JSON.parse(geoData).lng.toFixed(4)}</small>
                  </div>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            <button type="button" class="btn btn-primary" onclick="downloadDetectionImage()">
              <i class="fas fa-download"></i> Download Image
            </button>
          </div>
        </div>
      </div>
    `;
    
    // Set up canvas with detection image after modal is shown
    modal.addEventListener('shown.bs.modal', () => {
      const galleryCanvas = modal.querySelector('#gallery-canvas');
      const galleryCtx = galleryCanvas.getContext('2d');
      
      // Copy the current canvas content to gallery canvas
      galleryCanvas.width = canvas.width;
      galleryCanvas.height = canvas.height;
      galleryCtx.drawImage(canvas, 0, 0);
      
      // Add download functionality
      window.downloadDetectionImage = () => {
        const link = document.createElement('a');
        link.download = `hazard-detection-${Date.now()}.jpg`;
        link.href = galleryCanvas.toDataURL('image/jpeg', 0.95);
        link.click();
      };
    });
    
    return modal;
  }
  
  // Enhanced image validation
  function validateImageFile(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (!validTypes.includes(file.type)) {
      throw new Error(`Invalid file type: ${file.type}. Please select a JPEG, PNG, or WebP image.`);
    }
    
    if (file.size > maxSize) {
      throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum size is 10MB.`);
    }
    
    return true;
  }
  
  
  
  // YOLOv12n Road Damage Detection Model Configuration
const FIXED_SIZE = 480; // from YAML imgsz

// Import inference contract validator
import {
  validateDetectionResult,
  
  // Hazard colors for YOLOv12n classes
  const hazardColors = {
    crack:'#FF8844', 
    knocked:'#FFD400', 
    pothole:'#FF4444', 
    'surface damage':'#44D7B6'
  };

  // Detection configuration for YOLOv12n processing
  // Detection configuration for upload workflow
  const uploadDetectionConfig = {
    minConfidence: 0.25,
    nmsThreshold: 0.4,
    maxDetections: 50,
    minBoxSize: 4,
    aspectRatioFilter: 30.0,
    classThresholds: { 0:0.25, 1:0.25, 2:0.25, 3:0.25 }
  };
  
  // Legacy session for fallback (only loaded if worker fails)
  let session = null;

  // --- State for active image and detections ---
  let confidenceThreshold = parseFloat(confidenceSlider.value);
  let currentImage = null;
  let letterboxParams = { offsetX: 0, offsetY: 0, newW: FIXED_SIZE, newH: FIXED_SIZE };
  let lastRawBoxes = []; // Store raw detections to avoid re-running model on slider change

  confidenceSlider.addEventListener("input", (e) => {
    confidenceThreshold = parseFloat(e.target.value);
    confValueSpan.textContent = confidenceThreshold;
    if (currentImage) {
      // Re-filter and draw existing detections without re-running the model
      updateAndDrawDetections();
    }
  });

  if (imageUpload) {
    imageUpload.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file || !canvas) return;
      
      try {
        // Validate the image file
        validateImageFile(file);
        console.log('📁 Image file validated:', {
          name: file.name,
          size: `${(file.size / 1024 / 1024).toFixed(1)}MB`,
          type: file.type
        });
      } catch (error) {
        showToast(`❌ ${error.message}`, "error");
        imageUpload.value = ''; // Clear the input
        return;
      }

      showUploadingModal();
      updateProgressModal('UPLOAD');
      
      // Use enhanced EXIF service for better performance and reliability
      let exifResult = null;
      try {
        if (typeof processImageWithExif === 'function') {
          exifResult = await processImageWithExif(file, {
            autoCreateReport: true,
            uploadImmediately: true
          });
          
          if (exifResult.success && exifResult.hasGPS) {
            showToast(`✅ EXIF GPS found: Auto-report created (${exifResult.message})`, "success");
          } else if (exifResult.hasGPS === false) {
            console.log('📷 No GPS data in EXIF, proceeding with manual location detection');
          }
        } else {
          console.log('🔍 EXIF service not available, skipping EXIF processing');
        }
      } catch (error) {
        console.warn('⚠️ EXIF processing failed:', error);
        if (error.message !== 'processImageWithExif is not a function') {
          showToast(`⚠️ EXIF processing failed: ${error.message}`, "warning");
        }
      }
      
      // Update location data based on EXIF result
      if (exifResult?.success && exifResult.exifData?.location) {
        geoData = JSON.stringify({
          lat: exifResult.exifData.location.latitude,
          lng: exifResult.exifData.location.longitude,
          source: 'EXIF',
          accuracy: exifResult.exifData.location.accuracy
        });
        console.log('📍 Using EXIF GPS coordinates:', JSON.parse(geoData));
      } else {
        // Get current location as fallback
        await getCurrentLocation();
        console.log('📍 Using current location as fallback');
      }

      // Set canvas dimensions and reinitialize context
      canvas.width = FIXED_SIZE;
      canvas.height = FIXED_SIZE;
      ctx = canvas.getContext("2d");

      try {
        // Convert file to ImageBitmap for worker processing
        const imageBitmap = await createImageBitmap(file);
        currentImage = imageBitmap;
        
        // Calculate coordinate mapping for proper overlay rendering
        coordinateMapping = computeContainMapping({
          videoW: imageBitmap.width,
          videoH: imageBitmap.height,
          viewportW: FIXED_SIZE,
          viewportH: FIXED_SIZE,
          dpr: 1 // Canvas uses device pixels
        });
        
        letterboxParams = {
          offsetX: coordinateMapping.offsetX,
          offsetY: coordinateMapping.offsetY,
          newW: coordinateMapping.displayWidth,
          newH: coordinateMapping.displayHeight
        };
        
        // Draw image immediately for instant preview
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageBitmap, 
          coordinateMapping.offsetX, 
          coordinateMapping.offsetY, 
          coordinateMapping.displayWidth, 
          coordinateMapping.displayHeight
        );
        
        // Run inference via worker
        updateProgressModal('PROCESSING');
        
        if (inferenceWorker) {
          inferenceWorker.postMessage({
            type: 'run_image_bitmap',
            payload: {
              bitmap: imageBitmap,
              opts: {
                inputSize: FIXED_SIZE,
                threshold: confidenceThreshold,
                iou: 0.45
              }
            }
          });
        } else {
          // Fallback if worker failed to initialize
          console.warn('⚠️ Inference worker not available, using fallback');
          const detections = await runInferenceFallback(imageBitmap);
          persistentDetections = detections;
          lastRawBoxes = detections.map(det => [
            det.x1, det.y1, det.x2, det.y2, det.score, det.classId
          ]);
          updateAndDrawDetections();
          emitDetectionEvent(detections, imageBitmap);
          hideUploadingModal();
        }
        
        // Add EXIF metadata to the detection event if available
        if (exifResult?.success && exifResult.exifData) {
          const exifEvent = new CustomEvent('exif-data-processed', {
            detail: {
              exifData: exifResult.exifData,
              hasGPS: exifResult.hasGPS,
              geoReportCreated: !!exifResult.uploadResult,
              sessionId: sessionId,
              timestamp: Date.now()
            }
          });
          document.dispatchEvent(exifEvent);
          console.log('📷 EXIF processing event emitted:', exifResult.message);
        }
        
      } catch (error) {
        console.error('❌ Failed to process uploaded image:', error);
        showToast(`❌ Failed to process image: ${error.message}`, "error");
        hideUploadingModal();
      }
    });
  }

  // Auto-detect and parse different YOLO output formats
  function parseDetectionsAuto(output, imgSize, confidenceThreshold) {
    const outputData = output.data;
    const dims = output.dims;
    console.log('🔍 Parsing detections with dims:', dims);
    
    const detections = [];
    
    // Check if this is NMS-ready output (like [1, 300, 6] or [N, 6])
    if (dims.length >= 2 && dims[dims.length - 1] === 6) {
      console.log('📦 Detected NMS-ready format [N, 6] - parsing directly as [x1,y1,x2,y2,score,classId]');
      
      // Parse direct [x1, y1, x2, y2, score, classId] format
      for (let i = 0; i < outputData.length; i += 6) {
        const [x1, y1, x2, y2, score, classId] = outputData.slice(i, i + 6);
        
        if (score >= confidenceThreshold && x1 < x2 && y1 < y2) {
          detections.push({
            x1: Math.max(0, Math.min(x1, imgSize)),
            y1: Math.max(0, Math.min(y1, imgSize)),
            x2: Math.max(0, Math.min(x2, imgSize)),
            y2: Math.max(0, Math.min(y2, imgSize)),
            score: score,
            classId: Math.floor(classId)
          });
        }
      }
    }
    // Check if this is raw YOLO format (like [1, 25200, 9] for 4 classes + 5 coords)
    else if (dims.length >= 2 && dims[dims.length - 1] >= 9) {
      console.log('📦 Detected raw YOLO format - converting from [cx,cy,w,h,obj,class_probs...]');
      
      const numClasses = dims[dims.length - 1] - 5; // 5 = cx,cy,w,h,obj
      const numAnchors = outputData.length / dims[dims.length - 1];
      
      for (let i = 0; i < numAnchors; i++) {
        const offset = i * dims[dims.length - 1];
        const cx = outputData[offset];
        const cy = outputData[offset + 1];
        const w = outputData[offset + 2];
        const h = outputData[offset + 3];
        const objectness = outputData[offset + 4];
        
        // Skip if objectness is too low
        if (objectness < 0.1) continue;
        
        // Find best class
        let bestClassId = 0;
        let bestClassProb = 0;
        
        for (let c = 0; c < numClasses; c++) {
          const classProb = outputData[offset + 5 + c];
          if (classProb > bestClassProb) {
            bestClassProb = classProb;
            bestClassId = c;
          }
        }
        
        const finalScore = objectness * bestClassProb;
        
        if (finalScore >= confidenceThreshold) {
          // Convert from center format to corner format
          const x1 = cx - w / 2;
          const y1 = cy - h / 2;
          const x2 = cx + w / 2;
          const y2 = cy + h / 2;
          
          if (x1 < x2 && y1 < y2) {
            detections.push({
              x1: Math.max(0, Math.min(x1, imgSize)),
              y1: Math.max(0, Math.min(y1, imgSize)),
              x2: Math.max(0, Math.min(x2, imgSize)),
              y2: Math.max(0, Math.min(y2, imgSize)),
              score: finalScore,
              classId: bestClassId
            });
          }
        }
      }
    }
    else {
      console.warn('⚠️ Unknown output format with dims:', dims);
      return [];
    }
    
    console.log(`✅ Parsed ${detections.length} detections from output`);
    return detections;
  }

  // Emit DetectionEvent compliant with inference contract
  function emitDetectionEvent(detections, imageElement) {
    // Handle both worker format detections and legacy array format
    let contractDetections;
    
    if (Array.isArray(detections) && detections.length > 0 && typeof detections[0] === 'object' && 'x1' in detections[0]) {
      // Worker format: array of detection objects {x1, y1, x2, y2, score, classId}
      contractDetections = detections.map(det => ({
        x1: det.x1, y1: det.y1, x2: det.x2, y2: det.y2,
        score: det.score, classId: det.classId,
        className: classNames[det.classId] || `Class ${det.classId}`
      }));
    } else if (Array.isArray(detections) && detections.length > 0 && Array.isArray(detections[0])) {
      // Legacy format: array of arrays [x1, y1, x2, y2, score, classId]
      contractDetections = detections.map(det => ({
        x1: det[0], y1: det[1], x2: det[2], y2: det[3],
        score: det[4], classId: Math.floor(det[5]),
        className: classNames[Math.floor(det[5])] || `Class ${Math.floor(det[5])}`
      }));
    } else {
      // No detections
      contractDetections = [];
    }
    
    // Create inference contract compliant result
    const detectionResult = {
      detections: contractDetections,
      width: imageElement.width || FIXED_SIZE,
      height: imageElement.height || FIXED_SIZE,
      timings: {
        preprocess_ms: 50,  // Estimated for upload flow
        infer_ms: 200,      // Estimated model inference time
        postprocess_ms: 30, // Estimated postprocessing time
        total_ms: 280
      },
      engine: {
        name: 'upload-worker',
        backend: inferenceWorker ? 'worker' : 'fallback',
        version: '1.0',
        modelPath: '/object_detection_model/best0608.onnx'
      }
    };
    
    const eventData = {
      detectionResult: detectionResult,
      sessionId: sessionId,
      timestamp: Date.now(),
      imageElement: imageElement,
      canvas: canvas,
      location: geoData ? JSON.parse(geoData) : null,
      source: 'upload',
      // Compatibility with auto-reporting service
      detections: contractDetections,
      // Additional metadata for upload workflow
      coordinateMapping: coordinateMapping,
      confidenceThreshold: confidenceThreshold
    };
    
    const event = new DetectionEvent('hazard-detected', eventData);
    document.dispatchEvent(event);
    
    console.log('📡 DetectionEvent emitted (inference contract compliant) for upload:', {
      detectionCount: contractDetections.length,
      sessionId: sessionId,
      location: eventData.location,
      engine: detectionResult.engine,
      confidenceThreshold: confidenceThreshold
    });
    
    // Process for auto-reporting if enabled and detections exist
    if (typeof processDetectionForAutoReporting === 'function' && contractDetections.length > 0) {
      processDetectionForAutoReporting(contractDetections, imageElement)
        .then(result => {
          if (result.processed) {
            console.log(`🚨 Upload auto-reporting: ${result.reportsCreated} report(s) created`);
            showToast(`🤖 Auto-reporting: ${result.reportsCreated} report(s) created`, "info");
          }
        })
        .catch(error => {
          console.warn('⚠️ Upload auto-reporting failed:', error);
        });
    }
  }

  // Fallback inference function when worker is not available
  async function runInferenceFallback(imageElement) {
    console.log('🔄 Running fallback inference (no worker available)');
    
    if (!session) {
      console.warn("Model not loaded yet.");
      showToast("⚠️ Model not loaded yet, please wait...", "warning");
      return [];
    }

    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = FIXED_SIZE;
      offscreen.height = FIXED_SIZE;
      const offCtx = offscreen.getContext("2d");

      // Draw image with letterbox padding
      offCtx.fillStyle = "black";
      offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
      offCtx.drawImage(imageElement, 
        coordinateMapping.offsetX, 
        coordinateMapping.offsetY, 
        coordinateMapping.displayWidth, 
        coordinateMapping.displayHeight
      );

      const imageData = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);
      const { data, width, height } = imageData;

      // Convert to tensor format
      const tensorData = new Float32Array(width * height * 3);
      for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
        tensorData[j] = data[i] / 255;
        tensorData[j + 1] = data[i + 1] / 255;
        tensorData[j + 2] = data[i + 2] / 255;
      }

      const chwData = new Float32Array(3 * width * height);
      for (let c = 0; c < 3; c++) {
        for (let h = 0; h < height; h++) {
          for (let w = 0; w < width; w++) {
            chwData[c * width * height + h * width + w] =
              tensorData[h * width * 3 + w * 3 + c];
          }
        }
      }

      const dims = [1, 3, height, width];
      const tensor = new ort.Tensor("float32", chwData, dims);

      // Run inference
      const inputName = session.inputNames[0];
      const feeds = { [inputName]: tensor };
      const results = await session.run(feeds);
      const outputKey = Object.keys(results)[0];
      const output = results[outputKey];
      
      console.log('🧪 Fallback ONNX output dims:', output.dims, 'len:', output.data.length);

      // Parse detections using auto-parser
      const parsed = parseDetectionsAuto(output, FIXED_SIZE, 0.01);
      
      // Return detections in worker-compatible format
      return parsed;
      
    } catch (err) {
      console.error("Error in fallback inference:", err);
      return [];
    }
  }

  let hazardTypes = [];
  let hasHazard = false;
  
  // Detection Session Tracking
  let detectionSession = {
    startTime: Date.now(),
    detections: [],
    totalReports: 0,
    uniqueHazards: new Set(),
    savedReports: 0
  };
  
  // Function to add detection to session
  function addDetectionToSession(detection) {
    detectionSession.detections.push({
      ...detection,
      timestamp: Date.now(),
      id: Date.now() + Math.random()
    });
    detectionSession.totalReports++;
    detectionSession.uniqueHazards.add(detection.type);
    updateDetectionSessionSummary();
  }
  
  // Function to update session summary display
  function updateDetectionSessionSummary() {
    const sessionDuration = Date.now() - detectionSession.startTime;
    const durationMinutes = Math.floor(sessionDuration / 60000);
    const durationSeconds = Math.floor((sessionDuration % 60000) / 1000);
    
    // Update session stats if elements exist
    const totalDetectionsEl = document.getElementById('session-total-detections');
    const sessionDurationEl = document.getElementById('session-duration');
    const uniqueHazardsEl = document.getElementById('session-unique-hazards');
    const savedReportsEl = document.getElementById('session-saved-reports');
    
    if (totalDetectionsEl) totalDetectionsEl.textContent = detectionSession.totalReports;
    if (sessionDurationEl) sessionDurationEl.textContent = `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;
    if (uniqueHazardsEl) uniqueHazardsEl.textContent = detectionSession.uniqueHazards.size;
    if (savedReportsEl) savedReportsEl.textContent = detectionSession.savedReports;
  }
  
  
  
  
  // Initialize session summary on page load
  updateDetectionSessionSummary();

  // Central function to filter raw boxes and draw them
  function updateAndDrawDetections() {
    if (!currentImage) return;

    // Apply intelligent filtering for road damage detection using the current confidence threshold
    const filteredBoxes = applyDetectionFilters(lastRawBoxes);
    
    console.log(`Detection Results: ${lastRawBoxes.length} raw → ${filteredBoxes.length} filtered by confidence ${confidenceThreshold}`);
    drawResults(filteredBoxes);
  }

  // Enhanced detection filtering for road damage
  function applyDetectionFilters(boxes) {
    let validBoxes = [];
    
    // Filter by confidence, size and aspect ratio
    for (const box of boxes) {
      let [x1, y1, x2, y2, score, classId] = box;
      
      const classIndex = Math.floor(classId);
      
      // Use class-specific confidence thresholds if available
      const classMinThreshold = uploadDetectionConfig.classThresholds[classIndex] || uploadDetectionConfig.minConfidence;
      const minThreshold = Math.max(confidenceThreshold, classMinThreshold);
      
      // Skip low confidence detections
      if (score < minThreshold) continue;
      
      // Validate coordinates
      if (x1 >= x2 || y1 >= y2) continue;
      
      const width = x2 - x1;
      const height = y2 - y1;
      
      // Filter tiny boxes
      if (width < uploadDetectionConfig.minBoxSize || height < uploadDetectionConfig.minBoxSize) continue;
      
      // Filter extreme aspect ratios (likely false positives)
      const aspectRatio = Math.max(width/height, height/width);
      if (aspectRatio > uploadDetectionConfig.aspectRatioFilter) continue;
      
      // Ensure box is within image bounds
      if (x1 < 0 || y1 < 0 || x2 > FIXED_SIZE || y2 > FIXED_SIZE) continue;
      
      validBoxes.push(box);
    }
    
    // Sort by confidence (highest first)
    validBoxes.sort((a, b) => b[4] - a[4]);
    
    // Limit number of detections
    if (validBoxes.length > uploadDetectionConfig.maxDetections) {
      validBoxes = validBoxes.slice(0, uploadDetectionConfig.maxDetections);
    }
    
    // Apply Non-Maximum Suppression (simplified)
    return applyNMS(validBoxes, uploadDetectionConfig.nmsThreshold);
  }

  // Simplified Non-Maximum Suppression
  function applyNMS(boxes, threshold) {
    if (boxes.length === 0) return [];
    
    const result = [];
    const indices = boxes.map((_, i) => i);
    
    // Sort by confidence score
    indices.sort((a, b) => boxes[b][4] - boxes[a][4]);
    
    while (indices.length > 0) {
      const current = indices.shift();
      result.push(boxes[current]);
      
      // Remove boxes with high IoU
      for (let i = indices.length - 1; i >= 0; i--) {
        const iou = calculateIoU(boxes[current], boxes[indices[i]]);
        if (iou > threshold) {
          indices.splice(i, 1);
        }
      }
    }
    
    return result;
  }

  // Calculate Intersection over Union
  function calculateIoU(box1, box2) {
    const [x1a, y1a, x2a, y2a] = [box1[0], box1[1], box1[2], box1[3]];
    const [x1b, y1b, x2b, y2b] = [box2[0], box2[1], box2[2], box2[3]];
    
    const xLeft = Math.max(x1a, x1b);
    const yTop = Math.max(y1a, y1b);
    const xRight = Math.min(x2a, x2b);
    const yBottom = Math.min(y2a, y2b);
    
    if (xRight < xLeft || yBottom < yTop) return 0;
    
    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
    const box1Area = (x2a - x1a) * (y2a - y1a);
    const box2Area = (x2b - x1b) * (y2b - y1b);
    const unionArea = box1Area + box2Area - intersectionArea;
    
    return intersectionArea / unionArea;
  }

  // Update detection information panel
  function updateDetectionInfoPanel(boxes, detectionCount, hazardTypes) {
    const detectionInfo = document.getElementById('detection-info');
    const detectionCountEl = document.getElementById('detection-count');
    const confidenceAvgEl = document.getElementById('confidence-avg');
    const hazardTypesCountEl = document.getElementById('hazard-types-count');
    const detectedHazardsEl = document.getElementById('detected-hazards');
    
    if (!detectionInfo || !detectionCountEl || !confidenceAvgEl || !hazardTypesCountEl || !detectedHazardsEl) return;
    
    // Show/hide panel based on detections
    if (detectionCount > 0) {
      detectionInfo.classList.remove('hidden');
      
      // Update counts
      detectionCountEl.textContent = detectionCount;
      hazardTypesCountEl.textContent = hazardTypes.length;
      
      // Calculate average confidence
      const validBoxes = boxes.filter(box => {
        const threshold = Math.max(confidenceThreshold, uploadDetectionConfig.minConfidence);
        return box[4] >= threshold;
      });
      
      const avgConfidence = validBoxes.length > 0 
        ? validBoxes.reduce((sum, box) => sum + box[4], 0) / validBoxes.length
        : 0;
      
      confidenceAvgEl.textContent = `${Math.round(avgConfidence * 100)}%`;
      
      // Show detected hazards with confidence ranges
      const hazardDetails = hazardTypes.map(hazardType => {
        const hazardBoxes = validBoxes.filter(box => {
          const classIndex = Math.floor(box[5]);
          return classNames[classIndex] === hazardType;
        });
        
        const count = hazardBoxes.length;
        const maxConf = Math.max(...hazardBoxes.map(box => box[4]));
        const minConf = Math.min(...hazardBoxes.map(box => box[4]));
        
        return `${hazardType}: ${count} detected (${Math.round(minConf * 100)}-${Math.round(maxConf * 100)}% confidence)`;
      });
      
      detectedHazardsEl.innerHTML = hazardDetails.join('<br>');
    } else {
      detectionInfo.classList.add('hidden');
    }
  }

  // Enhanced professional bounding box drawing function with better coordinate handling
  function drawProfessionalBoundingBox(ctx, options) {
    const { x1, y1, x2, y2, label, confidence, classIndex, detectionIndex, color } = options;
    
    const boxW = x2 - x1;
    const boxH = y2 - y1;
    
    // Early return for invalid boxes
    if (boxW <= 0 || boxH <= 0) {
      console.warn('Invalid bounding box dimensions for upload:', { x1, y1, x2, y2 });
      return;
    }
    
    const scorePerc = (confidence * 100).toFixed(1);
    
    // Save current context state
    ctx.save();
    
    // Enhanced styling with better visual hierarchy
    const alpha = Math.min(0.85 + confidence * 0.15, 1.0);
    const lineWidth = Math.max(2, Math.min(5, 2 + confidence * 3));
    const cornerSize = Math.max(10, Math.min(18, confidence * 22));
    
    // Enhanced shadow for better depth perception
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // Draw main bounding box with enhanced styling
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([]); // Ensure solid line
    ctx.strokeRect(x1, y1, boxW, boxH);
    
    // Semi-transparent fill for better contrast
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.fillRect(x1, y1, boxW, boxH);
    
    // Clear shadow for subsequent elements
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Enhanced corner markers for high-confidence detections
    if (confidence > 0.6 && Math.min(boxW, boxH) > 30) {
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, lineWidth * 0.8);
      ctx.lineCap = 'round';
      
      const cornerLength = Math.min(cornerSize, Math.min(boxW, boxH) / 3);
      
      // Draw enhanced corner markers
      // Top-left
      ctx.beginPath();
      ctx.moveTo(x1, y1 + cornerLength);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 + cornerLength, y1);
      ctx.stroke();
      
      // Top-right
      ctx.beginPath();
      ctx.moveTo(x2 - cornerLength, y1);
      ctx.lineTo(x2, y1);
      ctx.lineTo(x2, y1 + cornerLength);
      ctx.stroke();
      
      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(x1, y2 - cornerLength);
      ctx.lineTo(x1, y2);
      ctx.lineTo(x1 + cornerLength, y2);
      ctx.stroke();
      
      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(x2 - cornerLength, y2);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2, y2 - cornerLength);
      ctx.stroke();
      
      ctx.lineCap = 'butt';
    }
    
    // Enhanced label rendering with better typography
    drawUploadLabel(ctx, {
      x1, y1, y2, label, confidence, scorePerc, detectionIndex, color,
      canvasWidth: FIXED_SIZE, canvasHeight: FIXED_SIZE, boxWidth: boxW, boxHeight: boxH
    });
    
    // Restore context state
    ctx.restore();
  }
  
  // Enhanced label drawing function for upload images
  function drawUploadLabel(ctx, { x1, y1, y2, label, confidence, scorePerc, detectionIndex, color, canvasWidth, canvasHeight, boxWidth, boxHeight }) {
    // Adaptive font sizing
    const baseFontSize = Math.max(10, Math.min(14, Math.min(boxWidth / 6, boxHeight / 4)));
    const confFontSize = baseFontSize * 0.85;
    
    ctx.font = `${baseFontSize}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'middle';
    
    const mainText = label.charAt(0).toUpperCase() + label.slice(1);
    const confText = `${scorePerc}%`;
    const idText = `#${detectionIndex}`;
    
    const mainTextMetrics = ctx.measureText(mainText);
    const confTextMetrics = ctx.measureText(confText);
    const idTextMetrics = ctx.measureText(idText);
    
    const labelPadding = Math.max(6, baseFontSize * 0.5);
    const labelSpacing = Math.max(3, baseFontSize * 0.25);
    const totalLabelWidth = mainTextMetrics.width + confTextMetrics.width + idTextMetrics.width + labelPadding * 2 + labelSpacing * 2;
    const labelHeight = Math.max(18, baseFontSize * 1.5);
    
    // Smart label positioning with enhanced bounds checking
    let labelX = Math.max(2, Math.min(x1, canvasWidth - totalLabelWidth - 2));
    let labelY = y1 - labelHeight - 3;
    
    // Position adjustment logic
    if (labelY < 0) {
      if (y2 + labelHeight + 3 <= canvasHeight) {
        labelY = y2 + 3;
      } else if (boxHeight > labelHeight + 8) {
        labelY = y1 + 3;
      } else {
        labelY = Math.max(2, canvasHeight - labelHeight - 2);
      }
    }
    
    // Enhanced background with gradient
    ctx.globalAlpha = Math.min(0.95, 0.85 + confidence * 0.1);
    const bgGradient = ctx.createLinearGradient(labelX, labelY, labelX, labelY + labelHeight);
    bgGradient.addColorStop(0, color);
    bgGradient.addColorStop(1, adjustColorBrightness(color, -15));
    ctx.fillStyle = bgGradient;
    
    drawRoundedRect(ctx, labelX, labelY, totalLabelWidth, labelHeight, 3);
    
    // Subtle border for definition
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = adjustColorBrightness(color, 25);
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    drawRoundedRectStroke(ctx, labelX, labelY, totalLabelWidth, labelHeight, 3);
    
    // Enhanced text rendering
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = getOptimalTextColor(color);
    ctx.textBaseline = 'middle';
    
    // Text shadow for readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 1;
    ctx.shadowOffsetX = 0.5;
    ctx.shadowOffsetY = 0.5;
    
    // Draw text elements
    ctx.font = `${baseFontSize}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
    ctx.fillText(mainText, labelX + labelPadding, labelY + labelHeight / 2);
    
    ctx.font = `${confFontSize}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
    ctx.fillStyle = adjustColorBrightness(getOptimalTextColor(color), -15);
    ctx.fillText(confText, labelX + labelPadding + mainTextMetrics.width + labelSpacing, labelY + labelHeight / 2);
    
    ctx.font = `${Math.max(8, confFontSize * 0.8)}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
    ctx.fillStyle = adjustColorBrightness(getOptimalTextColor(color), -25);
    ctx.fillText(idText, labelX + labelPadding + mainTextMetrics.width + confTextMetrics.width + labelSpacing * 2, labelY + labelHeight / 2);
    
    // Clear shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
  
  // Helper function for optimal text color selection
  function getOptimalTextColor(bgColor) {
    if (bgColor.startsWith('#')) {
      const r = parseInt(bgColor.slice(1, 3), 16);
      const g = parseInt(bgColor.slice(3, 5), 16);
      const b = parseInt(bgColor.slice(5, 7), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 140 ? '#000000' : '#ffffff';
    }
    return '#ffffff';
  }
  
  // Enhanced rounded rectangle stroke function
  function drawRoundedRectStroke(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.stroke();
  }
  
  // Helper function to draw rounded rectangles
  function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }
  
  // Enhanced color brightness adjustment with better precision
  function adjustColorBrightness(color, amount) {
    if (!color || typeof color !== 'string') return '#ffffff';
    
    const usePound = color[0] === '#';
    const col = usePound ? color.slice(1) : color;
    
    if (col.length !== 6) return color; // Return original if invalid format
    
    const num = parseInt(col, 16);
    if (isNaN(num)) return color;
    
    let r = Math.round((num >> 16) + amount);
    let g = Math.round((num >> 8 & 0x00FF) + amount);
    let b = Math.round((num & 0x0000FF) + amount);
    
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    
    const result = (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
    return (usePound ? '#' : '') + result;
  }

  // Function to draw "No hazard detected" message on canvas
  function drawNoHazardMessage(ctx) {
    ctx.save();
    
    // Draw a message banner instead of full overlay to keep image visible
    const bannerHeight = 80;
    const bannerY = FIXED_SIZE - bannerHeight - 20;
    
    // Draw banner background
    ctx.fillStyle = "rgba(0, 100, 0, 0.85)";
    ctx.fillRect(20, bannerY, FIXED_SIZE - 40, bannerHeight);
    
    // Draw banner border
    ctx.strokeStyle = "#00FF88";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, bannerY, FIXED_SIZE - 40, bannerHeight);
    
    // Main message styling
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 20px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // Add text shadow
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    // Draw main message
    const centerX = FIXED_SIZE / 2;
    const centerY = bannerY + bannerHeight / 2 - 10;
    ctx.fillText("✅ No Hazards Detected", centerX, centerY);
    
    // Subtitle message
    ctx.font = "14px Arial, sans-serif";
    ctx.fillText("Road surface appears safe", centerX, centerY + 25);
    
    // Reset shadow
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    ctx.restore();
  }

  function drawResults(boxes) {
    if (!ctx || !coordinateMapping) return; // Check if context and mapping exist

    hazardTypes = []; // Reset hazard types array
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);

    if (currentImage) {
      ctx.drawImage(currentImage, 
        coordinateMapping.offsetX, 
        coordinateMapping.offsetY, 
        coordinateMapping.displayWidth, 
        coordinateMapping.displayHeight
      );
    }

    hasHazard = false;
    
    let detectionCount = 0;
    boxes.forEach((box, index) => {
      let [x1, y1, x2, y2, score, classId] = box;      
      const classIndex = Math.floor(classId);

      // Map model coordinates to canvas coordinates using proper coordinate mapping
      const mappedBox = modelToCanvasBox([x1, y1, x2, y2], coordinateMapping, FIXED_SIZE);
      const [mappedX1, mappedY1, mappedX2, mappedY2] = mappedBox;

      const boxW = mappedX2 - mappedX1;
      const boxH = mappedY2 - mappedY1;

      if (boxW <= 1 || boxH <= 1) return;

      hasHazard = true;
      detectionCount++;

      // Get the correct class name using corrected class ID
      const labelName = classNames[classIndex] || `Unknown Class ${classIndex}`;
      
      console.log(`🔍 Detection: Raw classId=${classId}, Corrected=${classIndex}, Label="${labelName}", Mapped: (${mappedX1},${mappedY1})→(${mappedX2},${mappedY2})`);

      // Add to hazard types if not already present
      if (!hazardTypes.includes(labelName)) {
        hazardTypes.push(labelName);
      }

      // Professional bounding box drawing with mapped coordinates
      drawProfessionalBoundingBox(ctx, {
        x1: mappedX1, y1: mappedY1, x2: mappedX2, y2: mappedY2,
        label: labelName,
        confidence: score,
        classIndex: classIndex,
        detectionIndex: index + 1,
        color: hazardColors[labelName] || '#00FF00'
      });
      
      // Add detection to session tracking
      addDetectionToSession({
        type: labelName,
        confidence: score,
        classIndex: classIndex,
        coordinates: { x1: mappedX1, y1: mappedY1, x2: mappedX2, y2: mappedY2 },
        imageDimensions: { width: canvas.width, height: canvas.height }
      });
    });

    // Update detection information panel
    updateDetectionInfoPanel(boxes, detectionCount, hazardTypes);
    
    // Update detection modal with filtered results
    updateDetectionModal(boxes, hazardTypes);
    
    // Draw "No hazard detected" message if no detections found
    if (detectionCount === 0) {
      drawNoHazardMessage(ctx);
      showToast("🟢 No hazards detected in this image", "success");
    }
    
    // Log detection summary
    console.log(`✅ Detected ${detectionCount} hazards:`, hazardTypes);
    if (detectionCount > 0) {
      console.log(`📊 Detection confidence scores:`, boxes.slice(0, 5).map(b => `${(b[4] * 100).toFixed(1)}%`));
    }

  // שליטה בכפתור השמירה לפי האם יש מפגעים
  if (!saveBtn || !tooltip) return;

  if (!hasHazard) {
    saveBtn.disabled = true;
    saveBtn.style.opacity = "0.5";
    saveBtn.style.cursor = "not-allowed";

    // מוסיפים את ההאזנה רק אם לא נוספה עדיין
    saveBtn.addEventListener("mousemove", showTooltip);
    saveBtn.addEventListener("mouseleave", hideTooltip);
  } else {
    saveBtn.disabled = false;
    saveBtn.style.opacity = "1";
    saveBtn.style.cursor = "pointer";

    // מסתיר את הטולטיפ מיידית
    tooltip.style.display = "none";
    tooltip.style.left = "-9999px";  // אופציונלי — לוודא שהוא לא נשאר במקום
    tooltip.style.top = "-9999px";

    // מסיר את ההאזנה כדי למנוע חפיפות
    saveBtn.removeEventListener("mousemove", showTooltip);
    saveBtn.removeEventListener("mouseleave", hideTooltip);
  }
}

function showTooltip(e) {
  tooltip.style.left = e.pageX + 15 + "px";
  tooltip.style.top = e.pageY + "px";
  tooltip.style.display = "block";
}

function hideTooltip() {
  tooltip.style.display = "none";
}

if (saveBtn && tooltip) { // Ensure elements exist before adding listeners
  saveBtn.addEventListener("mousemove", (e) => {
    if (saveBtn.disabled) { // Simplified tooltip logic, text is static in HTML/CSS
      tooltip.style.left = `${e.pageX + 10}px`;
      tooltip.style.top = `${e.pageY + 10}px`;
      tooltip.style.display = "block";
    }
  });

  saveBtn.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
  });
}

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      // This button is removed from upload.html.
      // If logout is needed, it should be handled by a button in the sidebar
      // or another shared component.
      try {
        const response = await fetch("/logout", { method: "GET" });
        if (response.redirected) {
          window.location.href = response.url;
        }
      } catch (error) {
        console.error("Logout failed:", error);
      }
    });
  } else {
    // Optional: Add logout functionality to a sidebar button if it exists
    const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');
    if (sidebarLogoutBtn) {
      sidebarLogoutBtn.addEventListener("click", async () => {
        try {
          const response = await fetch("/logout", { method: "GET" });
          if (response.redirected) {
            window.location.href = response.url;
          }
        } catch (error) {
          console.error("Logout failed:", error);
        }
      });
    }
  }
});