import { useInterfaceText } from "./InterfaceLanguage";
import {
  automaticHolidayCalendar,
  holidayCalendarLabel,
  INTERFACE_LANGUAGES,
} from "./calendarPreferences";
import { HOLIDAY_CALENDARS } from "./holidayCatalog";
import * as cal from "./calendar";
import type { Settings } from "./types";

const countries = Object.entries(HOLIDAY_CALENDARS)
  .filter(([, location]) => !location.state)
  .sort((a, b) => a[1].label.localeCompare(b[1].label, "en"));
const timezones = Intl.supportedValuesOf("timeZone");

export function CalendarSettings({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
}) {
  const t = useInterfaceText();

  const country = ["auto", "none"].includes(settings.holidayCalendar)
    ? settings.holidayCalendar
    : settings.holidayCalendar.split(".")[0];
  const regions = Object.entries(HOLIDAY_CALENDARS)
    .filter(([, location]) => location.country === country && location.state)
    .sort((a, b) => a[1].label.localeCompare(b[1].label, "en"));
  const automatic = automaticHolidayCalendar(settings.timezone);
  return (
    <fieldset className="settings-section">
      <legend>{t("Calendar settings")}</legend>
      <div className="two-fields">
        <label className="field">
          {t("Timezone")}
          <select
            value={settings.timezone}
            onChange={(event) =>
              onChange({ ...settings, timezone: event.target.value })
            }
          >
            {[...new Set([...timezones, "UTC", settings.timezone])]
              .sort()
              .map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
          </select>
        </label>
        <label className="field">
          {t("Language")}
          <select
            aria-label={t("Language")}
            aria-describedby="language-help"
            value={settings.language}
            onChange={(event) =>
              onChange({ ...settings, language: event.target.value })
            }
          >
            {INTERFACE_LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
          <span id="language-help" className="field-help">
            {t(
              "English is available now. More interface languages can be added later.",
            )}
          </span>
        </label>
      </div>
      <div className="two-fields">
        <label className="field">
          {t("Week starts on")}
          <select
            value={settings.weekStartsOn}
            onChange={(event) =>
              onChange({
                ...settings,
                weekStartsOn: Number(event.target.value),
              })
            }
          >
            {Array.from({ length: 7 }, (_, day) => (
              <option key={day} value={day}>
                {cal.dateLabel(
                  cal.addDays("2026-10-11", day),
                  { weekday: "long" },
                  settings.language,
                )}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.showWeekNumbers}
            onChange={(event) =>
              onChange({ ...settings, showWeekNumbers: event.target.checked })
            }
          />
          {t("Show week numbers")}
        </label>
      </div>
      <label className="field">
        {t("Public holiday calendar")}
        <select
          value={country}
          onChange={(event) =>
            onChange({ ...settings, holidayCalendar: event.target.value })
          }
          aria-describedby="holiday-calendar-help"
        >
          <option value="auto">
            {t("Automatic —")} {holidayCalendarLabel(automatic)}
          </option>
          <option value="none">{t("None")}</option>
          {countries.map(([id, location]) => (
            <option key={id} value={id}>
              {location.label}
            </option>
          ))}
        </select>
      </label>
      {regions.length > 0 && (
        <label className="field">
          {t("State or region")}
          <select
            value={settings.holidayCalendar}
            onChange={(event) =>
              onChange({ ...settings, holidayCalendar: event.target.value })
            }
          >
            <option value={country}>{t("National holidays only")}</option>
            {regions.map(([id, location]) => (
              <option key={id} value={id}>
                {location.label.slice(
                  HOLIDAY_CALENDARS[country].label.length + 3,
                )}
              </option>
            ))}
          </select>
        </label>
      )}
      <p id="holiday-calendar-help" className="small muted">
        {t(
          "Automatic follows your timezone. Choose a country and region to override it. Holidays are shown for reference and do not change goal scheduling. Local show days and one-off holidays may not be included.",
        )}
      </p>
    </fieldset>
  );
}
