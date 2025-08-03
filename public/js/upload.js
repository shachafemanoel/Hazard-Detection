document.addEventListener("DOMContentLoaded", async function () {
  const imageUpload = document.getElementById("image-upload");
  const confidenceSlider = document.getElementById("confidence-slider");
  const confValueSpan = document.getElementById("conf-value");
  const canvas = document.getElementById("preview-canvas");
  const ctx = canvas ? canvas.getContext("2d") : null; // Check if canvas exists
  const logoutBtn = document.getElementById("logout-btn");
  const saveBtn = document.getElementById("save-detection");
  const uploadingModal = document.getElementById("uploading-modal");

import { notify } from './notifications.js';

  const uploadingModal = new bootstrap.Modal(document.getElementById('uploading-modal'));

  function showUploadingModal() {
    uploadingModal.show();
  }

  function hideUploadingModal() {
    uploadingModal.hide();
  }

  function showToast(message, type = 'success') {
    notify(message, type);
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
            const res = await fetch("/upload-detection", {
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

      // נמחק את התמונה אחרי 5 שניות
      setTimeout(() => {
          const imageInput = document.getElementById('image-upload');
          const imagePreview = document.getElementById('preview-canvas');

          if (imageInput) {
              imageInput.value = ''; // מנקה את שדה העלאת התמונה
          }

          if (imagePreview) {
              const ctx = imagePreview.getContext('2d'); 
              ctx.clearRect(0, 0, imagePreview.width, imagePreview.height);           // נמחק את התמונה המוצגת ב-canvas
          }
      }, 2500);
    }, "image/jpeg", 0.95);
  });
  
  // Enhanced Road Damage Detection Model Configuration
  const FIXED_SIZE = 512; // Optimized for road_damage_detection_last_version.onnx
  
  // Road Damage Classes (mapping to model's 10 classes)
  const classNames = [
    'crack',
    'knocked', 
    'pothole',
    'surface_damage'
  ];
  let session = null;
  
  // Configure ONNX Runtime environment for CPU execution
  // Use CPU execution provider to avoid WASM ES module issues
  console.log('✅ ONNX Runtime loaded, configuring for CPU execution...');

  // Check if ONNX Runtime is loaded
  if (typeof ort === 'undefined') {
    console.error('ONNX Runtime not loaded. Please ensure ort.wasm.min.js is included in the HTML.');
    // Create a script element to load ONNX Runtime dynamically
    const script = document.createElement('script');
    script.src = './ort/ort.wasm.min.js';
    script.onload = () => {
      console.log('ONNX Runtime loaded dynamically');
      // Retry model loading after ONNX Runtime is loaded
      setTimeout(() => location.reload(), 1000);
    };
    document.head.appendChild(script);
    return;
  }

  try {
    // Prioritized model paths - using the latest road damage detection model
    const modelPaths = [
      './object_detection_model/road_damage_detection_last_version.onnx', // Primary model
      './object_detection_model/road_damage_detection_simplified.onnx',   // Fallback 1
      './object_detection_model/model 18_7.onnx'                         // Fallback 2
    ];
    
    let modelPath = null;
    for (const path of modelPaths) {
      try {
        // URL encode the path to handle spaces in filenames
        const encodedPath = encodeURI(path);
        const response = await fetch(encodedPath, { method: 'HEAD' });
        if (response.ok) {
          modelPath = encodedPath;
          console.log(`✅ Found ONNX model at: ${path}`);
          break;
        }
      } catch (e) {
        console.log(`❌ Failed to access model at ${path}:`, e.message);
        // Continue to next path
      }
    }
    
    if (!modelPath) {
      throw new Error('No ONNX model found in any of the expected locations');
    }

    // Create session with CPU execution provider only (avoid WASM ES module issues)
    const executionProviders = ['cpu'];
    console.log('✅ Using CPU execution provider');
    
    session = await ort.InferenceSession.create(
      modelPath,
      { 
        executionProviders: executionProviders,
        graphOptimizationLevel: 'disabled', // Disable optimizations for stability
        enableCpuMemArena: false,
        logSeverityLevel: 2 // Reduce logging
      }
    );
    
    console.log("✅ YOLO model loaded!");
  } catch (err) {
    console.error("❌ Failed to load model:", err);
  }

  let confidenceThreshold = parseFloat(confidenceSlider.value);
  confidenceSlider.addEventListener("input", (e) => {
    confidenceThreshold = parseFloat(e.target.value);
    confValueSpan.textContent = confidenceThreshold;
    if (currentImage) {
      runInferenceOnImage(currentImage);
    }
  });

  let currentImage = null;
  let letterboxParams = { offsetX: 0, offsetY: 0, newW: FIXED_SIZE, newH: FIXED_SIZE };

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

  // 2. תמיד תציג תצוגה ותריץ את המודל
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = async () => {
      currentImage = img;
      canvas.width  = FIXED_SIZE;
      canvas.height = FIXED_SIZE;
      await runInferenceOnImage(img);  // כאן מציירים את המסגרות
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});
  }

  async function runInferenceOnImage(imageElement) {
    if (!session) {
      console.warn("Model not loaded yet or canvas not found.");
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
      const feeds = { images: tensor };

      const results = await session.run(feeds);
      const outputKey = Object.keys(results)[0];
      const outputData = results[outputKey].data;

      console.log("Raw outputData:", outputData);

      // Enhanced detection parsing with filtering
      const rawBoxes = [];
      for (let i = 0; i < outputData.length; i += 6) {
        const box = outputData.slice(i, i + 6);
        rawBoxes.push(box);
      }

      // Apply intelligent filtering for road damage detection
      const filteredBoxes = applyDetectionFilters(rawBoxes);
      
      console.log(`Detection Results: ${rawBoxes.length} raw → ${filteredBoxes.length} filtered`);
      console.log("Top detections:", filteredBoxes.slice(0, 5));
      
      drawResults(filteredBoxes);
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

  // Enhanced detection filtering for road damage
  function applyDetectionFilters(boxes) {
    let validBoxes = [];
    
    // Filter by confidence, size and aspect ratio
    for (const box of boxes) {
      let [x1, y1, x2, y2, score, classId] = box;
      
      // Fix class ID mapping - model outputs class_id + 1, so subtract 1
      const correctedClassId = Math.floor(classId) - 1;
      const classIndex = Math.max(0, correctedClassId); // Ensure non-negative
      
      // Use class-specific confidence thresholds if available
      const minThreshold = DETECTION_CONFIG.classThresholds[classIndex] || DETECTION_CONFIG.minConfidence;
      
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
          const correctedClassId = Math.floor(box[5]) - 1;
          const classIndex = Math.max(0, correctedClassId);
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
    const tooltip = document.getElementById("tooltip");
    
    // Enhanced color scheme for different road damage types
    const hazardColors = {
      'Alligator Crack': '#FF4444',    // Red - Critical structural damage
      'Block Crack': '#FF6600',        // Red-Orange - Significant cracking
      'Crosswalk Blur': '#4444FF',     // Blue - Safety marking issues
      'Lane Blur': '#6644FF',          // Purple - Traffic marking issues  
      'Longitudinal Crack': '#FF8844', // Orange - Directional cracking
      'Manhole': '#888888',            // Gray - Infrastructure elements
      'Patch Repair': '#44FF88',       // Green - Previous repairs
      'Pothole': '#FF0088',            // Pink - Critical surface damage
      'Transverse Crack': '#FFAA44',   // Light Orange - Cross cracking
      'Wheel Mark Crack': '#AA4444'    // Dark Red - Load-induced damage
    };

    let detectionCount = 0;
    boxes.forEach((box, index) => {
      let [x1, y1, x2, y2, score, classId] = box;
      
      // Fix class ID mapping - model outputs class_id + 1, so subtract 1
      const correctedClassId = Math.floor(classId) - 1;
      const classIndex = Math.max(0, correctedClassId); // Ensure non-negative
      
      // Use class-specific confidence threshold or dynamic threshold
      const classThreshold = DETECTION_CONFIG.classThresholds[classIndex] || DETECTION_CONFIG.minConfidence;
      const threshold = Math.max(confidenceThreshold, classThreshold);
      if (score < threshold) return;

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