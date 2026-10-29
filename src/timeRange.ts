export function minuteFor(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60
    ? hour * 60 + minute
    : NaN;
}
export function timeRange(startTime: string, endTime: string, allDay = false) {
  if (allDay) return { start: 0, minutes: 1440 };
  const start = minuteFor(startTime);
  const end = minuteFor(endTime);
  return { start, minutes: (end === 0 && start > 0 ? 1440 : end) - start };
}
