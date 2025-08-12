const DB_NAME = 'hazard-db';
const DB_VERSION = 1;
const STORE_REPORTS = 'reports';

let dbPromise = null;

function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject)=>{
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if(!db.objectStoreNames.contains(STORE_REPORTS)){
        db.createObjectStore(STORE_REPORTS, {keyPath:'id'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function queueReport(report){
  const db = await openDB();
  const tx = db.transaction(STORE_REPORTS,'readwrite');
  tx.objectStore(STORE_REPORTS).put(report);
  return tx.complete;
}

export async function getQueuedReports(){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE_REPORTS,'readonly');
    const store = tx.objectStore(STORE_REPORTS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteQueuedReport(id){
  const db = await openDB();
  const tx = db.transaction(STORE_REPORTS,'readwrite');
  tx.objectStore(STORE_REPORTS).delete(id);
  return tx.complete;
}
