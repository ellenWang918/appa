import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../dist/runtime/src/calendar.js";

const today = "2026-10-17";
const details = {
  title: "Family day",
  date: today,
  start: 540,
  minutes: 30,
  allDay: true,
};
const reload = (state) =>
  c.validateBackup(JSON.parse(JSON.stringify(state)), today);

test("All-day events round-trip, import and Undo as dated entries outside timed slots", () => {
  const empty = c.blank(today);
  const next = c.createEvent(empty, details, today);
  const event = next.tasks[0];
  assert.equal(event.allDay, true);
  assert.equal(event.start, 0);
  assert.equal(event.minutes, 1440);
  assert.deepEqual(c.slotsFor(next, today), []);
  assert.deepEqual(c.allDaySlotsFor(next, today)[0].tasks, [event]);
  assert.equal(c.plannedMinutesFor(next, today), 0);
  assert.deepEqual(reload(next).tasks, next.tasks);
  assert.deepEqual(c.importBackup(empty, next, today).tasks, next.tasks);
  assert.deepEqual(c.undoChange(next).tasks, []);
});

test("Multiple all-day events coexist with appointments and AI planning without consuming hourly capacity", () => {
  let state = c.createEvent(c.blank(today), details, today);
  state = c.createEvent(state, { ...details, title: "School holidays" }, today);
  state = c.createEvent(
    state,
    { title: "Dentist", date: today, start: 540, minutes: 30 },
    today,
  );
  const planned = c.approvePlan(
    state,
    {
      goalName: "Read a book",
      kind: "project",
      perWeek: null,
      clarification: null,
      tasks: [{ title: "Read a chapter", minutes: 20, dependsOn: [] }],
    },
    { today },
  );
  assert.equal(c.allDaySlotsFor(planned, today).length, 2);
  assert.equal(c.slotsFor(planned, today).length, 2);
  assert.equal(
    planned.tasks.find((task) => task.goalId !== null).start,
    planned.settings.start,
  );
  assert.equal(c.plannedMinutesFor(planned, today), 50);
  assert.deepEqual(reload(planned).tasks, planned.tasks);
});

test("Switching event types preserves identity and checks conflicts when returning to timed mode", () => {
  const timed = { title: "Family lunch", date: today, start: 720, minutes: 60 };
  let state = c.createEvent(c.blank(today), timed, today);
  const eventId = state.tasks[0].id;
  state = c.editTask(state, eventId, { ...timed, allDay: true }, today);
  assert.equal(state.tasks[0].id, eventId);
  assert.equal(c.allDaySlotsFor(state, today).length, 1);
  assert.equal(c.slotsFor(state, today).length, 0);
  state = c.createEvent(state, timed, today);
  const before = structuredClone(state);
  assert.throws(
    () => c.editTask(state, eventId, { ...timed, allDay: false }, today),
    /overlaps/,
  );
  assert.deepEqual(state, before);
  state = c.editTask(
    state,
    eventId,
    { ...timed, start: 840, allDay: false },
    today,
  );
  assert.equal(c.allDaySlotsFor(state, today).length, 0);
  assert.equal(c.slotsFor(state, today).length, 2);
  assert.equal(state.tasks[0].allDay, undefined);
  assert.deepEqual(reload(state).tasks, state.tasks);
});

test("Moving an all-day event changes its date without moving other work or changing its identity", () => {
  const original = c.createEvent(c.seed(today), details, today);
  const eventId = original.tasks.at(-1).id;
  const next = c.editTask(
    original,
    eventId,
    { ...details, title: "Family trip", date: c.addDays(today, 2) },
    today,
  );
  assert.deepEqual(next.tasks.slice(0, -1), original.tasks.slice(0, -1));
  assert.equal(c.allDaySlotsFor(next, today).length, 0);
  assert.equal(
    c.allDaySlotsFor(next, c.addDays(today, 2))[0].tasks[0].id,
    eventId,
  );
  assert.deepEqual(c.undoChange(next).tasks, original.tasks);
});

test("All-day events stay fixed through recovery, recurrence extension and availability changes", () => {
  let state = c.createEvent(c.seed(today), details, today);
  const event = structuredClone(state.tasks.at(-1));
  state = c.extendRecurrences(state, today);
  state = c.updateSettings(
    state,
    { ...state.settings, start: 1140, end: 1260 },
    today,
  );
  state = c.catchUp(state, c.addDays(today, 3), 1140, true);
  assert.deepEqual(
    state.tasks.find((task) => task.id === event.id),
    event,
  );
  assert.deepEqual(reload(state).tasks, state.tasks);
});

test("All-day events support completion, removal and Undo without becoming timed reservations", () => {
  let state = c.createEvent(c.blank(today), details, today);
  const eventId = state.tasks[0].id;
  state = c.completeTask(state, eventId, today);
  assert.equal(c.allDaySlotsFor(state, today)[0].done, true);
  assert.deepEqual(c.slotsFor(state, today), []);
  assert.deepEqual(reload(state).tasks, state.tasks);
  const removed = c.removeEvent(state, eventId);
  assert.deepEqual(removed.tasks, []);
  assert.deepEqual(c.undoChange(removed).tasks, state.tasks);
});

test("All-day validation rejects malformed flags, invalid dates and goal steps while preserving old backups", () => {
  const empty = c.blank(today);
  assert.throws(() =>
    c.createEvent(empty, { ...details, allDay: "yes" }, today),
  );
  assert.throws(() =>
    c.createEvent(empty, { ...details, date: "2026-02-30" }, today),
  );
  const next = c.createEvent(empty, details, today);
  for (const patch of [{ allDay: "true" }, { start: 540 }, { minutes: 30 }]) {
    const corrupt = structuredClone(next);
    Object.assign(corrupt.tasks[0], patch);
    assert.throws(() => reload(corrupt));
  }
  const seeded = c.seed(today);
  assert.deepEqual(reload(seeded).tasks, seeded.tasks);
  assert.throws(
    () => c.editTask(seeded, "outline", details, today),
    /standalone/,
  );
  const corruptGoal = structuredClone(seeded);
  Object.assign(corruptGoal.tasks[0], {
    allDay: true,
    start: 0,
    minutes: 1440,
  });
  assert.throws(() => reload(corruptGoal));
});
