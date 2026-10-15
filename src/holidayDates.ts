import { addDays, localDate, localMinute, timeLabel } from "./calendar.js";
import type { PublicHoliday } from "./types.js";

interface HolidayRecord {
  date: string;
  start: Date;
  end: Date;
  name: string;
  type: string;
}

// Holiday dates belong to the selected calendar's region, even when the user's
// display timezone is elsewhere. Keep partial days and multi-day holidays intact.
export function indexHolidays(
  records: readonly HolidayRecord[],
  timezone: string,
) {
  const days = new Map<string, PublicHoliday[]>();
  for (const record of records) {
    if (record.type !== "public") continue;
    const first = record.date.slice(0, 10);
    const last = localDate(timezone, new Date(record.end.getTime() - 1));
    for (let date = first; date <= last; date = addDays(date, 1)) {
      const item = {
        name: record.name,
        startMinute: date === first ? localMinute(timezone, record.start) : 0,
        endMinute:
          date === last ? localMinute(timezone, record.end) || 1440 : 1440,
      };
      const items = days.get(date) ?? [];
      if (
        !items.some(
          (existing) =>
            existing.name === item.name &&
            existing.startMinute === item.startMinute &&
            existing.endMinute === item.endMinute,
        )
      )
        items.push(item);
      days.set(date, items);
    }
  }
  return days;
}

export function holidayLabel(holiday: PublicHoliday): string {
  if (holiday.startMinute === 0 && holiday.endMinute === 1440)
    return holiday.name;
  if (holiday.endMinute === 1440)
    return `${holiday.name} (from ${timeLabel(holiday.startMinute)})`;
  if (holiday.startMinute === 0)
    return `${holiday.name} (until ${timeLabel(holiday.endMinute)})`;
  return `${holiday.name} (${timeLabel(holiday.startMinute)}–${timeLabel(holiday.endMinute)})`;
}
