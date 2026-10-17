import { useActionGuard, useUnsavedChanges } from "./ActionGuard";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import type { EventDraft, TaskEdit } from "./types";
import { useInterfaceText } from "./InterfaceLanguage";
import { IconButton } from "./ui";
import { clockTime } from "./CalendarViews";
import { errorMessage } from "./errors";
import { useFloatingCard } from "./useFloatingCard";
import { AllDayToggle } from "./AllDayToggle";
import { EventRepeatSelect } from "./EventRepeatSelect";

export function EventCreator({
  draft,
  anchor,
  trigger,
  timezone,
  onClose,
  onDraftChange,
  onSave,
}: {
  draft: EventDraft;
  anchor: HTMLElement | null;
  trigger: HTMLElement | null;
  today: string;
  timezone: string;
  onClose: (restoreFocus?: boolean) => void;
  onDraftChange: (changes: Partial<TaskEdit>) => void;
  onSave: (event: TaskEdit) => void;
}) {
  const t = useInterfaceText();
  const guard = useActionGuard();
  const errorId = useId();
  const headingId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const { ref, position } = useFloatingCard(
    anchor ?? trigger,
    `${draft.date}/${draft.start}/${draft.minutes}`,
    true,
  );
  const [error, setError] = useState("");
  const [date, setDate] = useState(draft.date);
  const [startTime, setStartTime] = useState(clockTime(draft.start));
  const [endTime, setEndTime] = useState(
    clockTime((draft.start + draft.minutes) % 1440),
  );
  useUnsavedChanges({
    title: draft.title,
    date,
    startTime,
    endTime,
    allDay: !!draft.allDay,
    repeat: draft.repeat ?? "none",
  });
  const minuteFor = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (guard.confirming()) return;
      const target = event.target;
      if (
        target instanceof Node &&
        !ref.current?.contains(target) &&
        !anchor?.contains(target) &&
        !trigger?.contains(target)
      )
        onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (guard.confirming()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose(true);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, trigger, onClose, ref]);

  function updateTime(from: string, to: string) {
    if (!from || !to) return;
    const start = minuteFor(from);
    const end = minuteFor(to) || (start > 0 ? 1440 : 0);
    if (end - start >= 5) onDraftChange({ start, minutes: end - start });
  }

  return (
    <section
      ref={ref}
      className="task-card event-creator"
      role="region"
      aria-labelledby={headingId}
      style={position}
    >
      <IconButton
        showTooltip={false}
        className="task-card-close"
        aria-label={t("Close event creation")}
        onClick={() => onClose(true)}
      >
        <X size={16} />
      </IconButton>
      <h2 id={headingId} className="event-creator-heading">
        {t("Create event")}
      </h2>
      <form
        className="event-creator-form"
        aria-describedby={error ? errorId : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const values = new FormData(event.currentTarget);
            const from = minuteFor(startTime);
            const to = minuteFor(endTime);
            onSave({
              title: String(values.get("title")).trim() || t("New event"),
              date: String(values.get("date")),
              start: draft.allDay ? 0 : from,
              minutes: draft.allDay
                ? 1440
                : (to === 0 && from > 0 ? 1440 : to) - from,
              ...(draft.allDay ? { allDay: true } : {}),
              repeat: draft.repeat ?? "none",
            });
          } catch (caught) {
            setError(errorMessage(caught));
          }
        }}
        onChange={() => setError("")}
      >
        <label className="field">
          {t("Event name")}
          <input
            ref={nameRef}
            name="title"
            placeholder={t("New event")}
            value={draft.title}
            onChange={(event) => onDraftChange({ title: event.target.value })}
            maxLength={180}
          />
        </label>
        <AllDayToggle
          checked={!!draft.allDay}
          onChange={(allDay) => {
            setError("");
            onDraftChange({ allDay });
          }}
        />
        <label className="field">
          {t("Date")}
          <input
            type="date"
            name="date"
            value={date}
            onChange={(event) => {
              const value = event.target.value;
              setDate(value);
              if (value) onDraftChange({ date: value });
            }}
            required
          />
        </label>
        {!draft.allDay && (
          <div className="two-fields">
            <label className="field">
              {t("Start time")}
              <input
                type="time"
                name="start"
                value={startTime}
                required
                onChange={(event) => {
                  const value = event.target.value;
                  if (value && startTime && endTime) {
                    const previousStart = minuteFor(startTime);
                    const previousEnd = minuteFor(endTime) || 1440;
                    const duration = Math.max(5, previousEnd - previousStart);
                    const end = Math.min(1440, minuteFor(value) + duration);
                    const nextEnd = clockTime(end % 1440);
                    setEndTime(nextEnd);
                    updateTime(value, nextEnd);
                  } else {
                    updateTime(value, endTime);
                  }
                  setStartTime(value);
                }}
              />
            </label>
            <label className="field">
              {t("End time")}
              <input
                type="time"
                name="end"
                value={endTime}
                required
                onChange={(event) => {
                  setEndTime(event.target.value);
                  updateTime(startTime, event.target.value);
                }}
              />
            </label>
          </div>
        )}
        <EventRepeatSelect
          value={draft.repeat ?? "none"}
          onChange={(repeat) => {
            setError("");
            onDraftChange({ repeat });
          }}
        />
        {draft.allDay && (
          <p className="small muted">
            {t("Moves to the All day row when saved.")}
          </p>
        )}
        {!draft.allDay && (
          <p className="small muted event-timezone">
            {t("Times are in {timezone}.", {
              timezone: timezone.replaceAll("_", " "),
            })}
          </p>
        )}
        {error && (
          <p id={errorId} className="inline-error" role="alert">
            {t(error)}
          </p>
        )}
        <div className="task-card-actions">
          <button
            type="button"
            className="task-card-secondary"
            onClick={() => onClose(true)}
          >
            {t("Cancel")}
          </button>
          <button type="submit" className="task-card-primary">
            {t("Save event")}
          </button>
        </div>
      </form>
    </section>
  );
}
