# Client Audit Summary

## Root Causes Found
- External model errors left the UI without detections or reports.
- API client retry logic referenced an undefined error variable and lacked typed errors.
- Notifications module was not an ES module, preventing imports.
- Report uploads failed offline with no retry queue.
- Dashboard polling interval too long for live updates.

## Fixes Implemented
- Added `FallbackDetectionProvider` and auto switch via `switchToFallback`.
- Created `PendingReportsQueue` for offline report retry.
- Hardened `apiClient.js` with `TransportError`, `ModelError`, and `ParseError` classes and fixed retry logic.
- Converted notifications to ESM and exported helpers.
- Poll dashboard every 10s with `If-Modified-Since` header.
- Tests for imports, fallback switch, bbox mapping, and queue retry.

## Running Fallback Mode
Fallback triggers automatically when API health check or detection fails. The current mode and queue size appear in the debug panel.

## Running Tests
```bash
npm test
```
