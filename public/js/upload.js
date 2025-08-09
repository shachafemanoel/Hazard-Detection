import { loadONNXRuntime, createInferenceSession } from './onnx-runtime-loader.js';
import { BASE_API_URL } from './config.js';
import { fetchWithTimeout } from './utils/fetchWithTimeout.js';
import { ensureOk, getJsonOrThrow } from './utils/http.js';

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

  const GLOBAL_CONFIDENCE_THRESHOLD = window.CONFIDENCE_THRESHOLD || 0.5;
  const CLASS_THRESHOLDS = window.CLASS_THRESHOLDS || {};

  function showUploadingModal() {
    uploadingModalBootstrap.show();
  }

  function hideUploadingModal() {
    uploadingModalBootstrap.hide();
  }

  function showToast(message, type = 'success') {
    notify(message, type);
  }

  // Update detection modal with current detection results
  function updateDetectionModal(boxes, hazardTypes) {
    const detectionResults = document.getElementById('detection-results');
    
    if (boxes.length === 0) {
      const noDets = document.createElement('p');
      noDets.className = 'text-muted';
      noDets.textContent = 'No detections found in this image.';
      detectionResults.replaceChildren(noDets);
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
      x1 = Math.max(0, Math.min(FIXED_SIZE, x1));
      y1 = Math.max(0, Math.min(FIXED_SIZE, y1));
      x2 = Math.max(0, Math.min(FIXED_SIZE, x2));
      y2 = Math.max(0, Math.min(FIXED_SIZE, y2));
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
    // Create detection results safely
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'detection-summary mb-3';
    
    const summaryTitle = document.createElement('h6');
    summaryTitle.textContent = 'Detection Summary';
    summaryDiv.appendChild(summaryTitle);
    
    const totalP = document.createElement('p');
    const totalStrong = document.createElement('strong');
    totalStrong.textContent = 'Total Detections: ';
    totalP.appendChild(totalStrong);
    totalP.appendChild(document.createTextNode(boxes.length.toString()));
    summaryDiv.appendChild(totalP);
    
    const hazardP = document.createElement('p');
    const hazardStrong = document.createElement('strong');
    hazardStrong.textContent = 'Hazard Types: ';
    hazardP.appendChild(hazardStrong);
    hazardP.appendChild(document.createTextNode(hazardTypes.join(', ')));
    summaryDiv.appendChild(hazardP);
    
    const listDiv = document.createElement('div');
    listDiv.className = 'detection-list';
    
    const listTitle = document.createElement('h6');
    listTitle.textContent = 'Individual Detections';
    listDiv.appendChild(listTitle);
    
    boxes.forEach((box, index) => {
      let [x1, y1, x2, y2, score, classId] = box;
      const classIndex = Math.floor(classId);
      const labelName = classNames[classIndex] || `Unknown Class ${classIndex}`;
      const scorePerc = (score * 100).toFixed(1);
      
      const detDiv = document.createElement('div');
      detDiv.className = 'detection-item border rounded p-2 mb-2';
      
      const detNumber = document.createElement('strong');
      detNumber.textContent = `Detection #${index + 1}`;
      detDiv.appendChild(detNumber);
      detDiv.appendChild(document.createElement('br'));
      
      const className = document.createElement('span');
      className.className = 'text-info';
      className.textContent = labelName;
      detDiv.appendChild(className);
      detDiv.appendChild(document.createElement('br'));
      
      const confSmall = document.createElement('small');
      confSmall.className = 'text-muted';
      confSmall.textContent = `Confidence: ${scorePerc}%`;
      detDiv.appendChild(confSmall);
      detDiv.appendChild(document.createElement('br'));
      
      const locSmall = document.createElement('small');
      locSmall.className = 'text-muted';
      locSmall.textContent = `Location: (${Math.round(x1)}, ${Math.round(y1)}) to (${Math.round(x2)}, ${Math.round(y2)})`;
      detDiv.appendChild(locSmall);
      
      listDiv.appendChild(detDiv);
    });
    
    detectionResults.replaceChildren(summaryDiv, listDiv);
  }

  let geoData = null;

  function getGeoDataFromImage(file) {
    // ... (קוד פונקציה זהה)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const imgData = e.target.result;
  
        const img = new Image();
        img.onload = function () {
          EXIF.getData(img, function () {
            const lat = EXIF.getTag(this, "GPSLatitude");
            const lon = EXIF.getTag(this, "GPSLongitude");
            const latRef = EXIF.getTag(this, "GPSLatitudeRef") || "N";
            const lonRef = EXIF.getTag(this, "GPSLongitudeRef") || "E";
  
            if (!lat || !lon) {
              return resolve(null); // No geo data
            }
  
            const toDecimal = (dms, ref) => {
              const [deg, min, sec] = dms;
              let decimal = deg + min / 60 + sec / 3600;
              if (ref === "S" || ref === "W") decimal *= -1;
              return decimal;
            };
  
            const latitude = toDecimal(lat, latRef);
            const longitude = toDecimal(lon, lonRef);
  
            resolve(JSON.stringify({ lat: latitude, lng: longitude }));
          });
        };
        img.src = imgData;
      };
      reader.readAsDataURL(file);
    });
  }



// שמירת התמונה והנתונים
  saveBtn.addEventListener("click", () => {
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

    // Draw the original uploaded image using the same letterbox parameters
    if (currentImage) {
        const { offsetX, offsetY, newW, newH } = letterboxParams;
        compositeCtx.fillStyle = "black";
        compositeCtx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
        compositeCtx.drawImage(currentImage, offsetX, offsetY, newW, newH);
    }

    // Draw the detection overlays
    compositeCtx.drawImage(canvas, 0, 0);

    showUploadingModal();

    compositeCanvas.toBlob(async (blob) => {
        if (!blob) {
          hideUploadingModal();
          return alert("❌ Failed to get image blob");
        }
  
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', blob, 'detection.jpg');
      formData.append('hazardTypes', hazardTypes.join(","));
      formData.append('geoData', geoData);
      formData.append('time', new Date().toISOString());
      formData.append('locationNote', 'GPS');

        try {
            const res = await fetchWithTimeout("/api/upload", {
                method: "POST",
                body: formData,
                credentials: "include",
            });

          if (!res.ok) {
              const contentType = res.headers.get("content-type");
              let errorMessage = `HTTP ${res.status}`;
              
              if (contentType && contentType.includes("application/json")) {
                  const errorData = await res.json();
                  errorMessage = errorData.error || errorMessage;
              } else {
                  errorMessage = res.status === 401 ? "Authentication required" : `Server error (${res.status})`;
              }
              
              throw new Error(errorMessage);
          }

            const result = await res.json();
            detectionSession.savedReports++;
            updateDetectionSessionSummary();
            showToast("✅ Saved to server: " + result.message, "success");

        } catch (err) {
            showToast("❌ Failed to save image to server.", "error");
            console.error(err);
        } finally {
            hideUploadingModal();
        }

    }, "image/jpeg", 0.95);
  });
  
  // YOLOv12n Road Damage Detection Model Configuration
  const FIXED_SIZE = 480; // from YAML imgsz
  
  // YOLOv12n Road Damage Classes (4 classes)
  const classNames = ['crack', 'knocked', 'pothole', 'surface damage'];
  
  // Hazard colors for YOLOv12n classes
  const hazardColors = {
    crack:'#FF8844', 
    knocked:'#FFD400', 
    pothole:'#FF4444', 
    'surface damage':'#44D7B6'
  };

  // Detection configuration for YOLOv12n processing
  const DETECTION_CONFIG = {
    minConfidence: 0.25,          // Updated for YOLOv12n
    nmsThreshold: 0.4,            // Lower for better precision
    maxDetections: 50,            // Higher limit for batch processing
    minBoxSize: 4,                // Smaller for crack detection
    aspectRatioFilter: 30.0,      // Allow longer shapes for cracks/markings
    // Class-specific minimum confidences for YOLOv12n (4 classes)
    classThresholds: { 0:0.25, 1:0.25, 2:0.25, 3:0.25 }
  };
  let session = null;
  let runtime = 'wasm';
  
  // Load ONNX Runtime using shared loader to ensure consistent env/config
  // Loading ONNX Runtime via loader...
  await loadONNXRuntime();
  // ONNX Runtime loaded (WASM)

  try {
    // Prioritized model paths - using available ONNX models
    const modelPaths = [
      'web/best_web.onnx'           // Primary web-optimized model
    ]
    
    let modelPath = null;
    for (const path of modelPaths) {
      try {
        // URL encode the path to handle spaces in filenames
        const encodedPath = encodeURI(path);
        const response = await fetchWithTimeout(encodedPath, { method: 'HEAD', timeout: 5000 });
        if (response.ok) {
          modelPath = encodedPath;
          // Found ONNX model at path
          break;
        }
      } catch (e) {
        // Failed to access model at path
        // Continue to next path
      }
    }
    
    if (!modelPath) {
      throw new Error('No ONNX model found in any of the expected locations');
    }

    // Initialize session using shared loader (configures env and warmup)
    session = await createInferenceSession(modelPath);
    // YOLO model loaded with ONNX runtime!
  } catch (err) {
    console.error("❌ Failed to load model:", err);
  }

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
  if (!file || !canvas) return; // Add check for canvas

  // 1. נתחיל קריאת EXIF ברקע (לא חוסם את התצוגה)
  getGeoDataFromImage(file).then(data => {
    if (data) {
      geoData = data;      // שומר מיקום אם קיים
    } else {
      console.warn("אין נתוני EXIF גיאו בתמונה הזאת");
    }
  });

  // 2. Set canvas dimensions and reinitialize context
  canvas.width  = FIXED_SIZE;
  canvas.height = FIXED_SIZE;
  ctx = canvas.getContext("2d"); // Re-initialize context after resizing

  // 3. תמיד תציג תצוגה ותריץ את המודל
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = async () => {
      currentImage = img;
      
      // Draw image immediately for instant preview
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Calculate letterbox parameters for preview
      const imgW = img.width;
      const imgH = img.height;
      const scale = Math.min(FIXED_SIZE / imgW, FIXED_SIZE / imgH);
      const newW = Math.round(imgW * scale);
      const newH = Math.round(imgH * scale);
      const offsetX = Math.floor((FIXED_SIZE - newW) / 2);
      const offsetY = Math.floor((FIXED_SIZE - newH) / 2);
      
      letterboxParams = { offsetX, offsetY, newW, newH };
      
      // Draw the image for immediate visual feedback
      ctx.drawImage(img, offsetX, offsetY, newW, newH);
      
      // Run inference in background
      await runInferenceOnImage(img);  // כאן מציירים את המסגרות
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});
  }

  // Auto-detect and parse different YOLO output formats
  function parseDetectionsAuto(output, imgSize, confidenceThreshold) {
    const outputData = output.data;
    const dims = output.dims;
    // Parsing detections
    
    const detections = [];
    
    // Check if this is NMS-ready output (like [1, 300, 6] or [N, 6])
    if (dims.length >= 2 && dims[dims.length - 1] === 6) {
      // Detected NMS-ready format
      
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
      // Detected raw YOLO format
      
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
    
    // Parsed detections from output
    return detections;
  }

  async function runInferenceOnImage(imageElement) {
    if (!session) {
      console.warn("Model not loaded yet.");
      showToast("⚠️ Model not loaded yet, please wait...", "warning");
      return;
    }
    
    if (!ctx) {
      console.warn("Canvas context not available.");
      return;
    }

    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = FIXED_SIZE;
      offscreen.height = FIXED_SIZE;
      const offCtx = offscreen.getContext("2d");

      const imgW = imageElement.width;
      const imgH = imageElement.height;
      const scale = Math.min(FIXED_SIZE / imgW, FIXED_SIZE / imgH);
      const newW = Math.round(imgW * scale);
      const newH = Math.round(imgH * scale);
      const offsetX = Math.floor((FIXED_SIZE - newW) / 2);
      const offsetY = Math.floor((FIXED_SIZE - newH) / 2);

      letterboxParams = { offsetX, offsetY, newW, newH };

      offCtx.fillStyle = "black";
      offCtx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);
      offCtx.drawImage(imageElement, offsetX, offsetY, newW, newH);

      const imageData = offCtx.getImageData(0, 0, FIXED_SIZE, FIXED_SIZE);
      const { data, width, height } = imageData;

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

      // Dynamically get the input nam from the model for robustness
      const inputName = session.inputNames[0];
      const feeds = { [inputName]: tensor };
      const results = await session.run(feeds);
      const outputKey = Object.keys(results)[0];
      const output = results[outputKey];
      
      // Enhanced debug logging after model inference
      // ONNX output processed
      console.log('Output dims:', output.dims, 'Output data length:', output.data.length);
      console.log("Raw outputData sample:", output.data.slice(0, 20));

      // Use auto-detection parser with a low threshold to get all potential boxes
      const parsed = parseDetectionsAuto(output, FIXED_SIZE, 0.01);
      
      // Convert parsed detections to the format expected by applyDetectionFilters
      lastRawBoxes = parsed.map(det => [det.x1, det.y1, det.x2, det.y2, det.score, det.classId]);
      
      updateAndDrawDetections();
    } catch (err) {
      console.error("Error in inference:", err);
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
      const className = classNames[classIndex] || 'unknown';

      const classMinThreshold = CLASS_THRESHOLDS[className] ?? GLOBAL_CONFIDENCE_THRESHOLD;
      const minThreshold = Math.max(confidenceThreshold, classMinThreshold);
      
      // Skip low confidence detections
      if (score < minThreshold) continue;
      
      // Validate coordinates
      if (x1 >= x2 || y1 >= y2) continue;
      
      const width = x2 - x1;
      const height = y2 - y1;
      
      // Filter tiny boxes
      if (width < DETECTION_CONFIG.minBoxSize || height < DETECTION_CONFIG.minBoxSize) continue;
      
      // Filter extreme aspect ratios (likely false positives)
      const aspectRatio = Math.max(width/height, height/width);
      if (aspectRatio > DETECTION_CONFIG.aspectRatioFilter) continue;
      
      // Ensure box is within image bounds
      if (x1 < 0 || y1 < 0 || x2 > FIXED_SIZE || y2 > FIXED_SIZE) continue;
      
      validBoxes.push(box);
    }
    
    // Sort by confidence (highest first)
    validBoxes.sort((a, b) => b[4] - a[4]);
    
    // Limit number of detections
    if (validBoxes.length > DETECTION_CONFIG.maxDetections) {
      validBoxes = validBoxes.slice(0, DETECTION_CONFIG.maxDetections);
    }
    
    // Apply Non-Maximum Suppression (simplified)
    return applyNMS(validBoxes, DETECTION_CONFIG.nmsThreshold);
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
        const threshold = Math.max(confidenceThreshold, DETECTION_CONFIG.minConfidence);
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
      
      // Create hazard details safely
      const fragment = document.createDocumentFragment();
      hazardDetails.forEach((detail, index) => {
        if (index > 0) fragment.appendChild(document.createElement('br'));
        fragment.appendChild(document.createTextNode(detail));
      });
      detectedHazardsEl.replaceChildren(fragment);
    } else {
      detectionInfo.classList.add('hidden');
    }
  }

  // Professional bounding box drawing function
  function drawProfessionalBoundingBox(ctx, options) {
    const { x1, y1, x2, y2, label, confidence, classIndex, detectionIndex, color } = options;
    
    const boxW = x2 - x1;
    const boxH = y2 - y1;
    const scorePerc = (confidence * 100).toFixed(1);
    
    // Save current context state
    ctx.save();
    
    // Calculate dynamic styling based on confidence
    const alpha = Math.min(0.7 + confidence * 0.3, 1.0);
    const lineWidth = Math.max(2, Math.min(6, confidence * 8));
    const cornerSize = Math.max(8, Math.min(16, confidence * 20));
    
    // Set shadow for depth effect
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // Draw main bounding box
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x1, y1, boxW, boxH);
    
    // Reset shadow for corner markers
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Draw professional corner markers
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.min(alpha + 0.2, 1.0);
    
    const cornerThickness = Math.max(2, lineWidth / 2);
    const cornerLength = cornerSize;
    
    // Top-left corner
    ctx.fillRect(x1 - cornerThickness, y1 - cornerThickness, cornerLength, cornerThickness);
    ctx.fillRect(x1 - cornerThickness, y1 - cornerThickness, cornerThickness, cornerLength);
    
    // Top-right corner
    ctx.fillRect(x2 - cornerLength + cornerThickness, y1 - cornerThickness, cornerLength, cornerThickness);
    ctx.fillRect(x2, y1 - cornerThickness, cornerThickness, cornerLength);
    
    // Bottom-left corner
    ctx.fillRect(x1 - cornerThickness, y2, cornerLength, cornerThickness);
    ctx.fillRect(x1 - cornerThickness, y2 - cornerLength + cornerThickness, cornerThickness, cornerLength);
    
    // Bottom-right corner
    ctx.fillRect(x2 - cornerLength + cornerThickness, y2, cornerLength, cornerThickness);
    ctx.fillRect(x2, y2 - cornerLength + cornerThickness, cornerThickness, cornerLength);
    
    // Draw confidence indicator bar
    const confBarWidth = Math.min(boxW * 0.8, 60);
    const confBarHeight = 4;
    const confBarX = x1 + (boxW - confBarWidth) / 2;
    const confBarY = y2 - 8;
    
    // Background bar
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(confBarX, confBarY, confBarWidth, confBarHeight);
    
    // Confidence fill
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = color;
    ctx.fillRect(confBarX, confBarY, confBarWidth * confidence, confBarHeight);
    
    // Professional label design
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    const mainText = label;
    const confText = `${scorePerc}%`;
    const idText = `#${detectionIndex}`;
    
    const mainTextWidth = ctx.measureText(mainText).width;
    const confTextWidth = ctx.measureText(confText).width;
    const idTextWidth = ctx.measureText(idText).width;
    
    const labelPadding = 8;
    const labelSpacing = 4;
    const totalLabelWidth = mainTextWidth + confTextWidth + idTextWidth + labelPadding * 2 + labelSpacing * 2;
    const labelHeight = 22;
    
    // Smart label positioning
    let labelX = x1;
    let labelY = y1 - labelHeight - 4;
    
    // Adjust if label goes outside image bounds
    if (labelX + totalLabelWidth > FIXED_SIZE) {
      labelX = FIXED_SIZE - totalLabelWidth - 4;
    }
    if (labelY < 0) {
      labelY = y2 + 4;
    }
    
    // Draw label background with gradient effect
    ctx.globalAlpha = 0.95;
    
    // Create gradient background
    const gradient = ctx.createLinearGradient(labelX, labelY, labelX, labelY + labelHeight);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, adjustColorBrightness(color, -20));
    
    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, labelX, labelY, totalLabelWidth, labelHeight, 4);
    
    // Draw label text with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 1;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#FFFFFF';
    
    // Main label text
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.fillText(mainText, labelX + labelPadding, labelY + 14);
    
    // Confidence text
    ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#E0E0E0';
    ctx.fillText(confText, labelX + labelPadding + mainTextWidth + labelSpacing, labelY + 14);
    
    // Detection ID
    ctx.font = 'bold 8px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#CCCCCC';
    ctx.fillText(idText, labelX + labelPadding + mainTextWidth + confTextWidth + labelSpacing * 2, labelY + 13);
    
    // Restore context state
    ctx.restore();
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
  
  // Helper function to adjust color brightness
  function adjustColorBrightness(color, amount) {
    const usePound = color[0] === '#';
    const col = usePound ? color.slice(1) : color;
    const num = parseInt(col, 16);
    let r = (num >> 16) + amount;
    let g = (num >> 8 & 0x00FF) + amount;
    let b = (num & 0x0000FF) + amount;
    r = r > 255 ? 255 : r < 0 ? 0 : r;
    g = g > 255 ? 255 : g < 0 ? 0 : g;
    b = b > 255 ? 255 : b < 0 ? 0 : b;
    return (usePound ? '#' : '') + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
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
    if (!ctx) return; // Check if context exists

    hazardTypes = []; // Reset hazard types array
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { offsetX, offsetY, newW, newH } = letterboxParams;

    // Draw background
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);

    if (currentImage) {
      ctx.drawImage(currentImage, offsetX, offsetY, newW, newH);
    }

    hasHazard = false;
    
    let detectionCount = 0;
    boxes.forEach((box, index) => {
      let [x1, y1, x2, y2, score, classId] = box;
      x1 = Math.max(0, Math.min(FIXED_SIZE, x1));
      y1 = Math.max(0, Math.min(FIXED_SIZE, y1));
      x2 = Math.max(0, Math.min(FIXED_SIZE, x2));
      y2 = Math.max(0, Math.min(FIXED_SIZE, y2));
      const classIndex = Math.floor(classId);

      const boxW = x2 - x1;
      const boxH = y2 - y1;

      if (boxW <= 1 || boxH <= 1) return;

      hasHazard = true;
      detectionCount++;

      // Get the correct class name using corrected class ID
      const labelName = classNames[classIndex] || `Unknown Class ${classIndex}`;
      
      console.log(`🔍 Detection: Raw classId=${classId}, Corrected=${classIndex}, Label="${labelName}"`);  // Debug log
      const scorePerc = (score * 100).toFixed(1);

      // Add to hazard types if not already present
      if (!hazardTypes.includes(labelName)) {
        hazardTypes.push(labelName);
      }

      // Professional bounding box drawing
      drawProfessionalBoundingBox(ctx, {
        x1, y1, x2, y2,
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
        coordinates: { x1, y1, x2, y2 },
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
        const response = await fetchWithTimeout("/logout", { method: "GET" });
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
          const response = await fetchWithTimeout("/logout", { method: "GET" });
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