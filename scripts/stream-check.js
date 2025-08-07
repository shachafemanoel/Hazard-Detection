import { createRealtimeClient } from '../public/js/apiClient.js';
import { Blob } from 'buffer';
import { fetch } from 'undici';
import EventSource from 'eventsource';

// Polyfill globals for the test environment
global.fetch = fetch;
global.EventSource = EventSource;

console.log('🚀 Starting Real-time Client Verification Script...');

const client = createRealtimeClient();
let messageCounter = 0;
const REQUIRED_MESSAGES = 3;
const TEST_PAYLOADS = 3;

const SCRIPT_TIMEOUT = 20000; // 20 seconds
const scriptTimeout = setTimeout(() => {
  console.error('❌ ERROR: Script timed out. Could not complete verification.');
  process.exit(1);
}, SCRIPT_TIMEOUT);

client.onStatus(async status => {
  console.log(`[STATUS] Client status changed to: ${status}`);
  if (status === 'connected') {
    console.log(`✅ Client connected successfully. Sending ${TEST_PAYLOADS} test payloads...`);
    const dummyPayload = new Blob(['dummy frame data']);
    try {
      await Promise.all(
        Array.from({ length: TEST_PAYLOADS }, () => client.send(dummyPayload))
      );
    } catch (err) {
      console.error('Error sending payload', err);
    }
  }
});

client.onMessage(message => {
  console.log('[MESSAGE] Received message from server:', message);
  messageCounter++;
  if (messageCounter >= REQUIRED_MESSAGES) {
    console.log(`🎉 Received ${REQUIRED_MESSAGES} messages. Verification successful!`);
    client.disconnect();
    clearTimeout(scriptTimeout);
    process.exit(0);
  }
});

client.onError(error => {
  if (client.isConnected()) {
      console.warn('[WARNING] Non-fatal error occurred:', error.message);
  } else {
      console.error('❌ ERROR: A critical error occurred:', error.message);
      clearTimeout(scriptTimeout);
      process.exit(1);
  }
});

client.connect().catch(err => {
    console.error('❌ ERROR: Failed to connect.', err.message);
    clearTimeout(scriptTimeout);
    process.exit(1);
});

console.log('⏳ Connecting and waiting for messages...');
