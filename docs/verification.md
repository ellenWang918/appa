# Verification status

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
