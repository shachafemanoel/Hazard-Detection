document.addEventListener("DOMContentLoaded", async () => {
  const FIXED_SIZE = 640;
  const classNames = ['Alligator Crack', 'Block Crack', 'Construction Joint Crack', 'Crosswalk Blur', 'Lane Blur', 'Longitudinal Crack', 'Manhole', 'Patch Repair', 'Pothole', 'Transverse Crack', 'Wheel Mark Crack'];
  const imageUpload = document.getElementById('image-upload');
  const confidenceSlider = document.getElementById('confidence-slider');
  const confValueSpan = document.getElementById('conf-value');
  const canvas = document.getElementById('preview-canvas');
  const ctx = canvas.getContext('2d');
  const saveBtn = document.getElementById('save-detection');
  const logoutBtn = document.getElementById('logout-btn');
  canvas.width = FIXED_SIZE;
  canvas.height = FIXED_SIZE;
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style, {position:'fixed',bottom:'20px',right:'20px',padding:'12px 20px',borderRadius:'8px',color:'white',backgroundColor:type==='error'?'#f44336':'#4caf50',boxShadow:'0 0 10px rgba(0,0,0,0.2)',zIndex:9999});
    document.body.appendChild(toast);
    toast.style.opacity = '1';
    setTimeout(() => {toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300);}, 3000);
  }
  async function getLocationFallback() {
    if (navigator.geolocation) {
      try {
        return await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(pos => resolve({lat:pos.coords.latitude,lng:pos.coords.longitude}), reject, {timeout:10000}));
      } catch {}
    }
    try {
      const resp = await fetch('https://ipapi.co/json/');
      const data = await resp.json();
      return {lat:data.latitude,lng:data.longitude};
    } catch {}
    return null;
  }
  function getGeoDataFromImage(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => EXIF.getData(img, function() {
          const lat = EXIF.getTag(this,'GPSLatitude');
          const lon = EXIF.getTag(this,'GPSLongitude');
          if (!lat || !lon) return resolve(null);
          const toDecimal = (dms,ref) => {const [deg,min,sec] = dms; let dec = deg + min/60 + sec/3600; return ref==='S'||ref==='W'?-dec:dec;};
          const latitude = toDecimal(lat, EXIF.getTag(this,'GPSLatitudeRef')||'N');
          const longitude = toDecimal(lon, EXIF.getTag(this,'GPSLongitudeRef')||'E');
          resolve({lat:latitude,lng:longitude});
        });
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  let geoData = null;
  let hazardTypes = [];
  let currentImage = null;
  function previewAndInfer(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        currentImage = img;
        ctx.clearRect(0,0,FIXED_SIZE,FIXED_SIZE);
        ctx.drawImage(img,0,0,FIXED_SIZE,FIXED_SIZE);
        if (typeof runInferenceOnImage === 'function') runInferenceOnImage(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  imageUpload.addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    const exifLoc = await getGeoDataFromImage(file);
    geoData = exifLoc ? JSON.stringify(exifLoc) : null;
    if (!geoData) showToast('No EXIF location; will fallback on save','info');
    previewAndInfer(file);
  });
  saveBtn.addEventListener('click', async () => {
    if (!geoData) {
      const loc = await getLocationFallback();
      if (loc) geoData = JSON.stringify(loc);
      else return showToast('Cannot determine location; run in HTTPS or enter manually.','error');
    }
    canvas.toBlob(async blob => {
      if (!blob) return showToast('Failed to create image blob','error');
      const imageFile = new File([blob],'detection.jpg',{type:'image/jpeg'});
      const fd = new FormData();
      fd.append('file',imageFile);
      fd.append('geoData',geoData);
      fd.append('hazardTypes',hazardTypes.join(','));
      try {
        const res = await fetch('/upload-detection',{method:'POST',body:fd,credentials:'include'});
        const result = await res.json();
        showToast(`Saved successfully: ${result.message}`,'info');
      } catch(e) {
        console.error(e);
        showToast('Save failed','error');
      }
      setTimeout(() => {imageUpload.value=''; ctx.clearRect(0,0,FIXED_SIZE,FIXED_SIZE);},2500);
    },'image/jpeg',0.95);
  });
  let session = null;
  try { session = await ort.InferenceSession.create('/object_detecion_model/road_damage_detection_last_version.onnx'); } catch(err) { console.error('❌ Failed to load model:',err); }
  confidenceSlider.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    confValueSpan.textContent = val;
    if (currentImage) runInferenceOnImage(currentImage);
  });
  async function runInferenceOnImage(imageElement) {
    if (!session) return;
    const off = document.createElement('canvas'); off.width=off.height=FIXED_SIZE;
    const octx = off.getContext('2d');
    const scale = Math.min(FIXED_SIZE/imageElement.width, FIXED_SIZE/imageElement.height);
    const newW = Math.round(imageElement.width*scale);
    const newH = Math.round(imageElement.height*scale);
    const offsetX = Math.floor((FIXED_SIZE-newW)/2);
    const offsetY = Math.floor((FIXED_SIZE-newH)/2);
    octx.fillStyle='black'; octx.fillRect(0,0,FIXED_SIZE,FIXED_SIZE);
    octx.drawImage(imageElement,offsetX,offsetY,newW,newH);
    const {data,width,height} = octx.getImageData(0,0,FIXED_SIZE,FIXED_SIZE);
    const tensorData=new Float32Array(width*height*3);
    for(let i=0,j=0; i<data.length; i+=4,j+=3) {tensorData[j]=data[i]/255;tensorData[j+1]=data[i+1]/255;tensorData[j+2]=data[i+2]/255;}
    const chw=new Float32Array(3*width*height);
    for(let c=0;c<3;c++){ for(let h=0;h<height;h++){ for(let w=0;w<width;w++){ chw[c*width*height+h*width+w]=tensorData[h*width*3+w*3+c]; } } }
    const tensor=new ort.Tensor('float32',chw,[1,3,height,width]);
    const results=await session.run({images:tensor});
    const out=results[Object.keys(results)[0]].data;
    const boxes=[]; for(let i=0;i<out.length;i+=6) boxes.push(out.slice(i,i+6));
    drawResults(boxes);
  }
  function drawResults(boxes) {
    hazardTypes=[];
    ctx.clearRect(0,0,FIXED_SIZE,FIXED_SIZE);
    if(currentImage) ctx.drawImage(currentImage,0,0,FIXED_SIZE,FIXED_SIZE);
    boxes.forEach(([x1,y1,x2,y2,score,classId]) => {
      if(score<parseFloat(confValueSpan.textContent)) return;
      ctx.strokeStyle='red'; ctx.lineWidth=2; ctx.strokeRect(x1,y1,x2-x1,y2-y1);
      const label = classNames[Math.floor(classId)];
      const scorePct=(score*100).toFixed(1);
      ctx.fillStyle='red'; ctx.font='16px Arial'; ctx.fillText(`${label} (${scorePct}%)`,x1,y1>10?y1-5:10);
      if(!hazardTypes.includes(label)) hazardTypes.push(label);
    });
  }
  

  // ===== LOGOUT =====
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/logout');
        if (res.redirected) window.location.href = res.url;
      } catch (e) {
        console.error('Logout failed:', e);
      }
    });
  }
});

/* CSS for toast fade:
.toast { transition: opacity 0.3s ease-in-out; }
*/
