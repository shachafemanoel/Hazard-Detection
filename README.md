# Hazard Detection Dashboard

A full‑stack web app for reporting and managing road hazards. Includes an Express API with Google OAuth, Redis session/data store, Cloudinary uploads, and a modern frontend with Leaflet maps, clustering, and test coverage via Jest.

## Quick Start

- Requirements: Node 18+, Redis (optional in dev), Cloudinary (optional), SendGrid (optional)
- Install deps: `npm ci`
- Copy env: `cp .env.example .env` and `cp .env.example server/.env`, then fill values
- Dev server: `npm run dev` (serves frontend from `public/` and API from `server/`)
- Tests: `npm test` (coverage: `npm run test:coverage`)

## Scripts

- `npm run dev`: Start server with nodemon
- `npm start`: Start server (no reload)
- `npm test`: Run Jest tests
- `npm run test:coverage`: Coverage report in `coverage/`

## Project Structure

- `public/` frontend (HTML/CSS/JS, Leaflet map, clustering)
- `server/` Express API, auth, Redis, Cloudinary (`server/server.js`)
- `tests/` Jest setup and unit tests
- `AGENTS.md` contributor guide (coding/testing/style)

## Environment Variables

Create `.env` (root) and `server/.env` with at least:

- `SESSION_SECRET`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `SENDGRID_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `GOOGLE_MAP_GEOCODE` (server‑side geocoding only)

See `.env.example` for all options. Do not commit `.env*` files.

## Security & Publishing

- Secrets are ignored by Git (`.env`, `server/.env`) — keep only `.env.example` in Git
- Rotate any secrets that were ever committed
- Lock API keys: Google Geocoding by server IP; any client keys by referer domains
- Optional: run `trufflehog` locally to scan for secrets before pushing public

## License

Choose and add a LICENSE file (MIT/Apache‑2.0) if desired.
