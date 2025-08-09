import { jest } from '@jest/globals';
import { PendingReportsQueue } from '../../public/js/pendingReportsQueue.js';

test('queued reports retry until upload succeeds', async () => {
  const uploader = jest.fn();
  uploader.mockRejectedValueOnce(new Error('fail'));
  uploader.mockResolvedValueOnce({ ok: true });
  const queue = new PendingReportsQueue('test-queue', uploader);
  queue.enqueue({ id: 1 });
  await queue.flush();
  expect(uploader).toHaveBeenCalledTimes(1);
  await queue.flush();
  expect(uploader).toHaveBeenCalledTimes(2);
  expect(queue.size()).toBe(0);
});
