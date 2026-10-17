import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../dist/runtime/src/calendar.js";

const today = "2030-10-17";
const plan = {
  goalName: "Read more",
  kind: "project",
  perWeek: null,
  clarification: null,
  tasks: [{ title: "Read a chapter", minutes: 50, dependsOn: [] }],
};
const unrestricted = (state) =>
  c.updateSettings(
    state,
    {
      ...state.settings,
      useAvailableTime: false,
    },
    today,
  );

test("Disabling available time preserves schedules, completed work, shared choices and saved hours", () => {
  let state = c.selectChoice(c.seed(today), today, "move-slot", "walk");
  state = c.completeTask(state, "outline", today);
  const next = unrestricted(state);
  assert.equal(next.settings.useAvailableTime, false);
  assert.equal(next.settings.start, 1080);
  assert.equal(next.settings.end, 1260);
  assert.deepEqual(c.availableHours(next.settings), { start: 0, end: 1440 });
  assert.deepEqual(next.tasks, state.tasks);
  assert.deepEqual(next.goals, state.goals);
  assert.deepEqual(next.choices, state.choices);
  assert.deepEqual(c.undoChange(next).settings, state.settings);
  const restored = c.validateBackup(JSON.parse(JSON.stringify(next)), today);
  assert.deepEqual(restored.settings, next.settings);
  assert.deepEqual(restored.tasks, next.tasks);
  const imported = c.importBackup(c.blank(today), next, today);
  assert.deepEqual(imported.settings, next.settings);
  assert.deepEqual(imported.tasks, next.tasks);
});

test("No time limit allows project and recurring steps outside saved hours while respecting event reservations", () => {
  let state = unrestricted(c.blank(today));
  state = c.updateSettings(
    state,
    { ...state.settings, start: 1080, end: 1085 },
    today,
  );
  state = c.createEvent(
    state,
    {
      title: "Appointment",
      date: today,
      start: 0,
      minutes: 30,
      repeat: "daily",
    },
    today,
  );
  state = c.createEvent(
    state,
    {
      title: "All day",
      date: today,
      start: 0,
      minutes: 1440,
      allDay: true,
    },
    today,
  );
  state = c.approvePlan(state, plan, { today });
  const project = state.tasks.find((task) => task.goalId !== null);
  assert.equal(project.start, 30);
  state = c.approvePlan(
    state,
    { ...plan, goalName: "Practice", kind: "recurring", perWeek: 3 },
    { today },
  );
  state = c.extendRecurrences(state, today);
  assert.ok(state.tasks.some((task) => task.activityId));
  assert.doesNotThrow(() => c.validateBackup(state, today));
  for (const date of new Set(state.tasks.map((task) => task.date))) {
    const slots = c.slotsFor(state, date);
    for (let i = 1; i < slots.length; i++)
      assert.ok(slots[i].start >= slots[i - 1].start + slots[i - 1].duration);
  }
});

test("Manual goal edits and backup validation use the full day when the time limit is off", () => {
  const state = unrestricted(c.seed(today));
  const next = c.editTask(
    state,
    "outline",
    {
      title: "Read first",
      date: today,
      start: 540,
      minutes: 20,
    },
    today,
  );
  assert.equal(next.tasks.find((task) => task.id === "outline").start, 540);
  assert.doesNotThrow(() => c.validateBackup(next, today));
  assert.throws(
    () =>
      c.editTask(
        next,
        "outline",
        {
          title: "Invalid",
          date: today,
          start: 1430,
          minutes: 20,
        },
        today,
      ),
    /available hours/,
  );
  const limited = c.updateSettings(
    next,
    { ...next.settings, useAvailableTime: true },
    today,
  );
  assert.deepEqual(c.availableHours(limited.settings), {
    start: 1080,
    end: 1260,
  });
  assert.ok(
    limited.tasks
      .filter((task) => task.status === "pending" && task.goalId !== null)
      .every((task) => task.start >= 1080 && task.start + task.minutes <= 1260),
  );
  assert.doesNotThrow(() => c.validateBackup(limited, today));
});

test("Recovery continues later today after the remembered availability has ended when no limit is set", () => {
  let state = unrestricted(c.seed(c.addDays(today, -1)));
  state = c.catchUp(state, today, 1320);
  const outline = state.tasks.find((task) => task.id === "outline");
  assert.equal(outline.date, today);
  assert.ok(outline.start >= 1320);
  assert.doesNotThrow(() => c.validateBackup(state, today));
});

test("Old calendars retain their existing availability and invalid optional flags are rejected", () => {
  const old = c.seed(today);
  delete old.settings.useAvailableTime;
  const restored = c.validateBackup(old, today);
  assert.equal(restored.settings.useAvailableTime, true);
  assert.deepEqual(c.availableHours(restored.settings), {
    start: 1080,
    end: 1260,
  });
  assert.deepEqual(restored.tasks, old.tasks);
  for (const value of [null, 0, 1, "false", {}]) {
    const invalid = { ...restored.settings, useAvailableTime: value };
    assert.throws(
      () => c.updateSettings(restored, invalid, today),
      /whether to set available time/,
    );
    assert.throws(
      () => c.validateBackup({ ...restored, settings: invalid }, today),
      /whether to set available time/,
    );
  }
});

test("Disabled availability does not require hours; enabled availability still validates them", () => {
  const state = c.blank(today);
  const settings = { ...state.settings, useAvailableTime: false };
  delete settings.start;
  delete settings.end;
  const next = c.updateSettings(state, settings, today);
  assert.equal(next.settings.useAvailableTime, false);
  assert.deepEqual(c.availableHours(next.settings), { start: 0, end: 1440 });
  assert.doesNotThrow(() => c.validateBackup(next, today));
  assert.throws(
    () =>
      c.updateSettings(state, { ...settings, useAvailableTime: true }, today),
    /Available hours/,
  );
});

test("Unrestricted scheduling starts after the current time rather than earlier today", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2030-10-17T12:02:00Z"),
  });
  const state = unrestricted(c.blank(today));
  const next = c.approvePlan(state, plan, { today });
  assert.equal(next.tasks[0].date, today);
  assert.equal(next.tasks[0].start, 1325);
});

test("Unrestricted work moves to tomorrow when the rest of today cannot fit it", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2030-10-17T13:55:00Z"),
  });
  const state = unrestricted(c.blank(today));
  const next = c.approvePlan(state, plan, { today });
  assert.equal(next.tasks[0].date, c.addDays(today, 1));
  assert.equal(next.tasks[0].start, 0);
});

test("Re-enabling a window cannot exclude completed work and leaves the original calendar intact", () => {
  let state = c.editTask(
    unrestricted(c.seed(today)),
    "outline",
    {
      title: "Morning work",
      date: today,
      start: 540,
      minutes: 20,
    },
    today,
  );
  state = c.completeTask(state, "outline", today);
  const before = c.copy(state);
  assert.throws(
    () =>
      c.updateSettings(
        state,
        { ...state.settings, useAvailableTime: true },
        today,
      ),
    /already completed today/,
  );
  assert.deepEqual(state, before);
});
