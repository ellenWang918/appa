import { api, ApiError } from "./api";
import type { CalendarState, StoredCalendar } from "./types";

let scope = "main";
let version = 0;
let lastSaved = "";
let queue = Promise.resolve();
let failure: unknown;
let browserOnly = false;
let pendingSaves = 0;
let unloadRegistered = false;
const persisted = (state: CalendarState) => ({ ...state, undo: null });
export async function initializeCalendarStorage(
  key: string,
  legacy: CalendarState,
  legacyError: boolean,
  legacyBackup?: string,
) {
  scope = key;
  if (!unloadRegistered) {
    window.addEventListener("beforeunload", (event) => {
      if (pendingSaves > 0 || failure) {
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
      legacy: persisted(legacy),
      legacyError,
      legacyBackup,
    });
    browserOnly = false;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    // The optional static-hosting template has no local SQLite service.
    browserOnly = true;
    result = { state: legacy, storageVersion: 0, needsRecovery: legacyError };
  }
  acceptStoredCalendar(result);
  return result;
}
export function acceptStoredCalendar(result: StoredCalendar) {
  version = result.storageVersion;
  lastSaved = result.state ? JSON.stringify(persisted(result.state)) : "";
  failure = undefined;
}
export function saveCalendar(state: CalendarState) {
  const data = persisted(state);
  const json = JSON.stringify(data);
  pendingSaves++;
  const work = queue.then(async () => {
    if (failure) throw failure;
    if (json === lastSaved) return;
    try {
      if (browserOnly) {
        localStorage.setItem(
          scope === "reference"
            ? "ai-goal-calendar.reference.v1"
            : "ai-goal-calendar.v1",
          json,
        );
        lastSaved = json;
        return;
      }
      const saved = await api("calendar/save", {
        scope,
        state: data,
        expectedVersion: version,
      });
      version = saved.storageVersion;
      lastSaved = json;
    } catch (error) {
      failure = error;
      throw error;
    }
  });
  const completed = work.finally(() => {
    pendingSaves--;
  });
  queue = completed.catch(() => {});
  return completed;
}
export async function flushCalendar(state: CalendarState) {
  await saveCalendar(state);
  await queue;
  if (failure) throw failure;
}
export function storageScope() {
  return scope;
}
