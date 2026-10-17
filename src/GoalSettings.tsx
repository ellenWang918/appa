import { useId } from "react";
import { useInterfaceText } from "./InterfaceLanguage";
import type { Settings } from "./types";
import { clockTime } from "./calendar";

const minuteInput = (value: number) =>
  Number.isFinite(value) ? clockTime(value % 1440) : "";
const parseMinute = (value: string) => {
  if (!value) return NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

export function GoalSettings({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const t = useInterfaceText();
  const helpId = useId();
  return (
    <fieldset className="settings-section">
      <legend>{t("Goal settings")}</legend>
      <p className="small muted">
        {t("Choose whether to limit goal scheduling to certain hours.")}
      </p>
      <label className="goal-availability-toggle">
        <input
          type="checkbox"
          checked={settings.useAvailableTime}
          aria-describedby={helpId}
          onChange={(event) =>
            onChange({ ...settings, useAvailableTime: event.target.checked })
          }
        />
        {t("Set available time")}
      </label>
      <p id={helpId} className="small muted">
        {settings.useAvailableTime
          ? t("Appa schedules goal steps within these hours.")
          : t(
              "Goals can be scheduled at any time of day. Existing tasks stay where they are.",
            )}
      </p>
      {settings.useAvailableTime && (
        <>
          <div className="two-fields">
            <label className="field">
              {t("Available from")}
              <input
                type="time"
                value={minuteInput(settings.start)}
                required
                onChange={(event) =>
                  onChange({
                    ...settings,
                    start: parseMinute(event.target.value),
                  })
                }
              />
            </label>
            <label className="field">
              {t("Until")}
              <input
                type="time"
                value={minuteInput(settings.end)}
                required
                onChange={(event) => {
                  const end = parseMinute(event.target.value);
                  onChange({ ...settings, end: end === 0 ? 1440 : end });
                }}
              />
            </label>
          </div>
          <p className="small muted">
            {t("Until 00:00 means midnight at the end of the day.")}
          </p>
          <p className="small muted">
            {t(
              "Pending steps are rearranged to fit. When time is tight, a shared slot lets you choose one activity.",
            )}
          </p>
        </>
      )}
    </fieldset>
  );
}
