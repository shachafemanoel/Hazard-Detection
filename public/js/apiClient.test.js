import { test, before, after, describe } from 'node:test';
import assert from 'node:assert';
import { startMockServer, stopMockServer } from '../../tests/mock-server.js';
import { createRealtimeClient, setApiUrl } from './apiClient.js';
import EventSource from 'eventsource';
import { fetch as undiciFetch } from 'undici';

// Polyfill globals for the test environment
global.EventSource = EventSource;

describe('Realtime Client', () => {
  let server;
  const mockServerUrl = 'http://localhost:8081';

  before(async () => {
    server = await startMockServer(8081);

    global.fetch = (url, options) => {
      const fullUrl = url.startsWith('/') ? `${mockServerUrl}${url}` : url;
      return undiciFetch(fullUrl, options);
    };

    setApiUrl(`${mockServerUrl}/api/v1`);
  });

  after(async () => {
    await stopMockServer();
  });

  test('should connect, receive messages, and disconnect', async () => {
    const client = createRealtimeClient();
    const receivedMessages = [];
    const statusChanges = [];

    client.onStatus(status => {
      statusChanges.push(status);
    });

    client.onMessage(message => {
      receivedMessages.push(message);
    });

    await client.connect();

    await new Promise(resolve => setTimeout(resolve, 500));

    client.disconnect();

    assert.deepStrictEqual(statusChanges.includes('connected'), true);
    assert.strictEqual(receivedMessages.length, 3);
    assert.strictEqual(receivedMessages[0].type, 'greeting');
  });
});
