import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cal from "../dist/runtime/src/calendar.js";
import { openCalendarStore } from "../dist/runtime/server/calendar-store.js";
import { calendarReplacementIsHighImpact } from "../dist/runtime/src/actionPatterns.js";

const today = "2026-10-19";

test("To dos need only a title, reserve no calendar time and remain untouched by catch-up", () => {
  const original = cal.blank(today);
  const state = cal.addTodo(original, "  Book a dentist appointment  ");
  assert.deepEqual(state.todos[0], {
    id: state.todos[0].id,
    title: "Book a dentist appointment",
    minutes: 30,
    done: false,
  });
  assert.equal("date" in state.todos[0], false);
  assert.equal("start" in state.todos[0], false);
  assert.equal(cal.plannedMinutesFor(state, today), 0);
  assert.deepEqual(cal.catchUp(state, "2026-10-21", 540).todos, state.todos);
  assert.deepEqual(cal.undoChange(state).tasks, original.tasks);
  assert.equal(cal.undoChange(state).todos, undefined);
  assert.throws(() => cal.addTodo(original, "  "), /task name/);
  assert.throws(() => cal.addTodo(original, "Task", 0), /duration/);
});

test("Completion can be toggled without assigning a time and Undo restores its status", () => {
  const state = cal.addTodo(cal.blank(today), "Read the article");
  const done = cal.toggleTodo(state, state.todos[0].id);
  assert.equal(done.todos[0].done, true);
  assert.equal(done.tasks.length, 0);
  assert.deepEqual(cal.undoChange(done).todos, state.todos);
  assert.deepEqual(cal.toggleTodo(done, done.todos[0].id).todos, state.todos);
  assert.throws(() => cal.toggleTodo(state, "missing"), /no longer available/);
});

test("A calendar drop transfers the same item into a timed event with one atomic Undo", () => {
  let state = cal.addTodo(cal.blank(today), "Make the call");
  state = cal.addTodo(state, "Buy groceries");
  const todo = state.todos[0];
  const next = cal.scheduleTodo(state, todo.id, today, 600, today);
  const event = next.tasks[0];
  assert.equal(event.id, todo.id);
  assert.equal(event.title, todo.title);
  assert.equal(event.start, 600);
  assert.equal(event.minutes, 30);
  assert.equal(event.date, today);
  assert.equal(event.goalId, null);
  assert.equal(next.revision, state.revision + 1);
  assert.deepEqual(next.todos, [state.todos[1]]);
  assert.deepEqual(cal.undoChange(next).todos, state.todos);
  assert.deepEqual(cal.undoChange(next).tasks, state.tasks);
  assert.throws(
    () => cal.scheduleTodo(next, todo.id, today, 660, today),
    /unfinished/,
  );
});

test("Conflicting, completed or invalid-date drops preserve the original list and calendar", () => {
  let state = cal.addTodo(cal.blank(today), "A task");
  state = cal.createEvent(
    state,
    { title: "Existing", date: today, start: 600, minutes: 60 },
    today,
  );
  const todo = state.todos[0];
  const before = JSON.stringify(state);
  assert.throws(
    () => cal.scheduleTodo(state, todo.id, today, 630, today),
    /overlaps/,
  );
  assert.throws(
    () => cal.scheduleTodo(state, todo.id, "invalid", 660, today),
    /date/,
  );
  assert.equal(JSON.stringify(state), before);
  const done = cal.toggleTodo(state, todo.id);
  assert.throws(
    () => cal.scheduleTodo(done, todo.id, today, 660, today),
    /unfinished/,
  );
});

test("Date-only drops become all-day events; the schedule editor can choose a different duration", () => {
  const state = cal.addTodo(cal.blank(today), "Buy groceries");
  const todo = state.todos[0];
  const allDay = cal.scheduleTodo(state, todo.id, today, 0, today, true);
  assert.equal(cal.allDaySlotsFor(allDay, today)[0].tasks[0].id, todo.id);
  assert.equal(cal.slotsFor(allDay, today).length, 0);
  assert.equal(allDay.tasks[0].minutes, 1440);
  const timed = cal.scheduleTodo(state, todo.id, today, 600, today, false, {
    title: "Pick up groceries",
    date: today,
    start: 600,
    minutes: 45,
  });
  assert.equal(timed.tasks[0].minutes, 45);
  assert.equal(timed.tasks[0].title, "Pick up groceries");
  assert.deepEqual(
    cal.validateBackup(JSON.parse(JSON.stringify(timed)), today).tasks,
    timed.tasks,
  );
});

test("Scheduling reveals a hidden personal calendar and still validates its reservations", () => {
  let state = cal.addTodo(cal.blank(today), "A task");
  state = cal.createEvent(
    state,
    { title: "Hidden event", date: today, start: 600, minutes: 60 },
    today,
  );
  state.personalCalendar = {
    ...cal.personalCalendarFor(state),
    visible: false,
  };
  const todo = state.todos[0];
  assert.throws(
    () => cal.scheduleTodo(state, todo.id, today, 615, today),
    /overlaps/,
  );
  const next = cal.scheduleTodo(state, todo.id, today, 720, today);
  assert.equal(next.personalCalendar.visible, true);
  assert.equal(cal.undoChange(next).personalCalendar.visible, false);
});

test("To dos survive backup/import and malformed or duplicate records are rejected", () => {
  let state = cal.addTodo(cal.blank(today), "Read");
  state = cal.toggleTodo(state, state.todos[0].id);
  assert.deepEqual(
    cal.validateBackup(JSON.parse(JSON.stringify(state)), today).todos,
    state.todos,
  );
  assert.deepEqual(
    cal.importBackup(cal.blank(today), state, today).todos,
    state.todos,
  );
  assert.equal(cal.validateBackup(cal.blank(today), today).todos, undefined);
  for (const patch of [
    null,
    {},
    [{ ...state.todos[0], done: "yes" }],
    [{ ...state.todos[0], minutes: -1 }],
    [state.todos[0], state.todos[0]],
  ])
    assert.throws(
      () => cal.validateBackup({ ...state, todos: patch }, today),
      /to do list/,
    );
  const scheduled = cal.scheduleTodo(
    cal.toggleTodo(state, state.todos[0].id),
    state.todos[0].id,
    today,
    600,
    today,
  );
  assert.throws(
    () => cal.validateBackup({ ...scheduled, todos: state.todos }, today),
    /to do list/,
  );
});

test("Clearing protects personal to dos, removes them with the calendar and supports Undo", () => {
  const state = cal.addTodo(cal.blank(today), "Keep this");
  assert.equal(calendarReplacementIsHighImpact(state), true);
  const cleared = cal.resetWorkspace(state, today);
  assert.equal(cleared.todos?.length ?? 0, 0);
  assert.deepEqual(cal.undoChange(cleared).todos, state.todos);
});

test("SQLite saves and reopens unscheduled items and completion status", () => {
  const directory = mkdtempSync(join(tmpdir(), "appa-todos-"));
  let store;
  try {
    store = openCalendarStore(directory);
    const state = cal.addTodo(cal.blank(today), "A saved task");
    const saved = store.save(
      "main",
      cal.toggleTodo(state, state.todos[0].id),
      0,
    );
    assert.equal(saved.state.todos[0].done, true);
    store.close();
    store = openCalendarStore(directory);
    assert.deepEqual(store.load("main").state.todos, saved.state.todos);
  } finally {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
