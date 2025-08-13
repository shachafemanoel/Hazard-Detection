import {showToast} from './ui.js';

const sensitivity = document.getElementById('sensitivity');
const sensValue = document.getElementById('sensitivity-value');
const langSelect = document.getElementById('lang');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');
const btnSelfTest = document.getElementById('btn-self-test');
const btnExport = document.getElementById('btn-export-logs');

sensitivity?.addEventListener('input',()=>{
  sensValue.textContent = sensitivity.value;
});

langSelect?.addEventListener('change',()=>{
  const dir = langSelect.value==='he'?'rtl':'ltr';
  document.documentElement.dir = dir;
});

btnSelfTest?.addEventListener('click',async()=>{
  modal.classList.add('active');
  modalContent.innerHTML='<p>בודק...</p>';
  const results = [];
  // camera
  try{
    await navigator.mediaDevices.getUserMedia({video:true});
    results.push('מצלמה: תקין');
  }catch(e){
    results.push('מצלמה: כשל');
  }
  // geolocation
  await new Promise(res=>{
    navigator.geolocation.getCurrentPosition(()=>{results.push('מיקום: תקין');res();},()=>{results.push('מיקום: כשל');res();});
  });
  // API reachability (stub)
  try{
    await fetch('/');
    results.push('API: תקין');
  }catch(e){
    results.push('API: כשל');
  }
  // IndexedDB
  try{
    indexedDB.databases;
    results.push('IndexedDB: תקין');
  }catch(e){
    results.push('IndexedDB: כשל');
  }
  modalContent.innerHTML='<ul>'+results.map(r=>`<li>${r}</li>`).join('')+'</ul><button id="close-modal" class="btn btn-secondary">סגור</button>';
  document.getElementById('close-modal').addEventListener('click',()=>modal.classList.remove('active'));
});

btnExport?.addEventListener('click', async () => {
  try {
    // Import enhanced localStorage functions
    const { loadReports, getStorageInfo } = await import('./utils.js');
    
    const reports = await loadReports();
    const storageInfo = getStorageInfo();
    
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        reportCount: storageInfo.reportCount,
        dataSize: storageInfo.reportsSize
      },
      reports: reports
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hazard-reports-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    showToast(`Exported ${reports.length} reports successfully`, 'success');
  } catch (error) {
    console.error('Export failed:', error);
    showToast('Export failed: ' + error.message, 'error');
  }
});

modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('active');});
