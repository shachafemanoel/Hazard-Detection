// Unified Navigation Initialization Script
// This script loads the unified navigation system for all pages

if (!window.location.pathname.includes('login')) {
  // Check if navigation is already being loaded
  if (document.getElementById('unified-navigation-container')) {
    console.log('Navigation container already exists, skipping init-navigation.js');
  } else {
    // Load unified navigation component
    fetch('/components/navigation/unified-nav.html')
      .then(response => response.text())
      .then(html => {
        // Create navigation container
        const container = document.createElement('div');
        container.id = 'unified-navigation-container';
        document.body.insertBefore(container, document.body.firstChild);
        
        container.innerHTML = html;
        
        // Check if navigation script is already loaded
        const existingScript = document.querySelector('script[src="/components/navigation/unified-nav.js"]');
        if (!existingScript) {
          // Load navigation JavaScript
          const script = document.createElement('script');
          script.src = '/components/navigation/unified-nav.js';
          script.id = 'unified-nav-script';
          document.head.appendChild(script);
        }
      })
      .catch(error => console.error('Error loading unified navigation:', error));
  }
}