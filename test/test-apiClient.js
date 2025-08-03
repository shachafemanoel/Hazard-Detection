const { expect } = require('chai');
const sinon = require('sinon');
const axios = require('axios');
const { resolveBaseUrl, createRealtimeClient } = require('../public/js/apiClient.js');

describe('apiClient', () => {
  let axiosGetStub;

  beforeEach(() => {
    axiosGetStub = sinon.stub(axios, 'get');
  });

  afterEach(() => {
    axiosGetStub.restore();
    delete process.env.HAZARD_USE_PRIVATE;
  });

  describe('resolveBaseUrl', () => {
    it('should return the private URL if HAZARD_USE_PRIVATE is "true"', async () => {
      process.env.HAZARD_USE_PRIVATE = 'true';
      const baseUrl = await resolveBaseUrl();
      expect(baseUrl).to.equal('http://ideal-learning.railway.internal:8080');
    });

    it('should return the public URL if HAZARD_USE_PRIVATE is "false"', async () => {
      process.env.HAZARD_USE_PRIVATE = 'false';
      const baseUrl = await resolveBaseUrl();
      expect(baseUrl).to.equal('https://hazard-api-production-production.up.railway.app');
    });

    it('should return the private URL if it is healthy', async () => {
      axiosGetStub.withArgs('http://ideal-learning.railway.internal:8080/health').resolves({ status: 200 });
      const baseUrl = await resolveBaseUrl();
      expect(baseUrl).to.equal('http://ideal-learning.railway.internal:8080');
    });

    it('should return the public URL if the private one is unhealthy', async () => {
      axiosGetStub.withArgs('http://ideal-learning.railway.internal:8080/health').rejects();
      axiosGetStub.withArgs('https://hazard-api-production-production.up.railway.app/health').resolves({ status: 200 });
      const baseUrl = await resolveBaseUrl();
      expect(baseUrl).to.equal('https://hazard-api-production-production.up.railway.app');
    });

    it('should throw an error if no endpoint is healthy', async () => {
      axiosGetStub.withArgs('http://ideal-learning.railway.internal:8080/health').rejects();
      axiosGetStub.withArgs('https://hazard-api-production-production.up.railway.app/health').rejects();
      try {
        await resolveBaseUrl();
        // Should not reach here
        expect.fail('Expected resolveBaseUrl to throw an error');
      } catch (error) {
        expect(error.message).to.equal('No healthy endpoint found (private/public)');
      }
    });
  });

  describe('createRealtimeClient', () => {
    let client;
    let axiosPostStub;

    beforeEach(() => {
      axiosPostStub = sinon.stub(axios, 'post');
      client = createRealtimeClient();
    });

    afterEach(() => {
      axiosPostStub.restore();
    });

    it('should connect, send a message, and disconnect', async () => {
      const onStatusChange = sinon.spy();
      const onMessage = sinon.spy();
      const onError = sinon.spy();

      client.onStatus(onStatusChange);
      client.onMessage(onMessage);
      client.onError(onError);

      axiosGetStub.withArgs('http://ideal-learning.railway.internal:8080/health').resolves({ status: 200 });
      axiosPostStub.withArgs('http://ideal-learning.railway.internal:8080/session/start').resolves({ data: { session_id: 'test-session' } });
      axiosPostStub.withArgs('http://ideal-learning.railway.internal:8080/detect/test-session').resolves({ data: { success: true } });
      axiosPostStub.withArgs('http://ideal-learning.railway.internal:8080/session/test-session/end').resolves({ data: {} });

      await client.connect();
      expect(client.isConnected()).to.be.true;

      const imageStream = 'dummy image data';
      await client.send(imageStream);

      await client.disconnect();
      expect(client.isConnected()).to.be.false;

      expect(onStatusChange.args).to.deep.equal([
        ['connecting'],
        ['connected'],
        ['uploading'],
        ['connected'],
        ['disconnected'],
      ]);

      expect(onMessage.callCount).to.equal(1);
      expect(onMessage.firstCall.args[0]).to.deep.equal({ success: true });
      expect(onError.callCount).to.equal(0);
    });
  });
});
