import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../dist/runtime/src/calendar.js";
import {
  equalSecret,
  readResponseStream,
} from "../dist/runtime/server/chatgpt.js";
const today = "2026-10-12";
test("Calendar date and current-time position use the same instant in the chosen timezone", () => {
  const beforeMidnight = new Date("2026-10-14T13:59:30Z");
  assert.equal(c.localDate("Australia/Brisbane", beforeMidnight), "2026-10-14");
  assert.equal(c.localMinute("Australia/Brisbane", beforeMidnight), 1439);
  assert.equal(c.localDate("Pacific/Auckland", beforeMidnight), "2026-10-15");
  assert.equal(c.localMinute("Pacific/Auckland", beforeMidnight), 179);
  const midnight = new Date("2026-10-14T14:00:00Z");
  assert.equal(c.localDate("Australia/Brisbane", midnight), "2026-10-15");
  assert.equal(c.localMinute("Australia/Brisbane", midnight), 0);
});

function feasible(state, date = today) {
  const slots = c.slotsFor(state, date);
  for (let i = 0; i < slots.length; i++) {
    assert.ok(slots[i].start >= state.settings.start);
    assert.ok(slots[i].start + slots[i].duration <= state.settings.end);
    if (i)
      assert.ok(slots[i].start >= slots[i - 1].start + slots[i - 1].duration);
  }
}
test("Shared slots reserve the longest duration; choosing changes capacity without completing", () => {
  let state = c.seed(today);
  assert.equal(c.plannedMinutesFor(state, today), 45);
  state = c.selectChoice(state, today, "move-slot", "walk");
  assert.equal(c.plannedMinutesFor(state, today), 35);
  assert.ok(state.tasks.every((t) => t.status === "pending"));
  state = c.selectChoice(state, today, "move-slot", "stretch");
  assert.equal(c.plannedMinutesFor(state, today), 45);
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
  const next = c.updateSettings(state, { ...state.settings, end: 1110 }, today);
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
  const next = c.updateSettings(state, { ...state.settings, end: 1130 }, today);
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
  assert.equal(c.plannedMinutesFor(later, today), 45);
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
  capacity.settings.end = 1110;
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
      c.updateSettings(state, { ...state.settings, end: 1110 }, today),
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
test("Scheduling uses the full available window beyond the former daily limit", () => {
  const longPlan = {
    ...plan,
    tasks: ["Research", "Practice", "Review"].map((title) => ({
      title,
      minutes: 60,
      dependsOn: [],
    })),
  };
  let state = c.approvePlan(c.blank(today), longPlan, { today });
  assert.deepEqual(
    c.slotsFor(state, today).map((slot) => slot.start),
    [1080, 1140, 1200],
  );
  assert.equal(c.plannedMinutesFor(state, today), 180);
  feasible(state);
  for (const task of [...state.tasks])
    state = c.completeTask(state, task.id, today);
  state = c.approvePlan(
    state,
    { ...plan, tasks: [{ title: "One more step", minutes: 5, dependsOn: [] }] },
    { today },
  );
  assert.equal(state.tasks.at(-1).date, c.addDays(today, 1));
  feasible(state);
  feasible(state, c.addDays(today, 1));
});
test("Available hours can accommodate more than 180 planned minutes", () => {
  const state = c.updateSettings(
    c.blank(today),
    { start: 540, end: 1020, timezone: "Australia/Brisbane" },
    today,
  );
  const next = c.approvePlan(
    state,
    {
      ...plan,
      tasks: ["Research", "Practice", "Review", "Write"].map((title) => ({
        title,
        minutes: 60,
        dependsOn: [],
      })),
    },
    { today },
  );
  assert.equal(c.plannedMinutesFor(next, today), 240);
  assert.equal(c.slotsFor(next, today).length, 4);
  feasible(next);
  assert.doesNotThrow(() => c.validateBackup(next, today));
});
test("Recovery uses free hours without merging work at the former daily limit", () => {
  const yesterday = c.addDays(today, -1);
  const state = c.approvePlan(
    c.blank(yesterday),
    {
      ...plan,
      tasks: ["Research", "Practice"].map((title) => ({
        title,
        minutes: 60,
        dependsOn: [],
      })),
    },
    { today: yesterday },
  );
  const next = c.catchUp(state, today, 1080);
  assert.equal(c.plannedMinutesFor(next, today), 120);
  assert.equal(c.slotsFor(next, today).length, 2);
  assert.ok(next.tasks.every((task) => task.date === today));
  feasible(next);
  assert.deepEqual(c.undoChange(next).tasks, state.tasks);
});
test("Legacy budgets are discarded on reload, import and settings save without losing progress", () => {
  const state = c.completeTask(
    c.selectChoice(c.seed(today), today, "move-slot", "walk"),
    "outline",
    today,
  );
  state.settings.budget = 30;
  state.draft = { intention: "Read a book", plan };
  const original = c.copy(state);
  const restored = c.validateBackup(JSON.parse(JSON.stringify(state)), today);
  assert.equal(Object.hasOwn(restored.settings, "budget"), false);
  assert.deepEqual(restored.tasks, state.tasks);
  assert.deepEqual(restored.goals, state.goals);
  assert.deepEqual(restored.choices, state.choices);
  assert.deepEqual(restored.draft, state.draft);
  assert.deepEqual(state, original);
  const imported = c.importBackup(c.blank(today), state, today);
  assert.equal(Object.hasOwn(imported.settings, "budget"), false);
  assert.deepEqual(imported.tasks, state.tasks);
  const updated = c.updateSettings(state, state.settings, today);
  assert.equal(Object.hasOwn(updated.settings, "budget"), false);
  assert.equal(
    updated.tasks.find((task) => task.id === "outline").status,
    "done",
  );
  assert.doesNotThrow(() => c.validateBackup(updated, today));
});
test("A longer shared choice can exceed 60 planned minutes when hours remain", () => {
  let state = c.approvePlan(
    c.seed(today),
    { ...plan, tasks: [{ title: "Practice", minutes: 50, dependsOn: [] }] },
    { today },
  );
  state = c.selectChoice(state, today, "move-slot", "walk");
  assert.equal(c.plannedMinutesFor(state, today), 85);
  state = c.selectChoice(state, today, "move-slot", "stretch");
  assert.equal(c.plannedMinutesFor(state, today), 95);
  feasible(state);
  const overlap = c.copy(state);
  overlap.tasks.at(-1).start = 1125;
  overlap.choices[`${today}/move-slot`] = "walk";
  assert.throws(
    () => c.selectChoice(overlap, today, "move-slot", "stretch"),
    /no longer fits/,
  );
});
test("Settings still reject invalid available hours and tasks longer than the window", () => {
  const state = c.blank(today);
  for (const hours of [
    { start: -5, end: 1260 },
    { start: 1080, end: 1445 },
    { start: 1080, end: 1080 },
    { start: 1080, end: 1084 },
    { start: 1080.5, end: 1260 },
  ])
    assert.throws(
      () => c.updateSettings(state, { ...state.settings, ...hours }, today),
      /Available hours/,
    );
  const narrow = c.updateSettings(
    state,
    { ...state.settings, end: 1095 },
    today,
  );
  assert.throws(
    () => c.approvePlan(narrow, plan, { today }),
    /longer than your available hours/,
  );
});
test("Secret comparison rejects differing byte lengths without throwing", () => {
  assert.equal(equalSecret("same", "same"), true);
  assert.equal(equalSecret("é", "a"), false);
  assert.equal(equalSecret(null, "x"), false);
});
test("Calendars beyond former lifetime limits survive reload and reversible import", () => {
  let state = c.blank(today);
  for (let i = 0; i < 101; i++)
    state = c.approvePlan(state, plan, { today, later: true });
  let restored = c.validateBackup(JSON.parse(JSON.stringify(state)), today);
  assert.equal(restored.goals.length, 101);
  assert.deepEqual(
    c.importBackup(c.blank(today), restored, today).goals,
    state.goals,
  );
  state = c.blank(today);
  state.goals = [
    {
      id: "history",
      name: "History",
      color: "teal",
      status: "active",
      recurrence: null,
    },
  ];
  state.tasks = Array.from({ length: 5001 }, (_, i) => ({
    id: `history-${i}`,
    goalId: "history",
    title: "Finished step",
    minutes: 5,
    date: c.addDays(today, -1),
    start: 1080,
    slotId: `history-slot-${i}`,
    dependsOn: [],
    status: "done",
  }));
  restored = c.validateBackup(JSON.parse(JSON.stringify(state)), today);
  assert.deepEqual(restored.tasks, state.tasks);
  assert.equal(
    c.importBackup(c.blank(today), restored, today).tasks.length,
    5001,
  );
});
test("Active recurrence templates must fit hours even without upcoming tasks", () => {
  const state = c.blank(today);
  state.settings.end = 1085;
  state.goals = [
    {
      id: "repeat",
      name: "Repeat",
      color: "teal",
      status: "active",
      recurrence: {
        perWeek: 1,
        anchor: today,
        templates: [{ title: "Long session", minutes: 60 }],
      },
    },
  ];
  assert.throws(
    () => c.validateBackup(state, today),
    /recurring.*available hours/i,
  );
  state.goals[0].status = "later";
  assert.doesNotThrow(() => c.validateBackup(state, today));
  state.goals[0].status = "active";
  state.settings.end = 1260;
  assert.throws(
    () => c.updateSettings(state, { ...state.settings, end: 1085 }, today),
    /recurring.*available hours/i,
  );
  assert.doesNotThrow(() => c.validateBackup(state, today));
});
test("Approving work after a short shared choice preserves non-overlap and reloadability", () => {
  const yesterday = c.addDays(today, -1);
  let state = c.updateSettings(
    c.blank(yesterday),
    { start: 1080, end: 1110, timezone: "Australia/Brisbane" },
    yesterday,
  );
  state = c.extendRecurrences(
    c.approvePlan(
      state,
      {
        goalName: "Repeat",
        kind: "recurring",
        perWeek: 7,
        clarification: null,
        tasks: [
          { title: "Short option", minutes: 5, dependsOn: [] },
          { title: "Long option", minutes: 20, dependsOn: [] },
        ],
      },
      { today: yesterday },
    ),
    yesterday,
  );
  const short = state.tasks.find((t) => t.date === yesterday);
  state = c.extendRecurrences(c.catchUp(state, today, 1080), today);
  const shared = c
    .slotsFor(state, today)
    .find((slot) => slot.tasks.some((t) => t.id === short.id));
  state = c.selectChoice(state, today, shared.id, short.id);
  state = c.approvePlan(
    state,
    {
      ...plan,
      tasks: [{ title: "Fill freed time", minutes: 25, dependsOn: [] }],
    },
    { today },
  );
  const before = c.copy(state);
  state = c.approvePlan(
    state,
    { ...plan, tasks: [{ title: "Extra step", minutes: 5, dependsOn: [] }] },
    { today },
  );
  for (const date of new Set(state.tasks.map((t) => t.date)))
    feasible(state, date);
  assert.doesNotThrow(() => c.validateBackup(state, today));
  assert.equal(
    c.slotsFor(state, today).find((s) => s.id === shared.id).chosen?.id,
    short.id,
  );
  assert.deepEqual(c.undoChange(state).tasks, before.tasks);
});
test("Narrowing hours preserves an incoming shared choice and produces a reloadable calendar", () => {
  const state = c.blank(today);
  state.settings.end = 1110;
  state.goals = [
    {
      id: "g",
      name: "Project",
      status: "active",
      color: "teal",
      recurrence: null,
    },
  ];
  state.tasks = [
    ["first", 5, 1080, "a"],
    ["chosen", 10, 1085, "b"],
    ["long", 20, 1085, "b"],
  ].map(([id, minutes, start, slotId]) => ({
    id,
    minutes,
    start,
    slotId,
    goalId: "g",
    title: id,
    date: today,
    dependsOn: [],
    status: "pending",
  }));
  state.choices[`${today}/b`] = "chosen";
  c.validateBackup(state, today);
  const before = c.copy(state);
  const next = c.updateSettings(state, { ...state.settings, end: 1090 }, today);
  const chosen = next.tasks.find((t) => t.id === "chosen");
  const slot = c
    .slotsFor(next, chosen.date)
    .find((s) => s.id === chosen.slotId);
  assert.equal(slot.chosen?.id, "chosen");
  assert.deepEqual(
    slot.tasks.map((t) => t.id),
    ["chosen", "long"],
  );
  assert.ok(chosen.date > today);
  for (const date of new Set(next.tasks.map((t) => t.date)))
    feasible(next, date);
  const restored = c.validateBackup(JSON.parse(JSON.stringify(next)), today);
  assert.deepEqual(restored.tasks, next.tasks);
  assert.deepEqual(c.undoChange(next).tasks, before.tasks);
  assert.deepEqual(state, before);
});

test("Reload and cross-timezone import classify history using the saved timezone", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-13T11:30:00Z"),
  });
  const localToday = "2026-10-14";
  assert.equal(c.localDate("Pacific/Auckland"), localToday);
  assert.equal(c.localDate("Australia/Brisbane"), "2026-10-13");
  const state = c.approvePlan(
    c.blank("2026-10-13"),
    {
      ...plan,
      tasks: [{ title: "Finished yesterday", minutes: 20, dependsOn: [] }],
    },
    { today: "2026-10-13" },
  );
  state.settings.timezone = "Pacific/Auckland";
  const completed = c.completeTask(state, state.tasks[0].id, "2026-10-13");
  const next = c.updateSettings(completed, {
    ...completed.settings,
    start: 1140,
  });
  const raw = JSON.parse(JSON.stringify(next));
  assert.deepEqual(c.validateBackup(raw).tasks, next.tasks);
  for (const timezone of ["Australia/Brisbane", "America/New_York"]) {
    const workspace = c.blank(c.localDate(timezone));
    workspace.settings.timezone = timezone;
    const imported = c.importBackup(workspace, raw);
    assert.deepEqual(imported.tasks, next.tasks);
    assert.equal(imported.settings.timezone, "Pacific/Auckland");
    assert.deepEqual(c.undoChange(imported).settings, workspace.settings);
  }
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
