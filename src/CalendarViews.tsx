import { useInterfaceText } from "./InterfaceLanguage";
import { CaretLeft, CaretRight, Check } from "@phosphor-icons/react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import * as cal from "./calendar";
import type { CalendarState, HolidayLookup, Settings, Slot } from "./types";
import { holidayLabel } from "./holidayDates";

export type CalendarView = "day" | "week" | "month";
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
  const last = cal.addDays(shiftMonth(start, 1), -1);
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
function weekdays(settings: Settings, width: "short" | "narrow") {
  return Array.from({ length: 7 }, (_, index) =>
    cal.dateLabel(
      cal.addDays("2026-10-11", (settings.weekStartsOn + index) % 7),
      { weekday: width },
      settings.language,
    ),
  );
}
export const clockTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function MiniCalendar({
  month,
  selectedDay,
  today,
  settings,
  holidays,
  onMonth,
  onSelect,
}: {
  month: string;
  selectedDay: string;
  today: string;
  settings: Settings;
  holidays: HolidayLookup;
  onMonth: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  const t = useInterfaceText();

  return (
    <section
      className={`mini-calendar ${settings.showWeekNumbers ? "show-week-numbers" : ""}`}
      aria-label={t("Month navigator")}
    >
      <div className="mini-heading">
        <h2>{cal.dateLabel(month, { month: "long" }, settings.language)}</h2>
        <div>
          <button
            className="icon-button"
            aria-label={t("Previous month")}
            onClick={() => onMonth(shiftMonth(month, -1))}
          >
            <CaretLeft size={13} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Next month")}
            onClick={() => onMonth(shiftMonth(month, 1))}
          >
            <CaretRight size={13} />
          </button>
        </div>
      </div>
      <div className="mini-weekdays" aria-hidden="true">
        {settings.showWeekNumbers && <span />}
        {weekdays(settings, "narrow").map((day, i) => (
          <span key={i}>{day}</span>
        ))}
      </div>
      <div className="mini-days">
        {monthDays(month, settings.weekStartsOn).map((date, index) => (
          <Fragment key={date}>
            {settings.showWeekNumbers && index % 7 === 0 && (
              <span
                className="mini-week-number"
                aria-label={t("Week {v0}", {
                  v0: weekNumber(date, settings.weekStartsOn),
                })}
              >
                {weekNumber(date, settings.weekStartsOn)}
              </span>
            )}
            <button
              className={`${date === selectedDay ? "selected" : ""} ${monthStart(date) !== monthStart(month) ? "outside-month" : ""} ${date === today ? "is-today" : ""} ${holidays(date).length ? "has-holiday" : ""}`}
              aria-label={cal.dateLabel(
                date,
                {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                },
                settings.language,
              )}
              title={holidays(date).map(holidayLabel).join(" · ") || undefined}
              aria-current={date === today ? "date" : undefined}
              aria-pressed={date === selectedDay}
              onClick={() => onSelect(date)}
            >
              {Number(date.slice(-2))}
            </button>
          </Fragment>
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
  holidays,
  onSelect,
  onSlot,
  onVisibleMonth,
  scrollRequest,
}: {
  month: string;
  state: CalendarState;
  selectedDay: string;
  today: string;
  holidays: HolidayLookup;
  onSelect: (date: string) => void;
  onSlot: (slot: Slot) => void;
  onVisibleMonth: (month: string) => void;
  scrollRequest: number;
}) {
  const t = useInterfaceText();

  const scroll = useRef<HTMLDivElement>(null);
  const position = useRef({ month, offset: 0 });
  const lastJump = useRef("");
  const reportedMonth = useRef("");
  const changingWindow = useRef(false);
  const [months, setMonths] = useState(() => surroundingMonths(month));
  const [viewportHeight, setViewportHeight] = useState(0);

  function sections() {
    return Array.from(
      scroll.current?.querySelectorAll<HTMLElement>(".month-section") ?? [],
    );
  }

  function reportVisibleMonth() {
    const element = scroll.current;
    if (!element) return;
    const middle = element.scrollTop + element.clientHeight / 2;
    const visible = sections()
      .reverse()
      .find((section) => section.offsetTop <= middle);
    const visibleMonth = visible?.dataset.month;
    if (visibleMonth && reportedMonth.current !== visibleMonth) {
      reportedMonth.current = visibleMonth;
      onVisibleMonth(visibleMonth);
    }
  }

  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    setViewportHeight(element.clientHeight);
    const observer = new ResizeObserver(() =>
      setViewportHeight(element.clientHeight),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const jump = `${month}/${scrollRequest}`;
    if (lastJump.current !== jump) {
      lastJump.current = jump;
      position.current = { month, offset: 0 };
    }
    const anchor = sections().find(
      (section) => section.dataset.month === position.current.month,
    );
    if (!anchor) {
      setMonths(surroundingMonths(position.current.month));
      return;
    }
    // Retain the visible position when earlier months enter the render window.
    element.scrollTop = anchor.offsetTop + position.current.offset;
    changingWindow.current = false;
    reportVisibleMonth();
  }, [
    months,
    viewportHeight,
    month,
    scrollRequest,
    onVisibleMonth,
    state.settings.weekStartsOn,
    state.settings.showWeekNumbers,
  ]);

  function onScroll() {
    const element = scroll.current;
    if (!element || changingWindow.current) return;
    const anchor = sections()
      .reverse()
      .find((section) => section.offsetTop <= element.scrollTop + 1);
    if (!anchor?.dataset.month) return;
    position.current = {
      month: anchor.dataset.month,
      offset: element.scrollTop - anchor.offsetTop,
    };
    reportVisibleMonth();
    const nearStart = element.scrollTop < element.clientHeight;
    const nearEnd =
      element.scrollHeight - element.clientHeight - element.scrollTop <
      element.clientHeight;
    if (nearStart || nearEnd) {
      changingWindow.current = true;
      const nextStart = shiftMonth(months[0], nearStart ? -3 : 3);
      setMonths(
        Array.from({ length: 7 }, (_, index) => shiftMonth(nextStart, index)),
      );
    }
  }

  return (
    <div
      className={`month-calendar ${state.settings.showWeekNumbers ? "show-week-numbers" : ""}`}
    >
      <div className="month-weekdays">
        {state.settings.showWeekNumbers && (
          <span aria-label={t("Week number")}>{t("Wk")}</span>
        )}
        {weekdays(state.settings, "short").map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div
        className="month-scroll"
        ref={scroll}
        tabIndex={0}
        role="region"
        aria-label={t("Scroll month calendar")}
        onScroll={onScroll}
        style={
          {
            "--month-grid-height": `${Math.max(0, viewportHeight - 150)}px`,
          } as CSSProperties
        }
      >
        {months.map((visibleMonth) => (
          <section
            className="month-section"
            data-month={visibleMonth}
            key={visibleMonth}
            aria-label={cal.dateLabel(
              visibleMonth,
              {
                month: "long",
                year: "numeric",
              },
              state.settings.language,
            )}
          >
            <h2 className="month-section-heading">
              {cal.dateLabel(
                visibleMonth,
                { month: "long", year: "numeric" },
                state.settings.language,
              )}
            </h2>
            <div className="month-grid">
              {monthDays(visibleMonth, state.settings.weekStartsOn).map(
                (date, index) => {
                  const slots = cal.slotsFor(state, date);
                  return (
                    <Fragment key={date}>
                      {state.settings.showWeekNumbers && index % 7 === 0 && (
                        <span
                          className="month-week-number"
                          aria-label={t("Week {v0}", {
                            v0: weekNumber(date, state.settings.weekStartsOn),
                          })}
                        >
                          {weekNumber(date, state.settings.weekStartsOn)}
                        </span>
                      )}
                      <section
                        className={`month-cell ${monthStart(date) !== visibleMonth ? "outside-month" : ""} ${date === selectedDay ? "selected" : ""}`}
                      >
                        <button
                          className="month-day"
                          aria-label={t("View {v0}", {
                            v0: cal.dateLabel(
                              date,
                              {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              },
                              state.settings.language,
                            ),
                          })}
                          aria-current={date === today ? "date" : undefined}
                          onClick={() => onSelect(date)}
                        >
                          {Number(date.slice(-2))}
                        </button>
                        {holidays(date).map((holiday) => (
                          <p
                            className="holiday-label"
                            key={`${holiday.name}/${holiday.startMinute}`}
                            title={holidayLabel(holiday)}
                          >
                            {holidayLabel(holiday)}
                          </p>
                        ))}
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
                                ? t("Choose one")
                                : (slot.chosen || slot.tasks[0]).title}
                            </span>
                            <small>{clockTime(slot.start)}</small>
                          </button>
                        ))}
                        {slots.length > 3 && (
                          <button
                            className="more-tasks"
                            onClick={() => onSelect(date)}
                          >
                            {t("+")}
                            {slots.length - 3} {t("more")}
                          </button>
                        )}
                      </section>
                    </Fragment>
                  );
                },
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function surroundingMonths(month: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftMonth(month, index - 3));
}
