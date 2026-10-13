import { CaretLeft, CaretRight, Check } from "@phosphor-icons/react";
import * as cal from "./calendar";
import type { CalendarState, Slot } from "./types";

export type CalendarView = "day" | "week" | "month";
export const monthStart = (date: string) => date.slice(0, 7) + "-01";
export function shiftMonth(date: string, offset: number): string {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 10);
}
export function monthDays(month: string): string[] {
  const start = monthStart(month);
  const first = cal.monday(start);
  const last = cal.addDays(shiftMonth(start, 1), -1);
  const count =
    Math.ceil(
      (Date.parse(last) - Date.parse(first) + 86400000) / (7 * 86400000),
    ) * 7;
  return Array.from({ length: count }, (_, i) => cal.addDays(first, i));
}
export function weekNumber(date: string): number {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const first = Date.UTC(value.getUTCFullYear(), 0, 1, 12);
  return Math.ceil(((value.getTime() - first) / 86400000 + 1) / 7);
}
export const clockTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function MiniCalendar({
  month,
  selectedDay,
  today,
  onMonth,
  onSelect,
}: {
  month: string;
  selectedDay: string;
  today: string;
  onMonth: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  return (
    <section className="mini-calendar" aria-label="Month navigator">
      <div className="mini-heading">
        <h2>{cal.dateLabel(month, { month: "long" })}</h2>
        <div>
          <button
            className="icon-button"
            aria-label="Previous month"
            onClick={() => onMonth(shiftMonth(month, -1))}
          >
            <CaretLeft size={13} />
          </button>
          <button
            className="icon-button"
            aria-label="Next month"
            onClick={() => onMonth(shiftMonth(month, 1))}
          >
            <CaretRight size={13} />
          </button>
        </div>
      </div>
      <div className="mini-weekdays" aria-hidden="true">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
          <span key={i}>{day}</span>
        ))}
      </div>
      <div className="mini-days">
        {monthDays(month).map((date) => (
          <button
            key={date}
            className={`${date === selectedDay ? "selected" : ""} ${monthStart(date) !== monthStart(month) ? "outside-month" : ""} ${date === today ? "is-today" : ""}`}
            aria-label={cal.dateLabel(date, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            aria-current={date === today ? "date" : undefined}
            aria-pressed={date === selectedDay}
            onClick={() => onSelect(date)}
          >
            {Number(date.slice(-2))}
          </button>
        ))}
      </div>
    </section>
  );
}

export function MonthCalendar({
  month,
  state,
  selectedDay,
  today,
  onSelect,
  onSlot,
}: {
  month: string;
  state: CalendarState;
  selectedDay: string;
  today: string;
  onSelect: (date: string) => void;
  onSlot: (slot: Slot) => void;
}) {
  return (
    <div className="month-calendar">
      <div className="month-weekdays">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-grid">
        {monthDays(month).map((date) => {
          const slots = cal.slotsFor(state, date);
          return (
            <section
              key={date}
              className={`month-cell ${monthStart(date) !== monthStart(month) ? "outside-month" : ""} ${date === selectedDay ? "selected" : ""}`}
            >
              <button
                className="month-day"
                aria-label={`View ${cal.dateLabel(date, { day: "numeric", month: "long", year: "numeric" })}`}
                aria-current={date === today ? "date" : undefined}
                onClick={() => onSelect(date)}
              >
                {Number(date.slice(-2))}
              </button>
              {slots.slice(0, 3).map((slot) => (
                <button
                  className={`month-task ${slot.done ? "done" : ""}`}
                  key={slot.id}
                  onClick={() => onSlot(slot)}
                  title={(slot.chosen || slot.tasks[0]).title}
                >
                  {slot.done && <Check size={10} />}
                  <span>
                    {slot.tasks.length > 1 && !slot.chosen
                      ? "Choose one"
                      : (slot.chosen || slot.tasks[0]).title}
                  </span>
                  <small>{clockTime(slot.start)}</small>
                </button>
              ))}
              {slots.length > 3 && (
                <button className="more-tasks" onClick={() => onSelect(date)}>
                  +{slots.length - 3} more
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
