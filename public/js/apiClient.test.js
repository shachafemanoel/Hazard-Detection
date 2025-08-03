import { test, before, after, describe } from 'node:test';
import assert from 'node:assert';
import { startMockServer, stopMockServer } from '../../tests/mock-server.js';
import { createRealtimeClient } from './apiClient.js';
import EventSource from 'eventsource';

// Polyfill global fetch and EventSource for the test environment
import { fetch as undiciFetch } from 'undici';
global.EventSource = EventSource;

describe('Realtime Client', () => {
  let server;
  const mockServerUrl = 'http://localhost:8081';

  before(async () => {
    server = await startMockServer(8081);

    // Polyfill fetch to use the mock server's URL for relative paths
    global.fetch = (url, options) => {
      const fullUrl = url.startsWith('/') ? `${mockServerUrl}${url}` : url;
      return undiciFetch(fullUrl, options);
    };

    // Set the API_URL for functions that use it
    const apiClientModule = await import('./apiClient.js');
    apiClientModule.setApiUrl(`${mockServerUrl}/api/v1`);
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

    // Wait for messages to be received
    await new Promise(resolve => setTimeout(resolve, 500));

    client.disconnect();

    assert.deepStrictEqual(statusChanges, ['connecting', 'connected', 'disconnected']);
    assert.strictEqual(receivedMessages.length, 3);
    assert.strictEqual(receivedMessages[0].type, 'greeting');
  });
});
