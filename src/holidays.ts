import Holidays from "date-holidays";
import { HOLIDAY_CALENDARS } from "./holidayCatalog";
import { indexHolidays } from "./holidayDates";
import type { HolidayLookup, PublicHoliday } from "./types";

export function createHolidayLookup(id: string): HolidayLookup {
  const location = HOLIDAY_CALENDARS[id];
  if (!location) return () => [];
  const calendar = new Holidays(location, {
    languages: "en",
    types: ["public"],
  });
  const timezone = calendar.getTimezones()[0] ?? "UTC";
  const years = new Map<number, Map<string, PublicHoliday[]>>();
  return (date) => {
    const year = Number(date.slice(0, 4));
    if (!years.has(year)) {
      // Include holidays that started in December and continue into January.
      years.set(
        year,
        indexHolidays(
          [...calendar.getHolidays(year - 1), ...calendar.getHolidays(year)],
          timezone,
        ),
      );
      if (years.size > 8) years.delete(years.keys().next().value!);
    }
    return years.get(year)!.get(date) ?? [];
  };
}
