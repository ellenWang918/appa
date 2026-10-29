import * as cal from "./calendar.js";
import type { Settings } from "./types.js";
export const monthStart = (date: string) => date.slice(0, 7) + "-01";
export function shiftMonth(date: string, offset: number): string {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 10);
}
export function monthDays(month: string, startsOn = 1): string[] {
  const start = monthStart(month);
  const first = cal.weekStart(start, startsOn);
  const lastDay = new Date(start + "T12:00:00Z");
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  const last = lastDay.toISOString().slice(0, 10);
  const count =
    Math.ceil(
      (Date.parse(last) - Date.parse(first) + 86400000) / (7 * 86400000),
    ) * 7;
  return Array.from({ length: count }, (_, i) => cal.addDays(first, i));
}
export function weekNumber(date: string, startsOn = 1): number {
  // Label each visible week with the ISO week number of its Thursday.
  const value = new Date(
    cal.addDays(cal.weekStart(date, startsOn), (4 - startsOn + 7) % 7) +
      "T12:00:00Z",
  );
  const first = Date.UTC(value.getUTCFullYear(), 0, 1, 12);
  return Math.ceil(((value.getTime() - first) / 86400000 + 1) / 7);
}
export function weekdays(settings: Settings, width: "short" | "narrow") {
  return Array.from({ length: 7 }, (_, index) =>
    cal.dateLabel(
      cal.addDays("2026-10-11", (settings.weekStartsOn + index) % 7),
      { weekday: width },
      settings.language,
    ),
  );
}
