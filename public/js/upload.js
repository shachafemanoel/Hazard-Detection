document.addEventListener("DOMContentLoaded", async function () {
  const imageUpload = document.getElementById("image-upload");
  const confidenceSlider = document.getElementById("confidence-slider");
  const confValueSpan = document.getElementById("conf-value");
  const canvas = document.getElementById("preview-canvas");
  const ctx = canvas.getContext("2d");
  const logoutBtn = document.getElementById("logout-btn");
  const saveBtn = document.getElementById("save-detection");

  let geoData = null;

  function getGeoDataFromImage(file) {
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
  if (!geoData) return alert("❌ Cannot save report without geolocation data.");

  canvas.toBlob(async (blob) => {
      if (!blob) return alert("❌ Failed to get image blob");
  
      const file = new File([blob], "detection.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("geoData", geoData);  // הוספת המיקום לפורם דאטה
      formData.append("hazardTypes", hazardTypes.join(","));
      formData.append("locationNote","GPS");


      try {
          const res = await fetch("/upload-detection", {
              method: "POST",
              body: formData,
              credentials: "include",
          });
  
          const result = await res.json();
          alert("✅ Saved to server: " + result.message + "\n📸 " + result.url);
      } catch (err) {
          alert("❌ Failed to save image");
          console.error(err);
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
  
  // המודל (YOLO באון-אן-אקס) מיוצא לגודל 640x640
  const FIXED_SIZE =640;

  // רשימת המחלקות
  const classNames = ['Alligator Crack', 'Block Crack', 'Construction Joint Crack', 'Crosswalk Blur', 'Lane Blur', 'Longitudinal Crack', 'Manhole', 'Patch Repair', 'Pothole', 'Transverse Crack', 'Wheel Mark Crack'];

  let session = null;
  
  ort.env.wasm.wasmPaths = '/ort/';  


  try {
    session = await ort.InferenceSession.create(
      '/object_detecion_model/road_damage_detection_last_version.onnx',
      { executionProviders: ['cpu'] }
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
      if (!file) return;
    
      geoData = await getGeoDataFromImage(file);
      
      if (geoData) {
        // אם יש מידע גיאוגרפי, נמשיך עם שמירת הדיווח
        const reader = new FileReader();
        reader.onload = function (e) {
          const img = new Image();
          img.onload = async function () {
            currentImage = img;
            canvas.width = FIXED_SIZE;
            canvas.height = FIXED_SIZE;
            await runInferenceOnImage(img);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        // אם אין מידע גיאוגרפי, הצג הודעה למשתמש
        alert("❌ No geolocation data found in the image MetaData. Please provide a valid location.");
      }
    });
  }

  async function runInferenceOnImage(imageElement) {
    if (!session) {
      console.warn("Model not loaded yet.");
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

      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, boxW, boxH);

      ctx.fillStyle = "red";
      ctx.font = "16px Arial";
      ctx.fillText(`${labelName} (${scorePerc}%)`, x1, y1 > 10 ? y1 - 5 : 10);
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

saveBtn.addEventListener("mousemove", (e) => {
  if (saveBtn.disabled && saveBtn.dataset.tooltip) {
    tooltip.textContent = saveBtn.dataset.tooltip;
    tooltip.style.left = `${e.pageX + 10}px`;
    tooltip.style.top = `${e.pageY + 10}px`;
    tooltip.style.display = "block";
  }
});

saveBtn.addEventListener("mouseleave", () => {
  tooltip.style.display = "none";
});

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
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
});