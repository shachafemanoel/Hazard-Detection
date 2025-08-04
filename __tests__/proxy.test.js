import request from 'supertest';
import app from '../server/routes/server.js';

it('proxies /health to Python', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'healthy' });
});
