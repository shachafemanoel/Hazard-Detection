document.addEventListener("DOMContentLoaded", async function () {
  // אלמנטים של מסך הבית וממשק ההעלאה
  const homeScreenContent = document.getElementById('home-screen-content');
  const detectionSection = document.getElementById('detection-section');
  const showUploadSectionBtn = document.getElementById('show-upload-section-btn');
  const closeUploadSectionBtn = document.getElementById('close-upload-section-btn');

  const imageUpload = document.getElementById("image-upload");
  const confidenceSlider = document.getElementById("confidence-slider");
  const confValueSpan = document.getElementById("conf-value");
  const canvas = document.getElementById("preview-canvas");
  const ctx = canvas ? canvas.getContext("2d") : null; // Check if canvas exists
  const logoutBtn = document.getElementById("logout-btn");
  const saveBtn = document.getElementById("save-detection");

  // Toast Notification Elements
  const toastElement = document.getElementById('toast-notification');
  const toastBody = document.getElementById('toast-body');

  function showToast(message, type = 'success') {
    if (!toastElement || !toastBody) return;

    toastBody.textContent = message;
    toastElement.classList.remove('bg-success', 'bg-danger', 'bg-warning'); // Remove previous classes

    if (type === 'success') {
      toastElement.classList.add('bg-success');
    } else if (type === 'error') {
      toastElement.classList.add('bg-danger');
    } // Add more types like 'warning' if needed

    toastElement.style.display = 'block';
    setTimeout(() => {
      toastElement.style.display = 'none';
    }, 5000); // Hide after 5 seconds
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

  // ניהול תצוגת מסך הבית וממשק ההעלאה
  if (showUploadSectionBtn && homeScreenContent && detectionSection) {
    showUploadSectionBtn.addEventListener('click', () => {
      homeScreenContent.style.display = 'none';
      detectionSection.style.display = 'block';
    });
  }

  if (closeUploadSectionBtn && homeScreenContent && detectionSection) {
    closeUploadSectionBtn.addEventListener('click', () => {
      detectionSection.style.display = 'none';
      homeScreenContent.style.display = 'block';
      // איפוס אופציונלי של שדות וקנבס בעת סגירה
      if (imageUpload) {
        imageUpload.value = ''; // מנקה את שדה העלאת התמונה
      }
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // נמחק את התמונה המוצגת ב-canvas
      }
      if (confValueSpan && confidenceSlider) {
        confValueSpan.textContent = confidenceSlider.value; // מאפס את תצוגת הסף
      }
      currentImage = null; // מאפס את התמונה הנוכחית
      geoData = null; // מאפס נתוני מיקום
      if (saveBtn) saveBtn.disabled = true; // מנטרל כפתור שמירה
      const tooltip = document.getElementById("tooltip");
      if (tooltip) tooltip.style.display = "none";
    });
  }


// שמירת התמונה והנתונים
saveBtn.addEventListener("click", () => {
  if (!canvas) {
    showToast("❌ Canvas element not found.", "error");
    return;
  }

  if (!geoData) {
    showToast("❌ Cannot save report without geolocation data.", "error");
    return;
  }

  canvas.toBlob(async (blob) => {
      if (!blob) return alert("❌ Failed to get image blob");
  
      const reader = new FileReader();
      reader.onloadend = async () => {
          const base64Image = reader.result;
          let location = "Unknown";
          try {
              const { lat, lng } = JSON.parse(geoData);
              location = `Coordinates: ${lat}, ${lng}`;
          } catch (e) {
              console.warn("Failed to parse geolocation data", e);
          }

          const reportData = {
              type: hazardTypes.join(","),
              location,
              time: new Date().toISOString(),
              image: base64Image,
              status: "New",
              reportedBy: "anonymous",
              locationNote: "GPS"
          };

          try {
              const res = await fetch("/api/reports", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(reportData),
                  credentials: "include",
              });

              const result = await res.json();
              showToast("✅ Saved to server: " + result.message, "success");
          } catch (err) {
              showToast("❌ Failed to save image to server.", "error");
              console.error(err);
          }
      };
      reader.readAsDataURL(blob);

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
  
  // המודל (YOLO באון-אן-אקס) מיוצא לגודל 640x640
  const FIXED_SIZE =640;

  // רשימת המחלקות
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
    // Enhanced model path detection with fallbacks
    const modelPaths = [
      './object_detecion_model/model 18_7.onnx',
      './object_detecion_model/road_damage_detection_last_version.onnx',
      './object_detecion_model/last_model_train12052025.onnx',
      './object_detecion_model/road_damage_detection_simplified.onnx'
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

      const boxes = [];
      for (let i = 0; i < outputData.length; i += 6) {
        const box = outputData.slice(i, i + 6);
        boxes.push(box);
      }

      console.log("Parsed boxes:", boxes.slice(0, 5));
      drawResults(boxes);
    } catch (err) {
      console.error("Error in inference:", err);
    }
  }

  let hazardTypes = [];
  let hasHazard = false;

  function drawResults(boxes) {
    if (!ctx) return; // Check if context exists

    hazardTypes = []; // מאתחל את המערך של סוגי המפגעים
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { offsetX, offsetY, newW, newH } = letterboxParams;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, FIXED_SIZE, FIXED_SIZE);

    if (currentImage) {
      ctx.drawImage(currentImage, offsetX, offsetY, newW, newH);
    }

    hasHazard = false; // משתנה שמבצע את הבדיקה אם יש מפגע
    const tooltip = document.getElementById("tooltip");

    boxes.forEach((box) => {
      let [x1, y1, x2, y2, score, classId] = box;
      if (score < confidenceThreshold) return;

      const boxW = x2 - x1;
      const boxH = y2 - y1;

      if (boxW <= 1 || boxH <= 1 || boxW > FIXED_SIZE || boxH > FIXED_SIZE) return;

      // אם מצאנו לפחות קופסה שמאובחנת כמפגע, נעדכן את המשתנה
      hasHazard = true;

      const labelName = classNames[Math.floor(classId)] || `Class ${classId}`;
      const scorePerc = (score * 100).toFixed(1);

      // מוסיפים את סוג המפגע למערך אם הוא לא כבר שם
      if (!hazardTypes.includes(labelName)) {
      hazardTypes.push(labelName);
      }
      console.log("Hazard types:", hazardTypes);

      // --- שינוי סגנון התיבות ---
      const color = '#00FF00'; // ירוק בהיר
      ctx.strokeStyle = color;
      ctx.lineWidth = 3; // קו עבה יותר
      ctx.strokeRect(x1, y1, boxW, boxH);

      // --- שינוי סגנון הטקסט והוספת רקע ---
      ctx.fillStyle = color;
      ctx.font='bold 16px Arial'; // פונט מודגש
      const textWidth = ctx.measureText(`${labelName} (${scorePerc}%)`).width;
      // מיקום הרקע מעל התיבה, עם התאמה אם התיבה קרובה לקצה העליון
      const textBgX = x1;
      const textBgY = y1 > 20 ? y1 - 20 : y1;
      const textBgWidth = textWidth + 8; // רוחב הטקסט + ריווח קטן
      const textBgHeight = 20; // גובה קבוע לרקע הטקסט
      ctx.fillRect(textBgX, textBgY, textBgWidth, textBgHeight); // רקע לטקסט
      ctx.fillStyle = 'black'; // צבע טקסט שחור על הרקע הבהיר
      ctx.fillText(`${labelName} (${scorePerc}%)`, textBgX + 4, textBgY + 15); // מיקום הטקסט בתוך הרקע
    });

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