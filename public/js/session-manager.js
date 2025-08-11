// js/session-manager.js

/**
 * Saves the user token to localStorage.
 * @param {string} token - The authentication token.
 */
export function saveToken(token) {
  localStorage.setItem('user_token', token);
}

/**
 * Retrieves the user token from localStorage.
 * @returns {string|null} The token, or null if not found.
 */
export function getToken() {
  return localStorage.getItem('user_token');
}

/**
 * Clears the user token from localStorage (for logout).
 */
export function clearToken() {
  localStorage.removeItem('user_token');
}

/**
 * Checks if a user is currently logged in by verifying if a token exists.
 * @returns {boolean} True if the user is logged in, otherwise false.
 */
export function isUserLoggedIn() {
  const token = getToken();
  return !!token; // Returns true if token is not null or empty, otherwise false.
}
