import { IconButton } from "./ui";
import { useInterfaceText } from "./InterfaceLanguage";
import { EventReservation } from "./EventReservation";
import type { EventDraft } from "./types";
import { CaretLeft, CaretRight, Check } from "@phosphor-icons/react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import * as cal from "./calendar";
import type { CalendarState, HolidayLookup, Settings, Slot } from "./types";
import { holidayLabel } from "./holidayDates";

export type CalendarView = "day" | "week" | "month" | "year";
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
export { clockTime } from "./calendar";

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
  const dates = monthDays(month, settings.weekStartsOn);
  const selectedWeek = cal.weekStart(selectedDay, settings.weekStartsOn);

  return (
    <section
      className={`mini-calendar ${settings.showWeekNumbers ? "show-week-numbers" : ""}`}
      aria-label={t("Month navigator")}
    >
      <div className="mini-heading">
        <h2>{cal.dateLabel(month, { month: "long" }, settings.language)}</h2>
        <div>
          <IconButton
            className="icon-button"
            aria-label={t("Previous month")}
            onClick={() => onMonth(shiftMonth(month, -1))}
          >
            <CaretLeft size={13} />
          </IconButton>
          <IconButton
            className="icon-button"
            aria-label={t("Next month")}
            onClick={() => onMonth(shiftMonth(month, 1))}
          >
            <CaretRight size={13} />
          </IconButton>
        </div>
      </div>
      <div className="mini-weekdays" aria-hidden="true">
        {settings.showWeekNumbers && <span />}
        {weekdays(settings, "narrow").map((day, i) => (
          <span key={i}>{day}</span>
        ))}
      </div>
      <div className="mini-days">
        {dates
          .filter((_, index) => index % 7 === 0)
          .map((weekStart, weekIndex) => (
            <div
              className={`mini-week ${weekStart === selectedWeek ? "is-selected-week" : ""}`}
              key={weekStart}
            >
              {settings.showWeekNumbers && (
                <span
                  className="mini-week-number"
                  aria-label={t("Week {v0}", {
                    v0: weekNumber(weekStart, settings.weekStartsOn),
                  })}
                >
                  {weekNumber(weekStart, settings.weekStartsOn)}
                </span>
              )}
              {dates.slice(weekIndex * 7, weekIndex * 7 + 7).map((date) => (
                <button
                  key={date}
                  className={`${monthStart(date) !== monthStart(month) ? "outside-month" : ""} ${date === today ? "is-today" : ""} ${holidays(date).length ? "has-holiday" : ""}`}
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
                  title={
                    holidays(date).map(holidayLabel).join(" · ") || undefined
                  }
                  aria-current={date === today ? "date" : undefined}
                  aria-pressed={date === selectedDay}
                  onClick={() => onSelect(date)}
                >
                  {Number(date.slice(-2))}
                </button>
              ))}
            </div>
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
  onCreate,
  draft,
  onDraftAnchor,
  onVisibleMonth,
  scrollRequest,
}: {
  month: string;
  state: CalendarState;
  selectedDay: string;
  today: string;
  holidays: HolidayLookup;
  onSelect: (date: string) => void;
  onSlot: (slot: Slot, anchor: HTMLElement) => void;
  onCreate: (date: string, start?: number, trigger?: HTMLElement) => void;
  draft: EventDraft | null;
  onDraftAnchor: (element: HTMLElement | null) => void;
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
            "--month-grid-height": `${Math.max(0, viewportHeight - 124)}px`,
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
                  const slots = [
                    ...cal.allDaySlotsFor(state, date),
                    ...cal.slotsFor(state, date),
                  ];
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
                          className="calendar-create-area"
                          aria-description={t(
                            "Double-click or press Enter to create an event.",
                          )}
                          aria-label={t("Create event on {date}", {
                            date: cal.dateLabel(
                              date,
                              {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              },
                              state.settings.language,
                            ),
                          })}
                          onClick={(event) => {
                            if (event.detail === 0)
                              onCreate(date, undefined, event.currentTarget);
                          }}
                          onDoubleClick={(event) =>
                            onCreate(date, undefined, event.currentTarget)
                          }
                        />
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
                            data-goal-color={cal.slotGoalColor(state, slot)}
                            className={`month-task ${slot.done ? "done" : ""}`}
                            key={slot.id}
                            onClick={(event) =>
                              onSlot(slot, event.currentTarget)
                            }
                            title={(slot.chosen || slot.tasks[0]).title}
                          >
                            {slot.done && <Check size={10} />}
                            <span>
                              {slot.tasks.length > 1 && !slot.chosen
                                ? t("Choose one")
                                : (slot.chosen || slot.tasks[0]).title}
                            </span>
                            <small>
                              {slot.tasks[0].allDay
                                ? t("All day")
                                : cal.clockTime(slot.start)}
                            </small>
                          </button>
                        ))}
                        {draft?.date === date &&
                          monthStart(date) === visibleMonth && (
                            <EventReservation
                              draft={draft}
                              onAnchor={onDraftAnchor}
                              month
                            />
                          )}
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
