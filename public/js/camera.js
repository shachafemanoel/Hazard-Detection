import {detectFrame} from './utils.js';
import {showToast} from './ui.js';

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const errorDiv = document.getElementById('camera-error');
const btnPause = document.getElementById('btn-pause');
let running = true;
let currentStream = null;

async function initCamera(){
  try{
    // Enhanced camera constraints for better quality
    const constraints = {
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        facingMode: 'environment' // Prefer back camera on mobile
      }
    };
    
    // Clean up previous stream if exists
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    video.srcObject = stream;
    
    // Wait for video metadata to load
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
      setTimeout(() => reject(new Error('Video loading timeout')), 5000);
    });
    
    // Clear any previous errors
    errorDiv.textContent = '';
    showToast('Camera initialized successfully');
    requestAnimationFrame(loop);
    
  }catch(err){
    handleCameraError(err);
  }
}

function handleCameraError(error) {
  let message = 'Camera access failed: ';
  
  switch (error.name) {
    case 'NotAllowedError':
      message = 'Camera permission denied. Please allow camera access and refresh the page.';
      break;
    case 'NotFoundError':
      message = 'No camera found on this device.';
      break;
    case 'NotReadableError':
      message = 'Camera is already in use by another application.';
      break;
    case 'OverconstrainedError':
      message = 'Camera does not support the requested constraints.';
      break;
    case 'SecurityError':
      message = 'Camera access is not allowed on insecure connections.';
      break;
    default:
      message += error.message || 'Unknown error occurred';
  }
  
  errorDiv.textContent = message;
  showToast('Camera error: ' + error.name);
  
  // Show retry button
  showRetryButton();
}

function showRetryButton() {
  if (!document.getElementById('retry-camera-btn')) {
    const retryBtn = document.createElement('button');
    retryBtn.id = 'retry-camera-btn';
    retryBtn.textContent = 'Retry Camera Access';
    retryBtn.className = 'btn btn-secondary';
    retryBtn.onclick = () => {
      retryBtn.remove();
      initCamera();
    };
    errorDiv.appendChild(retryBtn);
  }
}

async function loop(){
  if(!running) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const dets = await detectFrame(video);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  dets.forEach(d=>{
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.strokeRect(...d.bbox);
    ctx.fillStyle = 'red';
    ctx.fillText(`${d.class} ${(d.confidence*100).toFixed(1)}%`, d.bbox[0], d.bbox[1]-4);
  });
  requestAnimationFrame(loop);
}

btnPause?.addEventListener('click',()=>{
  running = !running;
  if(running) {
    showToast('המשך');
    requestAnimationFrame(loop);
  } else {
    showToast('הושהה');
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
});

// Cleanup when navigating away from camera section
document.addEventListener('visibilitychange', () => {
  if (document.hidden && currentStream) {
    running = false;
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  } else if (!document.hidden && !currentStream) {
    initCamera();
  }
});

initCamera();
