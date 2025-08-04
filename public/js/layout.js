// Global layout script to inject header and navigation across pages
// Builds a fixed header with dynamic title and a left-side navigation drawer

function initializeLayout() {
  const body = document.body;

  // Create navigation drawer
  const nav = document.createElement('nav');
  nav.className = 'nav-menu-left';
  nav.innerHTML = `
    <button class="nav-toggle-btn hamburger" id="nav-toggle" aria-label="Open navigation">\n      <i class="fas fa-bars"></i>\n    </button>\n    <div class="nav-menu-content" id="nav-menu">\n      <div class="nav-menu-header">\n        <h5>Menu</h5>\n        <button class="nav-close-btn" id="nav-close" aria-label="Close navigation">\n          <i class="fas fa-times"></i>\n        </button>\n      </div>\n      <ul class="nav-menu-list">\n        <li><a href="/upload.html"><i class="fas fa-upload"></i> Upload</a></li>\n        <li><a href="/camera.html"><i class="fas fa-camera"></i> Camera</a></li>\n        <li><a href="/dashboard.html"><i class="fas fa-chart-bar"></i> Dashboard</a></li>\n        <li><a href="/logout"><i class="fas fa-sign-out-alt"></i> Logout</a></li>\n      </ul>\n    </div>\n    <div class="nav-overlay" id="nav-overlay"></div>\n  `;
  body.prepend(nav);

  // Create header
  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = `<h1 class="page-title">${document.title}</h1>`;
  body.prepend(header);

  // Navigation interactions
  const navToggle = document.getElementById('nav-toggle');
  const navMenu = document.getElementById('nav-menu');
  const navClose = document.getElementById('nav-close');
  const navOverlay = document.getElementById('nav-overlay');

  function openNav() {
    navMenu.classList.add('open');
    navOverlay.classList.add('active');
  }
  function closeNav() {
    navMenu.classList.remove('open');
    navOverlay.classList.remove('active');
  }

  navToggle.addEventListener('click', openNav);
  navClose.addEventListener('click', closeNav);
  navOverlay.addEventListener('click', closeNav);
}

document.addEventListener('DOMContentLoaded', initializeLayout);
