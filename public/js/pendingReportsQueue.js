import { uploadDetection } from './apiClient.js';

export class PendingReportsQueue {
  constructor(key = 'hazard_pending_reports', uploader = uploadDetection) {
    this.key = key;
    this.uploader = uploader;
    this.queue = this._load();
    this.flushing = false;
    this.start();
  }
  _load() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  _save() {
    localStorage.setItem(this.key, JSON.stringify(this.queue));
  }
  enqueue(report) {
    this.queue.push(report);
    this._save();
  }
  size() {
    return this.queue.length;
  }
  async flush() {
    if (this.flushing || !this.queue.length) return;
    this.flushing = true;
    try {
      while (this.queue.length) {
        const next = this.queue[0];
        try {
          await this.uploader(next);
          this.queue.shift();
          this._save();
        } catch (err) {
          console.warn('[queue] upload failed, will retry later', err.message);
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), 10000);
    window.addEventListener('online', () => this.flush());
  }
}

export const pendingReportsQueue = new PendingReportsQueue();
if (typeof window !== 'undefined') {
  window.pendingReportsQueue = pendingReportsQueue;
}
