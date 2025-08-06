import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Realtime client browser E2E', () => {
  let browser;
  let skipTests = false;

  before(async () => {
    try {
      browser = await puppeteer.launch({ 
        headless: 'new', 
        protocol: 'cdp', 
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security'
        ] 
      });
    } catch (error) {
      console.warn('Skipping E2E tests - Browser launch failed:', error.message);
      skipTests = true;
    }
  }, 30000);

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('uses private endpoint when healthy and sends frame', async () => {
    if (skipTests) {
      return;
    }
    
    const page = await browser.newPage();
    try {
      const scriptPath = path.resolve(__dirname, '../src/clients/realtime.browser.js');
      await page.addScriptTag({ path: scriptPath });

      const baseUrl = await page.evaluate(async (scriptPath) => {
        const { createRealtimeClient } = await import(scriptPath);
        // Stub fetch to simulate API responses
        const responses = {
          'http://ideal-learning.railway.internal:8080/health': { status: 200 },
          'https://hazard-api-production-production.up.railway.app/health': { status: 500 },
          'http://ideal-learning.railway.internal:8080/session/start': { status: 200, body: { session_id: 'abc' } },
          'http://ideal-learning.railway.internal:8080/detect/abc': { status: 200, body: { detections: [] } }
        };
        window.fetch = async (url) => {
          const res = responses[url];
          if (!res) return new Response('{}', { status: 404 });
          return new Response(JSON.stringify(res.body || {}), { status: res.status, headers: { 'Content-Type': 'application/json' } });
        };
        const client = createRealtimeClient({ timeout: 5000 });
        await client.connect();
        await client.send(new Blob(['abc'], { type: 'image/jpeg' }));
        return client.getBaseUrl();
      }, scriptPath);

      assert.strictEqual(baseUrl, 'http://ideal-learning.railway.internal:8080', 'Should use private endpoint when healthy');
    } finally {
      await page.close();
    }
  }, 20000);
});
