import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../dist/runtime/src/calendar.js";

const today = "2026-10-16";
function editFor(state, goalId) {
  const goal = state.goals.find((g) => g.id === goalId);
  return {
    name: goal.name,
    kind: goal.recurrence ? "recurring" : "project",
    perWeek: goal.recurrence?.perWeek ?? null,
    steps: goal.recurrence
      ? goal.recurrence.templates.map((t, i) => ({
          ...t,
          id: `template-${i}`,
          dependsOn: [],
        }))
      : state.tasks
          .filter((t) => t.goalId === goalId && t.status === "pending")
          .map(({ id, title, minutes, dependsOn }) => ({
            id,
            title,
            minutes,
            dependsOn: [...dependsOn],
          })),
  };
}
function projectState() {
  return c.approvePlan(
    c.blank(today),
    {
      goalName: "Project",
      kind: "project",
      perWeek: null,
      clarification: null,
      tasks: [
        { title: "First", minutes: 15, dependsOn: [] },
        { title: "Second", minutes: 20, dependsOn: [0] },
        { title: "Third", minutes: 15, dependsOn: [1] },
      ],
    },
    { today },
  );
}
test("Goal rename preserves every task, choice, goal identity and schedule; reload and Undo retain data", () => {
  const state = c.seed(today);
  for (const goal of state.goals.filter((g) => g.status === "active")) {
    const edit = editFor(state, goal.id);
    edit.name = "  Renamed goal  ";
    const next = c.editGoal(state, goal.id, edit, today);
    assert.equal(next.goals.find((g) => g.id === goal.id).name, "Renamed goal");
    assert.deepEqual(next.tasks, state.tasks);
    assert.deepEqual(next.choices, state.choices);
    assert.deepEqual(
      c.validateBackup(JSON.parse(JSON.stringify(next)), today).goals,
      next.goals,
    );
    assert.deepEqual(c.undoChange(next).goals, state.goals);
  }
});
test("Project edits add, remove and resize steps atomically, preserve completed history and unrelated work", () => {
  let state = projectState();
  const goal = state.goals[0];
  state = c.completeTask(state, state.tasks[0].id, today);
  const done = state.tasks.find((t) => t.status === "done");
  const edit = editFor(state, goal.id);
  const removed = edit.steps.pop();
  edit.steps[0].title = "Updated pending step";
  edit.steps[0].minutes = 30;
  edit.steps.push({
    id: "new-step",
    title: "New step",
    minutes: 25,
    dependsOn: [edit.steps[0].id],
  });
  const next = c.editGoal(state, goal.id, edit, today);
  assert.deepEqual(
    next.tasks.find((t) => t.id === done.id),
    done,
  );
  assert(!next.tasks.some((t) => t.id === removed.id));
  const changed = next.tasks.find((t) => t.id === edit.steps[0].id),
    added = next.tasks.find((t) => t.id === "new-step");
  assert.equal(changed.title, "Updated pending step");
  assert.equal(changed.minutes, 30);
  assert(added.date > changed.date);
  assert.deepEqual(
    c.validateBackup(JSON.parse(JSON.stringify(next)), today).tasks,
    next.tasks,
  );
  assert.deepEqual(c.undoChange(next).tasks, state.tasks);
});
test("Recurring edits rebuild only the goal's upcoming sessions and preserve finished occurrence history", () => {
  let state = c.approvePlan(
    c.blank(today),
    {
      goalName: "Walk",
      kind: "recurring",
      perWeek: 3,
      clarification: null,
      tasks: [{ title: "Walk", minutes: 15, dependsOn: [] }],
    },
    { today },
  );
  const goal = state.goals[0];
  state = c.extendRecurrences(state, today);
  state = c.completeTask(state, state.tasks[0].id, today);
  const done = state.tasks.find((t) => t.status === "done");
  state = c.approvePlan(
    state,
    {
      goalName: "Other",
      kind: "recurring",
      perWeek: 2,
      clarification: null,
      tasks: [{ title: "Other activity", minutes: 10, dependsOn: [] }],
    },
    { today },
  );
  const other = state.tasks.filter((t) => t.goalId !== goal.id);
  const edit = editFor(state, goal.id);
  edit.perWeek = 5;
  edit.steps[0].title = "Long walk";
  edit.steps[0].minutes = 25;
  const next = c.editGoal(state, goal.id, edit, today);
  assert.equal(next.goals.find((g) => g.id === goal.id).recurrence.perWeek, 5);
  assert.deepEqual(
    next.tasks.find((t) => t.id === done.id),
    done,
  );
  assert.deepEqual(
    next.tasks.filter((t) => t.goalId !== goal.id),
    other,
  );
  assert(
    next.tasks
      .filter((t) => t.goalId === goal.id && t.status === "pending")
      .every((t) => t.title === "Long walk" && t.minutes === 25),
  );
  c.validateBackup(JSON.parse(JSON.stringify(next)), today);
  assert.deepEqual(c.undoChange(next).tasks, state.tasks);
});
test("Changing project/recurring type retains goal identity and completion, and remains reloadable", () => {
  let state = projectState();
  const goal = state.goals[0];
  state = c.completeTask(state, state.tasks[0].id, today);
  const done = state.tasks.find((t) => t.status === "done");
  let edit = editFor(state, goal.id);
  edit.kind = "recurring";
  edit.perWeek = 2;
  edit.steps.forEach((t) => (t.dependsOn = []));
  state = c.editGoal(state, goal.id, edit, today);
  assert.equal(state.goals[0].id, goal.id);
  assert.deepEqual(
    state.tasks.find((t) => t.id === done.id),
    done,
  );
  edit = {
    name: goal.name,
    kind: "project",
    perWeek: null,
    steps: [
      {
        id: "project-step",
        title: "One-time follow-up",
        minutes: 20,
        dependsOn: [done.id],
      },
    ],
  };
  state = c.editGoal(state, goal.id, edit, today);
  assert.equal(state.goals[0].recurrence, null);
  assert.deepEqual(
    state.tasks.find((t) => t.id === done.id),
    done,
  );
  assert.equal(state.tasks.filter((t) => t.status === "pending").length, 1);
  c.validateBackup(JSON.parse(JSON.stringify(state)), today);
});
test("Invalid goal edits reject blank names, invalid durations/recurrence, unsafe identities and prerequisites without mutation", () => {
  const state = projectState(),
    original = structuredClone(state),
    goal = state.goals[0];
  const changes = [
    (e) => (e.name = " "),
    (e) => (e.steps[0].minutes = 0),
    (e) => (e.steps[0].dependsOn = [e.steps[1].id]),
    (e) => (e.steps[0].id = e.steps[1].id),
    (e) => {
      e.kind = "recurring";
      e.perWeek = 8;
      e.steps.forEach((t) => (t.dependsOn = []));
    },
    (e) => {
      e.kind = "recurring";
      e.perWeek = 2;
    },
    (e) => (e.steps = []),
  ];
  for (const change of changes) {
    const edit = editFor(state, goal.id);
    change(edit);
    assert.throws(() => c.editGoal(state, goal.id, edit, today));
    assert.deepEqual(state, original);
  }
  const later = {
    ...structuredClone(state),
    goals: state.goals.map((g) => ({ ...g, status: "later" })),
  };
  assert.throws(() =>
    c.editGoal(later, goal.id, editFor(later, goal.id), today),
  );
});
test("Shared choices remain intact for unchanged steps", () => {
  let state = c.seed(today);
  const slot = c.slotsFor(state, today).find((s) => s.tasks.length > 1);
  assert(slot);
  const chosen = slot.tasks.reduce((a, b) => (a.minutes < b.minutes ? a : b));
  state = c.selectChoice(state, today, slot.id, chosen.id);
  const goal = state.goals.find((g) => g.id === chosen.goalId);
  const edit = editFor(state, goal.id);
  edit.name = "Renamed shared goal";
  const next = c.editGoal(state, goal.id, edit, today);
  assert.deepEqual(next.choices, state.choices);
  assert.deepEqual(next.tasks, state.tasks);
});

test("Removing a selected shared step rejects an overlapping reservation atomically", () => {
  const state = c.blank(today);
  state.goals = ["short", "long", "other"].map((id) => ({
    id,
    name: id,
    color: "indigo",
    status: "active",
    recurrence: null,
  }));
  state.tasks = [
    {
      id: "finished",
      goalId: "short",
      title: "Finished",
      minutes: 10,
      date: "2026-10-15",
      start: 1080,
      slotId: "past",
      dependsOn: [],
      status: "done",
    },
    {
      id: "short-task",
      goalId: "short",
      title: "Short choice",
      minutes: 15,
      date: today,
      start: 1080,
      slotId: "shared",
      dependsOn: [],
      status: "pending",
    },
    {
      id: "long-task",
      goalId: "long",
      title: "Long choice",
      minutes: 25,
      date: today,
      start: 1080,
      slotId: "shared",
      dependsOn: [],
      status: "pending",
    },
    {
      id: "other-task",
      goalId: "other",
      title: "Next task",
      minutes: 15,
      date: today,
      start: 1095,
      slotId: "other",
      dependsOn: [],
      status: "pending",
    },
  ];
  state.choices[`${today}/shared`] = "short-task";
  c.validateBackup(state, today);
  const original = structuredClone(state);
  assert.throws(
    () =>
      c.editGoal(
        state,
        "short",
        { name: "short", kind: "project", perWeek: null, steps: [] },
        today,
      ),
    /overlapping/,
  );
  assert.deepEqual(state, original);
});
