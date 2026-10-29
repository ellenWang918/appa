import type { CalendarState, EventRepeat, EventSeries, Task } from "./types.js";

export const eventOccurrenceKey = (seriesId: string, date: string) =>
  JSON.stringify([seriesId, date]);

export const EVENT_REPEATS: readonly EventRepeat[] = [
  "daily",
  "weekly",
  "fortnightly",
  "monthly",
  "yearly",
];
export function isEventRepeat(value: unknown): value is EventRepeat {
  return EVENT_REPEATS.some((repeat) => repeat === value);
}
export function eventRepeatLabel(value: EventRepeat | "none") {
  switch (value) {
    case "daily":
      return "Every day";
    case "weekly":
      return "Every week";
    case "fortnightly":
      return "Every fortnight";
    case "monthly":
      return "Every month";
    case "yearly":
      return "Every year";
    default:
      return "Does not repeat";
  }
}
const dayNumber = (date: string) => Date.parse(date + "T12:00:00Z") / 86400000;
const interval = (repeat: EventRepeat) =>
  repeat === "daily" ? 1 : repeat === "weekly" ? 7 : 14;
const monthNumber = (date: string) =>
  Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
function indexNear(series: EventSeries, date: string) {
  if (series.repeat === "monthly")
    return monthNumber(date) - monthNumber(series.anchor);
  if (series.repeat === "yearly")
    return Number(date.slice(0, 4)) - Number(series.anchor.slice(0, 4));
  return Math.floor(
    (dayNumber(date) - dayNumber(series.anchor)) / interval(series.repeat),
  );
}
function dateAt(series: EventSeries, index: number): string | null {
  if (series.repeat !== "monthly" && series.repeat !== "yearly")
    return new Date(
      (dayNumber(series.anchor) + index * interval(series.repeat)) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  const months =
    monthNumber(series.anchor) + index * (series.repeat === "monthly" ? 1 : 12);
  const year = Math.floor(months / 12),
    month = months % 12;
  const date = `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${series.anchor.slice(-2)}`;
  const parsed = new Date(date + "T12:00:00Z");
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}
export function isEventOccurrence(series: EventSeries, date: string) {
  if (
    date < series.anchor ||
    (series.until && date > series.until) ||
    series.excludedDates.includes(date)
  )
    return false;
  const index = indexNear(series, date);
  return index >= 0 && dateAt(series, index) === date;
}
export function* eventOccurrenceDates(
  series: EventSeries,
  from: string,
  through: string,
) {
  const start = Math.max(0, indexNear(series, from));
  const end = indexNear(series, through);
  for (let index = start; index <= end; index++) {
    const date = dateAt(series, index);
    if (
      date &&
      date >= from &&
      date <= through &&
      isEventOccurrence(series, date)
    )
      yield date;
  }
}
export function eventForSeriesDate(
  state: Pick<CalendarState, "tasks">,
  series: EventSeries,
  date: string,
  overrides?: ReadonlyMap<string, Task>,
): Task | undefined {
  if (!isEventOccurrence(series, date)) return;
  const saved = overrides
    ? overrides.get(eventOccurrenceKey(series.id, date))
    : state.tasks.find(
        (task) =>
          task.eventSeriesId === series.id && task.eventOccurrenceDate === date,
      );
  if (saved) return saved.date === date ? saved : undefined;
  return {
    id: `${series.id}/${date}`,
    goalId: null,
    title: series.title,
    date,
    start: series.start,
    minutes: series.minutes,
    slotId: `${series.id}/${date}/slot`,
    status: "pending",
    dependsOn: [],
    eventSeriesId: series.id,
    eventOccurrenceDate: date,
    ...(series.allDay ? { allDay: true } : {}),
  };
}
export function virtualEventsForDate(
  state: Pick<CalendarState, "tasks" | "eventSeries">,
  date: string,
  index?: {
    byId: ReadonlyMap<string, Task>;
    overrides: ReadonlyMap<string, Task>;
  },
): Task[] {
  return (state.eventSeries ?? []).flatMap((series) => {
    const event = eventForSeriesDate(state, series, date, index?.overrides);
    return event &&
      !(index
        ? index.byId.has(event.id)
        : state.tasks.some((task) => task.id === event.id))
      ? [event]
      : [];
  });
}
export function virtualEventForId(
  state: CalendarState,
  taskId: string,
): Task | undefined {
  const separator = taskId.lastIndexOf("/");
  if (separator < 0) return;
  const series = state.eventSeries?.find(
    (item) => item.id === taskId.slice(0, separator),
  );
  const date = taskId.slice(separator + 1);
  if (
    !series ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date + "T12:00:00Z"))
  )
    return;
  const event = eventForSeriesDate(state, series, date);
  return event?.id === taskId ? event : undefined;
}
export function seriesCanShareDate(a: EventSeries, b: EventSeries) {
  const fixed = (series: EventSeries) =>
    ["daily", "weekly", "fortnightly"].includes(series.repeat);
  if (!fixed(a) || !fixed(b)) return true;
  const stepA = interval(a.repeat),
    stepB = interval(b.repeat);
  const divisor =
    stepA === 1 || stepB === 1 ? 1 : stepA === 7 || stepB === 7 ? 7 : 14;
  return (dayNumber(a.anchor) - dayNumber(b.anchor)) % divisor === 0;
}
