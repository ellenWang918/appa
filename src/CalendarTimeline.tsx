import { useInterfaceText } from "./InterfaceLanguage";
import type { CSSProperties, RefObject, MouseEvent } from "react";
import { Check, LockSimple } from "@phosphor-icons/react";
import { clockTime } from "./CalendarViews";
import type { CalendarState, HolidayLookup, Slot } from "./types";
import * as cal from "./calendar";
import { holidayLabel } from "./holidayDates";

const timelineEnd = 24 * 60;
const hours = Array.from({ length: 25 }, (_, i) => i * 60);

export function CalendarTimeline({
  dates,
  state,
  selectedDay,
  selectedTask,
  today,
  holidays,
  currentMinute,
  onDate,
  onSlot,
  scrollRef,
  gridRef,
}: {
  dates: string[];
  state: CalendarState;
  selectedDay: string;
  selectedTask: string | null;
  today: string;
  holidays: HolidayLookup;
  currentMinute: number;
  onDate: (date: string) => void;
  onSlot: (slot: Slot, anchor: HTMLElement) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useInterfaceText();

  const singleDay = dates.length === 1;
  const slotsByDay = dates.map((date) => ({
    date,
    slots: cal.slotsFor(state, date),
  }));
  const shortestSlot = slotsByDay
    .flatMap(({ slots }) => slots)
    .reduce((minutes, slot) => Math.min(minutes, slot.duration), 60);
  // Reserve at least 20px per short step while keeping empty hours compact.
  const hourHeight = Math.max(56, Math.ceil((20 * 60) / shortestSlot));
  const currentDayIndex = dates.indexOf(today);
  const gridStyle = {
    "--day-count": dates.length,
    "--hour-count": 24,
    "--hour-height": `${hourHeight}px`,
  } as CSSProperties;

  return (
    <div
      className={`week-scroll${singleDay ? " day-scroll" : ""}`}
      ref={scrollRef}
      tabIndex={0}
      role="region"
      aria-label={t("Scroll {v0} calendar", {
        v0: singleDay ? t("day") : t("week"),
      })}
    >
      <div
        className={`week-board${singleDay ? " single-day-board" : ""}`}
        style={gridStyle}
      >
        {!singleDay && (
          <div className="day-headers">
            <div />
            {dates.map((date) => (
              <button
                className={`day-header ${date === selectedDay ? "current" : ""} ${holidays(date).length ? "has-holiday" : ""}`}
                key={date}
                aria-pressed={date === selectedDay}
                onClick={() => onDate(date)}
                title={
                  holidays(date).map(holidayLabel).join(" · ") || undefined
                }
              >
                <span>
                  {cal.dateLabel(
                    date,
                    { weekday: "short" },
                    state.settings.language,
                  )}
                </span>
                <strong>{Number(date.slice(-2))}</strong>
                {date === today && (
                  <span className="sr-only">{t("Today")}</span>
                )}
                {holidays(date).length > 0 && (
                  <small className="header-holiday">
                    {holidays(date).map(holidayLabel).join(" · ")}
                  </small>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="time-grid" ref={gridRef}>
          <div className="time-gutter">
            {hours.map((minute) => (
              <span
                key={minute}
                style={{ top: `${(minute / timelineEnd) * 100}%` }}
              >
                {clockTime(minute)}
              </span>
            ))}
          </div>
          {slotsByDay.map(({ date, slots }) => (
            <div className="day-column" key={date}>
              {hours.map((minute) => (
                <div
                  className="grid-line"
                  key={minute}
                  style={{ top: `${(minute / timelineEnd) * 100}%` }}
                />
              ))}
              {slots.map((slot, index) => (
                <CalendarEvent
                  key={slot.id}
                  slot={slot}
                  state={state}
                  available={
                    (slots[index + 1]?.start ?? timelineEnd) - slot.start
                  }
                  selected={slot.tasks.some((task) => task.id === selectedTask)}
                  onClick={(event) => onSlot(slot, event.currentTarget)}
                />
              ))}
            </div>
          ))}
          {currentDayIndex >= 0 && (
            <div
              className="current-time-indicator"
              role="img"
              aria-label={t("Current time: {v0}", {
                v0: clockTime(currentMinute),
              })}
              style={
                {
                  top: `${(currentMinute / timelineEnd) * 100}%`,
                  "--current-day-index": currentDayIndex,
                } as CSSProperties
              }
            >
              <time
                className="current-time-label"
                dateTime={clockTime(currentMinute)}
              >
                {clockTime(currentMinute)}
              </time>
              <span className="current-time-line" aria-hidden="true" />
              <span className="current-time-today" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarEvent({
  slot,
  state,
  onClick,
  available,
  selected,
}: {
  slot: Slot;
  state: CalendarState;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  available: number;
  selected: boolean;
}) {
  const t = useInterfaceText();

  const task = slot.chosen || slot.tasks[0],
    goal = cal.goalFor(state, task),
    shared = slot.tasks.length > 1 && !slot.chosen,
    blocked = cal.isBlocked(state, task);
  if (!goal) return null;
  return (
    <button
      className={`calendar-event ${goal.color} ${shared ? "shared" : ""} ${slot.done ? "done" : ""} ${blocked ? "blocked" : ""} ${slot.duration < 40 ? "compact" : ""} ${selected ? "selected" : ""}`}
      style={{
        top: `${(slot.start / timelineEnd) * 100}%`,
        height: `min(max(18px, calc(${(slot.duration / timelineEnd) * 100}% - 2px)), calc(${(available / timelineEnd) * 100}% - 1px))`,
        maxHeight: `calc(${(available / timelineEnd) * 100}% - 1px)`,
      }}
      title={`${shared ? "Choose one" : task.title} · ${goal.name}`}
      onClick={onClick}
      aria-label={t("{v0}, {v1} minutes, {v2}{v3}", {
        v0: shared ? t("Choose one") : task.title,
        v1: slot.duration,
        v2: cal.timeLabel(slot.start),
        v3: blocked ? t(", prerequisite unfinished") : "",
      })}
    >
      <strong>
        {slot.done && <Check size={13} />}
        {blocked && <LockSimple size={11} />}
        {shared ? t("Choose one") : task.title}
        {slot.duration < 40 && (
          <span className="event-start">{clockTime(slot.start)}</span>
        )}
      </strong>
      <span className="event-minutes">
        {clockTime(slot.start)} {t("–")} {clockTime(slot.start + slot.duration)}
      </span>
      {shared ? (
        <span className="event-options">
          {slot.tasks.map((t) => `${t.title} ${t.minutes} min`).join(" / ")}
        </span>
      ) : (
        <small>{goal.name}</small>
      )}
    </button>
  );
}
