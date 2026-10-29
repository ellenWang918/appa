import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DotsThree, Check, X } from "@phosphor-icons/react";
import type { GoalColor } from "./types";
import { useInterfaceText } from "./InterfaceLanguage";
import { useActionGuard, useUnsavedChanges } from "./ActionGuard";
import { errorMessage } from "./errors";
import { ColorPicker } from "./ColorPicker";
import { IconButton } from "./ui";

export function CalendarGroupItem({
  name,
  color,
  visible,
  kind = "calendar",
  editing,
  onEdit,
  onFinishEdit,
  onToggle,
  onSave,
  onOpen,
  actions,
}: {
  name: string;
  color: GoalColor;
  visible: boolean;
  kind?: "calendar" | "goal";
  editing: boolean;
  onEdit: () => void;
  onFinishEdit: () => void;
  onToggle: () => void;
  onSave: (name: string, color: GoalColor) => void;
  onOpen?: () => void;
  actions?: (close: () => void) => ReactNode;
}) {
  const t = useInterfaceText();
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
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
  }, [menu]);
  const visibility = (
    <input
      className="calendar-visibility"
      type="checkbox"
      checked={visible}
      onChange={onToggle}
      aria-label={t("Show {name} events", { name })}
    />
  );
  return (
    <div ref={root} className="calendar-group-item" data-group-kind={kind}>
      {editing ? (
        <InlineGroupEditor
          group={{ name, color }}
          kind={kind}
          onCancel={onFinishEdit}
          onSave={(nextName, nextColor) => {
            onSave(nextName, nextColor);
            onFinishEdit();
          }}
        />
      ) : (
        <div className="calendar-group-row" data-goal-color={color}>
          {onOpen ? (
            <div className="calendar-group-label">
              {visibility}
              <button
                type="button"
                className="calendar-group-name"
                onClick={onOpen}
                title={name}
              >
                {name}
              </button>
            </div>
          ) : (
            <label className="calendar-group-label">
              {visibility}
              <span title={name}>{name}</span>
            </label>
          )}
          <IconButton
            buttonRef={trigger}
            type="button"
            className="calendar-group-menu-trigger"
            aria-label={t(
              kind === "goal"
                ? "Goal options for {name}"
                : "Calendar options for {name}",
              { name },
            )}
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
          </IconButton>
          {menu && (
            <div
              className="calendar-group-menu"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setMenu(false);
                  trigger.current?.focus();
                }
              }}
            >
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setMenu(false);
                  onEdit();
                }}
              >
                {t(kind === "goal" ? "Edit goal" : "Edit calendar")}
              </button>
              {actions?.(() => setMenu(false))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InlineGroupEditor({
  group,
  kind,
  onSave,
  onCancel,
}: {
  group: { name: string; color: GoalColor };
  kind: "calendar" | "goal";
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
        <IconButton
          type="button"
          className="calendar-colour-trigger"
          aria-label={t(
            kind === "goal" ? "Change goal colour" : "Change calendar colour",
          )}
          aria-expanded={palette}
          aria-haspopup="true"
          onClick={() => setPalette(!palette)}
        />
        <input
          autoFocus
          className="calendar-name-input"
          aria-label={t(kind === "goal" ? "Goal name" : "Calendar name")}
          value={name}
          maxLength={120}
          required
          onChange={(event) => {
            setName(event.target.value);
            setError("");
          }}
        />
        <IconButton
          type="submit"
          className="calendar-inline-action"
          aria-label={t(kind === "goal" ? "Save goal" : "Save calendar")}
        >
          <Check size={16} />
        </IconButton>
        <IconButton
          type="button"
          className="calendar-inline-action"
          aria-label={t(
            kind === "goal" ? "Cancel goal editing" : "Cancel calendar editing",
          )}
          onClick={() => guard.request(onCancel)}
        >
          <X size={16} />
        </IconButton>
      </div>
      {palette && (
        <ColorPicker variant="calendar" value={color} onChange={setColor} />
      )}
      {error && (
        <p className="inline-error" role="alert">
          {t(error)}
        </p>
      )}
    </form>
  );
}
