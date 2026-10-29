import { useCallback, useEffect, useState } from "react";
import { addDays, weekStart } from "./calendar";
import { monthStart, shiftMonth } from "./calendarDates";
import type { CalendarView } from "./types";

export function useCalendarNavigation(
  initialDate: string,
  weekStartsOn: number,
) {
  const [view, setView] = useState<CalendarView>("week");
  const [selectedDay, setSelectedDay] = useState(initialDate);
  const [week, setWeek] = useState(() => weekStart(initialDate, weekStartsOn));
  const [miniMonth, setMiniMonth] = useState(() => monthStart(initialDate));
  const [visibleMonth, setVisibleMonth] = useState(() =>
    monthStart(initialDate),
  );
  const [monthScrollRequest, setMonthScrollRequest] = useState(0);
  const [scrollToNowRequest, setScrollToNowRequest] = useState(0);
  useEffect(() => {
    setWeek(weekStart(selectedDay, weekStartsOn));
  }, [selectedDay, weekStartsOn]);
  const showVisibleMonth = useCallback((month: string) => {
    setVisibleMonth(month);
    setMiniMonth(month);
  }, []);
  const showVisibleYear = useCallback((year: string) => {
    setVisibleMonth((month) => `${year}${month.slice(4)}`);
    setMiniMonth((month) => `${year}${month.slice(4)}`);
  }, []);
  function selectDate(date: string) {
    setSelectedDay(date);
    setWeek(weekStart(date, weekStartsOn));
    showVisibleMonth(monthStart(date));
    if (view === "month" || view === "year")
      setMonthScrollRequest((request) => request + 1);
  }
  function goToday(date: string) {
    selectDate(date);
    if (view !== "month" && view !== "year")
      setMonthScrollRequest((request) => request + 1);
    setScrollToNowRequest((request) => request + 1);
  }
  function adjacentDate(direction: number) {
    return view === "year"
      ? shiftMonth(visibleMonth, direction * 12)
      : view === "month"
        ? shiftMonth(visibleMonth, direction)
        : addDays(
            view === "week" ? week : selectedDay,
            direction * (view === "week" ? 7 : 1),
          );
  }
  return {
    view,
    setView,
    selectedDay,
    setSelectedDay,
    week,
    setWeek,
    miniMonth,
    setMiniMonth,
    visibleMonth,
    setVisibleMonth,
    monthScrollRequest,
    setMonthScrollRequest,
    scrollToNowRequest,
    setScrollToNowRequest,
    showVisibleMonth,
    showVisibleYear,
    selectDate,
    goToday,
    adjacentDate,
  };
}
