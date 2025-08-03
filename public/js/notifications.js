function notify(message, type = 'info', persist = false) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.append(toast);
  if (!persist) {
    setTimeout(() => toast.remove(), 3000);
  }
  return toast;
}

// Make notify available globally for browser use
if (typeof window !== 'undefined') {
  window.notify = notify;
}
