import { useActionGuard, useUnsavedChanges } from "./ActionGuard";
import { useId, useState } from "react";
import type { EventRepeatChoice, Task, TaskEdit } from "./types";
import { useInterfaceText } from "./InterfaceLanguage";
import { CalendarBlank, Clock } from "@phosphor-icons/react";
import { clockTime } from "./CalendarViews";
import { errorMessage } from "./errors";
import { AllDayToggle } from "./AllDayToggle";
import { EventRepeatSelect } from "./EventRepeatSelect";

export function TaskEditor({
  task,
  goalName,
  repeat = "none",
  today,
  onClose,
  onSave,
}: {
  task: Task;
  goalName: string;
  repeat?: EventRepeatChoice;
  today: string;
  onClose: () => void;
  onSave: (edit: TaskEdit) => void;
}) {
  const errorId = useId();
  const t = useInterfaceText();
  const guard = useActionGuard();
  const [error, setError] = useState("");
  const [allDay, setAllDay] = useState(!!task.allDay);
  const [repeatChoice, setRepeatChoice] = useState(repeat);
  const [startTime, setStartTime] = useState(
    clockTime(task.allDay ? 540 : task.start),
  );
  const [endTime, setEndTime] = useState(
    clockTime(task.allDay ? 570 : (task.start + task.minutes) % 1440),
  );
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.date);
  useUnsavedChanges({ title, date, allDay, repeatChoice, startTime, endTime });
  return (
    <form
      className="task-card-editor"
      aria-describedby={error ? errorId : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const values = new FormData(event.currentTarget);
          const toMinute = (value: string) => {
            const [hour, minute] = value.split(":").map(Number);
            return hour * 60 + minute;
          };
          const start = toMinute(startTime);
          const end = toMinute(endTime);
          onSave({
            title: String(values.get("title")),
            date: String(values.get("date")),
            start: allDay ? 0 : start,
            minutes: allDay
              ? 1440
              : (end === 0 && start > 0 ? 1440 : end) - start,
            ...(task.goalId === null ? { allDay, repeat: repeatChoice } : {}),
          });
        } catch (caught) {
          setError(errorMessage(caught));
        }
      }}
    >
      <div className="task-card-main">
        <p className="task-card-goal">{goalName}</p>
        <label className="task-card-title-field">
          <span className="sr-only">
            {task.goalId === null ? t("Event name") : t("Task name")}
          </span>
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            maxLength={180}
            required
          />
        </label>
        {task.goalId === null && (
          <AllDayToggle
            checked={allDay}
            onChange={(value) => {
              setError("");
              setAllDay(value);
            }}
          />
        )}
        <div className="task-card-edit-row">
          <CalendarBlank size={21} aria-hidden="true" />
          <label>
            <span className="sr-only">{t("Date")}</span>
            <input
              type="date"
              name="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              min={task.goalId === null ? undefined : today}
              required
            />
          </label>
        </div>
        {!allDay && (
          <div className="task-card-edit-row">
            <Clock size={21} aria-hidden="true" />
            <div className="task-card-time-fields">
              <label>
                <span className="sr-only">{t("Start time")}</span>
                <input
                  type="time"
                  name="start"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                />
              </label>
              <span aria-hidden="true">–</span>
              <label>
                <span className="sr-only">{t("End time")}</span>
                <input
                  type="time"
                  name="end"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  required
                />
              </label>
            </div>
          </div>
        )}
        {task.goalId === null && (
          <>
            <EventRepeatSelect
              value={repeatChoice}
              onChange={(value) => {
                setError("");
                setRepeatChoice(value);
              }}
            />
            {(task.eventSeriesId || repeatChoice !== "none") && (
              <p className="small muted">
                {t(
                  "Changes apply to this event. Changing Repeat updates this and following events.",
                )}
              </p>
            )}
          </>
        )}
        {task.activityId && (
          <p className="small muted">
            {t(
              "Changes apply to this occurrence only. Future repeats stay unchanged.",
            )}
          </p>
        )}
        {error && (
          <p id={errorId} className="inline-error" role="alert">
            {t(error)}
          </p>
        )}
      </div>
      <div className="task-card-actions">
        <button
          type="button"
          className="task-card-secondary"
          onClick={() => guard.request(onClose)}
        >
          {t("Cancel")}
        </button>
        <button type="submit" className="task-card-primary">
          {t("Update")}
        </button>
      </div>
    </form>
  );
}
