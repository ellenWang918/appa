import { useId, useState } from "react";
import { Check, CalendarPlus, Plus } from "@phosphor-icons/react";
import type { GoalColor, Todo } from "./types";
import { useInterfaceText } from "./InterfaceLanguage";
import { errorMessage } from "./errors";
import { IconButton } from "./ui";

export function TodoPanel({
  open,
  todos,
  color,
  onAdd,
  onToggle,
  onDrag,
  onSchedule,
}: {
  open: boolean;
  todos: Todo[];
  color: GoalColor | undefined;
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
  onDrag: (todo: Todo | null) => void;
  onSchedule: (todo: Todo, trigger: HTMLElement) => void;
}) {
  const t = useInterfaceText();
  const heading = useId();
  const input = useId();
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const pending = todos.filter((todo) => !todo.done);
  const completed = todos.filter((todo) => todo.done);
  function cards(items: Todo[]) {
    return (
      <ul className="todo-cards">
        {items.map((todo) => (
          <li
            key={todo.id}
            className={`todo-card${todo.done ? " done" : ""}`}
            data-goal-color={color}
            draggable={!todo.done}
            onDragStart={(event) => {
              if (todo.done) {
                event.preventDefault();
                return;
              }
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", todo.title);
              onDrag(todo);
            }}
            onDragEnd={() => onDrag(null)}
          >
            <button
              className="todo-check"
              role="checkbox"
              aria-checked={todo.done}
              aria-label={t("Mark {title} as {status}", {
                title: todo.title,
                status: todo.done ? t("incomplete") : t("complete"),
              })}
              onClick={() => onToggle(todo.id)}
            >
              {todo.done && <Check size={13} weight="bold" />}
            </button>
            <span className="todo-title">{todo.title}</span>
            {!todo.done && (
              <IconButton
                className="todo-schedule icon-button"
                aria-label={t("Schedule {title}", { title: todo.title })}
                onClick={(event) => onSchedule(todo, event.currentTarget)}
              >
                <CalendarPlus size={16} />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <aside
      id="todo-list-panel"
      className="todo-panel"
      aria-labelledby={heading}
      hidden={!open}
    >
      <header>
        <h2 id={heading}>{t("To do list")}</h2>
        <span>{pending.length}</span>
      </header>
      <p className="todo-hint">
        {t("No date needed. Drag a card onto the calendar when you’re ready.")}
      </p>
      <form
        className="todo-add"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onAdd(title);
            setTitle("");
            setError("");
          } catch (caught) {
            setError(errorMessage(caught));
          }
        }}
      >
        <label className="sr-only" htmlFor={input}>
          {t("Add a to do")}
        </label>
        <input
          id={input}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError("");
          }}
          maxLength={180}
          placeholder={t("Add a to do…")}
          required
        />
        <IconButton
          type="submit"
          className="icon-button"
          aria-label={t("Add a to do")}
        >
          <Plus size={17} />
        </IconButton>
      </form>
      {error && (
        <p className="inline-error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="todo-list-scroll">
        {cards(pending)}
        {!pending.length && (
          <p className="todo-empty">{t("A little room for what’s next.")}</p>
        )}
        {!!completed.length && (
          <details className="todo-completed">
            <summary>
              {t("Completed")} ({completed.length})
            </summary>
            {cards(completed)}
          </details>
        )}
      </div>
    </aside>
  );
}
