import { createRealtimeClient } from '../public/js/apiClient.js';

// Polyfill for Blob in Node.js environment
import { Blob } from 'buffer';

console.log('🚀 Starting Real-time Client Verification Script...');

const client = createRealtimeClient();
let messageCounter = 0;

// Set a timeout for the entire script to prevent it from hanging.
const SCRIPT_TIMEOUT = 45000; // 45 seconds
const scriptTimeout = setTimeout(() => {
  console.error('❌ ERROR: Script timed out. Could not complete verification.');
  process.exit(1);
}, SCRIPT_TIMEOUT);

client.onStatus(status => {
  console.log(`[STATUS] Client status changed to: ${status}`);
  if (status === 'connected') {
    console.log('✅ Client connected successfully. Sending a test payload...');
    // Create a dummy payload. In a real scenario, this would be an image blob.
    const dummyPayload = new Blob(['dummy frame data']);
    client.send(dummyPayload).catch(err => {
        console.error('Error sending payload', err)
    });
  }
});

client.onMessage(message => {
  console.log('[MESSAGE] Received message from server:', message);
  messageCounter++;
  if (messageCounter >= 3) {
    console.log('🎉 Received 3 messages. Verification successful!');
    client.disconnect();
    clearTimeout(scriptTimeout);
    process.exit(0);
  }
});

client.onError(error => {
  // We only exit on major errors. Reconnecting is handled by the client.
  if (client.isConnected()) {
      console.warn('[WARNING] Non-fatal error occurred:', error.message);
  } else {
      console.error('❌ ERROR: A critical error occurred:', error.message);
      clearTimeout(scriptTimeout);
      process.exit(1);
  }
});

// Start the connection process
client.connect().catch(err => {
    console.error('❌ ERROR: Failed to connect.', err.message);
    clearTimeout(scriptTimeout);
    process.exit(1);
});

console.log('⏳ Connecting and waiting for messages...');
