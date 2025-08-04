# Real-time Streaming Client Guide

This guide provides instructions for using the high-precision, private-first real-time streaming client for the Hazard Detection API.

## 1. Overview

The real-time client is designed for applications that require immediate feedback from the hazard detection API. It uses a combination of an HTTP-based "ingest" flow for sending image data and a Server-Sent Events (SSE) stream for receiving real-time updates and results.

## 2. Features

*   **Private-First Connectivity:** Automatically probes a private network endpoint and falls back to a public one if the private network is unavailable.
*   **Real-time Notifications:** Uses Server-Sent Events (SSE) to receive immediate updates from the server.
*   **Resilient Connections:** Includes automatic reconnection logic with exponential backoff for both the initial connection and the SSE stream.
*   **Simple Interface:** Provides a clean, event-driven interface for connecting, sending data, and listening for messages.
*   **Configurable:** All key parameters can be configured via environment variables.

## 3. Configuration

The client is configured via environment variables that are exposed by the server's `/api/config` endpoint.

| Variable                  | Description                                               | Default                                                        |
| ------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `HAZARD_API_URL_PRIVATE`  | The URL of the private API endpoint.                      | `http://ideal-learning.railway.internal:8080`                  |
| `HAZARD_API_URL_PUBLIC`   | The URL of the public API endpoint.                       | `https://hazard-api-production-production.up.railway.app`      |
| `HAZARD_USE_PRIVATE`      | Force usage of private/public network (`true`, `false`, `auto`). | `auto`                                                         |
| `REALTIME_TRANSPORT`      | The desired transport (`ws`, `sse`, `http`).              | `auto` (currently defaults to SSE+HTTP)                        |
| `REALTIME_AUTH_TOKEN`     | A Bearer token for authenticating API requests.           | `null`                                                         |
| `REALTIME_TIMEOUT_MS`     | Timeout for health checks.                                | `30000`                                                        |
| `REALTIME_MAX_RETRIES`    | Maximum number of connection retries.                     | `5`                                                            |
| `REALTIME_BACKOFF_MS`     | The base backoff delay for retries in milliseconds.       | `500`                                                          |
| `REALTIME_HEARTBEAT_MS`   | Interval for heartbeats (if applicable).                  | `0`                                                            |

## 4. Usage

The client is available as an ES module and can be used in any modern JavaScript environment.

### 4.1. Importing the Client

```javascript
import { createRealtimeClient } from './apiClient.js';
```

### 4.2. Creating and Using a Client Instance

Here is a complete example of how to use the client:

```javascript
import { createRealtimeClient } from './apiClient.js';

// 1. Create a client instance
const client = createRealtimeClient();

// 2. Set up event listeners
client.onStatus(status => {
  console.log(`Client status is now: ${status}`);
  // e.g., update UI to show connection status
});

client.onMessage(message => {
  console.log('Received real-time message:', message);
  // e.g., handle new report notifications
  if (message.type === 'new_report') {
    console.log('A new hazard report has been created:', message.report);
  }
});

client.onError(error => {
  console.error('An error occurred:', error);
});

// 3. Connect to the service
client.connect().then(() => {
  console.log('Client connected successfully!');

  // 4. Send data (e.g., an image blob from a canvas)
  canvas.toBlob(blob => {
    if (blob) {
      client.send(blob)
        .then(result => {
          console.log('Detection result:', result);
        })
        .catch(error => {
          console.error('Failed to send detection:', error);
        });
    }
  }, 'image/jpeg');

}).catch(error => {
  console.error('Failed to connect after multiple retries:', error);
});


// 5. Disconnect when done
// a-button.addEventListener('click', () => {
//   client.disconnect();
// });
```

## 5. API Reference

The `createRealtimeClient()` function returns a client object with the following methods and properties.

### `connect()`
Asynchronously connects the client to the hazard detection service.
- Resolves the base URL (private or public).
- Starts a session with the API.
- Establishes a Server-Sent Events (SSE) connection.
- Returns a `Promise` that resolves on successful connection or rejects if the connection fails after all retries.

### `disconnect()`
Disconnects the client, closing the SSE connection and ending the API session.

### `send(payload)`
Sends a payload (e.g., an image `Blob`) to the detection endpoint.
- `payload`: The data to send.
- Returns a `Promise` that resolves with the detection result from the API.

### `onMessage(callback)`
Registers a callback function to handle incoming messages from the SSE stream.
- `callback(message)`: A function that will be called with the parsed message object.

### `onError(callback)`
Registers a callback function to handle errors.
- `callback(error)`: A function that will be called with an `Error` object.

### `onStatus(callback)`
Registers a callback function to handle client status changes.
- `callback(status)`: A function that will be called with a status string. Possible values are:
  - `disconnected`
  - `connecting`
  - `connected`
  - `reconnecting`
  - `uploading`

### `isConnected()`
Returns `true` if the client is currently connected, `false` otherwise.

## 6. Server-Sent Events (SSE)

The client listens for events on the `/api/events/stream` endpoint. The server sends JSON-formatted messages for various events.

### Example Message

```json
{
  "type": "new_report",
  "report": {
    "id": 1678886400000,
    "type": "pothole",
    "location": "Main St",
    "time": "2023-03-15T12:00:00.000Z",
    "image": "https://example.com/image.jpg",
    "status": "New",
    "reportedBy": "user@example.com"
  }
}
```

### Event Types
- `new_report`: A new hazard report has been created.
- `status_update`: The status of an existing report has been updated.
- `report_updated`: An existing report has been modified.
