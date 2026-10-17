import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../dist/runtime/src/calendar.js";

const today = "2026-10-17";
const event = { title: "Practice", date: today, start: 540, minutes: 30 };
const create = (repeat, changes = {}, state = c.blank(today)) =>
  c.createEvent(state, { ...event, ...changes, repeat }, today);
const reload = (state) =>
  c.validateBackup(JSON.parse(JSON.stringify(state)), today);
const occurrence = (state, date) => c.slotsFor(state, date)[0]?.tasks[0];

for (const [repeat, nextDate, excluded] of [
  ["daily", "2026-10-18", "2026-10-16"],
  ["weekly", "2026-10-24", "2026-10-23"],
  ["fortnightly", "2026-10-31", "2026-10-24"],
  ["monthly", "2026-11-17", "2026-11-18"],
  ["yearly", "2027-10-17", "2027-10-18"],
])
  test(`${repeat} events retain their cadence, times and stable identities across reload`, () => {
    const state = create(repeat);
    const next = occurrence(state, nextDate);
    assert.ok(next);
    assert.equal(next.start, 540);
    assert.equal(next.minutes, 30);
    assert.equal(next.date, nextDate);
    assert.equal(occurrence(state, excluded), undefined);
    assert.deepEqual(occurrence(reload(state), nextDate), next);
    assert.equal(c.taskFor(state, next.id)?.id, next.id);
    assert.equal(state.tasks.length, 1);
    assert.equal(c.undoChange(state).eventSeries, undefined);
  });

test("Monthly repeats skip missing dates without drifting to the next month's day", () => {
  const state = create("monthly", { date: "2026-10-31" });
  assert.equal(occurrence(state, "2026-11-30"), undefined);
  assert.ok(occurrence(state, "2026-12-31"));
  assert.equal(occurrence(state, "2027-02-28"), undefined);
  assert.ok(occurrence(state, "2027-03-31"));
});

test("Yearly leap-day repeats remain on 29 February, including Gregorian century rules", () => {
  const state = create("yearly", { date: "2028-02-29" });
  assert.equal(occurrence(state, "2029-02-28"), undefined);
  assert.ok(occurrence(state, "2032-02-29"));
  assert.equal(occurrence(state, "2100-02-28"), undefined);
  assert.ok(occurrence(state, "2400-02-29"));
  assert.equal(state.tasks.length, 1);
});

test("All-day repeats stay in the all-day row, coexist with appointments and persist", () => {
  let state = create("weekly", { allDay: true });
  state = c.createEvent(state, { ...event, date: "2026-10-24" }, today);
  assert.equal(c.allDaySlotsFor(state, "2026-10-24").length, 1);
  assert.equal(c.slotsFor(state, "2026-10-24").length, 1);
  assert.equal(c.plannedMinutesFor(state, "2026-10-24"), 30);
  assert.equal(c.allDaySlotsFor(reload(state), "2050-10-22").length, 1);
});

test("Repeat creation detects conflicts with saved future appointments and other series atomically", () => {
  const state = c.createEvent(
    c.blank(today),
    { ...event, date: "2030-10-17" },
    today,
  );
  const before = structuredClone(state);
  assert.throws(() => create("yearly", {}, state), /overlap/);
  assert.deepEqual(state, before);
  const weekly = create("weekly");
  assert.throws(
    () => create("daily", { date: "2026-10-18" }, weekly),
    /overlap/,
  );
  const otherWeekday = create("weekly", { date: "2026-10-18" }, weekly);
  assert.equal(c.slotsFor(otherWeekday, "2026-10-24").length, 1);
  assert.equal(c.slotsFor(otherWeekday, "2026-10-25").length, 1);
  assert.deepEqual(reload(otherWeekday).eventSeries, otherWeekday.eventSeries);
});

test("Fortnightly series on alternate weeks coexist and monthly/weekly intersections are rejected", () => {
  const fortnightly = create("fortnightly");
  const alternating = create(
    "fortnightly",
    { date: "2026-10-24" },
    fortnightly,
  );
  assert.equal(c.slotsFor(alternating, "2026-10-31").length, 1);
  assert.equal(c.slotsFor(alternating, "2026-11-07").length, 1);
  assert.throws(
    () => create("monthly", { date: "2026-11-17" }, create("weekly")),
    /overlap/,
  );
});

test("AI planning respects future repeating reservations while recovery preserves their cadence", () => {
  let state = create("daily", { start: 1080, minutes: 60 });
  state = c.approvePlan(
    state,
    {
      goalName: "Read",
      kind: "project",
      perWeek: null,
      clarification: null,
      tasks: [{ title: "Read a chapter", minutes: 20, dependsOn: [] }],
    },
    { today: "2026-10-18" },
  );
  assert.equal(state.tasks.find((task) => task.goalId !== null).start, 1140);
  const series = structuredClone(state.eventSeries);
  state = c.catchUp(state, "2026-10-20", 1080, true);
  assert.deepEqual(state.eventSeries, series);
  assert.equal(c.slotsFor(state, "2026-10-21")[0].start, 1080);
});

test("Editing one occurrence preserves the rest of the series and remains reversible", () => {
  const original = create("weekly");
  const next = occurrence(original, "2026-10-24");
  const edited = c.editTask(
    original,
    next.id,
    {
      ...event,
      date: "2026-10-25",
      start: 600,
      title: "Longer practice",
      repeat: "weekly",
    },
    today,
  );
  assert.equal(occurrence(edited, "2026-10-24"), undefined);
  assert.equal(occurrence(edited, "2026-10-25").title, "Longer practice");
  assert.equal(occurrence(edited, "2026-10-31").title, "Practice");
  assert.deepEqual(reload(edited).tasks, edited.tasks);
  assert.deepEqual(c.undoChange(edited).tasks, original.tasks);
});

test("Changing Repeat replaces this and following occurrences without changing earlier ones", () => {
  const original = create("weekly");
  const next = occurrence(original, "2026-10-24");
  const changed = c.editTask(
    original,
    next.id,
    { ...event, date: next.date, repeat: "fortnightly" },
    today,
  );
  assert.ok(occurrence(changed, today));
  assert.equal(occurrence(changed, "2026-10-31"), undefined);
  assert.ok(occurrence(changed, "2026-11-07"));
  assert.deepEqual(reload(changed).eventSeries, changed.eventSeries);
  const stopped = c.editTask(
    changed,
    next.id,
    { ...event, date: next.date, repeat: "none" },
    today,
  );
  assert.ok(occurrence(stopped, today));
  assert.ok(occurrence(stopped, "2026-10-24"));
  assert.equal(occurrence(stopped, "2026-11-07"), undefined);
  assert.deepEqual(reload(stopped).tasks, stopped.tasks);
});

test("Moving the series anchor can reuse the date of an old future occurrence", () => {
  const state = create("weekly");
  const first = state.tasks[0];
  const moved = c.editTask(
    state,
    first.id,
    { ...event, date: "2026-10-24", repeat: "monthly" },
    today,
  );
  assert.equal(occurrence(moved, today), undefined);
  assert.ok(occurrence(moved, "2026-10-24"));
  assert.ok(occurrence(moved, "2026-11-24"));
  assert.deepEqual(reload(moved).tasks, moved.tasks);
});

test("Completing and removing occurrences keeps future repeats and survives reload without regeneration", () => {
  const state = create("daily");
  const tomorrow = occurrence(state, "2026-10-18");
  const completed = c.completeTask(state, tomorrow.id, "2026-10-18");
  assert.equal(occurrence(completed, "2026-10-18").status, "done");
  assert.ok(occurrence(completed, "2026-10-19"));
  const removed = c.removeEvent(completed, tomorrow.id);
  assert.equal(occurrence(reload(removed), "2026-10-18"), undefined);
  assert.ok(occurrence(reload(removed), "2026-10-19"));
  assert.equal(occurrence(c.undoChange(removed), "2026-10-18").status, "done");
  const removedFirst = c.removeEvent(state, state.tasks[0].id);
  assert.equal(occurrence(reload(removedFirst), today), undefined);
  assert.ok(occurrence(reload(removedFirst), "2026-10-18"));
});

test("Repeat backups validate intervals, identities, exceptions and occurrence references", () => {
  const state = create("weekly");
  for (const patch of [
    { repeat: "hourly" },
    { anchor: "2026-02-30" },
    { until: "2026-10-16" },
    { excludedDates: ["2026-10-18"] },
    { start: -1 },
    { id: "invalid/id" },
  ]) {
    const corrupt = structuredClone(state);
    Object.assign(corrupt.eventSeries[0], patch);
    assert.throws(() => reload(corrupt));
  }
  const orphan = structuredClone(state);
  orphan.tasks[0].eventSeriesId = "missing";
  assert.throws(() => reload(orphan));
  assert.throws(() => create("invalid"));
  const old = c.seed(today);
  assert.deepEqual(reload(old).tasks, old.tasks);
});
