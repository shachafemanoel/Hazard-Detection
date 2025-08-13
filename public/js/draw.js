/** Utility helpers for canvas sizing and drawing detection boxes */

/**
 * Sync canvas size to match video element using devicePixelRatio.
 * Returns 2d context pre-scaled for DPR.
 */
export function syncCanvasToVideo(video, canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = video.videoWidth;
  const h = video.videoHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Sync canvas to match an image element (1:1 pixels) */
export function syncCanvasToImage(img, canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Draw detection boxes on a canvas context */
export function drawBoxes(ctx, boxes) {
  ctx.lineWidth = 2;
  ctx.font = '14px system-ui, sans-serif';
  boxes.forEach(b => {
    ctx.strokeStyle = '#ff0000';
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    const tag = `${b.label} ${(b.score * 100).toFixed(0)}%`;
    const textWidth = ctx.measureText(tag).width + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(b.x, b.y - 18, textWidth, 18);
    ctx.fillStyle = '#fff';
    ctx.fillText(tag, b.x + 3, b.y - 5);
  });
}
