const withTimeout = require('../lib/withTimeout');

test('resolves before timeout', async () => {
  const result = await withTimeout(Promise.resolve('ok'), 50);
  expect(result).toBe('ok');
});

test('rejects when promise exceeds timeout', async () => {
  await expect(
    withTimeout(new Promise(resolve => setTimeout(() => resolve('late'), 100)), 20)
  ).rejects.toThrow('Timeout after 20ms');
});
