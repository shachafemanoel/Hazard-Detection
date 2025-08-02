(() => {
  const fabBtn = document.getElementById('fab-btn');
  const fabMenu = document.getElementById('fab-menu');
  if (fabBtn && fabMenu) {
    fabBtn.addEventListener('click', () => {
      fabMenu.classList.toggle('open');
    });
  }
})();
