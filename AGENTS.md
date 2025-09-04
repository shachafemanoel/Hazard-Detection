# Repository Guidelines

## Project Structure & Module Organization
- `server/`: Express API, auth (Google OAuth), Redis, Cloudinary uploads. Entry: `server/server.js` (reads `server/.env`).
- `public/`: Static client (HTML, JS, CSS, ONNX assets under `public/ort`). Dashboard modules in `public/js/modules/`.
- `tests/`: Jest setup in `tests/setup/jest.setup.js`; unit tests in `tests/**/*.test.js`.
- Root config: `package.json`, `jest.config.js`, `babel.config.js`, `tailwind.config.js`, `.env.example`.

## Build, Test, and Development Commands
- `npm run dev`: Start server with nodemon; watches `server/`.
- `npm start`: Run Express server for production/local without reload.
- `npm test`: Run all Jest tests (jsdom environment).
- `npm run test:coverage`: Generate coverage to `coverage/`.
- `npm run test:e2e`: Run Playwright tests (run once: `npx playwright install`).
- `npm run test:unit` / `npm run test:integration`: Filter by path patterns.

## Coding Style & Naming Conventions
- Language: Node 18+, ES modules (`type: module`).
- Indentation: 2 spaces; use semicolons; prefer single quotes.
- Filenames: kebab-case for browser JS (`public/js/...`); descriptive snake/kebab for server files.
- Client UI: follow `style-guide.md`; Tailwind utility classes allowed via `tailwind.config.js`.
- Keep modules small; colocate helpers under `public/js/modules/` or `server/services/` as applicable.

## Testing Guidelines
- Framework: Jest + jsdom; setup via `tests/setup/jest.setup.js` (mocks canvas, ONNX, Web APIs).
- Location: `tests/**/*.test.js` (e.g., `tests/unit/yolo-detection.test.js`).
- Conventions: mirror source path in test name; use `describe/it` and explicit assertions.
- Coverage: aim ≥80% on changed files; validate with `npm run test:coverage`.

## Commit & Pull Request Guidelines
- Commits: prefer Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`). Keep messages imperative and scoped.
- PRs: concise description, linked issues, screenshots/GIFs for UI changes (dashboard), test plan, and risk notes. Update docs when behavior changes.

## Security & Configuration Tips
- Secrets: place server secrets in `server/.env` (code loads from there). Do not commit `.env*` files.
- Required env vars: `SESSION_SECRET`, `CLOUDINARY_*`, `REDIS_*`, `SENDGRID_API_KEY`, plus Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GOOGLE_MAP_GEOCODE`.
- CORS and cookies: production sets secure/sameSite; verify `BASE_URL` and `NODE_ENV`.
