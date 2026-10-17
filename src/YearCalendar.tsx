import {
  Fragment,
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { monthDays, monthStart, weekdays, weekNumber } from "./CalendarViews";
import { useInterfaceText } from "./InterfaceLanguage";
import { holidayLabel } from "./holidayDates";
import * as cal from "./calendar";
import type { CalendarState, HolidayLookup } from "./types";

type YearMonthsProps = {
  year: string;
  state: CalendarState;
  today: string;
  holidays: HolidayLookup;
  onMonth: (month: string) => void;
  onSelect: (date: string) => void;
};

function surroundingYears(year: string): string[] {
  const start = Math.max(1, Math.min(9995, Number(year) - 2));
  return Array.from({ length: 5 }, (_, index) =>
    String(start + index).padStart(4, "0"),
  );
}

export function YearCalendar({
  year,
  selectedDay,
  scrollRequest,
  onVisibleYear,
  ...monthProps
}: YearMonthsProps & {
  selectedDay: string;
  scrollRequest: number;
  onVisibleYear: (year: string) => void;
}) {
  const t = useInterfaceText();
  const scroll = useRef<HTMLDivElement>(null);
  const position = useRef({ year, offset: 0 });
  const lastJump = useRef("");
  const pendingMonth = useRef<string | null>(null);
  const reportedYear = useRef("");
  const lastViewport = useRef("");
  const changingWindow = useRef(false);
  const [years, setYears] = useState(() => surroundingYears(year));
  const [viewport, setViewport] = useState("");

  function sections() {
    return Array.from(
      scroll.current?.querySelectorAll<HTMLElement>(".year-section") ?? [],
    );
  }

  function reportVisibleYear() {
    const element = scroll.current;
    if (!element) return;
    const middle = element.scrollTop + element.clientHeight / 2;
    const visible = sections()
      .reverse()
      .find((section) => section.offsetTop <= middle);
    const visibleYear = visible?.dataset.year;
    if (visibleYear && reportedYear.current !== visibleYear) {
      reportedYear.current = visibleYear;
      onVisibleYear(visibleYear);
    }
  }

  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewport(`${element.clientWidth}/${element.clientHeight}`);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const jump = `${selectedDay}/${scrollRequest}`;
    const jumping = lastJump.current !== jump;
    const size = `${element.clientWidth}/${element.clientHeight}`;
    if (jumping) {
      pendingMonth.current = lastJump.current ? monthStart(selectedDay) : null;
      lastJump.current = jump;
      position.current = { year, offset: 0 };
    }
    if (!jumping && lastViewport.current && lastViewport.current !== size) {
      // Column changes keep the year that was visible before the resize.
      position.current = {
        year: reportedYear.current || position.current.year,
        offset: 0,
      };
    }
    lastViewport.current = size;
    const anchor = sections().find(
      (section) => section.dataset.year === position.current.year,
    );
    if (!anchor) {
      changingWindow.current = true;
      setYears(surroundingYears(position.current.year));
      return;
    }
    if (pendingMonth.current) {
      const month = anchor.querySelector<HTMLElement>(
        `[data-month="${pendingMonth.current}"]`,
      );
      if (month)
        position.current.offset = Math.max(
          0,
          month.offsetTop - anchor.offsetTop - element.clientHeight / 2,
        );
      pendingMonth.current = null;
    }
    // Keep the same content under the viewport when years enter or leave the window.
    element.scrollTop = anchor.offsetTop + position.current.offset;
    changingWindow.current = false;
    reportVisibleYear();
  }, [years, year, selectedDay, scrollRequest, viewport, onVisibleYear]);

  function onScroll() {
    const element = scroll.current;
    if (!element || changingWindow.current) return;
    if (
      lastViewport.current !== `${element.clientWidth}/${element.clientHeight}`
    )
      return;
    const anchor = sections()
      .reverse()
      .find((section) => section.offsetTop <= element.scrollTop + 1);
    if (!anchor?.dataset.year) return;
    position.current = {
      year: anchor.dataset.year,
      offset: element.scrollTop - anchor.offsetTop,
    };
    reportVisibleYear();
    const nearStart = element.scrollTop < element.clientHeight;
    const nearEnd =
      element.scrollHeight - element.clientHeight - element.scrollTop <
      element.clientHeight;
    if (nearStart || nearEnd) {
      const nextYears = surroundingYears(anchor.dataset.year);
      if (nextYears[0] !== years[0]) {
        changingWindow.current = true;
        setYears(nextYears);
      }
    }
  }

  return (
    <div
      className="year-calendar"
      ref={scroll}
      role="region"
      aria-label={t("Scroll year calendar")}
      tabIndex={0}
      onScroll={onScroll}
    >
      {years.map((visibleYear) => (
        <section
          className="year-section"
          data-year={visibleYear}
          key={visibleYear}
          aria-label={visibleYear}
        >
          <h2 className="year-section-heading">
            {cal.dateLabel(
              `${visibleYear}-01-01`,
              { year: "numeric" },
              monthProps.state.settings.language,
            )}
          </h2>
          <YearMonths year={visibleYear} {...monthProps} />
        </section>
      ))}
    </div>
  );
}

const YearMonths = memo(function YearMonths({
  year,
  state,
  today,
  holidays,
  onMonth,
  onSelect,
}: YearMonthsProps) {
  const t = useInterfaceText();
  const { settings } = state;
  const months = Array.from(
    { length: 12 },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}-01`,
  );
  const scheduledDates = useMemo(() => {
    const dates = new Set<string>();
    for (
      let date = `${year}-01-01`;
      date.slice(0, 4) === year;
      date = cal.addDays(date, 1)
    ) {
      if (
        cal.slotsFor(state, date).length ||
        cal.allDaySlotsFor(state, date).length
      )
        dates.add(date);
    }
    return dates;
  }, [state, year]);
  const dayLabels = weekdays(settings, "narrow");

  return (
    <div className="year-months">
      {months.map((month) => {
        const dates = monthDays(month, settings.weekStartsOn);
        const monthLabel = cal.dateLabel(
          month,
          { month: "long", year: "numeric" },
          settings.language,
        );
        return (
          <section
            key={month}
            data-month={month}
            className={`year-month ${settings.showWeekNumbers ? "show-week-numbers" : ""}`}
            aria-label={monthLabel}
          >
            <h3>
              <button
                aria-label={t("View {v0}", { v0: monthLabel })}
                onClick={() => onMonth(month)}
              >
                {cal.dateLabel(month, { month: "long" }, settings.language)}
              </button>
            </h3>
            <div className="year-weekdays" aria-hidden="true">
              {settings.showWeekNumbers && <span>{t("Wk")}</span>}
              {dayLabels.map((day, index) => (
                <span key={index}>{day}</span>
              ))}
            </div>
            <div className="year-days">
              {dates.map((date, index) => {
                const inMonth = monthStart(date) === month;
                const dateLabel = inMonth
                  ? cal.dateLabel(
                      date,
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      },
                      settings.language,
                    )
                  : "";
                const context = inMonth
                  ? [
                      ...holidays(date).map(holidayLabel),
                      ...(scheduledDates.has(date)
                        ? [t("Has scheduled events")]
                        : []),
                    ].join(" · ")
                  : "";
                return (
                  <Fragment key={`${date}/${index}`}>
                    {settings.showWeekNumbers && index % 7 === 0 && (
                      <span
                        className="year-week-number"
                        aria-label={t("Week {v0}", {
                          v0: weekNumber(date, settings.weekStartsOn),
                        })}
                      >
                        {weekNumber(date, settings.weekStartsOn)}
                      </span>
                    )}
                    {inMonth ? (
                      <button
                        className={`year-day ${scheduledDates.has(date) ? "has-events" : ""}`}
                        aria-label={t("View {v0}", { v0: dateLabel })}
                        aria-description={context || undefined}
                        aria-current={date === today ? "date" : undefined}
                        title={context || undefined}
                        onClick={() => onSelect(date)}
                      >
                        {Number(date.slice(-2))}
                        {scheduledDates.has(date) && (
                          <span className="year-event-dot" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                  </Fragment>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
});
