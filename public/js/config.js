// Smart API URL detection for Railway private network vs public access
function getBaseApiUrl() {
  // Check if we have a custom config first
  if (window.__CONFIG__?.BASE_API_URL) {
    return window.__CONFIG__.BASE_API_URL;
  }
  
  // Check if we're running on Railway (both client and API in same workspace)
  const hostname = window.location.hostname;
  const isOnRailway = hostname.includes('.railway.app') || hostname.includes('.up.railway.app');
  
  if (isOnRailway) {
    // Use Railway private network URL when both services are in same workspace
    return 'https://hazard-api-production-production.up.railway.app';
  }
  
  // For localhost and other domains, use public Railway URL
  return 'https://hazard-api-production-production.up.railway.app';
}

export const BASE_API_URL = getBaseApiUrl();