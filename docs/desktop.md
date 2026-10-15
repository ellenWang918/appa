# Desktop implementation and recovery

## Runtime

Electron loads the compiled React interface from a private loopback server in its main process. The frontend has no Node.js, filesystem, credential or generic IPC access. A read-only preload flag selects desktop-specific copy and an empty first workspace. The default timezone comes from the computer.

The server uses an OS-assigned available port on first launch and saves it in `desktop.json` under Electron's user-data folder. That port is reused so the browser-origin storage remains stable. If another process occupies it, startup fails visibly without loading a different origin or resetting the calendar. Single-instance locking prevents competing app launches.

The loopback server requires an unguessable per-launch HttpOnly device cookie set by Electron before loading the interface. Ordinary browser tabs cannot access the private session. A separate loopback listener receives OAuth callbacks from the system browser. State and PKCE bind those callbacks to a request initiated in the local app; nonce and verified ID-token claims bind the authenticated account.

## Data locations

On Windows, Appa retains the original user-data folder `%APPDATA%/AI Goal Calendar` explicitly, including the Chromium session directory. The original installer app ID, persistent partition and calendar storage keys also stay stable, so renaming the app preserves existing goals, drafts, settings and account registration metadata. The app's persistent partition contains calendar localStorage. `desktop.json` retains its origin's port, and `connection/registrations.json` retains the stable host ID and non-secret account/client mapping. OAuth access and refresh tokens are held in memory only.

Do not change or delete `desktop.json` to solve a port conflict: a changed origin would hide the existing calendar. Close the process occupying the saved port and reopen the app. Back up the entire user-data directory while the app is closed before attempting manual repair. For a damaged registration file, preserve a copy and contact the maintainer before reconnecting.

The calendar profile is local storage, not encrypted storage. Export backups regularly. The uninstaller is configured to retain app data, but export a backup before reinstalling or moving computers.

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
