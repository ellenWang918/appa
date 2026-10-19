import type {
  CalendarState,
  EventDraft,
  HolidayLookup,
  Slot,
  Todo,
} from "./types";
import { useState } from "react";
import { useInterfaceText } from "./InterfaceLanguage";
import * as cal from "./calendar";
import { holidayLabel } from "./holidayDates";
import { EventReservation } from "./EventReservation";

export function AllDayRow({
  dates,
  state,
  holidays,
  selectedTask,
  draft,
  onSlot,
  onCreate,
  onDraftAnchor,
  draggedTodo,
  onScheduleTodo,
}: {
  dates: string[];
  state: CalendarState;
  holidays: HolidayLookup;
  selectedTask: string | null;
  draft: EventDraft | null;
  onSlot: (slot: Slot, anchor: HTMLElement) => void;
  onCreate: (
    date: string,
    start: number,
    trigger: HTMLElement,
    allDay?: boolean,
  ) => void;
  onDraftAnchor: (element: HTMLElement | null) => void;
  draggedTodo: Todo | null;
  onScheduleTodo: (
    todo: Todo,
    date: string,
    start: number,
    allDay?: boolean,
  ) => void;
}) {
  const t = useInterfaceText();
  const [dropDate, setDropDate] = useState<string | null>(null);
  return (
    <section
      className="all-day-row"
      aria-label={t("All-day events and public holidays")}
    >
      <span className="all-day-label">{t("All day")}</span>
      {dates.map((date) => (
        <div
          className={`all-day-cell${cal.isWeekend(date) ? " is-weekend" : ""}${draggedTodo && dropDate === date ? " todo-drop-cell" : ""}`}
          key={date}
          data-goal-color={cal.personalCalendarFor(state)?.color ?? "slate"}
          onDragOver={(event) => {
            if (draggedTodo) {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              setDropDate(date);
            }
          }}
          onDragLeave={(event) => {
            if (
              !(event.relatedTarget instanceof Node) ||
              !event.currentTarget.contains(event.relatedTarget)
            )
              setDropDate(null);
          }}
          onDrop={(event) => {
            if (!draggedTodo) return;
            event.preventDefault();
            event.stopPropagation();
            setDropDate(null);
            onScheduleTodo(draggedTodo, date, 0, true);
          }}
        >
          <button
            className="calendar-create-area"
            aria-description={t(
              "Double-click or press Enter to create an event.",
            )}
            aria-label={t("Create all-day event on {date}", {
              date: cal.dateLabel(
                date,
                { weekday: "long", day: "numeric", month: "long" },
                state.settings.language,
              ),
            })}
            onClick={(event) => {
              if (event.detail === 0)
                onCreate(date, 540, event.currentTarget, true);
            }}
            onDoubleClick={(event) =>
              onCreate(date, 540, event.currentTarget, true)
            }
          />
          {holidays(date).map((holiday) => (
            <p
              className="all-day-holiday"
              key={`${holiday.name}/${holiday.startMinute}`}
              title={holidayLabel(holiday)}
            >
              {holidayLabel(holiday)}
            </p>
          ))}
          {cal.allDaySlotsFor(state, date).map((slot) => {
            const task = slot.tasks[0];
            return (
              <button
                key={slot.id}
                data-goal-color={cal.personalCalendarFor(state)?.color}
                className={`all-day-event ${slot.done ? "done" : ""} ${task.id === selectedTask ? "selected" : ""}`}
                aria-label={t("{title}, all day", { title: task.title })}
                onClick={(event) => onSlot(slot, event.currentTarget)}
              >
                {task.title}
              </button>
            );
          })}
          {draft?.reservationAllDay &&
            !draft.unscheduled &&
            draft.date === date && (
              <EventReservation draft={draft} onAnchor={onDraftAnchor} />
            )}
        </div>
      ))}
    </section>
  );
}
