# Verification status

Date: 2026-10-13. Target: Windows x64, version 0.1.0.

- 35 automated checks pass: 25 calendar/AI-stream checks, 6 desktop and OAuth-boundary checks, and 4 static-template packaging checks.
- Strict TypeScript checks and the production frontend/runtime build pass. All 35 checks execute against the compiled runtime where applicable.
- TypeScript migration verified on 2026-10-13: Windows unpacked packaging succeeds. The packaged app opens from `dist/runtime/desktop/main.js`, loads its CommonJS preload and private local service, saves settings on an empty calendar, and approves/schedules a manual goal with Undo. The synthetic goal was undone and its draft cleared after verification. The package contains compiled runtime files and excludes TypeScript sources, the compiler, development types and private QA files. Real account sign-in and inference remain unverified.
- Daily budget removal verified on 2026-10-13: browser preview confirms settings save/reload without a budget field, Today and Week omit budget indicators, and approving a manual goal can schedule 105 minutes in one day. The synthetic goal was undone after verification. Regression checks cover longer schedules, recovery, shared choices, available hours and legacy-backup compatibility. Native settings and calendar were also checked during TypeScript migration.
- Appa source rename verified on 2026-10-13: the native window, document title and main heading show Appa; the original desktop storage origin is retained. The full 29-check suite and production build pass after the rename. The published 0.1.0 installer predates the rename.
- Windows NSIS installer was built locally from the compiled frontend and official Electron 44.7.0 runtime, using electron-builder 26.15.3. The installer is unsigned.
- The packaged Windows executable was verified through its native interface: empty first launch, manual goal creation, approval and scheduling, Undo, quit/reopen, and restoration of an unfinished planner draft. The same local storage origin was retained after reopening. The synthetic goal was undone and its draft cleared after verification.
- Existing browser calendar flows were verified before desktop packaging, including goal planning, activation beyond two goals, completion, recovery, backup/import and responsive layouts.
- Real desktop account sign-in, consent, model access and inference require the user's authorization and remain unverified. The OAuth tests use synthetic discovery and deliberately incomplete callbacks, without a real account or token.
- Windows installation/uninstallation, signed distribution, automatic updates, macOS and Linux support remain unverified or deferred.

To repeat automated verification, run `npm ci`, `npm run typecheck`, `npm run build`, then `npm test`. `npm run desktop:dist` produces the installer. See [desktop runtime and recovery](desktop.md) for details.
