const axios = require('axios');
jest.mock('axios');

const { resolveBaseUrl } = require('../lib/realtimeClient');

describe('resolveBaseUrl', () => {
  beforeEach(() => {
    axios.get.mockReset();
    delete process.env.HAZARD_API_URL_PRIVATE;
    delete process.env.HAZARD_API_URL_PUBLIC;
    delete process.env.HAZARD_USE_PRIVATE;
  });

  test('prefers private endpoint when healthy', async () => {
    axios.get.mockResolvedValueOnce({ status: 200 }) // private
             .mockResolvedValueOnce({ status: 200 }); // public
    const url = await resolveBaseUrl();
    expect(url).toBe('http://ideal-learning.railway.internal:8080');
  });

  test('falls back to public when private down', async () => {
    axios.get.mockRejectedValueOnce(new Error('down')); // private
    axios.get.mockResolvedValueOnce({ status: 200 }); // public
    const url = await resolveBaseUrl();
    expect(url).toBe('https://hazard-api-production-production.up.railway.app');
  });

  test('throws when both endpoints down', async () => {
    axios.get.mockRejectedValue(new Error('down'));
    await expect(resolveBaseUrl()).rejects.toThrow('No healthy endpoint');
  });

  test('honors HAZARD_USE_PRIVATE=true', async () => {
    process.env.HAZARD_USE_PRIVATE = 'true';
    const url = await resolveBaseUrl();
    expect(url).toBe('http://ideal-learning.railway.internal:8080');
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('honors HAZARD_USE_PRIVATE=false', async () => {
    process.env.HAZARD_USE_PRIVATE = 'false';
    const url = await resolveBaseUrl();
    expect(url).toBe('https://hazard-api-production-production.up.railway.app');
    expect(axios.get).not.toHaveBeenCalled();
  });
});
