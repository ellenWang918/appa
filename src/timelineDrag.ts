import type { CalendarState, Slot, Task, TimelineResizeEdge } from "./types.js";
import * as cal from "./calendar.js";

export function draggableTimelineTask(state: CalendarState, slot: Slot) {
  const task =
    slot.chosen ?? (slot.tasks.length === 1 ? slot.tasks[0] : undefined);
  return task &&
    !task.allDay &&
    task.status === "pending" &&
    (task.goalId === null || cal.goalFor(state, task)?.status === "active")
    ? task
    : undefined;
}

export function timelineDropStart(
  pointerY: number,
  top: number,
  height: number,
  grabOffset: number,
  minutes: number,
) {
  const minute = ((pointerY - top) / height) * 1440 - grabOffset;
  return Math.max(
    0,
    Math.min(Math.floor((1440 - minutes) / 5) * 5, Math.round(minute / 5) * 5),
  );
}

export function moveTimelineTask(
  state: CalendarState,
  source: Task,
  date: string,
  start: number,
  today: string,
) {
  return changeTimelineTask(state, source, date, start, source.minutes, today);
}

export function timelineResizeRange(
  task: Task,
  edge: TimelineResizeEdge,
  minute: number,
) {
  const snapped = Math.round(minute / 5) * 5;
  const end = task.start + task.minutes;
  const maximum = task.goalId === null ? 1440 : 60;
  if (edge === "start") {
    const start = Math.max(0, end - maximum, Math.min(end - 5, snapped));
    return { start, minutes: end - start };
  }
  const nextEnd = Math.min(
    1440,
    task.start + maximum,
    Math.max(task.start + 5, snapped),
  );
  return { start: task.start, minutes: nextEnd - task.start };
}

export function resizeTimelineTask(
  state: CalendarState,
  source: Task,
  start: number,
  minutes: number,
  today: string,
) {
  return changeTimelineTask(state, source, source.date, start, minutes, today);
}

function changeTimelineTask(
  state: CalendarState,
  source: Task,
  date: string,
  start: number,
  minutes: number,
  today: string,
) {
  const task = cal.taskFor(state, source.id);
  if (
    !task ||
    task.date !== source.date ||
    task.start !== source.start ||
    task.minutes !== source.minutes ||
    task.status !== "pending" ||
    task.allDay
  )
    throw new Error("This entry changed while you were dragging. Try again.");
  if (task.date === date && task.start === start && task.minutes === minutes)
    return state;
  return cal.editTask(
    state,
    task.id,
    { title: task.title, date, start, minutes },
    today,
  );
}
