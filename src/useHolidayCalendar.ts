import { useEffect, useState } from "react";
import { automaticHolidayCalendar } from "./calendarPreferences";
import type { HolidayLookup, Settings } from "./types";

const empty: HolidayLookup = () => [];
export function useHolidayCalendar(settings: Settings) {
  const id =
    settings.holidayCalendar === "auto"
      ? automaticHolidayCalendar(settings.timezone)
      : settings.holidayCalendar;
  const [loaded, setLoaded] = useState<{
    id: string;
    lookup: HolidayLookup;
    error: string;
  }>({ id: "none", lookup: empty, error: "" });
  useEffect(() => {
    if (id === "none") return;
    let active = true;
    // Bundle the data locally, but load the rules separately from the main UI.
    import("./holidays")
      .then(({ createHolidayLookup }) => {
        if (active)
          setLoaded({ id, lookup: createHolidayLookup(id), error: "" });
      })
      .catch(() => {
        if (active)
          setLoaded({
            id,
            lookup: empty,
            error:
              "Public holidays could not be loaded. Reload Appa to try again.",
          });
      });
    return () => {
      active = false;
    };
  }, [id]);
  return id === "none" || loaded.id !== id
    ? { lookup: empty, error: "" }
    : loaded;
}
