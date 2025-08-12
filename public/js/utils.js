// Stub APIs
export async function detectFrame(video){
  // returns dummy detections
  return [{bbox:[50,50,100,100],class:'בור',confidence:0.8}];
}

export async function submitReport(report){
  // simulate network or offline
  if(!navigator.onLine){
    throw new Error('offline');
  }
  await new Promise(r=>setTimeout(r,500));
  return {ok:true,id:Date.now()};
}

export async function loadReports(){
  const stored = JSON.parse(localStorage.getItem('reports')||'[]');
  return stored;
}

export function saveReportLocal(report){
  const reports = JSON.parse(localStorage.getItem('reports')||'[]');
  reports.push(report);
  localStorage.setItem('reports',JSON.stringify(reports));
}

export function getSystemStatus(){
  if(!navigator.onLine) return {mode:'offline'};
  // simple stub always cloud
  return {mode:'cloud'};
}
