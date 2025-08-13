const shown = new Set();

function getContainer() {
  let el = document.getElementById('toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-container';
    el.style.position = 'fixed';
    el.style.top = '1rem';
    el.style.right = '1rem';
    el.style.zIndex = '9999';
    document.body.appendChild(el);
  }
  return el;
}

export function toastOnce(key, message) {
  if (shown.has(key)) return;
  shown.add(key);
  const container = getContainer();
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
    shown.delete(key);
  }, 5000);
}

export const ErrorCodes = {
  CAMERA_PERMISSION: 'camera_permission',
  CAMERA_INACTIVE: 'camera_inactive',
  CAMERA_SWITCH: 'camera_switch',
  MODEL_LOAD: 'model_load',
  MODEL_WARMUP: 'model_warmup',
  INFERENCE: 'inference',
  DRAW: 'draw',
  FILE_READ: 'file_read',
  UNSUPPORTED: 'unsupported'
};

export function reportError(code, detail) {
  console.groupCollapsed(`[Error:${code}]`);
  if (detail) console.error(detail);
  console.groupEnd();
  const messages = {
    camera_permission: 'Camera access denied. Check browser permissions and retry.',
    camera_inactive: 'Camera stream ended. Click Start to try again.',
    camera_switch: 'Switching camera failed. Try another device.',
    model_load: 'Could not load local model. Refresh or check files under /object_detecion_model/.',
    model_warmup: 'Warmup issue. Continuing with live inference.',
    inference: 'Inference error. Pausing detection.',
    draw: 'Drawing failed. Resetting overlay.',
    file_read: 'Could not read the selected file. Choose another image.',
    unsupported: 'Your device may not support WASM acceleration.'
  };
  toastOnce(code, messages[code] || 'Unexpected error');
}
