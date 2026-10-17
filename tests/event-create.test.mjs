import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../dist/runtime/src/calendar.js";

const today = "2026-10-17";
const appointment = {
  title: "Dentist appointment",
  date: today,
  start: 9 * 60,
  minutes: 120,
};
const add = (state, patch = {}) =>
  c.createEvent(state, { ...appointment, ...patch }, today);
const reload = (state) =>
  c.validateBackup(JSON.parse(JSON.stringify(state)), today);

test("Past events support creation, editing, reload and recovery without moving", () => {
  const date = c.addDays(today, -7);
  for (const extra of [{}, { allDay: true }, { repeat: "weekly" }]) {
    const original = c.blank(today);
    let state = add(original, { date, ...extra });
    const event = state.tasks[0];
    assert.equal(event.date, date);
    assert.equal(
      c.slotsFor(state, date).length + c.allDaySlotsFor(state, date).length,
      1,
    );
    assert.deepEqual(reload(state).tasks, state.tasks);
    assert.deepEqual(c.catchUp(state, today, 540, true).tasks, state.tasks);
    assert.deepEqual(c.undoChange(state).tasks, original.tasks);
    state = c.editTask(
      state,
      event.id,
      {
        ...appointment,
        date: c.addDays(date, -1),
        ...extra,
      },
      today,
    );
    assert.equal(state.tasks[0].date, c.addDays(date, -1));
    assert.deepEqual(reload(state).tasks, state.tasks);
  }
  const state = add(c.blank(today), { date });
  assert.throws(() => add(state, { date }), /overlaps/);
});

test("Standalone events save without goals, retain exact times on reload, and support Undo", () => {
  const state = c.blank(today);
  const next = add(state, { title: "  Dentist appointment  " });
  const event = next.tasks[0];
  assert.equal(event.goalId, null);
  assert.equal(event.title, appointment.title);
  assert.equal(event.start, appointment.start);
  assert.equal(event.minutes, 120);
  assert.deepEqual(next.goals, []);
  assert.deepEqual(c.slotsFor(next, today)[0].tasks, [event]);
  assert.deepEqual(reload(next).tasks, next.tasks);
  assert.deepEqual(c.undoChange(next).tasks, []);
  assert.deepEqual(state.tasks, []);
});

test("Blank event names default to New event for timed, all-day and repeating events", () => {
  for (const title of ["", "   "]) {
    for (const options of [
      {},
      { allDay: true },
      { repeat: "weekly" },
      { allDay: true, repeat: "daily" },
    ]) {
      const input = { ...appointment, ...options, title };
      const state = c.createEvent(c.blank(today), input, today);
      assert.equal(state.tasks[0].title, "New event");
      assert.equal(input.title, title);
      assert.deepEqual(reload(state).tasks, state.tasks);
      if (options.repeat) {
        assert.equal(state.eventSeries[0].title, "New event");
        const nextDate = c.addDays(today, options.repeat === "daily" ? 1 : 7);
        const slots = options.allDay
          ? c.allDaySlotsFor(state, nextDate)
          : c.slotsFor(state, nextDate);
        assert.equal(slots[0].tasks[0].title, "New event");
      }
      assert.deepEqual(c.undoChange(state).tasks, []);
    }
  }
});

test("Event creation rejects invalid input without changing the calendar or existing planner draft", () => {
  const state = c.seed(today);
  state.draft = { intention: "Learn to swim", plan: null };
  const before = structuredClone(state);
  for (const patch of [
    { title: "a".repeat(181) },
    { date: "2026-02-30" },
    { start: -1 },
    { start: 1440 },
    { start: 0.5 },
    { start: NaN },
    { minutes: 0 },
    { minutes: 4 },
    { minutes: 5.5 },
    { start: 1400, minutes: 60 },
    { start: 1080 },
    { start: 1110, minutes: 5 },
  ]) {
    assert.throws(() => add(state, patch));
    assert.deepEqual(state, before);
  }
  assert.deepEqual(add(state).draft, state.draft);
});

test("Events respect shared reservations and allow touching boundaries and midnight", () => {
  const state = c.seed(today);
  assert.throws(() => add(state, { start: 1125, minutes: 5 }), /overlaps/);
  const next = add(state, { start: 1135, minutes: 5 });
  assert.deepEqual(reload(next).tasks, next.tasks);
  const midnight = add(c.blank(today), { start: 1410, minutes: 30 });
  assert.equal(c.slotsFor(midnight, today)[0].duration, 30);
  assert.deepEqual(reload(midnight).tasks, midnight.tasks);
  assert.throws(() => add(midnight, { start: 1435, minutes: 5 }), /overlaps/);
});

test("AI plans schedule around fixed events, while recovery and availability changes preserve them", () => {
  let state = add(c.blank(today), { start: 1080, minutes: 120 });
  const event = structuredClone(state.tasks[0]);
  state = c.approvePlan(
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
  const step = state.tasks.find((task) => task.goalId !== null);
  assert.ok(step.start >= event.start + event.minutes);
  state = c.updateSettings(
    state,
    { ...state.settings, start: 540, end: 720 },
    today,
  );
  assert.deepEqual(
    state.tasks.find((task) => task.id === event.id),
    event,
  );
  assert.deepEqual(reload(state).tasks, state.tasks);
  state = c.catchUp(state, c.addDays(today, 3), 540, true);
  assert.deepEqual(
    state.tasks.find((task) => task.id === event.id),
    event,
  );
  assert.ok(state.tasks.find((task) => task.id === step.id).date > today);
});

test("Settings reflow goal steps around an event on the same day without moving the event", () => {
  let state = add(c.seed(today), { start: 1140, minutes: 60 });
  const event = structuredClone(state.tasks.at(-1));
  state = c.updateSettings(
    state,
    { ...state.settings, start: 1140, end: 1260 },
    today,
  );
  assert.deepEqual(
    state.tasks.find((task) => task.id === event.id),
    event,
  );
  const slots = c.slotsFor(state, today);
  for (let index = 1; index < slots.length; index++)
    assert.ok(
      slots[index].start >= slots[index - 1].start + slots[index - 1].duration,
    );
  assert.deepEqual(reload(state).tasks, state.tasks);
});

test("Completed events outside goal hours remain fixed when settings change", () => {
  let state = add(c.blank(today));
  const eventId = state.tasks[0].id;
  state = c.completeTask(state, eventId, today);
  const event = structuredClone(state.tasks[0]);
  state = c.updateSettings(
    state,
    { ...state.settings, start: 1200, end: 1260 },
    today,
  );
  assert.deepEqual(state.tasks[0], event);
  assert.deepEqual(reload(state).tasks, state.tasks);
});

test("Events can be edited and removed with Undo; overlaps fail atomically", () => {
  const original = add(c.seed(today));
  const eventId = original.tasks.at(-1).id;
  let state = c.editTask(
    original,
    eventId,
    { ...appointment, start: 780, minutes: 180 },
    today,
  );
  assert.equal(state.tasks.at(-1).start, 780);
  assert.deepEqual(reload(state).tasks, state.tasks);
  assert.throws(
    () => c.editTask(state, eventId, { ...appointment, start: 1080 }, today),
    /overlaps/,
  );
  assert.deepEqual(c.undoChange(state).tasks, original.tasks);
  const removed = c.removeEvent(state, eventId);
  assert.equal(
    removed.tasks.some((task) => task.id === eventId),
    false,
  );
  assert.deepEqual(c.undoChange(removed).tasks, state.tasks);
  assert.throws(() => c.removeEvent(state, "outline"));
});

test("Backup validation rejects events disguised as shared activities or dependent tasks", () => {
  const state = add(c.seed(today));
  for (const patch of [
    { goalId: undefined },
    { dependsOn: ["outline"] },
    { status: "skipped" },
    { activityId: "move", occurrenceKey: today },
    { start: 1110, slotId: "move-slot", minutes: 5 },
  ]) {
    const corrupt = structuredClone(state);
    Object.assign(corrupt.tasks.at(-1), patch);
    assert.throws(() => reload(corrupt));
  }
});
