import { test } from "node:test";
import assert from "node:assert/strict";
import * as cal from "../dist/runtime/src/calendar.js";
import {
  calendarSnapshot,
  createCalendarPersistence,
} from "../dist/runtime/src/calendarPersistence.js";

const today = cal.localDate("Australia/Brisbane");
function fixture() {
  let stored = { state: cal.blank(today), storageVersion: 1 };
  const writes = [];
  let mode = "healthy";
  let release;
  const persistence = createCalendarPersistence(
    {
      load: async () => structuredClone(stored),
      async save(state, expectedVersion) {
        writes.push(structuredClone(state));
        if (mode === "pause")
          await new Promise((resolve) => {
            release = resolve;
          });
        if (mode === "fail") throw new Error("Temporary service failure");
        assert.equal(expectedVersion, stored.storageVersion);
        stored = {
          state: cal.validateBackup(state),
          storageVersion: expectedVersion + 1,
        };
        if (mode === "lost-response")
          throw new Error("Response lost after commit");
        return structuredClone(stored);
      },
    },
    1,
  );
  persistence.accept(stored);
  return {
    persistence,
    writes,
    get stored() {
      return stored;
    },
    mode(value) {
      mode = value;
    },
    release() {
      release();
    },
    conflict() {
      stored = {
        state: cal.addTodo(stored.state, "Other window"),
        storageVersion: stored.storageVersion + 1,
      };
    },
  };
}
test("A temporary save failure can retry the latest edits without reloading", async () => {
  const f = fixture();
  f.mode("fail");
  const first = cal.addTodo(f.stored.state, "First item");
  await assert.rejects(f.persistence.flush(first), /Temporary/);
  const latest = cal.addTodo(first, "Latest item");
  await assert.rejects(f.persistence.save(latest), /Temporary/);
  assert.equal(f.persistence.hasUnsavedChanges(), true);
  f.mode("healthy");
  await f.persistence.retry(latest);
  assert.deepEqual(
    f.stored.state.todos.map((item) => item.title),
    ["First item", "Latest item"],
  );
  assert.equal(f.persistence.hasUnsavedChanges(), false);
});
test("Retry reconciles a committed save whose response was lost", async () => {
  const f = fixture();
  const first = cal.addTodo(f.stored.state, "Committed once");
  f.mode("lost-response");
  await assert.rejects(f.persistence.flush(first), /Response lost/);
  f.mode("healthy");
  const latest = cal.addTodo(first, "Edited while offline");
  await f.persistence.retry(latest);
  assert.equal(f.stored.storageVersion, 3);
  assert.equal(f.stored.state.todos.length, 2);
});
test("Retry cannot overwrite a genuinely different calendar revision", async () => {
  const f = fixture();
  f.mode("fail");
  const local = cal.addTodo(f.stored.state, "Unsaved local item");
  await assert.rejects(f.persistence.flush(local));
  f.conflict();
  f.mode("healthy");
  await assert.rejects(f.persistence.retry(local), /another window/);
  assert.equal(f.writes.length, 1);
  assert.equal(f.stored.state.todos[0].title, "Other window");
  assert.equal(f.persistence.hasUnsavedChanges(), true);
});
test("Rapid draft edits coalesce and flush persists the final draft immediately", async () => {
  const f = fixture();
  const waiting = [];
  for (let index = 0; index < 30; index++)
    waiting.push(
      f.persistence.save({
        ...f.stored.state,
        draft: { intention: `Draft ${index}`, plan: null },
      }),
    );
  const final = {
    ...f.stored.state,
    draft: { intention: "Final draft", plan: null },
  };
  await f.persistence.flush(final);
  await Promise.all(waiting);
  assert.equal(f.writes.length, 1);
  assert.equal(f.stored.state.draft.intention, "Final draft");
});
test("Edits during an in-flight save keep only the newest pending snapshot", async () => {
  const f = fixture();
  f.mode("pause");
  const first = cal.addTodo(f.stored.state, "First");
  const saved = f.persistence.flush(first);
  await new Promise((resolve) => setImmediate(resolve));
  const second = cal.addTodo(first, "Second");
  const third = cal.addTodo(second, "Third");
  const pending = [f.persistence.save(second), f.persistence.save(third)];
  f.mode("healthy");
  f.release();
  await Promise.all([saved, ...pending]);
  assert.equal(f.writes.length, 2);
  assert.equal(f.stored.state.todos.length, 3);
});
test("Reverting a queued edit needs no write and does not leave saving stuck", async () => {
  const f = fixture();
  const original = f.stored.state;
  const pending = f.persistence.save(cal.addTodo(original, "Discarded"));
  await f.persistence.flush(original);
  await pending;
  assert.equal(f.writes.length, 0);
  assert.equal(f.persistence.hasUnsavedChanges(), false);
  await f.persistence.flush(cal.addTodo(original, "Kept"));
  assert.equal(f.writes.length, 1);
});
test("Only durable calendar data is sent; Undo and recovery remain session-local", () => {
  const state = cal.addTodo(cal.blank(today), "Keep me");
  assert.ok(state.undo);
  const snapshot = calendarSnapshot(state);
  assert.equal(snapshot.undo, null);
  assert.equal(snapshot.recovery, null);
  assert.ok(state.undo);
});
