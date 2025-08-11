// js/route-guard.js
import { isUserLoggedIn } from './session-manager.js';

// List of pages that require the user to be logged in.
const protectedPages = ['dashboard.html', 'profile.html', 'settings.html', 'camera.html', 'upload.html'];

// Get the name of the current HTML file.
const currentPage = window.location.pathname.split('/').pop();

// Check if the user is logged in using our session manager.
const userIsAuthenticated = isUserLoggedIn();

// If the current page is a protected page AND the user is NOT authenticated...
if (protectedPages.includes(currentPage) && !userIsAuthenticated) {
  console.warn('Access denied. User not authenticated. Redirecting to login.');
  
  //...redirect them to the login page.
  window.location.href = '/login.html';
}
