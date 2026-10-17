# Desktop implementation and recovery

## Runtime

Electron loads the compiled React interface from a private loopback server in its main process. The frontend has no Node.js, filesystem, credential or generic IPC access. A read-only preload flag selects desktop-specific copy and an empty first workspace. The default timezone comes from the computer.

The server uses an OS-assigned available port on first launch and saves it in `desktop.json` under Electron's user-data folder. That port is reused so the browser-origin storage remains stable. If another process occupies it, startup fails visibly without loading a different origin or resetting the calendar. Single-instance locking prevents competing app launches.

The loopback server requires an unguessable per-launch HttpOnly device cookie set by Electron before loading the interface. Ordinary browser tabs cannot access the private session. A separate loopback listener receives OAuth callbacks from the system browser. State and PKCE bind those callbacks to a request initiated in the local app; nonce and verified ID-token claims bind the authenticated account.

## Data locations

On Windows, Appa retains the original user-data folder `%APPDATA%/AI Goal Calendar` explicitly, including the Chromium session directory. The original installer app ID, persistent partition and calendar storage keys also stay stable, so renaming the app preserves existing goals, drafts, settings and account registration metadata. Calendar data is now stored in `calendar.sqlite` in this profile. The original persistent partition and localStorage keys remain available as migration sources; they are not deleted after migration. `desktop.json` retains its origin's port, and `connection/registrations.json` retains the stable host ID and non-secret account/client mapping. Desktop OAuth credentials are also saved in `connection/credentials.bin`, encrypted by Electron safeStorage using Windows DPAPI. Only the main process decrypts them. On reopening, the saved account is restored and expired access tokens are renewed; the replacement refresh token is saved atomically before renewal completes. All authenticated desktop sessions share the account and renewal lock. Browser development account sessions remain separate and memory-only; their calendar database is stored separately under `.local/calendar.sqlite` in the source checkout. If encrypted storage is unavailable, Appa warns that sign-in is available only for the current session; it never writes plaintext credentials. An unreadable credential file leaves the calendar available and asks the user to sign in again. Sign out in Settings → User removes the encrypted session, invalidates pending sign-in/renewal work, and attempts remote revocation, while preserving the host ID and account registration. A revoked or expired renewable session requires fresh consent.

Do not change or delete `desktop.json` to solve a port conflict: a changed origin would hide the existing calendar. Close the process occupying the saved port and reopen the app. Back up the entire user-data directory while the app is closed before attempting manual repair. For a damaged registration file, preserve a copy and contact the maintainer before reconnecting.

The calendar profile is local storage, not encrypted storage. Export backups regularly. The uninstaller is configured to retain app data, but export a backup before reinstalling or moving computers.

## SQLite calendar storage

The main process owns the SQLite connection using Node's built-in `node:sqlite`. The renderer loads the saved workspace before showing the calendar and saves through the existing authenticated, same-origin, CSRF-protected local service. No account sign-in is needed to load or save local data. Desktop keeps its device-cookie boundary. Node.js 22.13 or newer is needed when building from source; the pinned Electron runtime already includes SQLite support.

`workspace` holds the validated calendar snapshot and revision. `event`, `goal` and `event_series` are transactional searchable projections of that snapshot. Calendar settings, draft plans, choices, colours, completion history and recurrence overrides retain their existing backup format and identities. `change_history` retains up to 100 previous snapshots per workspace; this internal recovery history is separate from the one-level Undo available in the current session. Chat messages are not persisted. Short-lived, revision-bound replanning selections/proposals are saved in `proposal` and expire after 30 minutes.

On first opening a workspace without a SQLite snapshot, Appa validates and imports the existing browser-origin calendar. `migration_backup` archives the original raw JSON, and the legacy localStorage copy is retained. Later openings load SQLite and never replace it with the old copy. Invalid legacy data opens recovery without saving an empty replacement. A database/service failure displays a startup error instead of silently starting fresh. The main and isolated reference workspaces use separate scopes. A browser prototype on another origin must still be exported and imported explicitly.

Saves are queued and use optimistic revision checks. Conflicting writes fail visibly rather than overwriting a newer calendar; export the current work before reloading. Pending/failed saves trigger the close/reload warning. Assistant requests wait for queued saves; approved moves are revalidated and committed atomically. WAL journaling and full synchronous writes protect committed data. The `calendar.sqlite-wal` and `calendar.sqlite-shm` sidecars belong to the database: do not delete them while Appa is running. Close Appa before copying its profile, or use the regular JSON backup export. The database, migration archive and snapshots are local and are not encrypted by Appa.

The development preview uses its own `.local/calendar.sqlite` and does not read the installed application's profile. The optional static-hosting template has no local SQLite service and retains browser localStorage only when that service explicitly returns 404. Network errors or damaged SQLite data never trigger this fallback. That static template does not implement calendar-aware chat/replanning; use the local app or development service for those features.

## Move from the browser prototype

In the browser preview, open **Settings → Backup → Export backup**. In the desktop app, choose **Settings → Backup → Import backup**, inspect the summary, and restore. The desktop app never silently reads another browser's data or account credentials. Complete ChatGPT sign-in separately in the desktop app.

## Build

```sh
npm ci
npm test
npm run desktop:dist
```

The Windows x64 NSIS installer is created in `release/`. `npm run desktop:pack` creates an unpacked application for local checks. Node.js is required for building from source, but is bundled into the installer for end users. The browser development preview remains available through `npm run dev`.

Packaging copies the pinned official Electron runtime installed by `npm ci` from `node_modules/electron/dist`, avoiding a second runtime download and archive-extraction directory renames on Windows.

The installer creates desktop and Start menu shortcuts named Appa and registers Appa in Windows Installed apps for uninstalling. Launching either shortcut opens the packaged executable and its bundled production service without a terminal or development server. Installation is per user by default. Keep the original app ID and profile location when building updates so existing calendars remain accessible.

Windows executable resources retain Appa's name, version and calendar icon even in unsigned builds. `build/appa.svg` reuses the interface's Phosphor CalendarDots mark; `build/appa.ico` contains the Windows icon sizes. Code signing is disabled separately from resource editing.

Source code is strict TypeScript. `npm run typecheck` checks the React interface and Node/Electron modules with their respective module-resolution settings. `npm run build:runtime` compiles the desktop entry, local service, scheduling module and sandboxed CommonJS preload into `dist/runtime/`. The package entry is `dist/runtime/desktop/main.js`, and its preload is `dist/runtime/desktop/preload.cjs`. The desktop never executes TypeScript source or requires a development-time TypeScript loader. The existing regression suite runs against the compiled runtime.

The explicit packaging file list excludes private QA images, backups, registration files and development environment files. Only the compiled UI, desktop runtime, AI service, scheduling module, required runtime dependency, and license notices ship.
