import { useEffect, useRef, useState } from "react";
import { DotsThree, Check, X } from "@phosphor-icons/react";
import type { CalendarState, GoalColor } from "./types";
import { personalCalendarFor } from "./calendar";
import { useInterfaceText } from "./InterfaceLanguage";
import { useActionGuard, useUnsavedChanges } from "./ActionGuard";
import { DestructiveAction } from "./DestructiveAction";
import { errorMessage } from "./errors";

const colours = [
  ["indigo", "Sage"],
  ["slate", "Slate blue"],
  ["amber", "Ochre"],
  ["rose", "Dusty plum"],
  ["clay", "Clay"],
  ["teal", "Muted teal"],
] as const;

export function CalendarSection({
  state,
  onToggle,
  onSave,
  onDelete,
  onBackup,
}: {
  state: CalendarState;
  onToggle: () => void;
  onSave: (name: string, color: GoalColor) => void;
  onDelete: () => void;
  onBackup: () => void;
}) {
  const t = useInterfaceText();
  const group = personalCalendarFor(state);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || root.current?.contains(target))
        return;
      if (
        target.closest("dialog") &&
        target.closest("dialog") !== root.current?.closest("dialog")
      )
        return;
      setMenu(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const count = state.tasks.filter((task) => task.goalId === null).length;
  const completed = state.tasks.filter(
    (task) => task.goalId === null && task.status === "done",
  ).length;
  return (
    <section
      ref={root}
      className="goal-group personal-calendar"
      aria-label={t("Calendar")}
    >
      <h2>{t("Calendar")}</h2>
      {!group ? (
        <p className="small muted">
          {t("Create an event to start a new personal calendar.")}
        </p>
      ) : editing ? (
        <InlineCalendarEditor
          group={group}
          onCancel={() => setEditing(false)}
          onSave={(name, color) => {
            onSave(name, color);
            setEditing(false);
          }}
        />
      ) : (
        <div className="calendar-group-row" data-goal-color={group.color}>
          <label className="calendar-group-label">
            <input
              className="calendar-visibility"
              type="checkbox"
              checked={group.visible}
              onChange={onToggle}
              aria-label={t("Show {name} events", { name: group.name })}
            />
            <span>{group.name}</span>
          </label>
          <button
            type="button"
            className="calendar-group-menu-trigger"
            aria-label={t("Calendar options for {name}", { name: group.name })}
            aria-expanded={menu}
            aria-haspopup="true"
            onClick={() => setMenu(!menu)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setMenu(false);
              }
            }}
          >
            <DotsThree size={19} aria-hidden="true" />
          </button>
          {menu && (
            <div
              className="calendar-group-menu"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setMenu(false);
                }
              }}
            >
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setMenu(false);
                  setEditing(true);
                }}
              >
                {t("Edit calendar")}
              </button>
              <DestructiveAction
                label="Delete calendar"
                resourceName={group.name}
                impact={
                  count >= 30 || completed >= 10
                    ? "high"
                    : count || state.eventSeries?.length
                      ? "moderate"
                      : "low"
                }
                description={t(
                  "Delete {name} and all its personal events, completed history and repeating series? Goal tasks will stay.",
                  { name: group.name },
                )}
                onBackup={onBackup}
                onConfirm={onDelete}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function InlineCalendarEditor({
  group,
  onSave,
  onCancel,
}: {
  group: NonNullable<ReturnType<typeof personalCalendarFor>>;
  onSave: (name: string, color: GoalColor) => void;
  onCancel: () => void;
}) {
  const t = useInterfaceText();
  const guard = useActionGuard();
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color);
  const [palette, setPalette] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLFormElement>(null);
  useUnsavedChanges({ name, color });
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setPalette(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <form
      ref={root}
      className="calendar-inline-editor"
      data-goal-color={color}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          onSave(name, color);
        } catch (caught) {
          setError(errorMessage(caught));
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (palette) setPalette(false);
          else guard.request(onCancel);
        }
      }}
    >
      <div className="calendar-group-row">
        <button
          type="button"
          className="calendar-colour-trigger"
          aria-label={t("Change calendar colour")}
          aria-expanded={palette}
          aria-haspopup="true"
          onClick={() => setPalette(!palette)}
        />
        <input
          autoFocus
          className="calendar-name-input"
          aria-label={t("Calendar name")}
          value={name}
          maxLength={120}
          required
          onChange={(event) => {
            setName(event.target.value);
            setError("");
          }}
        />
        <button
          type="submit"
          className="calendar-inline-action"
          aria-label={t("Save calendar")}
        >
          <Check size={16} />
        </button>
        <button
          type="button"
          className="calendar-inline-action"
          aria-label={t("Cancel calendar editing")}
          onClick={() => guard.request(onCancel)}
        >
          <X size={16} />
        </button>
      </div>
      {palette && (
        <fieldset className="calendar-colour-palette">
          <legend>{t("Colour")}</legend>
          <div>
            {colours.map(([value, label]) => (
              <label key={value} data-goal-color={value} title={t(label)}>
                <input
                  type="radio"
                  name="calendar-colour"
                  value={value}
                  checked={color === value}
                  aria-label={t(label)}
                  onChange={() => setColor(value)}
                />
                <span aria-hidden="true" />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {t(error)}
        </p>
      )}
    </form>
  );
}
