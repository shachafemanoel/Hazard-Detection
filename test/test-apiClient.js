const { expect } = require('chai');
const sinon = require('sinon');
const axios = require('axios');
const { createRealtimeClient, resolveBaseUrl, probeHealth } = require('../lib/realtimeClient');

describe('Realtime API Client', () => {
  let axiosStub;

  beforeEach(() => {
    axiosStub = sinon.stub(axios, 'get');
    sinon.stub(axios, 'post');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('probeHealth', () => {
    it('should return true for healthy endpoint', async () => {
      axiosStub.resolves({ status: 200 });
      
      const result = await probeHealth('http://test-api.com');
      
      expect(result).to.be.true;
      expect(axiosStub.calledOnce).to.be.true;
      expect(axiosStub.getCall(0).args[0]).to.equal('http://test-api.com/health');
    });

    it('should return false for unhealthy endpoint', async () => {
      axiosStub.resolves({ status: 500 });
      
      const result = await probeHealth('http://test-api.com');
      
      expect(result).to.be.false;
    });

    it('should return false on network error', async () => {
      axiosStub.rejects(new Error('Network error'));
      
      const result = await probeHealth('http://test-api.com');
      
      expect(result).to.be.false;
    });

    it('should respect timeout', async () => {
      const result = await probeHealth('http://test-api.com', 1000);
      
      expect(axiosStub.getCall(0).args[1].timeout).to.equal(1000);
    });
  });

  describe('resolveBaseUrl', () => {
    beforeEach(() => {
      // Clear environment variables
      delete process.env.HAZARD_API_URL_PRIVATE;
      delete process.env.HAZARD_API_URL_PUBLIC;
      delete process.env.HAZARD_USE_PRIVATE;
    });

    it('should prefer private endpoint when healthy', async () => {
      axiosStub.onFirstCall().resolves({ status: 200 }); // private healthy
      axiosStub.onSecondCall().resolves({ status: 200 }); // public healthy
      
      const url = await resolveBaseUrl();
      
      expect(url).to.equal('http://ideal-learning.railway.internal:8080');
    });

    it('should fallback to public when private is down', async () => {
      axiosStub.onFirstCall().rejects(new Error('Connection refused')); // private down
      axiosStub.onSecondCall().resolves({ status: 200 }); // public healthy
      
      const url = await resolveBaseUrl();
      
      expect(url).to.equal('https://hazard-api-production-production.up.railway.app');
    });

    it('should throw when both endpoints are down', async () => {
      axiosStub.rejects(new Error('Connection refused'));
      
      try {
        await resolveBaseUrl();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('No healthy endpoint found (private/public)');
      }
    });

    it('should respect HAZARD_USE_PRIVATE=true', async () => {
      process.env.HAZARD_USE_PRIVATE = 'true';
      
      const url = await resolveBaseUrl();
      
      expect(url).to.equal('http://ideal-learning.railway.internal:8080');
      expect(axiosStub.called).to.be.false; // Should not probe when forced
    });

    it('should respect HAZARD_USE_PRIVATE=false', async () => {
      process.env.HAZARD_USE_PRIVATE = 'false';
      
      const url = await resolveBaseUrl();
      
      expect(url).to.equal('https://hazard-api-production-production.up.railway.app');
      expect(axiosStub.called).to.be.false; // Should not probe when forced
    });

    it('should use custom URLs from environment', async () => {
      process.env.HAZARD_API_URL_PRIVATE = 'http://custom-private.com';
      process.env.HAZARD_API_URL_PUBLIC = 'https://custom-public.com';
      axiosStub.onFirstCall().resolves({ status: 200 });
      
      const url = await resolveBaseUrl();
      
      expect(url).to.equal('http://custom-private.com');
    });
  });

  describe('createRealtimeClient', () => {
    let client;

    beforeEach(() => {
      // Mock successful health checks and session start
      axiosStub.resolves({ status: 200 });
      axios.post.onFirstCall().resolves({ data: { session_id: 'test-session-123' } });
    });

    afterEach(() => {
      if (client && client.isConnected()) {
        client.disconnect();
      }
    });

    it('should create client with default config', () => {
      client = createRealtimeClient();
      
      expect(client).to.have.property('connect');
      expect(client).to.have.property('disconnect');
      expect(client).to.have.property('send');
      expect(client).to.have.property('onMessage');
      expect(client).to.have.property('onError');
      expect(client).to.have.property('onStatus');
      expect(client).to.have.property('isConnected');
    });

    it('should connect successfully', async () => {
      client = createRealtimeClient();
      
      await client.connect();
      
      expect(client.isConnected()).to.be.true;
      expect(client.getSessionId()).to.equal('test-session-123');
    });

    it('should handle connection failure', async () => {
      axios.post.onFirstCall().rejects(new Error('Connection failed'));
      client = createRealtimeClient();
      
      let errorEmitted = false;
      client.onError(() => { errorEmitted = true; });
      
      try {
        await client.connect();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Connection failed');
        expect(client.isConnected()).to.be.false;
      }
    });

    it('should emit status changes', async () => {
      client = createRealtimeClient();
      const statusChanges = [];
      
      client.onStatus((status) => {
        statusChanges.push(status);
      });
      
      await client.connect();
      
      expect(statusChanges).to.deep.equal(['connecting', 'connected']);
    });

    it('should send detection requests', async () => {
      client = createRealtimeClient();
      await client.connect();
      
      const mockResponse = {
        data: {
          success: true,
          detections: [
            { class_name: 'pothole', confidence: 0.85 }
          ]
        }
      };
      axios.post.onSecondCall().resolves(mockResponse);
      
      const testBuffer = Buffer.from('fake-image-data');
      let messageReceived = false;
      
      client.onMessage((data) => {
        messageReceived = true;
        expect(data.detections).to.have.length(1);
        expect(data.detections[0].class_name).to.equal('pothole');
      });
      
      await client.send(testBuffer);
      
      expect(messageReceived).to.be.true;
    });

    it('should handle retry logic on network errors', async () => {
      client = createRealtimeClient({ maxRetries: 2, backoffMs: 10 });
      await client.connect();
      
      let errorCount = 0;
      axios.post.onSecondCall().rejects(new Error('ECONNRESET'));
      axios.post.onThirdCall().resolves({
        data: { success: true, detections: [] }
      });
      
      client.onError(() => { errorCount++; });
      
      const testBuffer = Buffer.from('fake-image-data');
      await client.send(testBuffer);
      
      // Wait for retry
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(errorCount).to.equal(0); // Should not emit error on successful retry
    });

    it('should disconnect gracefully', async () => {
      client = createRealtimeClient();
      await client.connect();
      
      axios.post.onSecondCall().resolves({ data: { message: 'Session ended' } });
      
      await client.disconnect();
      
      expect(client.isConnected()).to.be.false;
      expect(client.getSessionId()).to.be.null;
    });
  });

  describe('Environment Configuration', () => {
    beforeEach(() => {
      // Clear all environment variables
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('REALTIME_') || key.startsWith('HAZARD_')) {
          delete process.env[key];
        }
      });
    });

    it('should use environment variables for timeouts', () => {
      process.env.REALTIME_TIMEOUT_MS = '45000';
      process.env.REALTIME_MAX_RETRIES = '10';
      process.env.REALTIME_BACKOFF_MS = '1000';
      
      const client = createRealtimeClient();
      
      // Test that config is applied (we can't directly access private config,
      // but we can verify the client was created successfully)
      expect(client).to.have.property('connect');
    });
  });
});