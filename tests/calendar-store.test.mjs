import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openCalendarStore } from "../dist/runtime/server/calendar-store.js";
import * as c from "../dist/runtime/src/calendar.js";
import {
  retrieveCalendar,
  answerCalendar,
  proposeCalendarMoves,
  validateIntent,
} from "../dist/runtime/server/calendar-assistant.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "appa-sqlite-test-"));
  let store = openCalendarStore(root);
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    get store() {
      return store;
    },
    reopen() {
      store.close();
      store = openCalendarStore(root);
    },
  };
}
const today = c.localDate("Australia/Brisbane");
const query = (patch = {}) => ({
  terms: [],
  from: c.addDays(today, -30),
  to: c.addDays(today, 30),
  start: 0,
  end: 1440,
  operation: "agenda",
  completedOnly: false,
  ...patch,
});

test("SQLite migration preserves identities and the exact legacy backup, and never overwrites an existing workspace", async (t) => {
  const f = await fixture(t);
  let state = c.createEvent(
    c.seed(today),
    {
      title: "Haircut",
      date: c.addDays(today, -14),
      start: 540,
      minutes: 30,
      repeat: "weekly",
    },
    today,
  );
  state = c.editPersonalCalendar(state, "Family", "clay");
  const raw = JSON.stringify(state, null, 2);
  const first = f.store.bootstrap("main", state, false, raw);
  assert.deepEqual(first.state.tasks, state.tasks);
  assert.deepEqual(first.state.eventSeries, state.eventSeries);
  assert.deepEqual(first.state.personalCalendar, state.personalCalendar);
  assert.equal(first.storageVersion, 1);
  assert.equal(
    (await readFile(path.join(f.root, "calendar.sqlite")))
      .subarray(0, 15)
      .toString(),
    "SQLite format 3",
  );
  const db = new DatabaseSync(path.join(f.root, "calendar.sqlite"));
  try {
    assert.equal(
      db.prepare("SELECT source FROM migration_backup WHERE scope='main'").get()
        .source,
      raw,
    );
  } finally {
    db.close();
  }
  f.reopen();
  const second = f.store.bootstrap("main", c.blank(today));
  assert.deepEqual(second.state.tasks, state.tasks);
  assert.equal(second.storageVersion, 1);
  assert.equal(f.store.bootstrap("main", null, true).needsRecovery, undefined);
  assert.equal(f.store.bootstrap("reference", null, true).needsRecovery, true);
  assert.equal(f.store.load("reference").state, null);
});

test("SQLite rejects stale writes and invalid imports without changing data or indexes", async (t) => {
  const f = await fixture(t);
  const initial = f.store.bootstrap("main", c.seed(today));
  const state = c.createEvent(
    initial.state,
    { title: "Hair cut", date: c.addDays(today, 1), start: 540, minutes: 30 },
    today,
  );
  f.store.save("main", state, initial.storageVersion);
  assert.throws(
    () => f.store.save("main", c.blank(today), initial.storageVersion),
    /another window/,
  );
  const malformed = structuredClone(state);
  malformed.tasks[0].date = "not-a-date";
  assert.throws(() => f.store.save("main", malformed, 2));
  assert.deepEqual(f.store.load("main").state.tasks, state.tasks);
  assert.equal(
    f.store.matchingTasks("main", ["HAIR CUT"], today, c.addDays(today, 2))
      .length,
    1,
  );
  assert.equal(
    f.store.matchingTasks("main", ["' OR 1=1 --"], today, c.addDays(today, 2))
      .length,
    0,
  );
});

test("Calendar history searches hidden groups, expands repeats without duplicates and excludes future appointments from last", async (t) => {
  const f = await fixture(t);
  let state = c.createEvent(
    c.blank(today),
    {
      title: "Haircut",
      date: c.addDays(today, -15),
      start: 540,
      minutes: 30,
      repeat: "weekly",
    },
    today,
  );
  state = c.togglePersonalCalendar(state);
  f.store.bootstrap("main", state);
  const q = query({ terms: ["haircut"], operation: "last" });
  const tasks = retrieveCalendar(f.store, "main", state, q);
  assert.equal(tasks.length, 3);
  const result = answerCalendar(state, q, tasks);
  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].date, c.addDays(today, -1));
  assert.match(result.message, /not marked completed/);
  assert.equal(c.calendarDisplayState(state).tasks.length, 0);
  const none = query({ terms: ["Dentist"] });
  assert.match(
    answerCalendar(state, none, retrieveCalendar(f.store, "main", state, none))
      .message,
    /No matching/,
  );
  const group = query({ terms: ["Personal tasks"] });
  assert.equal(retrieveCalendar(f.store, "main", state, group).length, 7);
});

test("History distinguishes completed entries and availability includes hidden reservations", async (t) => {
  const f = await fixture(t);
  const date = c.addDays(today, -2);
  let state = c.createEvent(
    c.blank(today),
    { title: "Haircut", date, start: 540, minutes: 30 },
    today,
  );
  state = c.completeTask(state, state.tasks[0].id, date);
  state = c.createEvent(
    state,
    { title: "Meeting", date: c.addDays(today, 1), start: 600, minutes: 60 },
    today,
  );
  state = c.togglePersonalCalendar(state);
  state.settings.useAvailableTime = false;
  f.store.bootstrap("main", state);
  const completed = query({
    terms: ["Haircut"],
    operation: "last",
    completedOnly: true,
  });
  const answer = answerCalendar(
    state,
    completed,
    retrieveCalendar(f.store, "main", state, completed),
  );
  assert.equal(answer.references[0].status, "done");
  assert.match(answer.message, /marked completed/);
  assert.doesNotMatch(answer.message, /not marked completed/);
  const free = answerCalendar(
    state,
    query({
      from: c.addDays(today, 1),
      to: c.addDays(today, 1),
      start: 540,
      end: 720,
      operation: "availability",
    }),
    [],
  );
  assert.match(free.message, /09:00–10:00/);
  assert.match(free.message, /11:00–12:00/);
  assert.doesNotMatch(free.message, /09:00–12:00/);
});

test("Clarification outcomes cannot smuggle unvalidated plans or event proposals into review", () => {
  const state = c.blank(today);
  const result = validateIntent(
    {
      kind: "clarify",
      message: "Which day?",
      plan: { invented: true },
      event: { invented: true },
    },
    state,
  );
  assert.equal(result.plan, null);
  assert.equal(result.event, null);
  const followup = validateIntent(
    {
      kind: "goal",
      message: "Here is a plan",
      plan: {
        goalName: "Run",
        kind: "project",
        perWeek: null,
        clarification: "How far do you run now?",
        tasks: [],
      },
    },
    state,
  );
  assert.equal(followup.kind, "clarify");
  assert.equal(followup.message, "How far do you run now?");
  assert.equal(followup.plan, null);
});

test("Multiple moves are reviewed together, preserve recurrence identity, and undo restores all entries", async (t) => {
  const f = await fixture(t);
  const date = c.addDays(today, 2);
  let state = c.createEvent(
    c.blank(today),
    { title: "Walk", date, start: 540, minutes: 30, repeat: "weekly" },
    today,
  );
  state = c.createEvent(
    state,
    { title: "Haircut", date, start: 600, minutes: 30 },
    today,
  );
  f.store.bootstrap("main", state);
  const q = query({ from: date, to: date, start: 540, end: 720 });
  const refs = retrieveCalendar(f.store, "main", state, q).map((task) => ({
    ...task,
    goalName: null,
    recurring: !!task.eventSeriesId,
  }));
  const moves = proposeCalendarMoves(state, refs, q, {
    from: date,
    to: c.addDays(date, 3),
    start: 720,
    end: 1020,
  });
  assert.equal(moves.length, 2);
  const next = c.applyCalendarMoves(state, moves, today);
  assert.ok(next.tasks.every((task) => task.start >= 720));
  assert.deepEqual(c.undoChange(next).tasks, state.tasks);
  assert.equal(next.tasks[0].eventSeriesId, state.tasks[0].eventSeriesId);
  assert.deepEqual(next.eventSeries, state.eventSeries);
  const corrupt = [...moves];
  corrupt[1] = { ...corrupt[1], toStart: corrupt[0].toStart };
  assert.throws(() => c.applyCalendarMoves(state, corrupt, today), /overlap/);
  assert.equal(state.tasks[0].start, 540);
  assert.throws(
    () =>
      proposeCalendarMoves(state, refs, q, {
        from: date,
        to: date,
        start: 540,
        end: 720,
      }),
    /No free time/,
  );
});

test("Proposal versions and scope prevent stale, cross-workspace and replayed changes", async (t) => {
  const f = await fixture(t);
  const initial = f.store.bootstrap("main", c.blank(today));
  const id = f.store.putProposal("main", "moves", [], initial.storageVersion);
  assert.throws(() => f.store.proposal("reference", id, "moves"), /expired/);
  f.store.save("main", initial.state, initial.storageVersion);
  assert.throws(
    () => f.store.proposal("main", id, "moves"),
    /calendar changed/,
  );
  const next = f.store.putProposal("main", "moves", [], 2);
  f.store.removeProposal(next);
  assert.throws(() => f.store.proposal("main", next, "moves"), /expired/);
});

test("Atomic moves respect prerequisites, availability, completion and occurrence overrides", async (t) => {
  const date = c.addDays(today, 3);
  let state = c.seed(date);
  const before = structuredClone(state);
  const task = state.tasks[0];
  const move = {
    id: task.id,
    title: task.title,
    fromDate: task.date,
    fromStart: task.start,
    toDate: c.addDays(date, 4),
    toStart: task.start,
    minutes: task.minutes,
    allDay: false,
  };
  assert.throws(
    () => c.applyCalendarMoves(state, [move], today),
    /prerequisites/,
  );
  assert.throws(
    () =>
      c.applyCalendarMoves(
        state,
        [{ ...move, toDate: date, toStart: 0 }],
        today,
      ),
    /available hours/,
  );
  assert.deepEqual(state, before);
  state = c.createEvent(
    c.blank(today),
    { title: "Haircut", date, start: 540, minutes: 30, repeat: "weekly" },
    today,
  );
  const occurrenceDate = c.addDays(date, 7);
  const occurrence = c.slotsFor(state, occurrenceDate)[0].tasks[0];
  const next = c.applyCalendarMoves(
    state,
    [
      {
        id: occurrence.id,
        title: occurrence.title,
        fromDate: occurrenceDate,
        fromStart: 540,
        toDate: c.addDays(occurrenceDate, 1),
        toStart: 600,
        minutes: 30,
        allDay: false,
      },
    ],
    today,
  );
  assert.equal(c.slotsFor(next, occurrenceDate).length, 0);
  assert.equal(
    c.slotsFor(next, c.addDays(occurrenceDate, 1))[0].tasks[0]
      .eventOccurrenceDate,
    occurrenceDate,
  );
  assert.equal(c.slotsFor(next, c.addDays(occurrenceDate, 7)).length, 1);
});
