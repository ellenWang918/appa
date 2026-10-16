import { IconButton } from "./ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Clock, LockSimple, Square, X } from "@phosphor-icons/react";
import type { CalendarState, Task, TaskEdit } from "./types";
import { useInterfaceText } from "./InterfaceLanguage";
import { TaskEditor } from "./TaskEditor";
import { clockTime } from "./CalendarViews";
import * as cal from "./calendar";

export function TaskCard({
  state,
  task,
  anchor,
  today,
  onClose,
  onSave,
  onComplete,
  onTask,
  onChoice,
}: {
  state: CalendarState;
  task: Task;
  anchor: HTMLElement | null;
  today: string;
  onClose: () => void;
  onSave: (edit: TaskEdit) => void;
  onComplete: () => void;
  onTask: (task: Task) => void;
  onChoice: (task: Task) => void;
}) {
  const t = useInterfaceText();
  const ref = useRef<HTMLElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const anchorRect = useRef<DOMRect | null>(null);
  const [editing, setEditing] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 80 });
  const goal = cal.goalFor(state, task)!;
  const blocked = cal.isBlocked(state, task);
  const slot = cal
    .slotsFor(state, task.date)
    .find((item) => item.id === task.slotId);
  const needsChoice =
    !!slot && slot.tasks.length > 1 && slot.chosen?.id !== task.id;
  const later = state.tasks
    .filter(
      (item) =>
        item.goalId === task.goalId &&
        item.id !== task.id &&
        item.status === "pending" &&
        (item.date > task.date ||
          (item.date === task.date && item.start > task.start)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
    .slice(0, 4);
  const canComplete =
    task.status === "pending" &&
    task.date === today &&
    !blocked &&
    !needsChoice;

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    function positionCard() {
      if (!card) return;
      if (anchor?.isConnected)
        anchorRect.current = anchor.getBoundingClientRect();
      const rect = anchorRect.current;
      const width = card.offsetWidth,
        height = card.offsetHeight;
      const gap = 12,
        margin = 16;
      const preferredLeft =
        rect && rect.right + gap + width <= window.innerWidth - margin
          ? rect.right + gap
          : rect
            ? rect.left - gap - width
            : window.innerWidth - width - margin;
      setPosition({
        left: Math.max(
          margin,
          Math.min(preferredLeft, window.innerWidth - width - margin),
        ),
        top: Math.max(
          margin,
          Math.min(rect?.top ?? 80, window.innerHeight - height - margin),
        ),
      });
    }
    positionCard();
    const observer = new ResizeObserver(positionCard);
    observer.observe(card);
    window.addEventListener("resize", positionCard);
    window.addEventListener("scroll", positionCard, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", positionCard);
      window.removeEventListener("scroll", positionCard, true);
    };
  }, [anchor]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!editing) editButton.current?.focus({ preventScroll: true });
  }, [editing]);
  useEffect(() => {
    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !ref.current?.contains(target) &&
        !anchor?.contains(target)
      )
        onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (editing) setEditing(false);
        else {
          onClose();
          anchor?.focus({ preventScroll: true });
        }
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose, editing]);

  return (
    <section
      ref={ref}
      className="task-card"
      role="region"
      aria-label={t("Task details")}
      tabIndex={-1}
      style={position}
    >
      <IconButton
        showTooltip={false}
        className="task-card-close"
        aria-label={t("Close task details")}
        onClick={() => {
          onClose();
          anchor?.focus({ preventScroll: true });
        }}
      >
        <X size={16} />
      </IconButton>
      {editing ? (
        <TaskEditor
          key={task.id}
          task={task}
          goalName={goal.name}
          today={today}
          onClose={() => setEditing(false)}
          onSave={(edit) => {
            onSave(edit);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <div className="task-card-main">
            <p className="task-card-goal">{goal.name}</p>
            <h2>{task.title}</h2>
            <p className="task-card-date">
              {cal
                .dateLabel(
                  task.date,
                  { weekday: "short", day: "numeric", month: "long" },
                  state.settings.language,
                )
                .replace(",", "")}
            </p>
            <p>
              {clockTime(task.start)} – {clockTime(task.start + task.minutes)}
            </p>
            <p className="task-card-duration">
              <Clock size={17} aria-hidden="true" />
              {t("{minutes} mins", { minutes: task.minutes })}
            </p>
          </div>
          {blocked && (
            <p className="task-card-hint">
              {t("After:")}{" "}
              {task.dependsOn
                .map(
                  (key) => state.tasks.find((item) => item.id === key)?.title,
                )
                .join(", ")}
            </p>
          )}
          {task.status === "pending" && slot && slot.tasks.length > 1 && (
            <fieldset className="task-card-choices">
              <legend>{t("Choose one activity")}</legend>
              {slot.tasks.map((item) => (
                <label key={item.id}>
                  <input
                    type="radio"
                    name={`task-card-${slot.id}`}
                    checked={slot.chosen?.id === item.id}
                    disabled={cal.isBlocked(state, item)}
                    onChange={() => onChoice(item)}
                  />
                  <span>
                    {item.title}
                    <small>
                      {item.minutes} {t("min")}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="task-card-actions">
            <button
              ref={editButton}
              className="task-card-secondary"
              disabled={task.status !== "pending"}
              onClick={() => setEditing(true)}
            >
              {t("Edit")}
            </button>
            <button
              className="task-card-primary"
              disabled={!canComplete}
              onClick={onComplete}
            >
              {task.status === "done" ? (
                <>
                  <Check size={17} />
                  {t("Completed")}
                </>
              ) : (
                t("Mark as complete")
              )}
            </button>
          </div>
          {task.status === "pending" && task.date !== today && (
            <p className="task-card-hint">
              {t("Available to complete on the scheduled day.")}
            </p>
          )}
        </>
      )}
      {later.length > 0 && (
        <section className="task-card-later">
          <h3>{t("Later Steps (scheduled)")}</h3>
          {later.map((item) => (
            <button
              className="task-card-later-step"
              key={item.id}
              onClick={() => onTask(item)}
            >
              <Square size={15} weight="fill" aria-hidden="true" />
              <span>
                {item.title}
                <small>
                  {cal.dateLabel(
                    item.date,
                    { weekday: "short", day: "numeric", month: "short" },
                    state.settings.language,
                  )}{" "}
                  · {item.minutes} {t("min")}
                </small>
              </span>
              {cal.isBlocked(state, item) && (
                <LockSimple
                  size={15}
                  weight="fill"
                  aria-label={t("Prerequisite unfinished")}
                />
              )}
            </button>
          ))}
        </section>
      )}
    </section>
  );
}
