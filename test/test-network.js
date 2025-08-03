const { expect } = require('chai');
const sinon = require('sinon');
const { resolveBaseUrl, probeHealth } = require('../public/js/network.js');

// Since network.js is a UMD module, we need to simulate a browser-like environment
// for fetch to be available globally, or mock it. For these tests, we'll mock it.
global.fetch = () => {};

describe('Network Utilities', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // Stub global fetch
    global.fetch = sandbox.stub();

    // Mock process.env for consistent testing
    process.env.HAZARD_API_URL_PRIVATE = 'http://private.test';
    process.env.HAZARD_API_URL_PUBLIC = 'http://public.test';
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.HAZARD_API_URL_PRIVATE;
    delete process.env.HAZARD_API_URL_PUBLIC;
  });

  describe('resolveBaseUrl', () => {
    it('should resolve to the private URL when it is healthy', async () => {
      global.fetch.withArgs('http://private.test/health', sinon.match.any)
        .resolves({ ok: true });

      const baseUrl = await resolveBaseUrl('auto');
      expect(baseUrl).to.equal('http://private.test');
      expect(global.fetch.calledOnce).to.be.true;
    });

    it('should fall back to the public URL if the private one fails', async () => {
      global.fetch.withArgs('http://private.test/health', sinon.match.any)
        .rejects(new Error('Network error'));
      global.fetch.withArgs('http://public.test/health', sinon.match.any)
        .resolves({ ok: true });

      const baseUrl = await resolveBaseUrl('auto');
      expect(baseUrl).to.equal('http://public.test');
      expect(global.fetch.calledTwice).to.be.true;
    });

    it('should throw an error if both private and public URLs fail', async () => {
      global.fetch.withArgs('http://private.test/health', sinon.match.any)
        .rejects(new Error('Network error'));
      global.fetch.withArgs('http://public.test/health', sinon.match.any)
        .rejects(new Error('Network error'));

      try {
        await resolveBaseUrl('auto');
        // Should not reach here
        expect.fail('resolveBaseUrl should have thrown an error');
      } catch (error) {
        expect(error).to.be.an('error');
        expect(error.message).to.equal('No healthy API endpoint found. Both private and public URLs failed.');
      }
    });

    it('should return the private URL when pref is "private" without probing', async () => {
      const baseUrl = await resolveBaseUrl('private');
      expect(baseUrl).to.equal('http://private.test');
      // fetch should not be called at all
      expect(global.fetch.notCalled).to.be.true;
    });

    it('should return the public URL when pref is "public" without probing', async () => {
      const baseUrl = await resolveBaseUrl('public');
      expect(baseUrl).to.equal('http://public.test');
      // fetch should not be called at all
      expect(global.fetch.notCalled).to.be.true;
    });
  });

  describe('probeHealth', () => {
    it('should return true for a healthy (2xx) response', async () => {
      global.fetch.resolves({ ok: true });
      const isHealthy = await probeHealth('http://any.url');
      expect(isHealthy).to.be.true;
    });

    it('should return false for an unhealthy (non-2xx) response', async () => {
      global.fetch.resolves({ ok: false });
      const isHealthy = await probeHealth('http://any.url');
      expect(isHealthy).to.be.false;
    });

    it('should return false if fetch throws an error', async () => {
      global.fetch.rejects(new Error('Connection timed out'));
      const isHealthy = await probeHealth('http://any.url');
      expect(isHealthy).to.be.false;
    });
  });
});
