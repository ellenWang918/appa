# Appa calendar assistant

Implemented in source: 18 October 2026, Australia/Brisbane. Automated checks use simulated AI responses; real ChatGPT inference and browser/native interaction checks remain pending. Appa 0.1.5 has been packaged and installed locally; its private production service and SQLite workspace initialization were checked. See [verification status](verification.md).

## Scope and presentation

The floating chat supports three capabilities in one conversation: plan new work, answer questions from saved calendar data, and reorganise upcoming entries. Users do not select a mode. The existing personal ChatGPT connection and account-discovered model are used. Calendar storage and manual planning work without signing in.

Preserve the approved floating layout: same width as the compact composer, 560px maximum, 400px total expanded height, scrollable conversation and bottom-anchored input. No Close button or backdrop. Click/Enter opens; Escape/outside click collapses, preserving conversation and unsent text for this session. Chat history is not persisted or exported.

## 1. Plan a goal or event

Example: “I want to run five kilometres.”

Appa uses recent conversation and scheduling hours to ask useful clarification, then proposes a finite goal, recurring activity or standalone event. Missing essential dates/times prompt clarification. A new goal offers Review plan in the existing editable planner, with Add to active goals or Save in Later. A single appointment offers Review event in the existing event editor, prefilled with date, time, duration, all-day status and supported recurrence. Planning alone does not save events or goals. Approval still checks prerequisites, available hours, recurrence and overlaps; new work supports existing Undo.

Follow-up messages revise the proposal rather than automatically creating duplicate goals. Goal scheduling uses Appa's existing scheduler; the assistant does not promise that an arbitrary deadline or unavailable slot can be met.

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
| Plan/event or selection/preview is generated | Saved events and goals are unchanged until explicit approval. |
| Only personal entries are selected | Work remains in place; preview/apply moves only selected IDs. |
| Multiple moves conflict or revision changes | Apply fails atomically; stale/cross-workspace/replayed tokens cannot mutate the calendar. |
| Move succeeds | Identities and recurring overrides survive; one Undo restores the batch. |
| Local service access is unauthorised | Device cookie, session, same-origin and CSRF checks remain enforced. |

Remaining manual checks: live sign-in/inference, realistic clarification quality, clicking history references and selection/preview controls, keyboard focus/announcements, narrow/zoomed layouts, native restart/migration and packaged desktop operation. Browser visual inspection is currently blocked by the tool URL policy; no alternate automation was used to bypass it.
