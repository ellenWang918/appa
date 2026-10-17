# Security and privacy

## Local application

Appa is a local desktop application. Calendar data is saved in `calendar.sqlite` in the app's local profile on your computer. The legacy Chromium calendar copy is retained during migration; SQLite also stores the original migration JSON and up to 100 previous calendar snapshots for recovery. Deleting an entry from the current calendar does not immediately purge these recovery copies. Export/import backups retain the current calendar snapshot, not these internal copies. Export/import backups contain goal and progress data; keep them private. There is no maintainer-operated AI server, account database, analytics, or cloud synchronization.

When you use AI chat, the message, recent conversation, timezone, current date/time, earliest saved date and scheduling hours are sent directly from the local main process to OpenAI. The first routing request does not include the calendar's event records: SQL retrieval, factual answer construction and proposed-time validation run locally. However, earlier calendar answers in the recent conversation may include matching event titles/times/status and be sent with a follow-up request. Manual planning remains local. Requests use `store: false`. OpenAI's own processing and retention policies still apply. Tokens are never included in calendar context.

Each person authorizes their own eligible ChatGPT account. Desktop OAuth credentials are held in the main process and persisted only in `connection/credentials.bin`, encrypted with Electron safeStorage (Windows DPAPI). There is no plaintext fallback. The current Windows user can resume and renew the session after restart. Rotating refresh tokens are replaced atomically and renewals are serialized within the single app instance. Sign out in Settings → User clears the saved credentials and attempts remote revocation; a failed revocation is reported. Non-secret client registrations, account labels and a stable host ID remain in `connection/registrations.json` for future sign-in; do not publish these files. The browser development preview keeps tokens in memory only. Tokens are never placed in renderer JavaScript, browser storage, exported backups, logs, or source control.

The renderer is sandboxed with Node integration disabled and context isolation enabled. The app serves packaged assets on loopback only, requires a launch-specific HttpOnly device cookie, enforces same-origin requests and CSRF protection, restricts navigation, and opens allowlisted HTTPS sign-in/documentation links in the system browser. The OAuth callback uses state, nonce, verified ID tokens and S256 PKCE. Native callbacks do not require an Electron cookie in the separate system browser.

Local data is not encrypted by this application. Your OS account and disk protection govern access to your application profile. Protect your computer and exported backups accordingly.

## Report a vulnerability

Use the repository's **Security → Report a vulnerability** feature when available. If private reporting is unavailable, open an issue asking the maintainer for a private contact channel, without exploit details or credentials. Never post tokens, authorization URLs, personal backups, or registration files publicly.

## Release status

Version 0.1 is an early desktop release. Manual planning and automated security-boundary checks are verified separately from real account authorization. Genuine ChatGPT sign-in and inference require an eligible user's live consent and must not be represented as verified by mocked tests.

Installers are initially unsigned. Public signing and automatic updates are future work. Updates are downloaded manually from this repository's Releases page; the application does not silently install updates.
