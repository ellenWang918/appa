import { test } from "node:test";
import assert from "node:assert/strict";
import * as cal from "../dist/runtime/src/calendar.js";
import {
  draggableTimelineTask,
  timelineDropStart,
  moveTimelineTask,
  timelineResizeRange,
  resizeTimelineTask,
} from "../dist/runtime/src/timelineDrag.js";

const today = "2026-10-19";
const eventDetails = {
  title: "Appointment",
  date: today,
  start: 540,
  minutes: 30,
};
function workspace() {
  return cal.createEvent(cal.blank(today), eventDetails, today);
}

test("Top resizing fixes the end; bottom resizing fixes the start and allows longer standalone events", () => {
  const state = workspace();
  const source = state.tasks[0];
  const top = timelineResizeRange(source, "start", 523);
  assert.deepEqual(top, { start: 525, minutes: 45 });
  const earlier = resizeTimelineTask(
    state,
    source,
    top.start,
    top.minutes,
    today,
  );
  assert.equal(earlier.tasks[0].start + earlier.tasks[0].minutes, 570);
  const bottom = timelineResizeRange(source, "end", 658);
  assert.deepEqual(bottom, { start: 540, minutes: 120 });
  const longer = resizeTimelineTask(
    state,
    source,
    bottom.start,
    bottom.minutes,
    today,
  );
  assert.deepEqual(longer.tasks[0], { ...source, minutes: 120 });
  assert.equal(
    cal.validateBackup(JSON.parse(JSON.stringify(longer)), today).tasks[0]
      .minutes,
    120,
  );
  assert.deepEqual(cal.undoChange(earlier).tasks, state.tasks);
  assert.deepEqual(cal.undoChange(longer).tasks, state.tasks);
  assert.equal(
    resizeTimelineTask(state, source, source.start, source.minutes, today),
    state,
  );
});

test("Resize edges stop at midnight, retain five minutes and preserve goal duration limits", () => {
  const source = workspace().tasks[0];
  assert.deepEqual(timelineResizeRange(source, "start", -100), {
    start: 0,
    minutes: 570,
  });
  assert.deepEqual(timelineResizeRange(source, "start", 800), {
    start: 565,
    minutes: 5,
  });
  assert.deepEqual(timelineResizeRange(source, "end", 400), {
    start: 540,
    minutes: 5,
  });
  assert.deepEqual(timelineResizeRange(source, "end", 1600), {
    start: 540,
    minutes: 900,
  });
  const task = cal.seed(today).tasks.find((item) => item.id === "outline");
  assert.equal(timelineResizeRange(task, "start", 0).minutes, 60);
  assert.equal(timelineResizeRange(task, "end", 1440).minutes, 60);
});

test("Resizing into either neighbour fails atomically; touching its boundary is allowed", () => {
  let state = workspace();
  const source = state.tasks[0];
  state = cal.createEvent(state, { ...eventDetails, start: 510 }, today);
  state = cal.createEvent(state, { ...eventDetails, start: 600 }, today);
  const before = JSON.stringify(state);
  assert.throws(
    () => resizeTimelineTask(state, source, 525, 45, today),
    /overlaps/,
  );
  assert.throws(
    () => resizeTimelineTask(state, source, 540, 75, today),
    /overlaps/,
  );
  assert.equal(JSON.stringify(state), before);
  const next = resizeTimelineTask(state, source, 540, 60, today);
  assert.equal(next.tasks[0].start + next.tasks[0].minutes, 600);
});

test("Resizing goal work checks availability and reservations left behind in shared slots", () => {
  const state = cal.seed(today);
  const source = state.tasks.find((item) => item.id === "outline");
  assert.throws(
    () => resizeTimelineTask(state, source, 1075, 30, today),
    /available hours/,
  );
  assert.throws(
    () => resizeTimelineTask(state, source, source.start, 65, today),
    /duration/,
  );
  const chosen = cal.selectChoice(state, today, "move-slot", "walk");
  const walk = chosen.tasks.find((item) => item.id === "walk");
  const next = resizeTimelineTask(chosen, walk, walk.start, 10, today);
  assert.equal(next.choices[`${today}/move-slot`], walk.id);
  assert.equal(
    next.tasks.find((task) => task.id === "stretch").minutes,
    state.tasks.find((task) => task.id === "stretch").minutes,
  );
  assert.deepEqual(cal.undoChange(next).tasks, chosen.tasks);
});

test("Resizing one virtual repeat preserves the following occurrences and rejects stale source data", () => {
  const state = cal.createEvent(
    cal.blank(today),
    { ...eventDetails, repeat: "daily" },
    today,
  );
  const date = "2026-10-20";
  const source = cal.slotsFor(state, date)[0].tasks[0];
  const next = resizeTimelineTask(state, source, 525, 60, today);
  const occurrence = cal.slotsFor(next, date)[0];
  assert.equal(occurrence.start, 525);
  assert.equal(occurrence.duration, 60);
  assert.equal(cal.slotsFor(next, "2026-10-21")[0].duration, 30);
  assert.deepEqual(next.eventSeries, state.eventSeries);
  assert.throws(
    () => resizeTimelineTask(next, source, 540, 45, today),
    /changed while/,
  );
  assert.deepEqual(cal.undoChange(next).tasks, state.tasks);
});

test("Drop coordinates retain the grab offset, snap to five minutes and fit inside the day", () => {
  // One pixel per minute; grabbing ten minutes into a card keeps its top ten minutes earlier.
  assert.equal(timelineDropStart(711, 100, 1440, 10, 30), 600);
  assert.equal(timelineDropStart(711, 100, 2880, 5, 30), 300);
  assert.equal(timelineDropStart(50, 100, 1440, 10, 30), 0);
  assert.equal(timelineDropStart(1600, 100, 1440, 10, 25), 1415);
});

test("Dropping an event changes only its time/date, persists and supports Undo", () => {
  const state = workspace();
  const source = state.tasks[0];
  const next = moveTimelineTask(state, source, "2026-10-20", 605, today);
  assert.deepEqual(next.tasks[0], {
    ...source,
    date: "2026-10-20",
    start: 605,
  });
  assert.deepEqual(state.tasks[0], source);
  const restored = cal.validateBackup(JSON.parse(JSON.stringify(next)), today);
  assert.equal(restored.tasks[0].start, 605);
  assert.deepEqual(cal.undoChange(next).tasks, state.tasks);
  assert.equal(
    moveTimelineTask(state, source, source.date, source.start, today),
    state,
  );
});

test("A hidden calendar still reserves time and invalid drops leave the schedule untouched", () => {
  const state = cal.createEvent(
    cal.seed(today),
    { ...eventDetails, start: 1200 },
    today,
  );
  state.personalCalendar = {
    ...cal.personalCalendarFor(state),
    visible: false,
  };
  const before = JSON.stringify(state);
  assert.ok(
    cal
      .slotsFor(cal.calendarDisplayState(state), today)
      .every((slot) => slot.tasks.every((task) => task.goalId !== null)),
  );
  const source = state.tasks.find((task) => task.id === "outline");
  assert.throws(
    () => moveTimelineTask(state, source, today, 1190, today),
    /overlaps/,
  );
  assert.equal(JSON.stringify(state), before);
});

test("Drop validation uses current reservations and rejects a source changed during the drag", () => {
  const state = workspace();
  const source = state.tasks[0];
  const changed = cal.editTask(
    state,
    source.id,
    { ...eventDetails, start: 600 },
    today,
  );
  assert.throws(
    () => moveTimelineTask(changed, source, today, 720, today),
    /changed while/,
  );
  const occupied = cal.createEvent(
    state,
    { ...eventDetails, start: 720 },
    today,
  );
  assert.throws(
    () => moveTimelineTask(occupied, source, today, 720, today),
    /overlaps/,
  );
});

test("Dragging a virtual repeating event moves this occurrence and leaves the series unchanged", () => {
  const state = cal.createEvent(
    cal.blank(today),
    { ...eventDetails, repeat: "daily" },
    today,
  );
  const date = "2026-10-20";
  const source = cal.slotsFor(state, date)[0].tasks[0];
  assert.equal(
    state.tasks.some((task) => task.id === source.id),
    false,
  );
  const next = moveTimelineTask(state, source, date, 720, today);
  assert.equal(cal.slotsFor(next, date).length, 1);
  assert.equal(cal.slotsFor(next, date)[0].start, 720);
  assert.equal(cal.slotsFor(next, "2026-10-21")[0].start, eventDetails.start);
  assert.deepEqual(next.eventSeries, state.eventSeries);
  assert.deepEqual(cal.undoChange(next).tasks, state.tasks);
});

test("Goal drops respect available hours and unfinished prerequisites", () => {
  const state = cal.seed(today);
  const task = state.tasks.find((item) => item.id === "draft");
  assert.throws(
    () => moveTimelineTask(state, task, task.date, 540, today),
    /available hours/,
  );
  assert.throws(
    () => moveTimelineTask(state, task, today, 1200, today),
    /prerequisites/,
  );
});

test("Only pending timed cards and chosen shared activities can start a drag", () => {
  const state = cal.seed(today);
  const shared = cal
    .slotsFor(state, today)
    .find((slot) => slot.tasks.length > 1);
  assert.equal(draggableTimelineTask(state, shared), undefined);
  const chosen = cal.selectChoice(state, today, shared.id, "walk");
  const chosenSlot = cal
    .slotsFor(chosen, today)
    .find((slot) => slot.id === shared.id);
  assert.equal(draggableTimelineTask(chosen, chosenSlot).id, "walk");
  const done = cal.completeTask(chosen, "walk", today);
  assert.equal(
    draggableTimelineTask(
      done,
      cal.slotsFor(done, today).find((slot) => slot.id === shared.id),
    ),
    undefined,
  );
  const allDay = cal.createEvent(
    cal.blank(today),
    { ...eventDetails, allDay: true },
    today,
  );
  assert.equal(
    draggableTimelineTask(allDay, cal.allDaySlotsFor(allDay, today)[0]),
    undefined,
  );
});
