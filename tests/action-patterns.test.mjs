import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../dist/runtime/src/calendar.js";
import {
  createDraftProtection,
  goalDeletionImpact,
  calendarReplacementIsHighImpact,
} from "../dist/runtime/src/actionPatterns.js";
import { errorMessage } from "../dist/runtime/src/errors.js";

test("Dirty drafts keep navigation pending; choosing to discard resumes the complete transition once", () => {
  let pending,
    navigations = 0,
    nested = 0;
  const guard = createDraftProtection((action) => {
    pending = action;
  });
  const draft = {};
  guard.drafts.set(draft, true);
  const navigate = () => {
    navigations++;
    guard.request(() => {
      nested++;
    });
  };
  guard.request(navigate);
  assert.equal(navigations, 0);
  // Keep editing drops the pending action without touching the draft.
  pending = null;
  assert.equal(guard.drafts.get(draft), true);
  guard.request(navigate);
  pending();
  assert.equal(navigations, 1);
  assert.equal(nested, 1);
  // Reverting or successfully saving removes the need for confirmation.
  guard.drafts.set(draft, false);
  guard.request(navigate);
  assert.equal(navigations, 2);
  guard.drafts.delete(draft);
});

test("Discard bypass is restored after a failed action; later dirty drafts remain protected", () => {
  let pending;
  const guard = createDraftProtection((action) => {
    pending = action;
  });
  guard.drafts.set({}, true);
  guard.request(() => {
    throw new Error("failed");
  });
  assert.throws(() => pending(), /failed/);
  let changed = false;
  guard.request(() => {
    changed = true;
  });
  assert.equal(changed, false);
});

test("Deletion safeguards reflect saved steps and history, including Later goals", () => {
  const state = c.seed("2026-10-17");
  assert.equal(goalDeletionImpact(state, "japanese").impact, "low");
  state.goals.find((g) => g.id === "portfolio").status = "later";
  assert.equal(goalDeletionImpact(state, "portfolio").impact, "moderate");
  const removed = c.deleteGoal(state, "portfolio");
  assert.equal(
    removed.goals.some((g) => g.id === "portfolio"),
    false,
  );
  assert.deepEqual(c.undoChange(removed).tasks, state.tasks);
  const template = state.tasks[0];
  state.tasks = Array.from({ length: 10 }, (_, index) => ({
    ...template,
    id: `history-${index}`,
    status: "done",
  }));
  assert.deepEqual(goalDeletionImpact(state, "portfolio"), {
    count: 10,
    completed: 10,
    impact: "high",
  });
});

test("Personal events require protection when clearing or replacing the whole calendar", () => {
  const today = "2026-10-17";
  const empty = c.blank(today);
  assert.equal(calendarReplacementIsHighImpact(empty), false);
  const personal = c.createEvent(
    empty,
    { title: "Appointment", date: today, start: 540, minutes: 30 },
    today,
  );
  assert.equal(calendarReplacementIsHighImpact(personal), true);
  const cleared = c.resetWorkspace(personal, today);
  assert.equal(cleared.tasks.length, 0);
  assert.deepEqual(c.undoChange(cleared).tasks, personal.tasks);
});

test("Network, malformed file and unknown failures offer actionable recovery messages", () => {
  assert.match(
    errorMessage(new TypeError("Failed to fetch")),
    /running.*try again/,
  );
  assert.match(
    errorMessage(new SyntaxError("Unexpected token")),
    /Appa JSON backup/,
  );
  assert.match(errorMessage(null), /Try again/);
  const helpful = "This time overlaps another event. Choose a free time.";
  assert.equal(errorMessage(new Error(helpful)), helpful);
});
