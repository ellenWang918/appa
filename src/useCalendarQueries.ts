import { useMemo } from "react";
import type { CalendarState } from "./types";
import { calendarDisplayState } from "./calendar";
import { createCalendarQueries } from "./calendarQueries";

// Reuse one visible snapshot index across dates and transient UI updates.
export function useCalendarQueries(state: CalendarState) {
  const { tasks, goals, choices, eventSeries, personalCalendar } = state;
  return useMemo(
    () =>
      createCalendarQueries(
        calendarDisplayState({
          ...state,
          tasks,
          goals,
          choices,
          eventSeries,
          personalCalendar,
        }),
      ),
    [tasks, goals, choices, eventSeries, personalCalendar],
  );
}
