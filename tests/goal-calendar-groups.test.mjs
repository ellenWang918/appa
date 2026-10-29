import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "../dist/runtime/src/calendar.js";
import { createCalendarQueries } from "../dist/runtime/src/calendarQueries.js";

const today = "2026-10-29";
function fixture() {
  const state = c.blank(today);
  state.settings.useAvailableTime = false;
  state.goals = [{id:"goal",name:"Research",color:"slate",status:"active",recurrence:null}];
  state.tasks = [{id:"step",goalId:"goal",title:"Read notes",date:today,start:540,minutes:30,slotId:"step",status:"pending",dependsOn:[]}];
  return state;
}
test("Goal visibility hides its calendar cards and year dates without freeing reservations", () => {
  const state = fixture();
  const hidden = c.toggleGoalVisibility(state, "goal");
  assert.strictEqual(hidden.tasks, state.tasks);
  assert.equal(hidden.revision, state.revision);
  assert.equal(hidden.undo, state.undo);
  const display = c.calendarDisplayState(hidden);
  assert.equal(c.slotsFor(display,today).length,0);
  assert.equal(createCalendarQueries(display).scheduledDates(today,today).size,0);
  assert.throws(() => c.createEvent(hidden,{title:"Overlap",date:today,start:540,minutes:30},today),/overlaps/);
  assert.equal(c.slotsFor(c.calendarDisplayState(c.toggleGoalVisibility(hidden,"goal")),today).length,1);
  assert.equal(c.validateBackup(hidden,today).goals[0].visible,false);
  assert.equal(c.calendarDisplayState(c.togglePersonalCalendar(state)).tasks.length,1);
});
test("Goal row edits change only metadata and support Undo and backup round trips", () => {
  const state = fixture();
  const next = c.editGoalCalendar(state,"goal","  Reading  ","clay");
  assert.deepEqual(next.tasks,state.tasks);
  assert.deepEqual(next.choices,state.choices);
  assert.equal(next.goals[0].name,"Reading");
  assert.equal(next.goals[0].color,"clay");
  assert.deepEqual(c.undoChange(next).goals,state.goals);
  assert.deepEqual(c.validateBackup(JSON.parse(JSON.stringify(next)),today).goals,next.goals);
  assert.throws(() => c.editGoalCalendar(state,"goal"," ","clay"),/name/);
  assert.throws(() => c.editGoalCalendar(state,"goal","Reading","invalid"),/colour/);
  assert.throws(() => c.editGoalCalendar(state,"missing","Reading","clay"),/no longer/);
});
test("Older goals stay visible and malformed visibility is rejected", () => {
  const state = fixture();
  assert.equal(c.validateBackup(state,today).goals[0].visible,undefined);
  for (const visible of ["false",0,null]) {
    assert.throws(() => c.validateBackup({...state,goals:[{...state.goals[0],visible}]},today),/invalid goal/);
  }
});
