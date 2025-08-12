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

btnExport?.addEventListener('click',()=>{
  const data = localStorage.getItem('reports')||'[]';
  const blob = new Blob([data],{type:'application/json'});
  const a = document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='logs.json';
  a.click();
});

modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('active');});
