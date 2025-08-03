const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit

async function reportUploadService(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Buffer required');
  }
  if (buffer.length > MAX_SIZE_BYTES) {
    throw new Error('File too large');
  }
  // simulate async upload
  return { ok: true };
}

module.exports = { reportUploadService, MAX_SIZE_BYTES };
