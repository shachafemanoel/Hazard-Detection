import { syncCanvasToVideo, drawBoxes } from './draw.js';
import { reportError, ErrorCodes, toastOnce } from './notifications.js';

const MODEL_PATH = '/object_detecion_model/best.onnx';
const INPUT_SIZE = 640;

let session; // onnx session
let stream;
let ctx;
let rafId = 0;
let devices = [];
let currentDevice = null;

async function getSession() {
  if (session) return session;
  try {
    session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    });
  } catch (e) {
    reportError(ErrorCodes.MODEL_LOAD, e);
    throw e;
  }
  try {
    const dummy = new ort.Tensor('float32', new Float32Array(INPUT_SIZE * INPUT_SIZE * 3), [1, 3, INPUT_SIZE, INPUT_SIZE]);
    await session.run({ images: dummy });
  } catch (e) {
    reportError(ErrorCodes.MODEL_WARMUP, e);
  }
  return session;
}

function preprocess(video) {
  const off = document.createElement('canvas');
  off.width = INPUT_SIZE;
  off.height = INPUT_SIZE;
  const offCtx = off.getContext('2d', { willReadFrequently: true });
  const scale = Math.min(INPUT_SIZE / video.videoWidth, INPUT_SIZE / video.videoHeight);
  const nw = video.videoWidth * scale;
  const nh = video.videoHeight * scale;
  const ox = (INPUT_SIZE - nw) / 2;
  const oy = (INPUT_SIZE - nh) / 2;
  offCtx.fillStyle = '#000';
  offCtx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  offCtx.drawImage(video, ox, oy, nw, nh);
  const imgData = offCtx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  const data = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
  for (let i = 0, j = 0; i < imgData.length; i += 4, j += 3) {
    data[j] = imgData[i] / 255;
    data[j + 1] = imgData[i + 1] / 255;
    data[j + 2] = imgData[i + 2] / 255;
  }
  const tensor = new ort.Tensor('float32', data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  return { tensor, scale, ox, oy };
}

function postprocess(output, params) {
  const key = Object.keys(output)[0];
  const arr = output[key].data;
  const boxes = [];
  for (let i = 0; i < arr.length; i += 6) {
    const x1 = arr[i];
    const y1 = arr[i + 1];
    const x2 = arr[i + 2];
    const y2 = arr[i + 3];
    const score = arr[i + 4];
    const cls = arr[i + 5];
    if (score < 0.25) continue;
    const px1 = (x1 - params.ox) / params.scale;
    const py1 = (y1 - params.oy) / params.scale;
    const px2 = (x2 - params.ox) / params.scale;
    const py2 = (y2 - params.oy) / params.scale;
    boxes.push({
      x: px1,
      y: py1,
      w: px2 - px1,
      h: py2 - py1,
      score,
      label: `class ${cls}`
    });
  }
  return boxes;
}

async function detect(video) {
  try {
    const s = await getSession();
    const { tensor, ...params } = preprocess(video);
    const result = await s.run({ images: tensor });
    const boxes = postprocess(result, params);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawBoxes(ctx, boxes);
  } catch (e) {
    reportError(ErrorCodes.INFERENCE, e);
  }
  rafId = requestAnimationFrame(() => detect(video));
}

async function startCamera(deviceId) {
  try {
    if (stream) await stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined } });
    const video = document.getElementById('camera-stream');
    const canvas = document.getElementById('overlay-canvas');
    video.srcObject = stream;
    await video.play();
    ctx = syncCanvasToVideo(video, canvas);
    toastOnce('mode', 'Local ONNX active');
    detect(video);
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => {
      stopCamera();
      reportError(ErrorCodes.CAMERA_INACTIVE);
    });
  } catch (e) {
    reportError(ErrorCodes.CAMERA_PERMISSION, e);
  }
}

export async function stopCamera() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

async function listDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    devices = all.filter(d => d.kind === 'videoinput');
    const select = document.getElementById('camera-select');
    select.innerHTML = '';
    devices.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Camera ${i + 1}`;
      select.appendChild(opt);
    });
    if (devices[0]) currentDevice = devices[0].deviceId;
  } catch (e) {
    reportError(ErrorCodes.CAMERA_PERMISSION, e);
  }
}

async function switchCamera() {
  if (devices.length < 2) return;
  const idx = devices.findIndex(d => d.deviceId === currentDevice);
  const next = devices[(idx + 1) % devices.length];
  currentDevice = next.deviceId;
  await startCamera(currentDevice).catch(e => reportError(ErrorCodes.CAMERA_SWITCH, e));
}

function bindUI() {
  const startBtn = document.getElementById('start-camera');
  const stopBtn = document.getElementById('stop-camera');
  const switchBtn = document.getElementById('switch-camera');
  const select = document.getElementById('camera-select');
  if (startBtn) startBtn.addEventListener('click', () => startCamera(select.value));
  if (stopBtn) stopBtn.addEventListener('click', stopCamera);
  if (switchBtn) switchBtn.addEventListener('click', switchCamera);
  if (select) select.addEventListener('change', e => {
    currentDevice = e.target.value;
    startCamera(currentDevice);
  });
}

async function init() {
  const badge = document.getElementById('mode-badge');
  if (badge) badge.textContent = 'Local ONNX';
  await listDevices();
  bindUI();
}

document.addEventListener('DOMContentLoaded', init);
