import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../src/calendar.mjs";
import { equalSecret, readResponseStream } from "../server/chatgpt.mjs";
const today = "2026-10-12";
function feasible(state, date = today) {
  const slots = c.slotsFor(state, date);
  assert.ok(c.budgetFor(state, date) <= state.settings.budget);
  for (let i = 0; i < slots.length; i++) {
    assert.ok(slots[i].start >= state.settings.start);
    assert.ok(slots[i].start + slots[i].duration <= state.settings.end);
    if (i)
      assert.ok(slots[i].start >= slots[i - 1].start + slots[i - 1].duration);
  }
}
test("Shared slots reserve the longest duration; choosing changes capacity without completing", () => {
  let state = c.seed(today);
  assert.equal(c.budgetFor(state, today), 45);
  state = c.selectChoice(state, today, "move-slot", "walk");
  assert.equal(c.budgetFor(state, today), 35);
  assert.ok(state.tasks.every((t) => t.status === "pending"));
  state = c.selectChoice(state, today, "move-slot", "stretch");
  assert.equal(c.budgetFor(state, today), 45);
  feasible(state);
});
test("Completing a shared choice skips other recurring occurrences, keeps future repeats and supports undo", () => {
  let state = c.extendRecurrences(c.seed(today), today);
  const future = state.tasks
    .filter((t) => t.date > today && t.activityId)
    .map((t) => t.id);
  assert.throws(() => c.completeTask(state, "walk", today), /Choose/);
  state = c.completeTask(
    c.selectChoice(state, today, "move-slot", "walk"),
    "walk",
    today,
  );
  assert.equal(state.tasks.find((t) => t.id === "stretch").status, "skipped");
  assert.ok(
    future.every(
      (key) => state.tasks.find((t) => t.id === key).status === "pending",
    ),
  );
  state = c.undoChange(state);
  assert.equal(state.tasks.find((t) => t.id === "walk").status, "pending");
  assert.equal(state.tasks.find((t) => t.id === "stretch").status, "pending");
});
test("Completing an alternative keeps unchosen project work pending", () => {
  let state = c.seed(today);
  const task = state.tasks.find((t) => t.id === "outline");
  task.slotId = "move-slot";
  task.start = 1110;
  state = c.completeTask(
    c.selectChoice(state, today, "move-slot", "walk"),
    "walk",
    today,
  );
  assert.equal(state.tasks.find((t) => t.id === "outline").status, "pending");
  const next = c.catchUp(state, c.addDays(today, 1), 1080);
  assert.equal(
    next.tasks.find((t) => t.id === "outline").date,
    c.addDays(today, 1),
  );
});
test("Prerequisites and future dates prevent completion", () => {
  const state = c.seed(today);
  assert.throws(() => c.completeTask(state, "draft", today), /not actionable/);
  assert.throws(
    () => c.completeTask(state, "draft", c.addDays(today, 1)),
    /not actionable/,
  );
  assert.equal(
    c.isBlocked(
      c.completeTask(state, "outline", today),
      state.tasks.find((t) => t.id === "draft"),
    ),
    false,
  );
});
test("Catch up moves dependent steps in order and keeps independent work", () => {
  const state = c.seed(c.addDays(today, -3));
  const next = c.catchUp(state, today, 1080);
  const dates = ["outline", "draft", "review"].map(
    (key) => next.tasks.find((t) => t.id === key).date,
  );
  assert.ok(dates[0] >= today);
  assert.ok(dates[0] < dates[1] && dates[1] < dates[2]);
  assert.equal(
    next.tasks.filter((t) => t.activityId && t.status === "pending").length,
    1,
  );
  assert.equal(next.recovery.consolidated, 1);
  for (const date of new Set(next.tasks.map((t) => t.date)))
    feasible(next, date);
  assert.equal(c.catchUp(next, today, 1080), next);
  const undone = c.undoChange(next);
  assert.equal(
    undone.tasks.find((t) => t.id === "outline").date,
    c.addDays(today, -3),
  );
  assert.equal(c.catchUp(undone, today, 1080), undone);
});
test("Recovery merges an overdue repeat with an existing occurrence into one choice", () => {
  const state = c.seed(today);
  const overdue = {
    ...state.tasks.find((t) => t.id === "stretch"),
    id: "old",
    date: c.addDays(today, -2),
    slotId: "old-slot",
    occurrenceKey: c.addDays(today, -2),
  };
  state.tasks.push(overdue);
  state.lastRecoveryDay = "";
  const next = c.catchUp(state, today, 1080);
  assert.equal(next.tasks.find((t) => t.id === "old").slotId, "move-slot");
  feasible(next);
});
test("Recovery after available hours begins tomorrow", () => {
  const state = c.seed(c.addDays(today, -1));
  const next = c.catchUp(state, today, 1260);
  assert.ok(
    next.tasks
      .filter((t) => t.status === "pending")
      .every((t) => t.date > today),
  );
});
test("Recurrence extension is idempotent and keeps regular cadence", () => {
  const state = c.extendRecurrences(c.seed(today), today);
  assert.equal(
    c.extendRecurrences(state, today).tasks.length,
    state.tasks.length,
  );
  assert.deepEqual(
    state.tasks
      .filter((t) => t.activityId && t.date > today)
      .map((t) => t.occurrenceKey),
    ["2026-10-19", "2026-10-26"],
  );
});
test("Settings keep choices together, reflow capacity and preserve dependencies", () => {
  const state = c.seed(today);
  const next = c.updateSettings(
    state,
    { ...state.settings, budget: 30 },
    today,
  );
  assert.equal(
    next.tasks.find((t) => t.id === "walk").slotId,
    next.tasks.find((t) => t.id === "stretch").slotId,
  );
  for (const date of new Set(next.tasks.map((t) => t.date)))
    feasible(next, date);
  assert.equal(next.tasks.find((t) => t.id === "outline").status, "pending");
  assert.ok(
    next.tasks.find((t) => t.id === "draft").date >
      next.tasks.find((t) => t.id === "outline").date,
  );
});
test("Settings never lose pending projects in completed shared slots", () => {
  let state = c.seed(today);
  state.tasks.find((t) => t.id === "outline").slotId = "move-slot";
  state.tasks.find((t) => t.id === "outline").start = 1110;
  state = c.completeTask(
    c.selectChoice(state, today, "move-slot", "walk"),
    "walk",
    today,
  );
  const next = c.updateSettings(
    state,
    { ...state.settings, budget: 50 },
    today,
  );
  assert.equal(next.tasks.find((t) => t.id === "outline").date, "2026-10-13");
  assert.equal(next.tasks.find((t) => t.id === "walk").date, today);
});
const plan = {
  goalName: "Read a book",
  kind: "project",
  perWeek: null,
  clarification: null,
  tasks: [
    { title: "Choose a book", minutes: 10, dependsOn: [] },
    { title: "Read chapter one", minutes: 20, dependsOn: [0] },
  ],
};
test("New plans can join more than two active goals while preserving daily capacity and prerequisites", () => {
  const state = c.seed(today);
  const later = c.approvePlan(state, plan, { today, later: true });
  assert.equal(later.goals.at(-1).status, "later");
  assert.equal(c.budgetFor(later, today), 45);
  const next = c.approvePlan(state, plan, { today });
  assert.equal(next.goals.filter((g) => g.status === "active").length, 3);
  assert.equal(next.goals.find((g) => g.id === "portfolio").status, "active");
  assert.equal(next.goals.find((g) => g.id === "move").status, "active");
  const tasks = next.tasks.filter((t) => t.goalId === next.goals.at(-1).id);
  assert.ok(tasks[1].date > tasks[0].date);
  for (const date of new Set(next.tasks.map((t) => t.date)))
    feasible(next, date);
});
test("Later goals activate alongside existing goals, survive reload/import, and undo without losing progress", () => {
  let state = c.completeTask(c.seed(today), "outline", today);
  state = c.approvePlan(state, plan, { today, later: true });
  const firstId = state.goals.at(-1).id;
  state = c.activateGoal(state, firstId, { today });
  state = c.approvePlan(
    state,
    { ...plan, goalName: "Learn a language" },
    { today, later: true },
  );
  const secondId = state.goals.at(-1).id;
  const before = c.copy(state);
  state = c.activateGoal(state, secondId, { today });
  assert.equal(state.goals.filter((g) => g.status === "active").length, 4);
  assert.equal(state.goals.length, before.goals.length);
  assert.equal(state.tasks.length, before.tasks.length);
  assert.equal(state.tasks.find((t) => t.id === "outline").status, "done");
  for (const date of new Set(state.tasks.map((t) => t.date)))
    feasible(state, date);
  const restored = c.validateBackup(JSON.parse(JSON.stringify(state)), today);
  assert.equal(restored.goals.filter((g) => g.status === "active").length, 4);
  assert.equal(
    c
      .importBackup(c.blank(today), restored, today)
      .goals.filter((g) => g.status === "active").length,
    4,
  );
  const undone = c.undoChange(state);
  assert.deepEqual(undone.goals, before.goals);
  assert.deepEqual(undone.tasks, before.tasks);
});
test("Backup validation rejects cycles, invalid recurrences and over-capacity schedules", () => {
  const state = c.seed(today);
  assert.doesNotThrow(() => c.validateBackup(state, today));
  const cycle = c.copy(state);
  cycle.tasks[0].dependsOn = ["draft"];
  assert.throws(() => c.validateBackup(cycle, today), /cycle/);
  const recurrence = c.copy(state);
  recurrence.tasks[3].occurrenceKey = "invalid";
  assert.throws(
    () => c.validateBackup(recurrence, today),
    /recurring occurrence/,
  );
  const capacity = c.copy(state);
  capacity.settings.budget = 30;
  assert.throws(() => c.validateBackup(capacity, today), /capacity/);
  assert.throws(
    () =>
      c.validatePlan({
        ...plan,
        tasks: [{ title: "x", minutes: 3, dependsOn: [] }],
      }),
    /5–60/,
  );
});
test("Import is reversible", () => {
  const state = c.seed(today);
  const imported = c.importBackup(state, c.blank(today), today);
  assert.equal(imported.goals.length, 0);
  assert.deepEqual(c.undoChange(imported).goals, state.goals);
});
test("Recurring plans in Later retain cadence when activated", () => {
  const plan = {
    goalName: "Move daily",
    kind: "recurring",
    perWeek: 3,
    clarification: null,
    tasks: [
      { title: "Walk", minutes: 15, dependsOn: [] },
      { title: "Stretch", minutes: 20, dependsOn: [] },
    ],
  };
  let state = c.approvePlan(c.seed(today), plan, {
    later: true,
    today: "2026-10-01",
  });
  const goal = state.goals.at(-1);
  state = c.activateGoal(state, goal.id, { today });
  const tasks = state.tasks.filter((t) => t.goalId === goal.id);
  assert.deepEqual(
    tasks.map((t) => t.date),
    [today, "2026-10-14"],
  );
  assert.equal(state.goals.at(-1).recurrence.anchor, today);
});
test("Settings that exclude finished work are rejected rather than breaking the saved calendar", () => {
  let state = c.completeTask(c.seed(today), "outline", today);
  assert.throws(
    () => c.updateSettings(state, { ...state.settings, start: 1140 }, today),
    /already completed/,
  );
  assert.doesNotThrow(() =>
    c.validateBackup(
      c.updateSettings(state, { ...state.settings, budget: 30 }, today),
      today,
    ),
  );
});
test("Invalid saved draft is discarded while the valid calendar is preserved", () => {
  const state = c.seed(today);
  state.draft = {
    intention: "hello",
    plan: { goalName: "x", kind: "project", tasks: "bad" },
  };
  const next = c.validateBackup(state, today);
  assert.equal(next.draft, null);
  assert.equal(next.tasks.length, state.tasks.length);
});
test("Secret comparison rejects differing byte lengths without throwing", () => {
  assert.equal(equalSecret("same", "same"), true);
  assert.equal(equalSecret("é", "a"), false);
  assert.equal(equalSecret(null, "x"), false);
});
function stream(events, chunkSize = 13) {
  const bytes = new TextEncoder().encode(
    events.map((item) => "data: " + JSON.stringify(item) + "\r\n\r\n").join(""),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize)
          controller.enqueue(bytes.slice(i, i + chunkSize));
        controller.close();
      },
    }),
  );
}
test("AI plans require a completed stream and validate structured output across chunk boundaries", async () => {
  assert.deepEqual(
    await readResponseStream(
      stream([
        { type: "response.output_text.delta", delta: JSON.stringify(plan) },
        { type: "response.completed" },
      ]),
    ),
    plan,
  );
  await assert.rejects(
    () =>
      readResponseStream(
        stream([
          { type: "response.output_text.delta", delta: JSON.stringify(plan) },
        ]),
      ),
    /before the plan was complete/,
  );
  await assert.rejects(
    () =>
      readResponseStream(
        stream([
          { type: "response.output_text.delta", delta: JSON.stringify(plan) },
          {
            type: "response.failed",
            response: { error: { code: "subscription_sharing_usage_limit" } },
          },
        ]),
      ),
    /usage is unavailable/,
  );
});
