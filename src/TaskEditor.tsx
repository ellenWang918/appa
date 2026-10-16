import { useState } from "react";
import type { Task, TaskEdit } from "./types";
import { useInterfaceText } from "./InterfaceLanguage";
import { CalendarBlank, Clock } from "@phosphor-icons/react";
import { clockTime } from "./CalendarViews";
import { errorMessage } from "./errors";

export function TaskEditor({
  task,
  goalName,
  today,
  onClose,
  onSave,
}: {
  task: Task;
  goalName: string;
  today: string;
  onClose: () => void;
  onSave: (edit: TaskEdit) => void;
}) {
  const t = useInterfaceText();
  const [error, setError] = useState("");
  return (
    <form
      className="task-card-editor"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const values = new FormData(event.currentTarget);
          const toMinute = (value: FormDataEntryValue | null) => {
            const [hour, minute] = String(value).split(":").map(Number);
            return hour * 60 + minute;
          };
          const start = toMinute(values.get("start"));
          const end = toMinute(values.get("end"));
          onSave({
            title: String(values.get("title")),
            date: String(values.get("date")),
            start,
            minutes: (end === 0 && start > 0 ? 1440 : end) - start,
          });
        } catch (caught) {
          setError(errorMessage(caught));
        }
      }}
    >
      <div className="task-card-main">
        <p className="task-card-goal">{goalName}</p>
        <label className="task-card-title-field">
          <span className="sr-only">{t("Task name")}</span>
          <input
            name="title"
            defaultValue={task.title}
            autoFocus
            maxLength={180}
            required
          />
        </label>
        <div className="task-card-edit-row">
          <CalendarBlank size={21} aria-hidden="true" />
          <label>
            <span className="sr-only">{t("Date")}</span>
            <input
              type="date"
              name="date"
              defaultValue={task.date}
              min={today}
              required
            />
          </label>
        </div>
        <div className="task-card-edit-row">
          <Clock size={21} aria-hidden="true" />
          <div className="task-card-time-fields">
            <label>
              <span className="sr-only">{t("Start time")}</span>
              <input
                type="time"
                name="start"
                defaultValue={clockTime(task.start)}
                required
              />
            </label>
            <span aria-hidden="true">–</span>
            <label>
              <span className="sr-only">{t("End time")}</span>
              <input
                type="time"
                name="end"
                defaultValue={clockTime((task.start + task.minutes) % 1440)}
                required
              />
            </label>
          </div>
        </div>
        {task.activityId && (
          <p className="small muted">
            {t(
              "Changes apply to this occurrence only. Future repeats stay unchanged.",
            )}
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {t(error)}
          </p>
        )}
      </div>
      <div className="task-card-actions">
        <button type="button" className="task-card-secondary" onClick={onClose}>
          {t("Cancel")}
        </button>
        <button type="submit" className="task-card-primary">
          {t("Update")}
        </button>
      </div>
    </form>
  );
}
