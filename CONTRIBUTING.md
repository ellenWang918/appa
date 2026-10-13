# Contributing

Thank you for helping make starting a goal easier.

Use GitHub Issues for reproducible bugs or a small feature proposal. Include the app version, Windows version, expected behavior, and what happened. Remove personal goal text and account information from screenshots. Never include tokens, authorization URLs, account registration files or calendar backups in public reports.

## Develop

Install Node.js 22 or newer, then:

```sh
npm ci
npm run build
npm test
npm run desktop
```

`npm run dev -- --host 127.0.0.1 --port 4173 --strictPort` runs the browser development preview. It uses a separate calendar from the desktop app. For UI iteration, use the browser preview; `npm run desktop` rebuilds the bundled interface before opening Electron.

Use strict TypeScript for application code and share data contracts through `src/types.ts`. Run `npm run typecheck` while editing. The production build checks both the frontend and Node/Electron runtime, and `npm test` compiles the runtime before running the existing JavaScript regression suite. Keep runtime validation at JSON, backup and network boundaries.

## Submit a change

Create a branch, keep the change focused, and explain the user-visible behavior in your pull request. Run `npm test` and `npm run build`. Add a meaningful regression check when changing scheduling, persistence, account boundaries, or desktop security. Visual changes should include public-safe screenshots.

Preserve available hours, prerequisite order, shared-slot choice rules, missed-day recovery and Undo. Activation may add more than two active goals. Keep account tokens out of the renderer, logs and backups. Open sign-in in the system browser.

The template's `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs` and `tests/sites-worker.test.mjs` remain intact. Desktop releases use compiled `dist/runtime/` and `dist/client/`; they do not depend on the static hosting worker.

Contributions are made under the project's MIT license. Third-party components retain their own licenses.
