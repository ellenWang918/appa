import { useId } from "react";
import type { GoalColor } from "./types";
import { GOAL_PALETTE } from "./goalPalette";
import { useInterfaceText } from "./InterfaceLanguage";

export function ColorPicker({
  value,
  onChange,
  variant = "goal",
}: {
  value: GoalColor;
  onChange: (color: GoalColor) => void;
  variant?: "goal" | "calendar";
}) {
  const t = useInterfaceText();
  const name = useId();
  const calendar = variant === "calendar";
  return (
    <fieldset
      className={calendar ? "calendar-colour-palette" : "goal-colour-picker"}
    >
      <legend>{t(calendar ? "Colour" : "Goal colour")}</legend>
      <div className={calendar ? undefined : "goal-colour-options"}>
        {GOAL_PALETTE.map((option) => (
          <label
            key={option.value}
            data-goal-color={option.value}
            title={calendar ? t(option.label) : undefined}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              aria-label={calendar ? t(option.label) : undefined}
              onChange={() => onChange(option.value)}
            />
            <span
              className={calendar ? undefined : "goal-colour-swatch"}
              aria-hidden="true"
            />
            {!calendar && t(option.label)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
