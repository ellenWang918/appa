# Product behavior

AI Goal Calendar helps one person turn an intention into a manageable next action, and return after missed work without manually repairing the calendar.

## Agreed behavior

- English interface, Today and Week views. Desktop starts empty and uses the computer's timezone.
- Any chosen number of active goals. Later keeps accepted plans without scheduling them. Activating a saved goal preserves its identity and existing progress and keeps other active goals in place.
- AI proposals are editable and require approval before scheduling. Manual planning works without an AI account. Aim at 5–25 minute tasks; the editor accepts up to 60 minutes when the daily window permits.
- Default daily budget is 60 minutes inside 18:00–21:00, adjustable. Scheduling never increases that budget automatically.
- Prerequisites constrain actionable work and move forward in dependency order. Independent work remains in place unless involved in a scheduling conflict.
- Shared slots contain alternatives. Reserve their maximum duration until selection, then the selected duration. Selection alone changes no completion state.
- Completing a selected shared task skips unchosen recurring occurrences in that slot; project alternatives remain unfinished, and future repeats keep their cadence.
- Catch-up retains one pending overdue occurrence per recurring activity, preserves unfinished projects, and shows recovery details with Undo. Undo applies to the latest committed change in the current page session.
- Calendar data and draft proposals are saved locally, with validated JSON export/import. Cross-device synchronization, repeated-postponement suggestions, deadline warnings and automatic updates are deferred.

## Main modules

`src/calendar.mjs` owns scheduling, recurrence, recovery, validation and reversible changes. `src/App.jsx` coordinates the calendar views; `src/Dialogs.jsx` owns planning, settings and goal details. `server/chatgpt.mjs` supplies the reusable local OAuth/inference service and browser-development adapter. `desktop/` supplies Electron startup, its private loopback server, and external-link policy.

The Evening Planner interface is the visual baseline. Functional changes should preserve its typography, palette and layout unless the requested behavior requires a scoped adjustment.
