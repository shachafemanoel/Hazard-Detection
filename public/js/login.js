// js/login.js
// Login page logic for new login.html structure

document.addEventListener('DOMContentLoaded', function() {
  // Toggle email login form (already handled inline, but keep for robustness)
  const showEmailBtn = document.getElementById('show-email-login');
  const emailLoginDiv = document.getElementById('email-login-form');
  if (showEmailBtn && emailLoginDiv) {
    showEmailBtn.onclick = function() {
      emailLoginDiv.style.display = 'block';
      this.style.display = 'none';
    };
  }

  // Handle login form submit
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const email = loginForm.email.value.trim();
      const password = loginForm.password.value;
      const messagesDiv = document.getElementById('form-messages');
      messagesDiv.innerHTML = '';
      if (!isValidEmail(email)) {
        showMessage('error', 'Invalid email format.');
        return;
      }
      if (password.length < 8) {
        showMessage('error', 'Password must be at least 8 characters.');
        return;
      }
      try {
        const res = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showMessage('success', 'Login successful! Redirecting...');
          setTimeout(() => {
            window.location.href = '/pages/index.html';
          }, 1000);
        } else {
          showMessage('error', data.message || 'Login failed.');
        }
      } catch (err) {
        showMessage('error', 'Network error.');
      }
    });
  }

  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  function showMessage(type, message) {
    const messagesDiv = document.getElementById('form-messages');
    if (!messagesDiv) return;
    const messageClass = type === 'success' ? 'success-message' : 'error-message';
    const icon = type === 'success' ? 'check-circle' : 'exclamation-triangle';
    messagesDiv.innerHTML = `
      <div class="${messageClass}">
        <i class="fas fa-${icon}"></i>
        ${message}
      </div>
    `;
    setTimeout(() => {
      messagesDiv.innerHTML = '';
    }, 5000);
  }
});