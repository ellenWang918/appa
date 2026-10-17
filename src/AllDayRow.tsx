import type { CalendarState, EventDraft, HolidayLookup, Slot } from "./types";
import { useInterfaceText } from "./InterfaceLanguage";
import * as cal from "./calendar";
import { holidayLabel } from "./holidayDates";
import { EventReservation } from "./EventReservation";

export function AllDayRow({
  dates,
  state,
  today,
  holidays,
  selectedTask,
  draft,
  onSlot,
  onCreate,
  onDraftAnchor,
}: {
  dates: string[];
  state: CalendarState;
  today: string;
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
}) {
  const t = useInterfaceText();
  return (
    <section
      className="all-day-row"
      aria-label={t("All-day events and public holidays")}
    >
      <span className="all-day-label">{t("All day")}</span>
      {dates.map((date) => (
        <div className="all-day-cell" key={date}>
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
          {draft?.reservationAllDay && draft.date === date && (
            <EventReservation draft={draft} onAnchor={onDraftAnchor} />
          )}
        </div>
      ))}
    </section>
  );
}
