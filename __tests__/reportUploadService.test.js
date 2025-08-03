const { reportUploadService, MAX_SIZE_BYTES } = require('../lib/reportUploadService');

test('accepts buffer within size limit', async () => {
  const buf = Buffer.alloc(MAX_SIZE_BYTES);
  await expect(reportUploadService(buf)).resolves.toEqual({ ok: true });
});

test('rejects buffer exceeding size limit', async () => {
  const buf = Buffer.alloc(MAX_SIZE_BYTES + 1);
  await expect(reportUploadService(buf)).rejects.toThrow('File too large');
});
