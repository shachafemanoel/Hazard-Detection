import { reportError, ErrorCodes, toastOnce } from './notifications.js';
import { syncCanvasToImage, drawBoxes } from './draw.js';

const MODEL_PATH = '/object_detecion_model/best.onnx';
const INPUT_SIZE = 640;
let session;

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
    const dummy = new ort.Tensor('float32', new Float32Array(INPUT_SIZE * INPUT_SIZE * 3), [1,3,INPUT_SIZE,INPUT_SIZE]);
    await session.run({ images: dummy });
  } catch (e) {
    reportError(ErrorCodes.MODEL_WARMUP, e);
  }
  return session;
}

function preprocess(img) {
  const off = document.createElement('canvas');
  off.width = INPUT_SIZE;
  off.height = INPUT_SIZE;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  const scale = Math.min(INPUT_SIZE / img.naturalWidth, INPUT_SIZE / img.naturalHeight);
  const nw = img.naturalWidth * scale;
  const nh = img.naturalHeight * scale;
  const ox = (INPUT_SIZE - nw) / 2;
  const oy = (INPUT_SIZE - nh) / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(img, ox, oy, nw, nh);
  const data = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  const arr = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
  for (let i=0,j=0;i<data.length;i+=4,j+=3){
    arr[j] = data[i]/255;
    arr[j+1] = data[i+1]/255;
    arr[j+2] = data[i+2]/255;
  }
  const tensor = new ort.Tensor('float32', arr, [1,3,INPUT_SIZE,INPUT_SIZE]);
  return { tensor, scale, ox, oy };
}

function postprocess(output, params, threshold){
  const key = Object.keys(output)[0];
  const data = output[key].data;
  const boxes=[];
  for(let i=0;i<data.length;i+=6){
    const x1=data[i];
    const y1=data[i+1];
    const x2=data[i+2];
    const y2=data[i+3];
    const score=data[i+4];
    const cls=data[i+5];
    if(score<threshold) continue;
    const px1=(x1-params.ox)/params.scale;
    const py1=(y1-params.oy)/params.scale;
    const px2=(x2-params.ox)/params.scale;
    const py2=(y2-params.oy)/params.scale;
    boxes.push({x:px1,y:py1,w:px2-px1,h:py2-py1,score,label:`class ${cls}`});
  }
  return boxes;
}

function loadImage(file){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=URL.createObjectURL(file);
  });
}

async function handleFile(file){
  if(!file) return;
  try{
    const img = await loadImage(file);
    const canvas = document.getElementById('preview-canvas');
    const ctx = syncCanvasToImage(img, canvas);
    ctx.drawImage(img,0,0);
    const s = await getSession();
    const {tensor,...params} = preprocess(img);
    const threshold = parseFloat(document.getElementById('confidence-slider').value || '0.5');
    const result = await s.run({images: tensor});
    const boxes = postprocess(result, params, threshold);
    drawBoxes(ctx, boxes);
    toastOnce('mode', 'Local ONNX active');
  }catch(e){
    reportError(ErrorCodes.FILE_READ, e);
  }
}

export function initUploadUI(){
  const input = document.getElementById('image-upload');
  const drop = document.getElementById('drop-zone');
  if(input) input.addEventListener('change', e=>handleFile(e.target.files[0]));
  if(drop){
    drop.addEventListener('dragover', e=>{e.preventDefault();});
    drop.addEventListener('drop', e=>{e.preventDefault(); handleFile(e.dataTransfer.files[0]);});
  }
  const badge = document.getElementById('mode-badge');
  if(badge) badge.textContent='Local ONNX';
}

document.addEventListener('DOMContentLoaded', initUploadUI);
