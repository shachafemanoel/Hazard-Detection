import { saveReport } from "./apiClient.js";

// DOM Elements
const videoElement = document.getElementById("camera-stream");
const canvasElement = document.getElementById("overlay-canvas");
const startButton = document.getElementById("start-camera");
const stopButton = document.getElementById("stop-camera");
const loadingIndicator = document.getElementById("loading-overlay");
const loadingStatus = document.getElementById("loading-status");

// --- UI Elements for results ---
const detectionCountBadge = document.getElementById("detection-count-badge");
const hazardTypesList = document.getElementById("hazard-types-list");
const hazardTypesDisplay = document.getElementById("hazard-types-display");
const fpsBadge = document.getElementById("fps-badge"); // For FPS counter

// Detection state
let isDetecting = false;
let session; // ONNX session
let animationFrameId;
const model_dim = [480, 480]; // Model input dimensions

// FPS calculation
let lastFrameTime = 0;
let frameCount = 0;
let fps = 0;

const model_path = "../object_detection_model/best0408.onnx";
const classes = [
  "dumpster",
  "vent",
  "bikes",
  "sign",
  "construction",
  "trashcan",
  "vape",
  "truck",
  "person",
  "car",
  "bus",
  "motorcycle",
  "scooter",
  "bench",
  "hydrant",
  "chair",
  "table",
  "door",
  "window",
  "stairs",
  "ramp",
  "elevator",
  "escalator",
  "column",
  "crosswalk",
  "curb",
  "pothole",
  "crack",
  "graffiti",
  "garbage",
  "spill",
  "blockage",
  "animal",
  "plant",
  "fire",
  "smoke",
  "flood",
  "wires",
  "fallen_object",
  "emergency_vehicle",
  "police",
  "ambulance",
  "fire_truck",
  "traffic_light",
  "stop_sign",
  "cone",
  "barricade",
  "fence",
  "wall",
  "railing",
  "camera",
  "speaker",
  "intercom",
  "alarm",
  "extinguisher",
  "first_aid",
  "phone",
  "person_with_disability",
  "guide_dog",
  "wheelchair",
  "stroller",
  "baby",
  "child",
  "adult",
  "senior",
  "male",
  "female",
  "crowd",
  "homeless_person",
  "protest",
  "fight",
  "accident",
  "injury",
  "weapon",
  "gun",
  "knife",
  "bat",
  "club",
  "homeless_encampment",
  "tent",
  "sleeping_bag",
  "cart",
  "bag",
  "box",
  "luggage",
  "bottle",
  "can",
  "cup",
  "cigarette",
  "drug_paraphernalia",
  "needle",
  "pipe",
  "syringe",
  "puddle",
  "ice",
  "snow",
  "leaves",
  "debris",
  "construction_site",
  "crane",
  "excavator",
  "bulldozer",
  "scaffolding",
  "manhole",
  "grate",
  "sewer",
  "power_line",
  "transformer",
  "utility_pole",
  "billboard",
  "poster",
  "banner",
  "awning",
  "canopy",
  "shed",
  "garage",
  "parking_meter",
  "newsstand",
  "kiosk",
  "vending_machine",
  "atm",
  "mailbox",
  "trash_compactor",
  "recycling_bin",
  "dumpster_fire",
  "abandoned_vehicle",
  "flat_tire",
  "broken_window",
  "graffiti_removal",
  "street_sweeper",
  "delivery_truck",
  "food_cart",
  "street_performer",
  "musician",
  "artist",
  "panhandler",
  "beggar",
  "preacher",
  "activist",
  "security_guard",
  "police_officer",
  "firefighter",
  "paramedic",
  "utility_worker",
  "construction_worker",
  "maintenance_worker",
  "janitor",
  "custodian",
  "gardener",
  "landscaper",
  "dog_walker",
  "runner",
  "jogger",
  "cyclist",
  "skater",
  "skateboarder",
  "rollerblader",
  "scooter_rider",
  "tourist",
  "resident",
  "commuter",
  "student",
  "teacher",
  "parent",
  "guardian",
  "nanny",
  "caregiver",
  "delivery_person",
  "mail_carrier",
  "courier",
  "messenger",
  "vendor",
  "shopkeeper",
  "cashier",
  "waiter",
  "waitress",
  "bartender",
  "barista",
  "chef",
  "cook",
  "host",
  "hostess",
  "manager",
  "owner",
  "employee",
  "customer",
  "client",
  "patient",
  "visitor",
  "guest",
  "member",
  "user",
  "spectator",
  "audience",
  "congregation",
  "passenger",
  "driver",
  "pedestrian",
  "bystander",
  "witness",
  "victim",
  "suspect",
  "criminal",
  "offender",
  "person_of_interest",
];

// --- Initialization ---
async function initialize() {
  if (!startButton || !stopButton || !loadingIndicator) {
    console.error("Required UI elements are missing from the page.");
    return;
  }
  startButton.addEventListener("click", startCamera);
  stopButton.addEventListener("click", stopCamera);
  await loadModel();
}

// --- Model Loading ---
async function loadModel() {
  console.log("Loading model...");
  loadingIndicator.style.display = "flex";
  if (loadingStatus) loadingStatus.textContent = "Loading AI Model...";

  try {
    session = await ort.InferenceSession.create(model_path, {
      executionProviders: ["wasm"],
    });
    console.log("Model loaded successfully.");
    startButton.disabled = false;
    if (loadingStatus) loadingStatus.textContent = "Model Ready";
  } catch (error) {
    console.error("Failed to load the model:", error);
    if (loadingStatus)
      loadingStatus.textContent = "Error: Model Failed to Load";
    if (typeof notify === "function") {
      notify(
        "Error: Could not load the detection model. Please refresh and try again.",
        "error",
      );
    }
  } finally {
    // Hide loading indicator after a short delay to show status
    setTimeout(() => {
      loadingIndicator.style.display = "none";
    }, 1500);
  }
}

// --- Camera Controls ---
async function startCamera() {
  if (isDetecting || !session) {
    if (!session) {
      console.warn("Detection started before model was ready.");
      if (typeof notify === "function")
        notify("Model not loaded. Cannot start detection.", "warning");
    }
    return;
  }
  isDetecting = true;
  startButton.style.display = "none";
  stopButton.style.display = "block";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    videoElement.srcObject = stream;
    videoElement.onloadedmetadata = () => {
      videoElement.play();
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      lastFrameTime = performance.now();
      detectionLoop();
    };
  } catch (err) {
    console.error("Error accessing camera:", err);
    if (typeof notify === "function") {
      notify(
        "Could not access camera. Please grant permission and ensure a camera is available.",
        "error",
      );
    }
    isDetecting = false;
    startButton.style.display = "block";
    stopButton.style.display = "none";
  }
}

function stopCamera() {
  if (!isDetecting) return;
  isDetecting = false;
  startButton.style.display = "block";
  stopButton.style.display = "none";

  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
    videoElement.srcObject = null;
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  const ctx = canvasElement.getContext("2d");
  ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  // Reset UI
  if (detectionCountBadge) detectionCountBadge.textContent = "0 hazards";
  if (hazardTypesDisplay) hazardTypesDisplay.style.display = "none";
  if (hazardTypesList) hazardTypesList.textContent = "No hazards";
  if (fpsBadge) fpsBadge.textContent = "0 FPS";
}

// --- Detection Loop ---
async function detectionLoop() {
  if (!isDetecting) return;

  const frame = await captureFrame();
  if (frame) {
    try {
      const tensor = preprocess(frame, model_dim);
      const feeds = { images: tensor };
      const results = await session.run(feeds);
      const outputKey = Object.keys(results)[0];
      const detections = postprocess(
        results[outputKey],
        model_dim,
        frame.width,
        frame.height,
      );

      drawResults(detections, frame);
      if (detections.length > 0) {
        handleSaveDetection(detections, frame);
      }
    } catch (error) {
      console.error("Error during detection:", error);
    }
  }

  // Calculate FPS
  const now = performance.now();
  frameCount++;
  if (now - lastFrameTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFrameTime = now;
    if (fpsBadge) fpsBadge.textContent = `${fps} FPS`;
  }

  animationFrameId = requestAnimationFrame(detectionLoop);
}

async function captureFrame() {
  if (videoElement.readyState < 2) return null; // Not ready
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = videoElement.videoWidth;
  tempCanvas.height = videoElement.videoHeight;
  const ctx = tempCanvas.getContext("2d");
  ctx.drawImage(videoElement, 0, 0, tempCanvas.width, tempCanvas.height);
  return tempCanvas;
}

// --- Pre-processing ---
function preprocess(source, model_dim) {
  const [model_width, model_height] = model_dim;
  const [input_width, input_height] = [source.width, source.height];

  const ratio = Math.min(
    model_width / input_width,
    model_height / input_height,
  );
  const new_width = Math.round(input_width * ratio);
  const new_height = Math.round(input_height * ratio);

  const C = document.createElement("canvas");
  C.width = model_width;
  C.height = model_height;
  const ctx = C.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, model_width, model_height);

  const x_offset = (model_width - new_width) / 2;
  const y_offset = (model_height - new_height) / 2;
  ctx.drawImage(source, x_offset, y_offset, new_width, new_height);

  const image_data = ctx.getImageData(0, 0, model_width, model_height);
  const data = image_data.data;

  const red = [],
    green = [],
    blue = [];
  for (let i = 0; i < data.length; i += 4) {
    red.push(data[i] / 255.0);
    green.push(data[i + 1] / 255.0);
    blue.push(data[i + 2] / 255.0);
  }
  const transposed = red.concat(green, blue);
  const float32_data = new Float32Array(transposed);

  return new ort.Tensor("float32", float32_data, [
    1,
    3,
    model_height,
    model_width,
  ]);
}

// --- Post-processing ---
function postprocess(output, model_dim, original_width, original_height) {
  if (!output || !output.data) {
    console.error("Invalid model output received for postprocessing.");
    return [];
  }
  const [model_width, model_height] = model_dim;
  const boxes = [];
  const data = output.data;

  for (let i = 0; i < data.length; i += 6) {
    const [x1, y1, x2, y2, score, classId] = data.slice(i, i + 6);
    if (score < 0.5) continue;

    const scaleX = original_width / model_width;
    const scaleY = original_height / model_height;

    boxes.push({
      box: [x1 * scaleX, y1 * scaleY, x2 * scaleX, y2 * scaleY],
      label: classes[Math.floor(classId)] || `class_${classId}`,
      score: score,
    });
  }
  return nms(boxes, 0.5);
}

// --- NMS (Non-Maximum Suppression) ---
function nms(boxes, iou_threshold) {
  boxes.sort((a, b) => b.score - a.score);
  const result = [];
  while (boxes.length > 0) {
    result.push(boxes[0]);
    boxes = boxes.filter((box) => iou(boxes[0], box) < iou_threshold);
  }
  return result;
}

function iou(box1, box2) {
  const [x1, y1, x2, y2] = box1.box;
  const [x3, y3, x4, y4] = box2.box;

  const inter_x1 = Math.max(x1, x3);
  const inter_y1 = Math.max(y1, y3);
  const inter_x2 = Math.min(x2, x4);
  const inter_y2 = Math.min(y2, y4);

  const inter_area =
    Math.max(0, inter_x2 - inter_x1) * Math.max(0, inter_y2 - inter_y1);
  const box1_area = (x2 - x1) * (y2 - y1);
  const box2_area = (x4 - x3) * (y4 - y3);

  return inter_area / (box1_area + box2_area - inter_area);
}

// --- Drawing and Reporting ---
function drawResults(detections, source) {
  const ctx = canvasElement.getContext("2d");
  ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  ctx.drawImage(source, 0, 0, canvasElement.width, canvasElement.height);

  // Update UI badges
  if (detectionCountBadge)
    detectionCountBadge.textContent = `${detections.length} hazard${detections.length === 1 ? "" : "s"}`;
  if (detections.length > 0) {
    if (hazardTypesDisplay) hazardTypesDisplay.style.display = "flex";
    const uniqueLabels = [...new Set(detections.map((d) => d.label))];
    if (hazardTypesList) hazardTypesList.textContent = uniqueLabels.join(", ");
  } else {
    if (hazardTypesDisplay) hazardTypesDisplay.style.display = "none";
  }

  detections.forEach((det) => {
    const [x1, y1, x2, y2] = det.box;
    const label = `${det.label} (${det.score.toFixed(2)})`;
    ctx.strokeStyle = "#00FF00";
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    ctx.fillStyle = "#00FF00";
    ctx.font = "16px sans-serif";
    const textWidth = ctx.measureText(label).width;
    ctx.fillRect(x1 - 1, y1 - 18, textWidth + 4, 20);
    ctx.fillStyle = "#000000";
    ctx.fillText(label, x1 + 1, y1 - 2);
  });
}

let lastSaveTime = 0;
const SAVE_INTERVAL = 5000; // 5 seconds

function handleSaveDetection(detections, frameCanvas) {
  const now = Date.now();
  if (now - lastSaveTime < SAVE_INTERVAL) {
    return; // Debounce saving
  }
  lastSaveTime = now;

  console.log("Preparing to save detection:", detections);

  frameCanvas.toBlob(
    async (blob) => {
      if (!blob) {
        console.error("Failed to create blob from canvas.");
        return;
      }
      const reportData = {
        timestamp: new Date().toISOString(),
        latitude: null, // No EXIF for live video
        longitude: null,
        detections: detections.map((d) => ({
          box: d.box,
          label: d.label,
          score: d.score,
        })),
        imageBlob: blob,
        imageName: `detection-${Date.now()}.jpg`,
      };

      try {
        await saveReport(reportData);
        console.log("Report saved successfully.");
        if (typeof notify === "function") {
          notify(
            `Report with ${detections.length} hazard(s) saved.`,
            "success",
          );
        }
      } catch (error) {
        console.error("Error saving report:", error);
        if (typeof notify === "function") {
          notify("Error saving report. See console for details.", "error");
        }
      }
    },
    "image/jpeg",
    0.8,
  );
}

// --- Start ---
document.addEventListener("DOMContentLoaded", initialize);
