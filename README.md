# Road Hazard Detector UI

A responsive, accessible web UI (RTL-friendly) for reporting and viewing road hazards. Built with vanilla HTML, CSS and JavaScript modules.

## Setup
Open `public/index.html` in a modern browser. No build step is required.

## Keyboard Shortcuts
- `Tab` / `Shift+Tab`: navigate through interactive elements.
- `Enter` or `Space`: activate focused button or link.
- `Esc`: close dialogs.

## Features
- Live camera detection overlay
- Manual report creation with image and geolocation
- Map with clustered markers
- Offline queue of reports using IndexedDB
- History list with sync on reconnect
- Settings including language toggle and self-test diagnostics

## Development
The code uses ES modules located in `public/js`. Sample data is under `public/js/sample-*`.
