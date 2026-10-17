import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../dist/runtime/src/calendar.js";
const today = "2026-10-17";
const details = {
  title: "Appointment",
  date: today,
  start: 540,
  minutes: 30,
  repeat: "weekly",
};

test("Calendar visibility hides personal occurrences while preserving real reservations and goal tasks", () => {
  const state = c.createEvent(c.seed(today), details, today);
  const hidden = c.togglePersonalCalendar(state);
  const display = c.calendarDisplayState(hidden);
  assert.equal(
    c.slotsFor(display, today).some((slot) => slot.tasks[0].goalId === null),
    false,
  );
  assert.equal(
    c
      .slotsFor(display, c.addDays(today, 7))
      .some((slot) => slot.tasks[0].goalId === null),
    false,
  );
  assert.ok(display.tasks.some((task) => task.goalId === "portfolio"));
  assert.deepEqual(hidden.tasks, state.tasks);
  assert.throws(
    () => c.createEvent(hidden, { ...details, repeat: "none" }, today),
    /overlaps/,
  );
  assert.equal(
    c.personalCalendarFor(c.validateBackup(hidden, today)).visible,
    false,
  );
  assert.equal(
    c.personalCalendarFor(c.togglePersonalCalendar(hidden)).visible,
    true,
  );
});

test("Inline calendar edits persist colour and name without moving events and support Undo", () => {
  const state = c.createEvent(c.blank(today), details, today);
  const next = c.editPersonalCalendar(state, "Family", "clay");
  assert.deepEqual(next.tasks, state.tasks);
  assert.deepEqual(next.eventSeries, state.eventSeries);
  const restored = c.validateBackup(JSON.parse(JSON.stringify(next)), today);
  assert.equal(c.personalCalendarFor(restored).name, "Family");
  assert.equal(
    c.slotGoalColor(restored, c.slotsFor(restored, c.addDays(today, 7))[0]),
    "clay",
  );
  assert.equal(
    c.personalCalendarFor(c.undoChange(next)).name,
    "Personal tasks",
  );
  assert.throws(() => c.editPersonalCalendar(state, " ", "clay"), /name/);
  assert.throws(
    () => c.editPersonalCalendar(state, "Family", "invalid"),
    /colour/,
  );
});

test("Deleting a calendar removes its saved and virtual events; Undo restores the entire group", () => {
  const state = c.editPersonalCalendar(
    c.createEvent(c.seed(today), details, today),
    "Family",
    "rose",
  );
  const next = c.deletePersonalCalendar(state);
  assert.equal(c.personalCalendarFor(next), null);
  assert.ok(next.tasks.every((task) => task.goalId !== null));
  assert.deepEqual(next.goals, state.goals);
  assert.equal(
    c
      .slotsFor(next, c.addDays(today, 7))
      .some((slot) => slot.tasks[0].goalId === null),
    false,
  );
  assert.equal(c.personalCalendarFor(c.validateBackup(next, today)), null);
  const restored = c.undoChange(next);
  assert.deepEqual(restored.tasks, state.tasks);
  assert.deepEqual(restored.eventSeries, state.eventSeries);
  assert.deepEqual(restored.personalCalendar, state.personalCalendar);
  assert.equal(
    c.personalCalendarFor(
      c.createEvent(next, { ...details, repeat: "none" }, today),
    ).name,
    "Personal tasks",
  );
});

test("Legacy backups inherit a personal calendar; malformed calendar settings are rejected", () => {
  assert.equal(
    c.personalCalendarFor(c.validateBackup(c.blank(today), today)).visible,
    true,
  );
  for (const group of [
    { name: "", color: "slate", visible: true },
    { name: "X", color: "unknown", visible: true },
    { name: "X", color: "slate", visible: "yes" },
  ]) {
    assert.throws(
      () =>
        c.validateBackup({ ...c.blank(today), personalCalendar: group }, today),
      /invalid calendar group/,
    );
  }
});
