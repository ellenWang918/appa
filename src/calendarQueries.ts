import type { CalendarState, Goal, Slot, Task } from "./types.js";
import {
  eventOccurrenceDates,
  eventOccurrenceKey,
  virtualEventsForDate,
} from "./eventRepeat.js";

type QueryState = Pick<
  CalendarState,
  "tasks" | "goals" | "choices" | "eventSeries"
>;
function groupSlots(
  state: QueryState,
  date: string,
  candidates: Task[],
  ignoreId: string | null,
  allDay: boolean,
  goals?: Map<string, Goal>,
): Slot[] {
  const groups = new Map<string, Task[]>();
  for (const task of candidates) {
    if (
      task.id === ignoreId ||
      task.date !== date ||
      !!task.allDay !== allDay ||
      !["pending", "done"].includes(task.status) ||
      (task.goalId !== null &&
        (goals
          ? goals.get(task.goalId)
          : state.goals.find((goal) => goal.id === task.goalId)
        )?.status !== "active")
    )
      continue;
    if (!groups.has(task.slotId)) groups.set(task.slotId, []);
    groups.get(task.slotId)!.push(task);
  }
  return [...groups]
    .map(([slotId, tasks]) => {
      const chosenId = state.choices[`${date}/${slotId}`];
      const done = tasks.find((task) => task.status === "done");
      const chosen = done || tasks.find((task) => task.id === chosenId);
      return {
        id: slotId,
        date,
        start: Math.min(...tasks.map((task) => task.start)),
        tasks,
        chosen,
        done: !!done,
        duration: chosen
          ? chosen.minutes
          : Math.max(...tasks.map((task) => task.minutes)),
      };
    })
    .sort((a, b) => a.start - b.start);
}
// Mutable scheduling operations can query a state directly without a stale cache.
export function slotsFor(
  state: QueryState,
  date: string,
  ignoreId: string | null = null,
  allDay = false,
): Slot[] {
  return groupSlots(
    state,
    date,
    [
      ...state.tasks.filter((task) => task.date === date),
      ...virtualEventsForDate(state, date),
    ],
    ignoreId,
    allDay,
  );
}
export const allDaySlotsFor = (state: QueryState, date: string) =>
  slotsFor(state, date, null, true);
export const plannedMinutesFor = (state: QueryState, date: string) =>
  slotsFor(state, date).reduce((sum, slot) => sum + slot.duration, 0);

// Build once for an immutable render/validation pass, never while mutating tasks.
export function createCalendarQueries(state: QueryState) {
  const byDate = new Map<string, Task[]>();
  const byId = new Map<string, Task>();
  const overrides = new Map<string, Task>();
  const goals = new Map(state.goals.map((goal) => [goal.id, goal]));
  for (const task of state.tasks) {
    if (!byDate.has(task.date)) byDate.set(task.date, []);
    byDate.get(task.date)!.push(task);
    byId.set(task.id, task);
    if (task.eventSeriesId && task.eventOccurrenceDate)
      overrides.set(
        eventOccurrenceKey(task.eventSeriesId, task.eventOccurrenceDate),
        task,
      );
  }
  return {
    slotsFor(date: string, ignoreId: string | null = null, allDay = false) {
      return groupSlots(
        state,
        date,
        [
          ...(byDate.get(date) ?? []),
          ...virtualEventsForDate(state, date, { byId, overrides }),
        ],
        ignoreId,
        allDay,
        goals,
      );
    },
    scheduledDates(from: string, through: string) {
      const dates = new Set<string>();
      for (const [date, tasks] of byDate) {
        if (date < from || date > through) continue;
        if (
          tasks.some(
            (task) =>
              ["pending", "done"].includes(task.status) &&
              (task.goalId === null ||
                goals.get(task.goalId)?.status === "active"),
          )
        )
          dates.add(date);
      }
      for (const series of state.eventSeries ?? [])
        for (const date of eventOccurrenceDates(series, from, through))
          if (
            !overrides.has(eventOccurrenceKey(series.id, date)) &&
            !byId.has(`${series.id}/${date}`)
          )
            dates.add(date);
      return dates;
    },
  };
}
