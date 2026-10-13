# Security and privacy

## Local application

AI Goal Calendar is a local desktop application. Calendar data is saved in the app's Chromium profile on your computer. Export/import backups contain goal and progress data; keep them private. There is no maintainer-operated AI server, account database, analytics, or cloud synchronization.

When you request AI planning, the intention and any clarification you entered are sent directly from the local main process to OpenAI. The rest of your saved calendar is not included. Requests use `store: false`. OpenAI's own processing and retention policies still apply.

Each person authorizes their own eligible ChatGPT account. OAuth tokens remain in main-process memory and are cleared when the app exits. Reconnect after reopening. Non-secret client registrations, account labels and a stable host ID are saved in the app's `connection/registrations.json`; do not publish that file. Tokens are never placed in renderer JavaScript, exported backups, or source control.

The renderer is sandboxed with Node integration disabled and context isolation enabled. The app serves packaged assets on loopback only, requires a launch-specific HttpOnly device cookie, enforces same-origin requests and CSRF protection, restricts navigation, and opens allowlisted HTTPS sign-in/documentation links in the system browser. The OAuth callback uses state, nonce, verified ID tokens and S256 PKCE. Native callbacks do not require an Electron cookie in the separate system browser.

Local data is not encrypted by this application. Your OS account and disk protection govern access to your application profile. Protect your computer and exported backups accordingly.

## Report a vulnerability

Use the repository's **Security → Report a vulnerability** feature when available. If private reporting is unavailable, open an issue asking the maintainer for a private contact channel, without exploit details or credentials. Never post tokens, authorization URLs, personal backups, or registration files publicly.

## Release status

Version 0.1 is an early desktop release. Manual planning and automated security-boundary checks are verified separately from real account authorization. Genuine ChatGPT sign-in and inference require an eligible user's live consent and must not be represented as verified by mocked tests.

Installers are initially unsigned. Public signing and automatic updates are future work. Updates are downloaded manually from this repository's Releases page; the application does not silently install updates.
