import { HOLIDAY_CALENDARS, TIMEZONE_CALENDARS } from "./holidayCatalog.js";
export { INTERFACE_LANGUAGES } from "./i18n.js";

export const DEFAULT_CALENDAR_PREFERENCES = {
  language: "en-AU",
  showWeekNumbers: true,
  weekStartsOn: 1,
  holidayCalendar: "auto",
};
export function automaticHolidayCalendar(timezone: string): string {
  if (TIMEZONE_CALENDARS[timezone]) return TIMEZONE_CALENDARS[timezone];
  try {
    const canonical = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
    }).resolvedOptions().timeZone;
    return TIMEZONE_CALENDARS[canonical] ?? "none";
  } catch {
    return "none";
  }
}
export function holidayCalendarLabel(id: string): string {
  return HOLIDAY_CALENDARS[id]?.label ?? "No public holiday calendar";
}
export function isHolidayCalendar(id: unknown): id is string {
  return (
    typeof id === "string" &&
    (id === "auto" || id === "none" || Object.hasOwn(HOLIDAY_CALENDARS, id))
  );
}
