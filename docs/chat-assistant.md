# Appa calendar assistant

Implemented in source: 18 October 2026, Australia/Brisbane. Automated checks use simulated AI responses; real ChatGPT inference and browser/native interaction checks remain pending. Appa 0.1.5 has been packaged and installed locally; its private production service and SQLite workspace initialization were checked. See [verification status](verification.md).

## Scope and presentation

The bottom composer adds recognised single events directly to the local calendar. It also supports chat for planning new work, answering questions from saved calendar data, reorganising upcoming entries and managing the unscheduled To do list. Users do not select a mode. Chat uses the existing personal ChatGPT connection and account-discovered model. Recognised event entry, calendar storage and manual planning work without signing in.

Preserve the approved floating layout: same width as the compact composer, 560px maximum, 400px total expanded height, scrollable conversation and bottom-anchored input. No Close button or backdrop. Click/focus keeps the conversation collapsed for typing. Submitting a recognised event keeps the conversation collapsed and saves it directly. Submitting another non-empty message opens chat and sends in one action; when disconnected, Send stays enabled with a “Sign in to ChatGPT first” tooltip on hover or keyboard focus, and opens sign-in without losing any text, even with an empty input. Escape/outside click collapses, preserving conversation and unsent text for this session. Chat history is not persisted or exported.

## 1. Add an event or plan a goal

Example event: “Review launch notes Friday at 2:55 pm for 45 minutes”.

Recognised date, time, duration, all-day and repeat text becomes neutral inline chips inside the same composer as the user types. Date and time remain separate chips. Backspace or Delete touching a chip first restores its original text without removing it; subsequent deletion edits that text normally. Typing into the restored text resumes recognition, so repairing “tomorro” to “tomorrow” immediately recreates its date chip. This applies to every chip type; typing elsewhere does not rewrap an untouched detail. With a date or time chip focused, or the caret beside it, Up/Down adjusts the date by one day or the time by five minutes. Keyboard adjustment retains focus for repeated presses and does not open chat or a picker. Clicking a chip opens a small anchored picker to adjust that detail. The text remains editable around the chips; typing alone does not save an event or make an AI request.

Enter or the red action creates a complete event through the existing calendar validation, local persistence and Undo. The input clears and the calendar selects and scrolls to the new event box. Day and Week retain their view; Month and Year switch to Day to reveal the event. A hidden personal calendar becomes visible. Event entry never opens the expanded conversation or event editor. Missing or ambiguous details and overlaps stay in the compact composer for correction without losing the input. An existing changed editor still uses its normal Keep editing / Discard changes guard before creation.

The local parser supports today/tomorrow, upcoming English weekdays, month names, ISO dates, unambiguous day/month dates, explicit 12/24-hour times and ranges, all-day wording, common durations and supported repeat intervals. Relative dates use the calendar timezone. A start time without a duration defaults to 30 minutes, shown beside the Enter hint. Ambiguous dates, missing clock times, conflicting scheduling details and ranges crossing midnight require correction. Calendar questions and requests to change existing items remain chat requests. Other wording may use the assistant; an assistant event response fills the compact composer and waits for Enter to create it.

Example goal: “I want to run five kilometres.” Appa uses recent conversation and scheduling hours to ask useful clarification, then offers Review plan in the existing editable planner, with Add to active goals or Save in Later. Generating a plan does not save work. Goal scheduling uses Appa's existing scheduler and checks prerequisites, available hours, recurrence and overlaps; the assistant does not promise that an arbitrary deadline or unavailable slot can be met. Successful changes support Undo.

## 2. Answer calendar questions

Examples: “When was my last haircut?”, “What is on tomorrow?”, “How many exercise entries were recorded last month?”, “When am I free tomorrow?”

The model returns a structured query, not a claimed calendar fact. The local service searches SQLite records and expands applicable repeating-event occurrences using calendar rules. It includes hidden calendar groups: visibility changes rendering, not search or scheduling capacity. Searches match title and goal/group terms, including synonyms supplied by the model. Unrelated records are not sent to the model for this retrieval.

The current supported operations are agenda, latest past occurrence, count, and free intervals within the user's scheduling hours. Answers are assembled from actual records on the local service. They disclose the date range and timezone, distinguish a recorded appointment from marked completion, and link matching entries back to the calendar. “Last” excludes future appointments, including later times today. All-day entries use dates. Completed-only questions require marked completion; a pending repeating template is never presented as proof that the user attended.

When nothing matches, say no matching record was found within the searched dates. Do not infer that the activity never happened. Deleted content is excluded from ordinary assistant searches even if retained in internal recovery snapshots. The assistant does not search the migration archive or previous snapshots.

Results display up to 20 detailed agenda lines and 100 event references; counts include all matches. Availability queries cover at most 31 days. Expansion rejects more than 100,000 repeating occurrences and asks for narrower dates. General unsupported analysis should be clarified rather than answered with invented facts.

Questions do not create, complete, move or delete entries. Opening a reference may reveal its hidden group so the event can be inspected.

## 3. Replan upcoming entries

Example: “Keep Monday morning free. Move my non-work tasks to another time.”

1. Resolve dates and local minutes in the calendar timezone. State the source and destination ranges. The default morning window is 09:00–12:00; Monday means upcoming Monday unless another meaning is specified. Ask a follow-up where the interpretation materially matters.
2. Retrieve pending entries in that source window, including hidden groups and repeating occurrences. Work/non-work classification is not stored or inferred from titles, colours or Personal tasks membership. Show checkboxes so the user selects the entries to move and leaves protected appointments unchecked.
3. Preview new times searches for free slots outside the original window and within the destination range. Goal tasks remain within available hours; personal events retain their standalone scheduling rules. Preserve identities, durations, completion history and goal/group identity. Check dependencies and existing reservations, including hidden and recurring work.
4. Show a before/after list of dates/times, the recurrence scope, and how many unselected entries remain in place. Selected repeating events are labelled This occurrence only. Unselected work can still occupy the original window; do not claim it is fully clear.
5. Apply changes revalidates the current revision and commits all moves together in SQLite. One Undo restores the complete previous schedule during the current session. Cancel changes applies nothing.

A proposal can move 1–100 selected entries within a destination range of at most 90 days. The default destination is the source end through 14 days later. Selection/proposal tokens expire after 30 minutes and are bound to their workspace and calendar revision. Any intervening saved edit, expired token, elapsed proposed start time or conflict requires fresh times. A failed batch applies no partial changes.

Replanning preserves duration and uses 15-minute candidate start increments. It does not delete content, mark tasks complete, shorten events, change work classifications or rewrite recurrence templates. Requests for all future occurrences need an explanation of the current single-occurrence limit. If capacity or prerequisites prevent a feasible plan, choose fewer entries, a wider destination range, or include dependent steps.

## To do list management

Examples: “Add buy milk and read a book to my to do list”, “Show unfinished to dos”, “Mark laundry complete”, “Rename buy milk to buy oat milk”, “Reopen the reading task”, “Remove buy bread”, “Schedule call Mum tomorrow at 10am”.

The model produces a structured list/add/rename/complete/reopen/delete/schedule request using title terms, status and requested values. It receives no automatic dump of the list and cannot supply target IDs. The local service searches the current saved list and assembles grounded results; items displayed in a chat reply can be part of follow-up history. Missing dates/times are not required to add a to do; scheduling asks for an exact date/time or all-day choice and preserves the existing duration unless a new one is requested.

Read-only requests change nothing. Add requests show proposed new cards. Changes to existing items show checkboxes containing actual matching to dos, followed by a before/after review. A single match is selected initially; ambiguous matches require selection. Rename and schedule operate on one selected item; add/complete/reopen/delete support up to 100 items. Apply to do changes commits the whole reviewed batch in SQLite, refreshes the side panel/calendar, and provides one Undo. Cancel changes applies nothing. Scheduled items preserve identity and leave the list; calendar conflicts, hidden reservations, passed times and completion state are rechecked. Completed scheduled events remain outside to do operations.

Review tokens use the existing thirty-minute, workspace/version-bound proposal store. Intervening saved edits, expired/cross-workspace/replayed proposals or a scheduling time that has passed fail without a partial write. Unknown model fields are discarded, and model prose never supplies a factual success claim. Automated tests cover structured intent, selection, preview, apply, persistence and Undo through the real local HTTP service with simulated AI output. Live account and visual interaction verification remain pending.

## Storage and request boundaries

SQLite is the authoritative local calendar store in the desktop profile or the separate development `.local` directory. Startup migrates existing data once, retaining its original raw JSON and browser copy. Saved calendar versions prevent overwriting another window's work. See [desktop storage and recovery](desktop.md) for locations and fallback behavior.

Assistant requests wait for queued local saves. `/api/assistant` interprets the message into clarification, goal/event draft, search or rescheduling selection. `/api/calendar/preview` resolves approved candidate IDs into validated before/after moves. `/api/calendar/apply` is a separate explicit action; it checks the token/revision, applies the batch and returns the new state with session Undo. All these routes retain session, same-origin and CSRF protection; desktop also requires its private device cookie. Tokens remain in the main process.

Only messages, recent conversation and necessary date/timezone/availability context are sent to OpenAI. Event lookup and move planning execute locally. Calendar answers appearing in recent conversation can be sent with a later follow-up; connection/privacy copy discloses this. No model response can directly apply arbitrary free-form edits. Requests use `store: false`. There is no cloud calendar sync or user-account database.

## Verification coverage

| Situation | Automated coverage |
| --- | --- |
| Existing browser calendar migrates | Exact original JSON, IDs, colours, groups and recurrence survive migration/restart; old data cannot replace SQLite. |
| Corrupt migration or stale save | Recovery preserves the source; invalid or conflicting writes leave saved data/indexes unchanged. |
| Last haircut is hidden or recurring | Saved and virtual occurrences are found, deduplicated and filtered before the current instant. |
| A record lacks completion | Answer describes a recorded appointment, without claiming completion. |
| No matching record | No invented date or unrelated event is returned. |
| A model attempts an invented calendar answer | Search facts come from local records, not the model's narrative. |
| AI plan/event or selection/preview is generated | Saved events and goals are unchanged until the user creates the event or approves the proposal. |
| Only personal entries are selected | Work remains in place; preview/apply moves only selected IDs. |
| Multiple moves conflict or revision changes | Apply fails atomically; stale/cross-workspace/replayed tokens cannot mutate the calendar. |
| Move succeeds | Identities and recurring overrides survive; one Undo restores the batch. |
| Local service access is unauthorised | Device cookie, session, same-origin and CSRF checks remain enforced. |

Remaining manual checks: live sign-in/inference, realistic clarification quality, clicking history references and selection/preview controls, assistive-technology announcements, zoomed layouts, native restart/migration and packaged desktop operation.

## Inline event entry, 29 October 2026

The corrected flow replaces the earlier event-review card with inline chips and direct calendar creation. All 190 automated checks and the production build passed. Hidden Electron checks exercised native incremental typing, separate date/time tags, Backspace/Delete restoration to editable text, recognition after repairing date/time/duration/repeat/all-day text, unrelated title edits, word deletion, selection shortcuts, repeated focused/adjacent arrow adjustment, retained range duration and weekly recurrence, Enter creation through the real local service and SQLite, Undo, missing details, conflicts, midnight, all-day recurrence and narrow-screen event reveal. Enter also creates the event after keyboard adjustment of a focused tag; Space opens its picker. Direct creation made no AI request while signed out and kept the upper chat panel and event editor closed. Desktop and narrow screenshots were inspected. Live ChatGPT inference and the installed release remain unverified for these changes.
