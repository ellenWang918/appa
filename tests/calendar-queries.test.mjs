import { test } from "node:test";
import assert from "node:assert/strict";
import * as cal from "../dist/runtime/src/calendar.js";
import { createCalendarQueries } from "../dist/runtime/src/calendarQueries.js";
import { timeRange, minuteFor } from "../dist/runtime/src/timeRange.js";

const today = cal.localDate("Australia/Brisbane");
test("Year presence accounts for moved, excluded and hidden recurring events", () => {
  let state = cal.createEvent(
    cal.blank(today),
    { title: "Walk", date: today, start: 540, minutes: 30, repeat: "daily" },
    today,
  );
  const series = state.eventSeries[0];
  state = cal.editTask(
    state,
    `${series.id}/${cal.addDays(today, 1)}`,
    {
      title: "Moved walk",
      date: cal.addDays(today, 3),
      start: 660,
      minutes: 30,
    },
    today,
  );
  state = cal.removeEvent(state, `${series.id}/${cal.addDays(today, 2)}`);
  const queries = createCalendarQueries(state);
  assert.deepEqual(
    [...queries.scheduledDates(today, cal.addDays(today, 4))].sort(),
    [today, cal.addDays(today, 3), cal.addDays(today, 4)],
  );
  assert.equal(queries.slotsFor(cal.addDays(today, 1)).length, 0);
  assert.deepEqual(
    queries.slotsFor(cal.addDays(today, 3)).map((slot) => slot.start),
    [540, 660],
  );
  const hidden = cal.calendarDisplayState(cal.togglePersonalCalendar(state));
  assert.equal(
    createCalendarQueries(hidden).scheduledDates(today, cal.addDays(today, 4))
      .size,
    0,
  );
});
test("Date indexes include completed and all-day work, but exclude Later and skipped tasks", () => {
  const state = cal.blank(today);
  state.goals = [
    {
      id: "later",
      name: "Later project",
      status: "later",
      color: "clay",
      recurrence: null,
    },
  ];
  state.tasks = [
    {
      id: "done",
      goalId: null,
      title: "Done event",
      date: today,
      start: 0,
      minutes: 1440,
      allDay: true,
      slotId: "done",
      status: "done",
      dependsOn: [],
    },
    {
      id: "later",
      goalId: "later",
      title: "Later step",
      date: cal.addDays(today, 1),
      start: 540,
      minutes: 30,
      slotId: "later",
      status: "pending",
      dependsOn: [],
    },
    {
      id: "skipped",
      goalId: "later",
      title: "Skipped step",
      date: cal.addDays(today, 2),
      start: 540,
      minutes: 30,
      slotId: "skip",
      status: "skipped",
      dependsOn: [],
    },
  ];
  const query = createCalendarQueries(state);
  assert.deepEqual(
    [...query.scheduledDates(today, cal.addDays(today, 3))],
    [today],
  );
  assert.equal(query.slotsFor(today).length, 0);
  assert.equal(query.slotsFor(today, null, true)[0].done, true);
});
test("Shared choices reserve the chosen duration through indexed slot queries", () => {
  const state = cal.blank(today);
  state.goals = [
    {
      id: "active",
      name: "Project",
      status: "active",
      color: "clay",
      recurrence: null,
    },
  ];
  state.tasks = [15, 30].map((minutes) => ({
    id: `task-${minutes}`,
    goalId: "active",
    title: "Step",
    date: today,
    start: 1080,
    minutes,
    slotId: "shared",
    status: "pending",
    dependsOn: [],
  }));
  assert.equal(createCalendarQueries(state).slotsFor(today)[0].duration, 30);
  state.choices[`${today}/shared`] = "task-15";
  assert.equal(createCalendarQueries(state).slotsFor(today)[0].duration, 15);
});
test("Creation and editing share midnight and invalid-time handling", () => {
  assert.deepEqual(timeRange("23:30", "00:00"), { start: 1410, minutes: 30 });
  assert.deepEqual(timeRange("09:00", "09:30"), { start: 540, minutes: 30 });
  assert.deepEqual(timeRange("", "", true), { start: 0, minutes: 1440 });
  assert.ok(Number.isNaN(minuteFor("25:00")));
  assert.ok(Number.isNaN(minuteFor("09:60")));
  assert.ok(Number.isNaN(timeRange("", "10:00").minutes));
  assert.equal(timeRange("10:00", "09:00").minutes, -60);
});
