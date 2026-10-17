# Appa common-action behavior review

Date: 17 October 2026. Scope: current working tree, including past-event creation and goal deletion added in this conversation. No application changes made during this review.

Reference: [Carbon Common actions](https://www.carbondesignsystem.com/building-blocks/core/patterns/common-actions), updated 11 August 2026. The trailing full stop in the supplied URL was removed to access the page.

## Evidence and limits

This is a source-based behavior review, not a completed visual or live-flow audit. In-app browser observation was previously denied by the browser URL policy; no alternative browser or capture route was used. No screenshots, responsive layout, actual focus movement, animation, or live account behavior are verified here. Conclusions below describe implemented paths, rather than observed user sessions.

Reviewed App.tsx, Dialogs.tsx, EventCreator.tsx, TaskCard.tsx, TaskEditor.tsx, GoalEditor.tsx, ChatgptAccount.tsx, ui.tsx, calendar.ts, api.ts, errors.ts, settings controls, recurrence controls and relevant CSS. The existing tests were not rerun because this review changes documentation only.

## Reference interpretation

Carbon separates adding existing objects from creation, removal from destruction, cancellation from dismissal, and resetting from restoring the last applied values. Deletion safeguards depend on impact: direct action for trivial recovery, confirmation for moderate impact, and typed confirmation for high impact. Editing should be explicit; errors should explain recovery; refresh updates stale information. These are reference principles, not a requirement to adopt Carbon's components or visual style.

## Inventory against all 12 Carbon categories

| Category | Current Appa instances | Assessment |
|---|---|---|
| Add | Make this goal active; Add to active goals; Add a step in planner and editor | Activation adds a saved goal to the calendar. Add a step creates a new object; Create step would be stricter terminology. |
| Cancel | Event creation; task/event editing; goal editing; settings; backup replacement; Keep this calendar in fresh-start confirmation | Secondary styling is consistent in source. Draft-loss behavior needs improvement. |
| Clear | No dedicated clear-field or clear-selection action found | Not applicable. Native text deletion is not a dedicated Clear pattern. |
| Close | X controls on dialogs/cards; Escape; outside click; Done in non-editable settings | X is correctly used for dismissal. Dirty editors also dismiss without protecting unsaved changes. Done is a text dismissal variant; this is a strict-reference difference, not a major defect. |
| Copy | No clipboard-copy or duplicate-object action found | Not applicable. Export a copy downloads a backup and belongs under Export. |
| Delete | Delete goal; Remove event/Remove this event; Remove step; workspace replacement/clearing | Existing deletion mechanisms use different labels. Goal deletion includes history with no scope explanation. |
| Edit | Goal editor; task/event editor; editable AI/manual plan; Calendar/Goal settings | Explicit editing and save/update actions exist. Saved Later goals have no Edit action, so cannot reach the new Delete goal control. |
| Errors | Inline form errors; calendar error banner; connection errors; storage/backup validation | Many corrective messages exist. Raw exceptions and generic fallbacks lack consistent recovery guidance. |
| Next | Continue planning; Continue editing plan; plan approval transition | App-specific labels explain transitions. Calendar Next day/week/month/year is date navigation, not a wizard Next action. |
| Refresh | Check connection; automatic account refresh/polling; minute/focus calendar refresh | Check connection uses a button and checking state. Today changes date context; it is not Refresh. |
| Remove | Remove step; Remove event/Remove this event; Remove example goals | These delete underlying data rather than merely detach preserved objects. Terminology needs correction. |
| Reset | No last-saved-value Reset action found | Start fresh is a destructive workspace operation, not Carbon Reset. Undo is also a separate pattern. |

## Other application patterns outside that page

| Pattern family | Instances |
|---|---|
| Create | Create event from sidebar/mobile/empty day/calendar space; Plan a goal; Create an AI plan; Write a plan myself; Add a step |
| Save/apply/update | Save event; Update task/event; Save goal; Save settings; Save in Later; Approve & schedule |
| Undo/recovery | Calendar Undo; Undo recovery/Undo this recovery; Undo removal within plan and goal drafts; automatic catch-up with review summary |
| Navigation/drill-down | Day/Week/Month/Year; Today; previous/next period; mini-calendar; year/month/date drill-down; open goal/task details; Later Steps; settings sections |
| Selection/configuration | Shared-activity radio choices; goal type; repeat interval; All day toggle; available-time toggle; language, timezone, holidays, week preferences; account/model/placement selection |
| Complete/status | Mark as complete; Completed; active/saved goal status; dependency locks and scheduled-day completion restrictions |
| Import/export | Export backup; Export a copy; Import backup; Restore this backup/Replace calendar |
| Authentication/external navigation | Sign in with ChatGPT; Connect another account; Continue to ChatGPT; Check connection; Sign out; retry sign-out; How it works |
| Feedback/progress | Success/Undo toast; inline error; storage warning; recovery banner; busy labels and disabled actions; empty-day/empty-goal states; hover/focus tooltips |
| Disclosure/layout | Completed-step history; missed occurrences; prerequisite details; mobile goals panel; resizable Day panels |

These extra families are inventory, not categories defined by the referenced page.

## Findings and proposed rules

### 1. High: fresh-start label understates the data removed

Evidence: App.tsx's reset dialog says Remove example goals. calendar.ts resetWorkspace commits blank(today), clearing all goals, events, recurring series and choices. The sample flag can remain set while users add their own work; the reset is also offered from the storage-error recovery path. The action therefore has a wider scope than the label promises.

Proposed rule: label the actual result, such as Clear calendar, and explain all affected data. If the intended action is Remove example goals, implement selective removal instead. Set safeguards according to the content being removed, with a backup route for valuable work. Existing Undo is a strength but does not make the label accurate.

### 2. High: Cancel/Close can silently discard edits

Evidence: ui.tsx closes dialogs on Escape/backdrop without a dirty-state check. GoalEditor keeps the edit only in local state; Cancel leaves editing, while X/backdrop/Escape closes the dialog. TaskCard outside click closes its editor; Escape leaves edit mode. EventCreator discards its draft through outside click/Escape/Close/Cancel. Settings uses an unsaved local settings object and closes through Cancel or generic dismissal.

Proposed rule: when values changed, retain the draft or offer Discard changes/Keep editing. Clean dismissal should remain immediate. Planner is a useful existing exception: its draft is saved and Back to intention retains it.

### 3. Medium: Remove event actually deletes the event

Evidence: TaskCard labels the action Remove event or Remove this event. calendar.ts removeEvent deletes the saved task; recurring occurrences are excluded so they cannot regenerate. There is no retained detached event elsewhere.

Proposed rule: use Delete event and Delete this occurrence. Keep the immediate Undo behavior. Explain series scope in plain language.

### 4. Medium: Delete goal gives no indication of cascade scope

Evidence: GoalEditor exposes an immediate Delete goal button. calendar.ts deleteGoal removes pending and completed tasks, recurrence and choices. App closes the editor and shows Goal deleted with Undo. Undo has one snapshot and reload validation resets it; a subsequent committed change replaces the snapshot.

Proposed rule: distinguish a trivial goal from one containing valuable history. Show the affected step/history scope; use confirmation when appropriate and typed confirmation only for genuinely high-impact cases. Immediate delete is reasonable where restoration is trivial. This is an impact-dependent gap, not a blanket requirement for a modal on every deletion.

### 5. Medium: deletion is unavailable for saved Later goals

Evidence: Dialogs.tsx shows Edit goal only when status is active. The sole Delete goal button lives inside GoalEditor. Later goals have activation but no delete path, even though calendar.ts deleteGoal supports either status.

Proposed rule: expose a consistent goal action location for Active and Later. Editing may stay restricted, but deletion should not require activation. This is an Appa consistency issue, not an explicit Carbon mandate that every object be editable.

### 6. Medium: errors do not always explain how to proceed

Evidence: errors.ts returns Error.message or This action could not be completed. api.ts exposes server errors and native fetch/JSON failures through that path. Goal deletion can surface backup-validation wording unrelated to the user's action. Positive examples include overlap errors asking users to choose a free time and connection errors asking them to finish sign-in and retry.

Proposed rule: translate technical failures into action-specific messages and a next step. Keep details in diagnostics; retain form data and show the message at the relevant action. Test focus and field associations separately before making accessibility claims.

### 7. Medium: settings can hide unsaved edits behind Done

Evidence: Dialogs.tsx stores one settings draft across sections. Calendar/Goals sections show Save settings and Cancel; User/Backup show Done. A user can edit settings, switch to Backup, and click Done, which only closes the dialog. No dirty indicator or guard is present.

Proposed rule: retain Save/Cancel while the overall settings draft is dirty, or settle changes before switching sections. Explain what Done means for pending changes.

### 8. Low: Add a step creates a new step

Evidence: both planner and GoalEditor append a newly constructed step. They do not select an existing step.

Proposed rule: choose Create step if adopting Carbon's exact Add/Create vocabulary. Add a step is understandable and this is a terminology alignment issue, not a functional failure.

### 9. Low: Remove step uses deletion semantics and a trash icon

Evidence: planner and GoalEditor filter the step out of their draft and remove prerequisite references. Both offer Undo removal until a subsequent draft edit. No reusable step survives elsewhere.

Proposed rule: use Delete step for strict deletion semantics and retain trash/Undo; reserve Remove for detaching a preserved item. Because it affects a reversible draft, this is lower risk than deleting saved events or history.

## Strengths to retain

- Explicit Save/Update/Cancel states in editors.
- Goal-delete errors remain in the open editor; successful deletion returns to the calendar with feedback.
- Reversible calendar changes, recovery summaries and draft-step Undo.
- Danger styling for destructive actions; secondary cancellation.
- Inline validation that preserves form input, including event overlap validation.
- Authentication loading/retry states and external-link announcements.
- One context-specific primary action in the examined editor footers.

## Recommended order

1. Correct fresh-start scope and wording.
2. Protect dirty editor dismissal and settings section transitions.
3. Standardize Delete/Remove and recurring-occurrence scope.
4. Make goal deletion available in Later and match its safeguards to impact.
5. Improve error recovery wording; then resolve lower-risk vocabulary differences.

Live acceptance checks remain pending: keyboard dismissal/focus, toast visibility and duration, small-screen action layout, real connection failures, and end-to-end save/delete/Undo flows.
