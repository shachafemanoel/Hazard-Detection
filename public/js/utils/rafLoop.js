let rafId = null;

export function startLoop(callback) {
  function loop(timestamp) {
    callback(timestamp);
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);
}

export function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}