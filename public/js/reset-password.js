// js/reset-password.js
// Handles password reset submission and feedback

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const form = document.getElementById('reset-password-form');
  const message = document.getElementById('reset-message');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('new-password').value.trim();

    // Reset previous state
    message.textContent = '';
    message.classList.add('hidden');
    message.classList.remove('alert-success', 'alert-danger', 'text-green-500', 'text-red-500');

    const valid = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(password);
    if (!valid) {
      message.textContent = 'Password must be at least 8 characters and contain letters and numbers.';
      message.classList.add('alert', 'alert-danger', 'text-red-500');
      message.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json();

      if (res.ok) {
        message.textContent = 'Password reset successfully! Redirecting...';
        message.classList.add('alert', 'alert-success', 'text-green-500');
        message.classList.remove('hidden');
        setTimeout(() => (window.location.href = '/upload.html'), 3000);
      } else {
        message.textContent = data.error || 'Reset failed.';
        message.classList.add('alert', 'alert-danger', 'text-red-500');
        message.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Reset error:', err);
      message.textContent = 'Server error.';
      message.classList.add('alert', 'alert-danger', 'text-red-500');
      message.classList.remove('hidden');
    }
  });
});
