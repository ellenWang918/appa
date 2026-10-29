import { api, ApiError } from "./api.js";
import {
  calendarSnapshot,
  createCalendarPersistence,
} from "./calendarPersistence.js";
import type { CalendarState, StoredCalendar } from "./types.js";

let scope = "main";
let browserOnly = false;
let browserResult: StoredCalendar = { state: null, storageVersion: 0 };
let unloadRegistered = false;
const persistence = createCalendarPersistence({
  load: () =>
    browserOnly
      ? Promise.resolve(browserResult)
      : api("calendar/load", { scope }),
  async save(state, expectedVersion) {
    if (!browserOnly)
      return api("calendar/save", { scope, state, expectedVersion });
    localStorage.setItem(
      scope === "reference"
        ? "ai-goal-calendar.reference.v1"
        : "ai-goal-calendar.v1",
      JSON.stringify(state),
    );
    browserResult = { state, storageVersion: expectedVersion + 1 };
    return browserResult;
  },
});
export async function initializeCalendarStorage(
  key: string,
  legacy: CalendarState,
  legacyError: boolean,
  legacyBackup?: string,
) {
  scope = key;
  if (!unloadRegistered) {
    window.addEventListener("beforeunload", (event) => {
      if (persistence.hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    unloadRegistered = true;
  }
  let result: StoredCalendar;
  try {
    result = await api("calendar/bootstrap", {
      scope,
      legacy: calendarSnapshot(legacy),
      legacyError,
      legacyBackup,
    });
    browserOnly = false;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    browserOnly = true;
    result = browserResult = {
      state: legacy,
      storageVersion: 0,
      needsRecovery: legacyError,
    };
  }
  persistence.accept(result);
  return result;
}
export const acceptStoredCalendar = persistence.accept;
export const saveCalendar = persistence.save;
export const flushCalendar = persistence.flush;
export const retryCalendar = persistence.retry;
export function storageScope() {
  return scope;
}
