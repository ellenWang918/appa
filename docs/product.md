# Product behavior

Appa helps one person turn an intention into a manageable next action, and return after missed work without manually repairing the calendar.

## Agreed behavior

- English interface, Day, Week and Month views with a shared selected date and a mini month navigator. Today returns to the current date in the chosen view. Desktop starts empty and uses the computer's timezone.
- Week shows five weekdays by default. Users can show seven days; weekends appear automatically when selected or when they contain active tasks. The displayed timeline includes available hours; its broader daytime range does not change scheduling availability.
- Week rows expand when needed to keep consecutive short steps readable without overlapping their cards. Empty weeks and longer appointments use the compact baseline spacing.
- Select a calendar task to open its day details, shared choices and completion controls. The floating goal input opens the existing planner with the intention prefilled; approval is still required before scheduling.
- Any chosen number of active goals. Later keeps accepted plans without scheduling them. Activating a saved goal preserves its identity and existing progress and keeps other active goals in place.
- AI proposals are editable and require approval before scheduling. Manual planning works without an AI account. Aim at 5–25 minute tasks; the editor accepts up to 60 minutes when the daily window permits.
- Scheduling uses available hours, initially 18:00–21:00 and adjustable, with no separate daily time limit. The user removed the daily budget on 2026-10-13. Older saved calendars and backups remain supported; their former budget field is discarded when loaded.
- Prerequisites constrain actionable work and move forward in dependency order. Independent work remains in place unless involved in a scheduling conflict.
- Shared slots contain alternatives. Reserve their maximum duration until selection, then the selected duration. Selection alone changes no completion state.
- Completing a selected shared task skips unchosen recurring occurrences in that slot; project alternatives remain unfinished, and future repeats keep their cadence.
- Catch-up retains one pending overdue occurrence per recurring activity, preserves unfinished projects, and shows recovery details with Undo. Undo applies to the latest committed change in the current page session.
- Calendar data and draft proposals are saved locally, with validated JSON export/import. Cross-device synchronization, repeated-postponement suggestions, deadline warnings and automatic updates are deferred.

## Main modules

`src/types.ts` defines the shared goal, task, plan, calendar and API contracts. `src/calendar.ts` owns scheduling, recurrence, recovery, validation and reversible changes. `src/App.tsx` coordinates the calendar views; `src/CalendarViews.tsx` supplies the month grid, mini calendar and date helpers; `src/Dialogs.tsx` owns planning, settings and goal details. `server/chatgpt.ts` supplies the reusable local OAuth/inference service and browser-development adapter. `desktop/` supplies Electron startup, its private loopback server, and external-link policy.

The visual baseline is the calendar reference supplied on 2026-10-14: white and soft grey surfaces, a narrow left rail, compact task cards, restrained type, and a floating composer with a red circular action. Appa keeps its own identity and real planning controls. On narrow screens, the rail becomes goal/settings buttons and the week can scroll horizontally. Day and Month views fit the screen.
