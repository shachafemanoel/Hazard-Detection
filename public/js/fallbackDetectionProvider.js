export class FallbackDetectionProvider {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.classes = ['crack', 'knocked', 'pothole', 'surface damage'];
  }
  // Simple deterministic pseudo random generator (LCG)
  rand() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }
  /**
   * Generate mock detections matching external schema
   * @param {{width:number,height:number}|ImageBitmap|ImageData|HTMLVideoElement} source
   * @returns {Array}
   */
  detect(source) {
    const width = source.width || source.videoWidth || 640;
    const height = source.height || source.videoHeight || 480;
    const detections = [];
    // 50% chance of a single detection
    if (this.rand() > 0.5) {
      const classId = Math.floor(this.rand() * this.classes.length);
      const w = Math.min(width, 50 + this.rand() * 100);
      const h = Math.min(height, 50 + this.rand() * 100);
      const x = this.rand() * (width - w);
      const y = this.rand() * (height - h);
      detections.push({
        x1: x,
        y1: y,
        x2: x + w,
        y2: y + h,
        score: 0.6 + this.rand() * 0.4,
        classId,
        className: this.classes[classId],
        area: w * h,
        aspectRatio: w / h,
        passedGeometryCheck: true,
        isNew: true,
        reportId: null
      });
    }
    return detections;
  }
}
