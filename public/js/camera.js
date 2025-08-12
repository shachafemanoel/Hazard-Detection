import {detectFrame} from './utils.js';
import {showToast} from './ui.js';

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const errorDiv = document.getElementById('camera-error');
const btnPause = document.getElementById('btn-pause');
let running = true;

async function initCamera(){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({video:true});
    video.srcObject = stream;
    requestAnimationFrame(loop);
  }catch(err){
    errorDiv.textContent = 'אין הרשאה למצלמה, נסו לאשר בדפדפן';
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

initCamera();
