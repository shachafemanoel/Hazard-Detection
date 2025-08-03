const path = require('path');
const puppeteer = require('puppeteer');

describe('Realtime client browser E2E', () => {
  let browser;
  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  }, 30000);

  afterAll(async () => {
    await browser.close();
  });

  test('uses private endpoint when healthy and sends frame', async () => {
    const page = await browser.newPage();
    const scriptPath = path.resolve(__dirname, '../public/js/realtimeClient.js');
    await page.addScriptTag({ path: scriptPath });

    const baseUrl = await page.evaluate(async () => {
      // Stub fetch to simulate API responses
      const responses = {
        'http://ideal-learning.railway.internal:8080/health': { status: 200 },
        'https://hazard-api-production-production.up.railway.app/health': { status: 500 },
        'http://ideal-learning.railway.internal:8080/session/start': { status: 200, body: { session_id: 'abc' } },
        'http://ideal-learning.railway.internal:8080/detect/abc': { status: 200, body: { detections: [] } }
      };
      window.fetch = async (url, opts) => {
        const res = responses[url];
        if (!res) return new Response('{}', { status: 404 });
        return new Response(JSON.stringify(res.body || {}), { status: res.status, headers: { 'Content-Type': 'application/json' } });
      };
      const client = createRealtimeClient({ timeout: 5000 });
      await client.connect();
      await client.send(new Blob(['abc'], { type: 'image/jpeg' }));
      return client.getBaseUrl();
    });

    expect(baseUrl).toBe('http://ideal-learning.railway.internal:8080');
  }, 20000);
});
