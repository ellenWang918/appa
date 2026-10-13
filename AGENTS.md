# Project instructions

Appa is a Windows-first Electron desktop app, published as `ellenWang918/appa` under the MIT license. The user approved a monochrome calendar reference on 2026-10-14: a left month navigator, full-width calendar, compact grey task blocks and a floating goal composer with a red action. Preserve this visual baseline and Appa's identity. Read `docs/product.md` for view and scheduling behavior and `docs/desktop.md` for runtime and storage behavior.

The user chose TypeScript on 2026-10-13. Keep application code in strict TypeScript: React `.tsx`, shared modules and services `.ts`, and the sandboxed preload `.cts`. Shared domain and API types live in `src/types.ts`. Desktop runs compiled files from `dist/runtime`; preserve the static-hosting template files in their existing formats.

The user renamed the product to Appa and the GitHub repository to `appa` on 2026-10-13. Use Appa for display names and new build artifacts, and `https://github.com/ellenWang918/appa` for repository links. Preserve the original installer app ID, `%APPDATA%/AI Goal Calendar` profile, session partition and storage keys for compatibility with existing installations.

Each person connects their own eligible ChatGPT account through the system browser. Keep tokens in the main process and out of logs, frontend code, backups and source control. Desktop starts with an empty calendar and the computer's timezone, and retains its storage origin across restarts. The browser preview remains a separate development tool.

The user removed the two-active-goal limit and daily time budget on 2026-10-13. Activation adds a saved goal alongside existing active goals. Keep Later optional. Schedule within the user's available hours without overlapping slots. Older calendars and backups may contain a budget field; discard it when loading settings.

Run and verify the app yourself when local tools permit. Report native UI or live-account verification as pending if it has not actually been completed. The packaged application must use compiled assets and the production local service; it must not depend on Vite's development server.

Preserve `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs`. They retain the optional static-hosting template contract. Desktop packaging uses its own explicit file list.

Run `npm test` and `npm run build` for relevant changes. Keep public release files free of private QA fixtures, personal backups, account registrations and environment secrets. Record durable product decisions in this file or the appropriate product document.
