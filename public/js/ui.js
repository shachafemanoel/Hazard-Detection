import {getSystemStatus} from './utils.js';

const sections = document.querySelectorAll('.section');
const navItems = document.querySelectorAll('[data-target]');
const toast = document.getElementById('toast');
const statusPill = document.getElementById('status-pill');

navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const target = item.dataset.target;
    sections.forEach(sec => sec.classList.toggle('active', sec.id===target));
  });
});

export function showToast(msg){
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'),2000);
}

export async function updateStatus(){
  const status = await getSystemStatus();
  const map = {
    cloud:'ענן',
    local:'מקומי',
    offline:'לא מחובר'
  };
  statusPill.textContent = map[status.mode]||'לא ידוע';
}

window.addEventListener('online',()=>showToast('חזרנו לרשת'));
window.addEventListener('offline',()=>showToast('אין חיבור אינטרנט'));

updateStatus();
