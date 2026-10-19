import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as c from "../dist/runtime/src/calendar.js";
import { openCalendarStore } from "../dist/runtime/server/calendar-store.js";
import {
  prepareTodoResult,
  previewTodoResult,
  applyTodoProposal,
  validateTodoRequest,
} from "../dist/runtime/server/todo-assistant.js";
import { validateIntent } from "../dist/runtime/server/calendar-assistant.js";

const today = c.localDate("Australia/Brisbane");
const request = (action, patch = {}) => ({
  action,
  terms: [],
  status: "pending",
  items: [],
  title: null,
  schedule: null,
  ...patch,
});
async function fixture(t, state = c.blank(today)) {
  const root = await mkdtemp(join(tmpdir(), "appa-todo-chat-"));
  const store = openCalendarStore(root);
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const saved = store.bootstrap("main", state);
  const prepare = (value) => {
    const latest = store.load("main");
    return prepareTodoResult(
      store,
      "main",
      latest.state,
      value,
      latest.storageVersion,
    );
  };
  return { store, saved, prepare };
}

test("Adding to dos from chat requires application, persists one atomic batch and supports Undo", async (t) => {
  const { store, prepare, saved } = await fixture(t);
  const result = prepare(
    request("add", {
      items: [
        { title: "Buy milk", minutes: 30 },
        { title: "Read", minutes: 15 },
      ],
    }),
  );
  assert.equal(result.kind, "todo_proposal");
  assert.equal(result.todoChanges.length, 2);
  assert.equal(store.load("main").storageVersion, saved.storageVersion);
  assert.equal(store.load("main").state.todos, undefined);
  const applied = applyTodoProposal(store, "main", result.proposalId);
  assert.deepEqual(
    applied.state.todos.map((todo) => todo.title),
    ["Buy milk", "Read"],
  );
  assert.equal(applied.state.revision, saved.state.revision + 1);
  assert.equal(applied.state.tasks.length, 0);
  assert.equal(c.undoChange(applied.state).todos, undefined);
  assert.deepEqual(store.load("main").state.todos, applied.state.todos);
  assert.throws(
    () => applyTodoProposal(store, "main", result.proposalId),
    /expired/,
  );
});

test("List questions report actual titles and completion states without modifying anything", async (t) => {
  let state = c.addTodo(c.blank(today), "Private groceries");
  state = c.addTodo(state, "Read a book");
  state = c.toggleTodo(state, state.todos[1].id);
  const { store, saved, prepare } = await fixture(t, state);
  const result = prepare(request("list", { status: "all" }));
  assert.equal(result.kind, "todo_answer");
  assert.match(result.message, /Private groceries — pending/);
  assert.match(result.message, /Read a book — completed/);
  assert.equal(result.todos.length, 2);
  assert.equal(store.load("main").storageVersion, saved.storageVersion);
  assert.equal(
    prepare(request("list", { terms: ["missing"] })).todos.length,
    0,
  );
});

test("Ambiguous titles require selection; only selected pending items are completed and can reopen", async (t) => {
  let state = c.addTodo(c.blank(today), "Read a book");
  state = c.addTodo(state, "Read an article");
  const { store, prepare } = await fixture(t, state);
  const selected = prepare(request("complete", { terms: ["read"] }));
  assert.equal(selected.kind, "todo_selection");
  assert.equal(selected.todos.length, 2);
  assert.throws(
    () =>
      previewTodoResult(store, "main", selected.selectionId, ["invented-id"]),
    /listed/,
  );
  assert.throws(
    () => previewTodoResult(store, "main", selected.selectionId, []),
    /Select/,
  );
  const id = selected.todos[0].id;
  const preview = previewTodoResult(store, "main", selected.selectionId, [id]);
  assert.equal(preview.todoChanges[0].after.done, true);
  assert.equal(store.load("main").state.todos[0].done, false);
  const applied = applyTodoProposal(store, "main", preview.proposalId);
  assert.deepEqual(
    applied.state.todos.map((todo) => todo.done),
    [true, false],
  );
  assert.deepEqual(c.undoChange(applied.state).todos, state.todos);
  const reopen = prepare(
    request("reopen", { terms: ["read"], status: "completed" }),
  );
  assert.equal(reopen.todos.length, 1);
  const reopening = previewTodoResult(store, "main", reopen.selectionId, [id]);
  assert.equal(
    applyTodoProposal(store, "main", reopening.proposalId).state.todos[0].done,
    false,
  );
});

test("Rename is limited to one selected item; delete previews show exactly what is removed", async (t) => {
  let state = c.addTodo(c.blank(today), "Buy milk");
  state = c.addTodo(state, "Buy bread");
  const { store, prepare } = await fixture(t, state);
  const selection = prepare(
    request("rename", { terms: ["buy"], title: "Buy oat milk" }),
  );
  assert.throws(
    () =>
      previewTodoResult(
        store,
        "main",
        selection.selectionId,
        selection.todos.map((todo) => todo.id),
      ),
    /Choose one/,
  );
  const id = selection.todos[0].id;
  const preview = previewTodoResult(store, "main", selection.selectionId, [id]);
  assert.equal(preview.todoChanges[0].before.title, "Buy milk");
  assert.equal(preview.todoChanges[0].after.title, "Buy oat milk");
  applyTodoProposal(store, "main", preview.proposalId);
  const deletion = prepare(request("delete", { terms: ["oat milk"] }));
  const deleting = previewTodoResult(store, "main", deletion.selectionId, [id]);
  assert.equal(deleting.todoChanges[0].after, null);
  const applied = applyTodoProposal(store, "main", deleting.proposalId);
  assert.deepEqual(
    applied.state.todos.map((todo) => todo.title),
    ["Buy bread"],
  );
  assert.equal(c.undoChange(applied.state).todos[0].title, "Buy oat milk");
});

test("Scheduling via chat preserves identity and duration and moves the item out of the list", async (t) => {
  const state = c.addTodo(c.blank(today), "Make the call", 45);
  const { store, prepare } = await fixture(t, state);
  const selection = prepare(
    request("schedule", {
      terms: ["call"],
      schedule: {
        date: c.addDays(today, 1),
        start: 600,
        minutes: null,
        allDay: false,
      },
    }),
  );
  const preview = previewTodoResult(store, "main", selection.selectionId, [
    state.todos[0].id,
  ]);
  assert.equal(preview.todoChanges[0].event.minutes, 45);
  assert.equal(store.load("main").state.tasks.length, 0);
  const applied = applyTodoProposal(store, "main", preview.proposalId);
  assert.equal(applied.state.tasks[0].id, state.todos[0].id);
  assert.equal(applied.state.tasks[0].start, 600);
  assert.equal(applied.state.tasks[0].minutes, 45);
  assert.equal(applied.state.todos.length, 0);
  assert.deepEqual(c.undoChange(applied.state).todos, state.todos);
  assert.equal(c.undoChange(applied.state).tasks.length, 0);
});

test("Hidden reservations and passed dates reject scheduling without removing the to do", async (t) => {
  const tomorrow = c.addDays(today, 1);
  let state = c.addTodo(c.blank(today), "Make the call");
  state = c.createEvent(state, {
    title: "Hidden appointment",
    date: tomorrow,
    start: 600,
    minutes: 60,
  });
  state = c.togglePersonalCalendar(state);
  const { store, prepare, saved } = await fixture(t, state);
  const selected = prepare(
    request("schedule", {
      schedule: { date: tomorrow, start: 600, minutes: null, allDay: false },
    }),
  );
  assert.throws(
    () =>
      previewTodoResult(store, "main", selected.selectionId, [
        state.todos[0].id,
      ]),
    /overlaps/,
  );
  const past = prepare(
    request("schedule", {
      schedule: {
        date: c.addDays(today, -1),
        start: 600,
        minutes: null,
        allDay: false,
      },
    }),
  );
  assert.throws(
    () =>
      previewTodoResult(store, "main", past.selectionId, [state.todos[0].id]),
    /passed/,
  );
  assert.equal(store.load("main").storageVersion, saved.storageVersion);
  assert.deepEqual(store.load("main").state.todos, state.todos);
});

test("Stale and cross-workspace proposals cannot change the current to do list", async (t) => {
  const state = c.addTodo(c.blank(today), "Keep this");
  const { store, prepare, saved } = await fixture(t, state);
  const selection = prepare(request("delete"));
  const preview = previewTodoResult(store, "main", selection.selectionId, [
    state.todos[0].id,
  ]);
  assert.throws(
    () => applyTodoProposal(store, "reference", preview.proposalId),
    /expired/,
  );
  const current = store.save(
    "main",
    c.addTodo(state, "New work"),
    saved.storageVersion,
  );
  assert.throws(
    () => applyTodoProposal(store, "main", preview.proposalId),
    /changed since/,
  );
  assert.throws(
    () =>
      previewTodoResult(store, "main", selection.selectionId, [
        state.todos[0].id,
      ]),
    /changed since/,
  );
  assert.deepEqual(store.load("main").state.todos, current.state.todos);
});

test("Malformed model responses are rejected and failed batches never partially mutate state", () => {
  const state = c.addTodo(c.blank(today), "Keep this");
  for (const invalid of [
    null,
    request("unknown"),
    request("add"),
    request("rename", { title: "" }),
    request("list", { status: "made-up" }),
    request("schedule", {
      schedule: { date: "2026-02-31", start: 600, minutes: 30, allDay: false },
    }),
  ])
    assert.throws(() => validateTodoRequest(invalid));
  assert.throws(
    () => validateIntent({ kind: "todo", message: "Done!", todo: null }, state),
    /invalid to do/,
  );
  assert.throws(
    () =>
      c.applyTodoMutations(state, [
        { action: "add", title: "Never saved", minutes: 30 },
        {
          action: "schedule",
          id: state.todos[0].id,
          event: {
            title: "Keep this",
            date: "invalid",
            start: 600,
            minutes: 30,
          },
        },
      ]),
    /date/,
  );
  assert.equal(state.todos.length, 1);
  assert.equal(state.tasks.length, 0);
});
test("Unexpected model fields cannot supply IDs or turn an add request into another mutation", async (t) => {
  const state = c.addTodo(c.blank(today), "Keep this");
  const { prepare, store } = await fixture(t, state);
  const result = prepare(
    request("add", {
      items: [
        {
          title: "A new task",
          minutes: 30,
          action: "delete",
          id: state.todos[0].id,
        },
      ],
    }),
  );
  assert.equal(result.todoChanges[0].before, null);
  const applied = applyTodoProposal(store, "main", result.proposalId);
  assert.deepEqual(
    applied.state.todos.map((todo) => todo.title),
    ["Keep this", "A new task"],
  );
});
