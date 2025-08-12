import {submitReport, loadReports, saveReportLocal} from './utils.js';
import {queueReport, getQueuedReports, deleteQueuedReport} from './storage.js';
import {showToast} from './ui.js';

const historyList = document.getElementById('history-list');
const btnSubmit = document.getElementById('btn-submit-report');
let newReport = {type:null,location:null};

// select hazard type
Array.from(document.querySelectorAll('#new [data-type]')).forEach(btn=>{
  btn.addEventListener('click',()=>{
    newReport.type = btn.dataset.type;
    showToast('נבחר '+btn.textContent);
  });
});

// use current location
const btnLoc = document.getElementById('btn-use-location');
btnLoc?.addEventListener('click',()=>{
  navigator.geolocation.getCurrentPosition(pos=>{
    newReport.location = {lat:pos.coords.latitude,lng:pos.coords.longitude};
    showToast('מיקום נוסף');
  },()=>showToast('שגיאה במיקום'));
});

btnSubmit?.addEventListener('click',async()=>{
  const report = {
    id:Date.now(),
    type:newReport.type,
    severity:document.getElementById('severity').value,
    details:document.getElementById('details').value,
    location:newReport.location,
    created_at:new Date().toISOString(),
    status:'sent'
  };
  try{
    await submitReport(report);
    saveReportLocal(report);
    showToast('נשלח');
  }catch(err){
    report.status='queued';
    await queueReport(report);
    saveReportLocal(report);
    showToast('נשמר לשליחה');
  }
  renderHistory();
});

async function renderHistory(){
  const reports = await loadReports();
  historyList.innerHTML='';
  reports.forEach(r=>{
    const li = document.createElement('li');
    li.className='history-item';
    li.innerHTML=`<span>${r.type} - ${new Date(r.created_at).toLocaleString()}</span> <span class="chip">${r.status==='queued'?'ממתין':'נשלח'}</span>`;
    historyList.appendChild(li);
  });
}

async function syncQueued(){
  const queued = await getQueuedReports();
  for(const r of queued){
    try{
      await submitReport(r);
      await deleteQueuedReport(r.id);
      r.status='sent';
      saveReportLocal(r);
    }catch(e){
      // still offline
    }
  }
  renderHistory();
}

window.addEventListener('online',syncQueued);

renderHistory();
