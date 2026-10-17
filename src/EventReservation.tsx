import type { EventDraft } from "./types";
import { useInterfaceText } from "./InterfaceLanguage";
import { clockTime } from "./calendar";

export function EventReservation({
  draft,
  onAnchor,
  month = false,
}: {
  draft: EventDraft;
  onAnchor: (element: HTMLElement | null) => void;
  month?: boolean;
}) {
  const t = useInterfaceText();
  const title = draft.title.trim() || t("New event");
  const start = clockTime(draft.start);
  const end = clockTime(draft.start + draft.minutes);
  const row = month || draft.reservationAllDay;
  return (
    <div
      ref={onAnchor}
      className={`${row ? "month-task" : "calendar-event"} calendar-draft${!row && draft.minutes < 40 ? " compact" : ""}`}
      role="group"
      aria-label={
        draft.reservationAllDay
          ? t("Unsaved all-day event: {title}", { title })
          : t("Unsaved event: {title}, {start}–{end}", {
              title,
              start,
              end,
            })
      }
      style={
        row
          ? undefined
          : {
              top: `${(draft.start / 1440) * 100}%`,
              height: `max(20px, calc(${(draft.minutes / 1440) * 100}% - 2px))`,
            }
      }
    >
      {row ? (
        <span>{title}</span>
      ) : (
        <strong>
          {title}
          {draft.minutes < 40 && <span className="event-start">{start}</span>}
        </strong>
      )}
      {!draft.reservationAllDay &&
        (month ? (
          <small>{start}</small>
        ) : (
          <span className="event-minutes">
            {start} – {end}
          </span>
        ))}
    </div>
  );
}
