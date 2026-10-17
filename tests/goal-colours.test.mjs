import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../dist/runtime/src/calendar.js";

test("Move more alternatives inherit their goal colour; mixed goals wait for a choice", () => {
  const today = "2026-10-17";
  const state = c.seed(today);
  const slot = c.slotsFor(state, today).find((item) => item.id === "move-slot");
  assert.equal(slot.tasks.length, 2);
  assert.equal(c.slotGoalColor(state, slot), "teal");
  state.goals.find((goal) => goal.id === "move").color = "clay";
  assert.equal(c.slotGoalColor(state, slot), "clay");
  const mixed = { ...slot, tasks: [slot.tasks[0], state.tasks[0]] };
  assert.equal(c.slotGoalColor(state, mixed), undefined);
  assert.equal(
    c.slotGoalColor(state, { ...mixed, chosen: slot.tasks[0] }),
    "clay",
  );
  const event = { ...slot.tasks[0], goalId: null };
  assert.equal(c.slotGoalColor(state, { ...slot, tasks: [event] }), "slate");
});

test("The expanded goal palette round-trips backups while preserving legacy colour keys", () => {
  const today = "2026-10-17";
  for (const color of c.COLORS) {
    const state = c.seed(today);
    state.goals[0].color = color;
    const restored = c.validateBackup(JSON.parse(JSON.stringify(state)), today);
    assert.equal(restored.goals[0].color, color);
    assert.deepEqual(restored.tasks, state.tasks);
  }
  for (const legacy of ["indigo", "teal", "amber", "rose"])
    assert.ok(c.COLORS.includes(legacy));
  assert.equal(new Set(c.COLORS).size, 6);
  const invalid = c.seed(today);
  invalid.goals[0].color = "unknown";
  assert.throws(() => c.validateBackup(invalid, today), /invalid goal/);
});
