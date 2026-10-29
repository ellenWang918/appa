import { useInterfaceText } from "./InterfaceLanguage";
import { useRef, useState } from "react";
import type {
  CSSProperties,
  RefObject,
  MouseEvent,
  DragEvent,
  PointerEvent,
  KeyboardEvent,
} from "react";
import { Check, LockSimple } from "@phosphor-icons/react";
import { clockTime } from "./calendar";
import { weekNumber } from "./calendarDates";
import type {
  CalendarState,
  EventDraft,
  HolidayLookup,
  Slot,
  Task,
  Todo,
  TimelineResizeEdge,
} from "./types";
import * as cal from "./calendar";
import { holidayLabel } from "./holidayDates";
import { EventReservation } from "./EventReservation";
import { AllDayRow } from "./AllDayRow";
import {
  draggableTimelineTask,
  timelineDropStart,
  validateTimelinePreview,
} from "./timelineDrag";
import { errorMessage } from "./errors";
import { useTimelineResize } from "./useTimelineResize";
import { useCalendarQueries } from "./useCalendarQueries";

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
  onMove,
  draggedTodo,
  onScheduleTodo,
  onCreate,
  draft,
  onDraftAnchor,
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
  onMove: (task: Task, date: string, start: number, minutes?: number) => void;
  draggedTodo: Todo | null;
  onScheduleTodo: (
    todo: Todo,
    date: string,
    start: number,
    allDay?: boolean,
  ) => void;
  onCreate: (
    date: string,
    start: number,
    trigger: HTMLElement,
    allDay?: boolean,
  ) => void;
  draft: EventDraft | null;
  onDraftAnchor: (element: HTMLElement | null) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
}) {
  const t = useInterfaceText();
  const resize = useTimelineResize({
    state,
    today,
    scrollRef,
    gridRef,
    onResize: (task, start, minutes) => onMove(task, task.date, start, minutes),
  });
  const source = useRef<{
    task: Task;
    color: ReturnType<typeof cal.slotGoalColor>;
    grabOffset: number;
  } | null>(null);
  const [drag, setDrag] = useState<typeof source.current>(null);
  const [target, setTarget] = useState<{
    date: string;
    start: number;
    error: string;
  } | null>(null);
  const lastTarget = useRef("");
  const movingItem = drag?.task ?? draggedTodo;
  const movingColor =
    drag?.color ?? cal.personalCalendarFor(state)?.color ?? "slate";

  function clearDrag() {
    source.current = null;
    lastTarget.current = "";
    setDrag(null);
    setTarget(null);
  }

  function dropStart(event: DragEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return timelineDropStart(
      event.clientY,
      rect.top,
      rect.height,
      source.current?.grabOffset ?? 0,
      (source.current?.task ?? draggedTodo)!.minutes,
    );
  }

  function previewDrop(event: DragEvent<HTMLDivElement>, date: string) {
    if (!source.current && !draggedTodo) return;
    event.preventDefault();
    event.stopPropagation();
    const start = dropStart(event);
    const key = `${movingItem?.id}/${date}/${start}/${state.revision}`;
    if (lastTarget.current === key) {
      event.dataTransfer.dropEffect = target?.error ? "none" : "move";
      return;
    }
    let error = "";
    try {
      if (source.current)
        validateTimelinePreview(
          state,
          source.current.task,
          date,
          start,
          source.current.task.minutes,
          today,
        );
      else cal.scheduleTodo(state, draggedTodo!.id, date, start, today);
    } catch (caught) {
      error = errorMessage(caught);
    }
    event.dataTransfer.dropEffect = error ? "none" : "move";
    lastTarget.current = key;
    setTarget({ date, start, error });
  }

  const singleDay = dates.length === 1;
  const visibleState = cal.calendarDisplayState(state);
  const queries = useCalendarQueries(state);
  const slotsByDay = dates.map((date) => ({
    date,
    slots: queries.slotsFor(date),
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
      className={`week-scroll${singleDay ? " day-scroll" : ""}${resize.preview ? " is-resizing-event" : ""}`}
      ref={scrollRef}
      tabIndex={0}
      role="region"
      aria-label={t("Scroll {v0} calendar", {
        v0: singleDay ? t("day") : t("week"),
      })}
      onDragOver={() => {
        lastTarget.current = "";
        setTarget(null);
      }}
      onDragLeave={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX >= rect.right ||
          event.clientY < rect.top ||
          event.clientY >= rect.bottom
        ) {
          lastTarget.current = "";
          setTarget(null);
        }
      }}
    >
      <span className="sr-only" role="status">
        {resize.preview &&
          (resize.preview.error ||
            t("Resize {title} to {start}–{end}, {minutes} minutes", {
              title: resize.preview.task.title,
              start: clockTime(resize.preview.start),
              end: clockTime(resize.preview.start + resize.preview.minutes),
              minutes: resize.preview.minutes,
            }))}
        {target &&
          movingItem &&
          (target.error ||
            t("Move {title} to {date}, {start}–{end}", {
              title: movingItem.title,
              date: target.date,
              start: clockTime(target.start),
              end: clockTime(target.start + movingItem.minutes),
            }))}
      </span>
      <div
        className={`week-board${singleDay ? " single-day-board" : ""}`}
        style={gridStyle}
      >
        <div className="timeline-heading">
          {!singleDay && (
            <div className="day-headers">
              <span className="timeline-week-number">
                {state.settings.showWeekNumbers && (
                  <span
                    title={t("Week {v0}", {
                      v0: weekNumber(dates[0], state.settings.weekStartsOn),
                    })}
                  >
                    {t("Wk {v0}", {
                      v0: weekNumber(dates[0], state.settings.weekStartsOn),
                    })}
                  </span>
                )}
              </span>
              {dates.map((date) => (
                <button
                  className={`day-header ${date === selectedDay ? "current" : ""} ${holidays(date).length ? "has-holiday" : ""} ${cal.isWeekend(date) ? "is-weekend" : ""}`}
                  key={date}
                  aria-pressed={date === selectedDay}
                  aria-current={date === today ? "date" : undefined}
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
                </button>
              ))}
            </div>
          )}
          <AllDayRow
            queries={queries}
            dates={dates}
            state={visibleState}
            holidays={holidays}
            selectedTask={selectedTask}
            draft={draft}
            onSlot={onSlot}
            onCreate={onCreate}
            onDraftAnchor={onDraftAnchor}
            draggedTodo={draggedTodo}
            onScheduleTodo={onScheduleTodo}
          />
        </div>
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
            <div
              className={`day-column${cal.isWeekend(date) ? " is-weekend" : ""}`}
              key={date}
              onDragOver={(event) => previewDrop(event, date)}
              onDrop={(event) => {
                if (!source.current && !draggedTodo) return;
                event.preventDefault();
                event.stopPropagation();
                const task = source.current?.task;
                const start = dropStart(event);
                clearDrag();
                if (task) onMove(task, date, start);
                else onScheduleTodo(draggedTodo!, date, start);
              }}
            >
              <button
                className="calendar-create-area"
                aria-description={t(
                  "Double-click or press Enter to create an event.",
                )}
                aria-label={t("Create event on {date}", {
                  date: cal.dateLabel(
                    date,
                    { weekday: "long", day: "numeric", month: "long" },
                    state.settings.language,
                  ),
                })}
                onClick={(event) => {
                  if (event.detail === 0)
                    onCreate(date, 540, event.currentTarget);
                }}
                onDoubleClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const minute =
                    event.detail === 0
                      ? 540
                      : Math.floor(
                          (((event.clientY - rect.top) / rect.height) *
                            timelineEnd) /
                            15,
                        ) * 15;
                  onCreate(
                    date,
                    Math.max(0, Math.min(1435, minute)),
                    event.currentTarget,
                  );
                }}
              />
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
                  dragging={slot.tasks.some(
                    (task) =>
                      task.id === drag?.task.id ||
                      task.id === resize.preview?.task.id,
                  )}
                  onDragStart={(event) => {
                    const task = draggableTimelineTask(state, slot);
                    if (!task || draft || resize.preview) {
                      event.preventDefault();
                      return;
                    }
                    const rect = event.currentTarget.getBoundingClientRect();
                    const column =
                      event.currentTarget.closest<HTMLElement>(".day-column")!;
                    source.current = {
                      task,
                      color: cal.slotGoalColor(state, slot),
                      grabOffset:
                        ((event.clientY - rect.top) / column.clientHeight) *
                        timelineEnd,
                    };
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", task.title);
                    setDrag(source.current);
                  }}
                  onDragEnd={clearDrag}
                  draggable={
                    !draft &&
                    !resize.preview &&
                    !!draggableTimelineTask(state, slot)
                  }
                  resizable={!draft && !!draggableTimelineTask(state, slot)}
                  resizing={slot.tasks.some(
                    (task) => task.id === resize.preview?.task.id,
                  )}
                  onResizeStart={(event, edge) =>
                    resize.start(event, slot, edge)
                  }
                  onResizeMove={resize.move}
                  onResizeEnd={resize.finish}
                  onResizeCancel={resize.cancel}
                  onResizeKey={(event, edge) =>
                    resize.keyboard(event, slot, edge)
                  }
                />
              ))}
              {resize.preview?.task.date === date && (
                <div
                  className={`calendar-drop-target${resize.preview.error ? " invalid" : ""}`}
                  data-goal-color={resize.preview.color}
                  aria-hidden="true"
                  style={{
                    top: `${(resize.preview.start / timelineEnd) * 100}%`,
                    height: `max(18px, calc(${(resize.preview.minutes / timelineEnd) * 100}% - 2px))`,
                  }}
                >
                  <span className="calendar-drop-label">
                    {clockTime(resize.preview.start)} –{" "}
                    {clockTime(resize.preview.start + resize.preview.minutes)} ·{" "}
                    {resize.preview.minutes} {t("min")}
                    {resize.preview.error && (
                      <span>{resize.preview.error}</span>
                    )}
                  </span>
                </div>
              )}
              {target?.date === date && movingItem && (
                <div
                  className={`calendar-drop-target${target.error ? " invalid" : ""}`}
                  data-goal-color={movingColor}
                  aria-hidden="true"
                  style={{
                    top: `${(target.start / timelineEnd) * 100}%`,
                    height: `max(20px, calc(${(movingItem.minutes / timelineEnd) * 100}% - 2px))`,
                  }}
                >
                  <span className="calendar-drop-label">
                    {clockTime(target.start)} –{" "}
                    {clockTime(target.start + movingItem.minutes)}
                    {target.error && <span>{target.error}</span>}
                  </span>
                </div>
              )}
              {draft?.date === date &&
                !draft.unscheduled &&
                !draft.reservationAllDay && (
                  <EventReservation draft={draft} onAnchor={onDraftAnchor} />
                )}
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
  dragging,
  draggable,
  onDragStart,
  onDragEnd,
  resizable,
  resizing,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onResizeCancel,
  onResizeKey,
}: {
  slot: Slot;
  state: CalendarState;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  available: number;
  selected: boolean;
  dragging: boolean;
  draggable: boolean;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  resizable: boolean;
  resizing: boolean;
  onResizeStart: (
    event: PointerEvent<HTMLButtonElement>,
    edge: TimelineResizeEdge,
  ) => void;
  onResizeMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeEnd: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeCancel: () => void;
  onResizeKey: (
    event: KeyboardEvent<HTMLButtonElement>,
    edge: TimelineResizeEdge,
  ) => void;
}) {
  const t = useInterfaceText();

  const task = slot.chosen || slot.tasks[0],
    goal = cal.goalFor(state, task),
    shared = slot.tasks.length > 1 && !slot.chosen,
    blocked = cal.isBlocked(state, task);
  return (
    <div
      className={`timeline-event${resizing ? " resizing" : ""}`}
      data-task-id={task.id}
      data-goal-color={cal.slotGoalColor(state, slot)}
      style={{
        top: `${(slot.start / timelineEnd) * 100}%`,
        height: `min(max(18px, calc(${(slot.duration / timelineEnd) * 100}% - 2px)), calc(${(available / timelineEnd) * 100}% - 1px))`,
        maxHeight: `calc(${(available / timelineEnd) * 100}% - 1px)`,
      }}
    >
      <button
        data-goal-color={cal.slotGoalColor(state, slot)}
        className={`calendar-event ${goal?.color ?? "indigo"} ${shared ? "shared" : ""} ${slot.done ? "done" : ""} ${blocked ? "blocked" : ""} ${slot.duration < 40 ? "compact" : ""} ${selected ? "selected" : ""} ${dragging ? "dragging" : ""}`}
        title={`${shared ? "Choose one" : task.title} · ${goal?.name ?? t("Event")}`}
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        aria-description={
          draggable
            ? t(
                "Drag to move to another time. You can also change the time in Edit.",
              )
            : undefined
        }
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
          {clockTime(slot.start)} {t("–")}{" "}
          {clockTime(slot.start + slot.duration)}
        </span>
        {shared ? (
          <span className="event-options">
            {slot.tasks.map((t) => `${t.title} ${t.minutes} min`).join(" / ")}
          </span>
        ) : (
          <small>{goal?.name ?? t("Event")}</small>
        )}
      </button>
      {resizable &&
        (["start", "end"] as const).map((edge) => (
          <button
            key={edge}
            type="button"
            className={`event-resize-handle ${edge}`}
            aria-label={
              edge === "start"
                ? t("Resize start of {title}", { title: task.title })
                : t("Resize end of {title}", { title: task.title })
            }
            aria-description={t(
              "Drag or use Up and Down arrow keys to resize. Press Escape to cancel.",
            )}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerDown={(event) => onResizeStart(event, edge)}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeCancel}
            onLostPointerCapture={onResizeCancel}
            onKeyDown={(event) => onResizeKey(event, edge)}
          />
        ))}
    </div>
  );
}
