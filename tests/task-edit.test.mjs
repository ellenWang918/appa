import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../dist/runtime/src/calendar.js";

const today = "2026-10-15";
function editFor(state, id, patch = {}) {
  const task = state.tasks.find((item) => item.id === id);
  return {
    title: task.title,
    date: task.date,
    start: task.start,
    minutes: task.minutes,
    ...patch,
  };
}
test("Task edits persist through backup reload and support Undo without changing other work", () => {
  const state = c.seed(today);
  const next = c.editTask(
    state,
    "review",
    editFor(state, "review", {
      date: "2026-10-20",
      start: 1140,
      minutes: 40,
      title: "Review the final draft",
    }),
    today,
  );
  const task = next.tasks.find((item) => item.id === "review");
  assert.equal(task.date, "2026-10-20");
  assert.equal(task.start, 1140);
  assert.equal(task.minutes, 40);
  assert.equal(task.title, "Review the final draft");
  assert.deepEqual(
    next.tasks.filter((item) => item.id !== "review"),
    state.tasks.filter((item) => item.id !== "review"),
  );
  assert.deepEqual(
    c.validateBackup(JSON.parse(JSON.stringify(next)), today).tasks,
    next.tasks,
  );
  assert.deepEqual(c.undoChange(next).tasks, state.tasks);
});
test("Invalid edits reject overlaps, unavailable hours, bad dates and durations atomically", () => {
  const state = c.seed(today);
  const original = structuredClone(state);
  for (const patch of [
    { start: 1100 },
    { start: 1070 },
    { start: 1250 },
    { date: "2026-02-30" },
    { date: "2026-10-14" },
    { minutes: 0 },
    { minutes: 61 },
    { minutes: 5.5 },
    { title: " " },
  ]) {
    assert.throws(() =>
      c.editTask(state, "outline", editFor(state, "outline", patch), today),
    );
    assert.deepEqual(state, original);
  }
});
test("Moving a task preserves prerequisite order in both directions", () => {
  const state = c.seed(today);
  assert.throws(
    () =>
      c.editTask(
        state,
        "draft",
        editFor(state, "draft", { date: today, start: 1200 }),
        today,
      ),
    /prerequisites/,
  );
  assert.throws(
    () =>
      c.editTask(
        state,
        "outline",
        editFor(state, "outline", { date: "2026-10-18" }),
        today,
      ),
    /later steps/,
  );
});
test("Editing a recurring occurrence preserves repeat identity and templates", () => {
  const state = c.extendRecurrences(c.seed(today), today);
  const next = c.editTask(
    state,
    "walk",
    editFor(state, "walk", { date: "2026-10-16", start: 1200, minutes: 35 }),
    today,
  );
  const moved = next.tasks.find((item) => item.id === "walk");
  assert.equal(
    moved.occurrenceKey,
    state.tasks.find((item) => item.id === "walk").occurrenceKey,
  );
  assert.deepEqual(next.goals, state.goals);
  assert.deepEqual(
    next.tasks.filter((item) => item.id !== "walk"),
    state.tasks.filter((item) => item.id !== "walk"),
  );
  assert.equal(
    c.extendRecurrences(next, today).tasks.filter((item) => item.id === "walk")
      .length,
    1,
  );
});
test("Shared task edits retain other choices and check the reservation left behind", () => {
  let state = c.selectChoice(c.seed(today), today, "move-slot", "walk");
  let next = c.editTask(
    state,
    "stretch",
    editFor(state, "stretch", { start: 1200 }),
    today,
  );
  assert.equal(next.choices[`${today}/move-slot`], "walk");
  next = c.editTask(
    state,
    "walk",
    editFor(state, "walk", { start: 1200 }),
    today,
  );
  assert.equal(next.choices[`${today}/move-slot`], undefined);
  assert.equal(
    c.slotsFor(next, today).find((slot) => slot.id === "move-slot").duration,
    25,
  );
  state.tasks.push({
    ...state.tasks[0],
    id: "another",
    start: 1125,
    slotId: "another-slot",
    minutes: 10,
  });
  assert.throws(
    () =>
      c.editTask(state, "walk", editFor(state, "walk", { start: 1200 }), today),
    /overlaps/,
  );
});
test("Completed and inactive tasks cannot be changed", () => {
  const state = c.seed(today);
  state.tasks[0].status = "done";
  assert.throws(
    () => c.editTask(state, "outline", editFor(state, "outline"), today),
    /pending/,
  );
  state.tasks[0].status = "pending";
  state.goals[0].status = "later";
  assert.throws(
    () => c.editTask(state, "outline", editFor(state, "outline"), today),
    /active/,
  );
});
