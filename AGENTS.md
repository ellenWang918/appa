# Project instructions

Appa is a Windows-first Electron desktop app, published as `ellenWang918/ai-goal-calendar` under the MIT license. The existing Evening Planner interface is the visual baseline. Product rules are recorded in `docs/product.md`; runtime and storage behavior are in `docs/desktop.md`.

The user renamed the product to Appa on 2026-10-13. Use Appa for display names and new build artifacts. Preserve the repository URL, original installer app ID, `%APPDATA%/AI Goal Calendar` profile, session partition and storage keys for compatibility with existing installations.

Each person connects their own eligible ChatGPT account through the system browser. Keep tokens in the main process and out of logs, frontend code, backups and source control. Desktop starts with an empty calendar and the computer's timezone, and retains its storage origin across restarts. The browser preview remains a separate development tool.

The user removed the two-active-goal limit on 2026-10-13. Activation adds a saved goal alongside existing active goals. Keep Later optional and enforce the daily time budget when scheduling.

Run and verify the app yourself when local tools permit. Report native UI or live-account verification as pending if it has not actually been completed. The packaged application must use compiled assets and the production local service; it must not depend on Vite's development server.

Preserve `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs`. They retain the optional static-hosting template contract. Desktop packaging uses its own explicit file list.

Run `npm test` and `npm run build` for relevant changes. Keep public release files free of private QA fixtures, personal backups, account registrations and environment secrets. Record durable product decisions in this file or the appropriate product document.
