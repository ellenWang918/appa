# Verification status

## Local Windows update to 0.1.7 — 2026-10-30

- Built the Windows x64 NSIS installer and installed Appa 0.1.7 over 0.1.6. Installer exit code is zero, the installed executable reports 0.1.7.0, and its application archive matches the packaged build by SHA-256. A matching installer checksum is retained locally in `release/`.
- Backed up the closed application's profile privately under ignored `.local/` before installation. The calendar database, saved origin configuration, account registrations and encrypted credentials had identical hashes immediately before and after installation. The original profile, installer identity and shortcuts are retained.
- Started the installed application and confirmed its processes respond. The bundled production service rejects requests without its device cookie with HTTP 403. This startup/service check does not constitute manual visual verification or genuine account consent/inference testing.
- All **194 Node checks**, the automated React/local-service/SQLite renderer journeys, strict TypeScript checks and production build pass. New checks cover non-committing move/resize previews, validation parity and access to goal steps/history beyond the initial 15 records. Existing inline event-tag editing, calendar groups, save recovery, shared reservations and Undo checks remain passing.
- Package inspection confirms the compiled desktop entry and client are present and excludes application TypeScript sources, tests, private QA, source maps, databases, registrations, credentials and environment files. Source publication excludes the private profile backup and generated installer.
- This update includes direct inline event entry without AI, separate editable date/time tags, shared Calendar/Active goal rows and palette, indexed view queries, on-demand deletion scope and lighter timeline previews. Local installer creation and source publication are separate from publishing a GitHub Release; no installer upload or release tag is included.

## Architecture, persistence and scalability fixes — 2026-10-26

- **184 Node checks** pass, including new save-queue recovery, response-loss reconciliation, real revision conflicts, pending-save coalescing, recurrence-aware date queries, time conversion and incremental search-projection checks. Strict TypeScript and the production build pass.
- `npm test` also builds and runs four automated renderer journeys in a hidden Electron window: temporary save failure → latest-edit retry → reload; event creation/editing, resize/drag and Undo through SQLite; dirty-draft keep/discard; and a mocked AI proposal that changes data only after Apply, with Undo. The window uses a temporary profile and synthetic calendar; its launcher removes the profile after Electron releases its locks. These checks run in the existing Windows CI gate.
- A repeatable `node scripts/benchmark-calendar.mjs` benchmark (after runtime compilation) uses 1k/5k/10k completed all-day events on distinct historical dates. On this machine with Node 24.14.1, median draft saves were **5/21/40 ms**, versus the audit's **19/213/893 ms**. Five Year query indexes took **1/4/7 ms**, versus **34/99/227 ms** for the previous daily slot scans. Three saves per size; timings exclude HTTP and DOM rendering and are not supported capacity guarantees.
- Shared workspace/navigation controllers, goal navigation, colour selection, time-range conversion and pure date/query helpers replace duplicated ownership. CSS and the approved visual baseline are preserved.
- The renderer checks use real React, the private local HTTP service and SQLite with synthetic inputs. They do not verify genuine ChatGPT consent/inference, native physical dragging, manual visual/accessibility checks or installer upgrades. Those remain separate verification tasks.

## Local Windows update to 0.1.5 — 2026-10-18

- Built the Windows x64 installer and installed Appa 0.1.5 over 0.1.4. Installer exit code is zero, executable product version is 0.1.5.0, and the installed `app.asar` hash matches the verified build exactly.
- Retained the original profile, installer identity and persistent origin. Before installing, saved a private profile copy under the ignored `.local/` directory. The saved origin settings, account registrations and encrypted credentials had identical hashes before and immediately after installation.
- Started the installed application. Its processes are responding; the private production service returns HTTP 403 without its device cookie. SQLite schema version 1 and the main workspace are initialized in the retained profile. This service/database check does not inspect calendar content or prove native visual interaction quality.
- All **143 automated checks**, strict TypeScript checks and the production build pass. Package inspection confirms the compiled client, runtime, SQLite store and calendar assistant; it excludes TypeScript source, tests, private QA, source maps, database files, registrations and credentials.
- The installer and SHA-256 checksum are retained under `release/`. No public GitHub release or installer upload is included in this source update. Live ChatGPT sign-in/inference, visual interaction checks and native Undo/restart flows remain pending.

## SQLite and calendar assistant source update — 2026-10-18

- Full regression suite: **143 passed, 0 failed**. Strict TypeScript checks and the production frontend/runtime build pass. This includes the retained static-hosting contract.
- Migration/store tests cover original raw JSON preservation, stable IDs, recurrence/group/colour compatibility, reopening from SQLite, corrupt legacy recovery, SQL search, invalid input and stale-write rejection without changing saved records or indexes.
- Calendar assistant tests cover hidden groups, recurring history without duplicate occurrences, future exclusion for “last”, recorded versus completed status, missing results, availability reservations and bounded follow-up context with editable proposal details.
- Local HTTP integration uses simulated ChatGPT/OAuth responses. It verifies grounded search instead of model-invented facts, new goal/event drafts without writes, explicit candidate selection and preview, atomic application, batch Undo, unchanged work, and stale/cross-workspace/replayed proposal rejection. Calendar changes during inference invalidate its result. Existing private-cookie, same-origin, CSRF and credential tests pass.
- Node's built-in SQLite was exercised in the CLI and the repository's pinned Electron runtime (Electron runtime Node 24.21.0). The running development service at `127.0.0.1:5173` returned HTTP 200 with `storage: sqlite`; this status check did not read or modify calendar content.
- Browser visual/interaction verification remains blocked by the tool URL policy recorded in `design-qa.md`. No alternate browser automation was used to bypass it. Live ChatGPT sign-in/inference and native visual/restart interactions remain unverified. Packaging, installation and SQLite initialization were subsequently checked as recorded above; the source tests alone do not verify the user's actual calendar contents.

## Local Windows update to 0.1.3 — 2026-10-16

- Built and installed Appa 0.1.3 over the existing per-user installation. Installer exit code is zero, executable product version is 0.1.3.0, and the installed application archive exactly matches the verified build.
- The saved storage origin, account registration and any existing credential file were unchanged by installation. A private copy of the existing profile was retained under the ignored `.local/` directory before updating. No calendar or account data was reset.
- The installed processes are responding and the private production service is listening. An unauthenticated status request returns HTTP 403 as expected. Native in-window interactions and real ChatGPT authorization were not repeated.
- All 72 automated checks, strict TypeScript checks and the production build pass. Package inspection confirms the compiled frontend, runtime and protected credential store, with no source, tests, private QA, source maps, registrations or credentials. The local installer and SHA-256 checksum are retained under `release/`; this update does not publish a GitHub release.

## Local Windows update to 0.1.2 — 2026-10-16

- Built and installed Appa 0.1.2 in the existing per-user installation. Installer exit code was zero; executable product version is 0.1.2.0. The installed application archive matches the newly packaged archive exactly.
- The existing desktop storage-origin configuration retained the same hash across installation. Desktop and Start menu shortcuts both target the installed Appa executable. No profile or credential files were reset.
- The installed Appa process is running and responding. Its private production service is listening under that process and returns HTTP 403 to an unauthenticated request, as expected. Native in-window interactions and real ChatGPT authorization were not repeated; no visible-window verification is claimed.
- All 65 tests, strict TypeScript checks and the production build pass. Archive inspection confirms compiled frontend/runtime files and excludes source, tests, QA artifacts, source maps, registration files and credentials. The 0.1.2 installer and SHA-256 checksum are retained under release/. No remote release was published.

## Settings button roles — 2026-10-16

Applied the user's section-specific hierarchy: User sign-in primary / Done secondary; Calendar and Goal Save settings primary / Cancel secondary; Backup Done primary / Export and Import secondary. Live browser inspection confirmed all four sections. DESIGN.md records these explicit preferences; planner sign-in retains its supporting role. All 65 tests and the production build pass. No saved settings or account connection was changed during verification; native packaging was not repeated.

## Button usage rules — 2026-10-16

- Applied behavior guidance while preserving Appa's visual baseline: labelled destructive confirmations, independent supporting actions, icon-only hover/focus tooltips, external launch indicators and Check connection wording.
- In the isolated reference workspace, a populated two-step plan and its prerequisite survive Back/Continue editing, planner closure and browser reload. Remove step and Undo removal restore the complete plan and prerequisite. The user's main workspace was not used for these edits.
- Keyboard Tab reveals an arrow's tooltip and Escape dismisses it. Dialog tooltips render above the modal. At 390px the labelled removal actions fit without page or dialog horizontal overflow; the normal viewport was restored. The reset confirmation displays Remove example goals and was cancelled. Browser warning/error logs were empty.
- All 65 automated tests, strict TypeScript checks and the production build pass. Native installer packaging, live-account sign-in/status checks and destructive backup replacement were not repeated. No separate audit-report or screenshot files were produced for this change.

## Shared typography and audit improvements — 2026-10-16

- Applied shared size, weight, line-height and tracking tokens across the active calendar, task cards, settings and dialogs. The approved 17px/13px title/body ratio and outer card layout remain. Settings headings, form values and actions now follow their documented roles; numeric information uses tabular figures.
- Darkened secondary text, selected-date fills and the current-time indicator. All 20 distinct opaque foreground/background pairs sampled across the checked views exceed 4.5:1; the lowest measured ratio is 4.919:1. This is a scoped contrast check, not a full accessibility-conformance claim.
- Browser checks cover Day, Week, Month, task read/edit states, all four Settings sections, the planner and goal details. At 390px and 360px, Month preserves complete sample task names with ordinary word wrapping and no page overflow. Narrow Settings exposes complete timezone and holiday-region summaries. Test selections were cancelled; saved preferences and tasks were retained. Browser warning/error logs were empty.
- Captures were collected on 15 October 2026 under `../qa/typography-implementation-2026-10-15/`. Combined full-view and focused comparisons were reviewed, including the correction of an initial mobile word-wrapping issue. The current `../design-qa.md` records final result: passed; the previous task-card QA report is archived alongside the captures.
- All 65 tests, strict TypeScript checks and the production build pass. The existing holiday-data chunk-size advisory remains. The live development preview was restarted for handoff and verified at its normal 1280 × 720 viewport with the 17px/13px task card visible, no horizontal overflow and empty warning/error logs. Screenshot: `../qa/typography-implementation-2026-10-15/14-live-handoff-2026-10-16.png`. Native installer packaging, 200% text resizing, user text-spacing overrides and screen-reader verification were not repeated.

## Task card typography — 2026-10-15

Applied the supplied event-details image's typography proportions to the existing floating task card: 17px title, 13px body, 360px card and 34px actions. Desktop and 390px browser checks confirmed that details and native edit fields fit without horizontal overflow; Edit/Cancel preserved the saved task. Browser warning/error logs were empty. All 65 tests and the production build passed. Full and focused source/before/after comparisons passed; the report is archived at `../qa/typography-implementation-2026-10-15/task-card-design-qa-before.md`. Native packaging was not repeated for this CSS-only change.

## Compact calendar content — 2026-10-15

- Reduced content sizes inside the existing calendar card: header 64→52px, title 20→17px, Week date row 54→44px, sample hourly spacing 96→80px and composer 650×58→560×48px. The measured outer card rectangle, 8px desktop inset and 250px sidebar remain unchanged. Day/Month headers, event labels and task-list spacing are also more compact.
- Full and focused before/after comparisons are in `../qa/calendar-compact-comparison.png` and `../qa/calendar-compact-header-composer.png`; `../design-qa.md` records final result: passed. Browser checks cover Day, Week and Month with no page-level overflow.
- Three consecutive five-minute steps in the isolated QA preview render as non-overlapping 18px event blocks with their text fully inside. Undo removed the synthetic goal. At 390×844, the 4px panel inset and 48px composer remain contained; the viewport override was reset. Browser warning/error logs are empty.
- All 65 automated tests and the strict TypeScript/production build pass. The existing holiday-data bundle advisory remains. The live preview is left on Week; screenshot: `../qa/calendar-compact-after.png`. Desktop packaging and live-account verification were not repeated for this presentation-only change.

## Shared calendar surface and reduced margins — 2026-10-15

- Applied the approved two-surface layout: the menu blends into the soft grey canvas, and one rounded white right-hand panel encloses the title, view/navigation controls, calendar and floating composer. The outer margin is 8px on desktop and 4px on narrow screens.
- Browser checks cover Week, Day and Month, Today navigation, and opening floating task details. Existing calendar data was retained. An isolated synthetic preview provided an empty Week calendar for a same-size comparison with the approved mockup. Full and focused comparison evidence is in `../qa/calendar-surface-comparison.png` and `../qa/calendar-surface-header-comparison.png`; `../design-qa.md` records final result: passed.
- At 390 x 844, Day retains its title and mobile controls inside the panel, the margin measures 4px on all edges, and there is no page-level horizontal overflow. The viewport override was reset. Browser warning/error logs are empty.
- All 65 automated tests and the strict TypeScript/production build pass. The existing holiday bundle advisory remains. The live preview is left on Week; screenshot: `../qa/calendar-surface-live.png`. Desktop packaging and live-account verification were not repeated for this layout change.

## Settings side menu — 2026-10-15

- Settings now has a left menu in the requested order: User, Calendar settings, Goal settings, Backup. User opens by default. The content area shows only the selected section, with Save settings and Cancel for Calendar/Goal and Done for User/Backup. The active menu item is announced with aria-current, and its content region is labelled by that item.
- Calendar/Goal drafts remain in the parent form while navigating. User stays mounted but hidden in other sections to preserve an unfinished sign-in. Browser checks confirmed that each section exposes only its relevant controls, week-start changes and native time edits survive a switch away and back, and Cancel discards the draft. The original calendar preferences were retained.
- All 65 automated checks and the strict TypeScript/production build pass. Browser warning/error logs are empty. The existing holiday-bundle size advisory remains. The real live preview is left on Settings → User; screenshot: `../qa/settings-side-menu.png`. Desktop packaging and live-account authorization were not repeated for this layout change.

## Remembered ChatGPT sign-in and User settings — 2026-10-15

- Settings now starts with User, providing ChatGPT sign-in, the active account, connection status and Sign out. The planner renders Use your ChatGPT plan only when disconnected; connected accounts retain a compact model selector. Returning from the system browser or checking the pending sign-in updates the connection automatically.
- Desktop stores the active account's validated OAuth credentials in `connection/credentials.bin` using Electron safeStorage with Windows DPAPI. The protected record is bound to the saved host and registered account identity. No password or plaintext-token file is stored. Browser-development credentials remain memory-only. Sign out clears the encrypted record and attempts revocation; failed file removal exposes a retry action.
- All 65 automated checks and the strict TypeScript/production build pass. Added checks cover restoration after restart, encrypted disk storage, refresh-token rotation across restarts, concurrent renewal, revoked grants versus temporary service errors, unavailable encryption, corrupt credential recovery, and retrying failed sign-out removal. Existing cancellation checks still pass. The existing holiday-bundle size advisory remains.
- Three separate hidden Electron processes with an isolated synthetic profile verified real Windows encryption, restoration through the production local service, removal on sign-out, and remaining signed out after another restart. These tests do not use a live ChatGPT account.
- A separate browser fixture verified the connected User account and Sign out control, the absence of the planner sign-in panel with a model selector present, and the return of sign-in after logout. Browser warning/error logs are empty. The real live preview is left on Settings → User; screenshot: `../qa/user-settings.png`.
- Real ChatGPT authorization and inference remain pending. The installed desktop copy has not been repackaged or replaced for this change. Session renewal follows [OpenAI's account/session guidance](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions); Windows protection follows [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).

## Floating task cards — 2026-10-15

- Task events in Day, Week and Month now open an anchored non-modal card. The user-supplied reference guides its goal/title, date, range, duration, actions and later-step list. Edit switches the same card to name, date and start/end fields; Cancel returns to details and Update derives the duration and saves. No dimming layer or focus trap is used.
- Browser checks cover all three calendar views, in-place Update and Cancel, invalid ranges, date/time changes, completion and Undo, later-step navigation, outside-click and Escape dismissal, restored keyboard focus, and 390 × 844 viewport bounds without horizontal overflow. Test edits and completion were undone. Final view/edit captures and the combined comparison are in `../../appa-screen-captures/`; `design-qa.md` records a passed comparison. Browser error logs are empty.
- All 58 automated checks and the strict TypeScript/production build pass. The installed desktop app has not been repackaged or updated. Live shared-choice and midnight-picker interactions were not repeated.

## Planned task editing — 2026-10-15

- Pending tasks can be edited from day details, including shared alternatives: task name, date, start time and duration. Edits validate available hours, overlaps, prerequisite dates and remaining shared reservations, preserve recurring occurrence identity, and support Undo and backup reload.
- Live browser verification changed Review the draft from 17 October at 18:00 to 18 October at 19:00 with a 35-minute duration. The details displayed all three saved values; Undo restored the prior schedule. An out-of-hours edit remained in the form with an error. Restored the example task's original 17 October / 18:00 / 15-minute schedule, reloaded, and reopened the editor to confirm persistence. Browser error logs are empty. The editor is left open in the side preview; screenshot: `../../appa-screen-captures/task-editor.png`.
- All 58 automated checks and the strict TypeScript/production build pass. Six added checks cover editing, reload and Undo, invalid inputs and atomic rejection, prerequisites, recurring identity, shared reservations and choices, and non-editable statuses. The existing holiday bundle size advisory remains. The installed desktop app has not been repackaged or updated for this change.

## Windows installation and shortcut launch — 2026-10-15

- Built and installed Appa 0.1.1 for the current Windows user. The desktop and Start menu Appa shortcuts both target the installed executable under `%LOCALAPPDATA%/Programs/Appa`; Windows Installed apps lists version 0.1.1. Installer exit code is zero.
- Opening the desktop shortcut starts the installed executable and exposes a responding Appa window. Opening the Start menu shortcut reuses that window and process. The private production service is running and rejects an unauthenticated browser request with HTTP 403. The installed application archive exactly matches the final production build. In-window planning interactions and live ChatGPT sign-in/inference were not repeated for this packaging change.
- Windows executable metadata now identifies Appa 0.1.1, with the interface's existing Phosphor CalendarDots mark used for the desktop icon at seven Windows sizes. Resource editing remains enabled while code signing is disabled.
- All 52 automated checks and the strict TypeScript/production build pass. Archive inspection verifies the compiled main entry, sandboxed preload, frontend and license notices, with no TypeScript sources, QA fixtures, tests, registration files, environment files or source maps. The installer and SHA-256 checksum are retained under `release/`; no GitHub release was published.
- Packaging uses the pinned Electron distribution installed by npm. The default archive-extraction path hit a Windows directory-rename permission error; copying the same official runtime directly succeeds.

## Calendar preferences and Settings — 2026-10-15

- Renamed the entry to Settings and separated Calendar settings, Goal settings and Backup. Added the timezone list, English-only language preference, week-number toggle, first-weekday selection and public holiday country/region selection. Automatic holidays follow the saved timezone, with Queensland selected for Brisbane; None and manual overrides are supported.
- Holiday rules are bundled locally and loaded separately from the main interface. Day, Week, Month and the mini calendar show holidays without adding tasks or changing scheduling availability. Regional holidays, substitute dates, partial-day hours and multi-day spans are covered. The settings helper explains that local show days and one-off changes may be absent. Source attribution and full dependency license notices are included.
- Added a shared interface language provider, English text catalog and extraction command for future full-interface translations, including dialogs and accessibility labels. English remains the only enabled option. Date formatting follows the saved locale; translation fallback and placeholder handling have regression coverage.
- Browser checks verify the three sections, timezone-based defaults, country/state override, Sunday-first weeks, week numbers on/off, holiday hiding, persistence after reload, and restoring automatic holidays/Monday/week numbers. Queensland's King's Birthday appears in all calendar views, and Christmas Eve displays its 6 pm start. Planner labels still render correctly. Final reload and interaction checks report no new frontend errors.
- At 390 by 844, Settings and Month have no horizontal overflow, Month keyboard scrolling updates the heading with fixed weekday labels, and Day stacks its panels with the divider hidden. The normal viewport was restored; Settings is open over the current week in the live preview.
- All 52 automated checks and the strict TypeScript/production build pass. New checks cover legacy migration, backup import/round-trip, Undo, unchanged task placement and choices for display preferences, malformed preferences, timezone defaults, year-boundary week starts, holiday dates and translation fallback. The holiday data chunk is larger than Vite's advisory threshold and is intentionally loaded separately. Native desktop launch and installer packaging were not repeated.

## Red circular date highlights — 2026-10-15

- Month view and the mini calendar now use Appa's red accent for the selected date, with white text. Live browser inspection confirms both marked October 15 highlights render as `rgb(230, 44, 75)` with white text.
- Month and Week selected-date highlights are now circles. Browser inspection confirms both are 26-by-26 pixels with 50% corner radii and the same red accent. Week was left open in the live preview.
- All 44 automated checks and the strict TypeScript/production build pass. Native desktop launch was not repeated.

## Scrollable Month view — 2026-10-15

- Month now scrolls vertically through surrounding months under fixed weekday labels. The visible month updates the main heading and mini calendar without changing the selected date. A seven-month render window shifts in either direction while preserving the visible position.
- Live browser checks verify wheel scrolling from October into December with the render range extending into April, scrolling back into September, Today returning to October at an exact zero month offset, and the header arrow jumping to November. Selecting the already-selected October date in the mini calendar also returns to October after scrolling away. Existing task details still open from month cells.
- At a 390-by-844 viewport, Month fits the screen without horizontal overflow and keyboard scrolling advances to November while the weekday row stays fixed. Clicking the active Month tab preserves the visible month's heading. The desktop viewport was restored and the preview left on the current month.
- All 44 automated checks, strict TypeScript checks and the production build pass. Browser error logs are empty. Native desktop launch and installer packaging were not repeated.

## Adjustable Day task-list width — 2026-10-15

- Added a draggable, keyboard-accessible divider between Day's timeline and task list. Width is saved in a separate local preference; resizing the window temporarily clamps it while retaining at least 240 pixels for the timeline. Double-click resets the 320-pixel preference. The divider hides in the existing stacked narrow layout.
- Live browser checks verify a drag from 320 to 440 pixels, an arrow-key change to 430 pixels, restoration of 430 after reload, 240/640-pixel keyboard bounds, a 448-pixel list with a 240-pixel timeline at a 900-pixel viewport, and restoration of the 640-pixel preference when widened. At 390 pixels the list fills the screen without horizontal overflow. Double-click reset returns to 320 pixels; the preview was left at the original default width.
- All 44 automated checks, strict TypeScript checks and the production build pass. The browser reports no interface errors. Native desktop launch and installer packaging were not repeated.

## Surrounding dates in Day header — 2026-10-15

- Day now has a Monday–Sunday date row above the timeline and task list, based on the supplied reference. The selected date is filled, today uses the red accent and weekends are muted. The former single-date timeline heading is removed.
- Live browser checks confirm synchronized date/task selection, an empty day, crossing Sunday into another week, returning with Today, keyboard activation, and a header that remains visible during timeline scrolling. All seven dates fit a 390-pixel-wide viewport without horizontal page overflow.
- The scoped visual comparison passes; evidence and intentional adaptations are recorded in `design-qa.md`. All 44 automated checks, strict TypeScript checks and the production build pass. Native desktop launch and installer packaging were not repeated.

## Day timeline and task list — 2026-10-15

- Day now shares Week's full-day timeline, with an independently scrolling task list on the right. Both panels open the existing task details. Day follows the approved current-time default and Today behavior.
- Live browser checks confirm both task entry points, date navigation, an empty day's full timeline without a current-time line, Today repositioning, and Week's seven columns and 25 hour labels. A 390-by-844 viewport confirms the panels stack without horizontal page overflow; the desktop viewport was restored afterward.
- All 44 automated checks, strict TypeScript checks and the production build pass. Native desktop launch and installer packaging were not repeated.

## Current-time default position — 2026-10-15

- Week now positions the timeline around the current time in the saved timezone on opening, entering Week, navigating weeks and pressing Today. Today also repositions within the same week. Day remains an agenda list.
- The live browser preview confirms the current-time line is visible after reload, Today returns from manual scrolling and another week, and switching from Day back to Week uses the current time. Manual scrolling stayed at exactly the same position as the clock advanced from 10:49 to 10:50.
- All 44 automated checks and the strict TypeScript/production build pass. Native desktop launch and installer packaging were not repeated.

## Fixed seven-day Week view — 2026-10-14

- Removed the five/seven-day toggle, its state, automatic weekend-selection logic and unused styles. Week now always shows Monday through Sunday.
- The open live preview confirms seven day columns, no day-count toggle and the retained 00:00–24:00 timeline.
- All 44 automated checks and the strict TypeScript/production build pass. Native desktop launch and installer packaging were not repeated.

## Full-day calendar — 2026-10-14

- Week now always spans 00:00–24:00, including weeks without today. Available scheduling hours remain independent of the displayed range.
- The open live preview updated automatically. Browser inspection confirms 25 labels from 00:00 through 24:00, a grid exactly 24 hours tall, and the current-time line at the correct minute within that range.
- All 44 automated checks and the strict TypeScript/production build pass. Native desktop launch and installer packaging were not repeated.

## Current-time indicator — 2026-10-14

- Week now displays the approved red current-time line, today's solid segment and dot, and a time badge in the hour gutter. The current hour is included when it falls outside the normal daytime range; scheduling availability is unchanged.
- All 44 automated checks and the strict TypeScript/production build pass. The new clock check covers a shared timestamp, timezone differences and midnight.
- Isolated browser checks against the compiled interface confirm exact minute positioning, automatic minute-boundary movement, five/seven-day alignment, hiding in another week and returning with Today, focus refresh, late-hour visibility, narrow-screen scrolling, Friday-to-Saturday rollover, and the saved timezone taking precedence over the browser timezone. The line does not intercept task clicks; no frontend runtime errors occurred.
- Verification uses synthetic local calendars and a controlled browser clock. Native desktop launch and installer packaging were not repeated for this change; source and compiled application assets are updated.

## Audit fixes — 2026-10-14

- The repeat audit's two remaining issues are corrected: available-hours changes preserve selected shared groups, and reload/import use the saved calendar's timezone. The settings result must also pass the same capacity checks used on reload before it is committed.
- Both new regression checks failed before these corrections and pass afterward. All 43 automated checks and the strict TypeScript/production build pass. The original six regression cases remain passing.
- Three isolated production-interface checks pass: narrowing hours with a selected shared group, Undo and reapplying that change; saving/reloading an Auckland calendar at the midnight boundary; and importing that calendar into a Brisbane workspace, then reloading. These use synthetic calendars and a frozen clock, with no real account requests.
- The earlier fixes remain in place: unsaved-progress export, lifetime reload limits, incompatible recurrence validation, disconnect races, the original add-work/shared-slot sequence and stale account-model selection.
- Isolated browser verification uses synthetic calendars and account replies. It checks failed-save and raw-data recovery exports, 101 goals/6,001 tasks with a backup above 2 MB, incompatible recurrence recovery, an automatic scheduling failure, the original shared-choice approval/reload sequence, and matching displayed/submitted models after an account switch.
- Real account consent/inference and native installation were not repeated for these fixes. This changes source and compiled build outputs; it does not publish a new installer.

## Earlier verification

Active-goal editing verified on 2026-10-16: all 72 automated checks pass and the production build passes. Regression coverage includes rename preservation, step changes, recurrence rebuilding, type conversion, reload, Undo, invalid inputs and shared-slot conflicts. Isolated browser examples verified rename/duration/add/remove, Undo removal, save and whole-goal Undo, recurrence changes and blank-name rejection. The recurring editor fits a 390×844 viewport. These checks apply to source and live preview; the installed desktop package has not been rebuilt for this feature.

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
