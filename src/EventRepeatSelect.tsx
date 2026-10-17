import type { EventRepeatChoice } from "./types";
import { EVENT_REPEATS, eventRepeatLabel, isEventRepeat } from "./eventRepeat";
import { useInterfaceText } from "./InterfaceLanguage";

export function EventRepeatSelect({
  value,
  onChange,
}: {
  value: EventRepeatChoice;
  onChange: (value: EventRepeatChoice) => void;
}) {
  const t = useInterfaceText();
  return (
    <label className="field repeat-field">
      {t("Repeat")}
      <select
        name="repeat"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "none" || isEventRepeat(next)) onChange(next);
        }}
      >
        {["none" as const, ...EVENT_REPEATS].map((repeat) => (
          <option value={repeat} key={repeat}>
            {t(eventRepeatLabel(repeat))}
          </option>
        ))}
      </select>
    </label>
  );
}
