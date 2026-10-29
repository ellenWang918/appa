import { validateBackup } from "./calendar.js";
import type { CalendarState, StoredCalendar } from "./types.js";

export const calendarSnapshot = (state: CalendarState): CalendarState => ({
  ...state,
  undo: null,
  recovery: null,
});
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
function sameCalendar(left: CalendarState | null, right: CalendarState) {
  return (
    left !== null &&
    JSON.stringify(canonical(validateBackup(left))) ===
      JSON.stringify(canonical(validateBackup(right)))
  );
}

// Intermediate edits share one pending snapshot; every caller awaits durability.
export function createCalendarPersistence(
  transport: {
    load: () => Promise<StoredCalendar>;
    save: (
      state: CalendarState,
      expectedVersion: number,
    ) => Promise<StoredCalendar>;
  },
  delay = 120,
) {
  let version = 0;
  let lastSaved = "";
  let pending: { state: CalendarState; json: string } | undefined;
  let uncertain: typeof pending;
  let failure: unknown;
  let running: Promise<void> | undefined;
  let recovering: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiters: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  function accept(result: StoredCalendar) {
    version = result.storageVersion;
    lastSaved = result.state
      ? JSON.stringify(calendarSnapshot(result.state))
      : "";
    failure = undefined;
    uncertain = undefined;
  }
  function start() {
    clearTimeout(timer);
    timer = undefined;
    if (running || recovering || failure || !pending) return;
    running = Promise.resolve().then(async () => {
      try {
        while (pending) {
          const next = pending;
          pending = undefined;
          if (next.json === lastSaved) continue;
          uncertain = next;
          const saved = await transport.save(next.state, version);
          version = saved.storageVersion;
          lastSaved = next.json;
          uncertain = undefined;
        }
        const completed = waiters;
        waiters = [];
        completed.forEach(({ resolve }) => resolve());
      } catch (error) {
        failure = error;
        const failed = waiters;
        waiters = [];
        failed.forEach(({ reject }) => reject(error));
      } finally {
        running = undefined;
      }
    });
  }
  function enqueue(state: CalendarState, immediate: boolean) {
    const snapshot = calendarSnapshot(state);
    const json = JSON.stringify(snapshot);
    if (json === lastSaved && !pending && !running && !failure)
      return Promise.resolve();
    pending = { state: snapshot, json };
    if (failure) return Promise.reject(failure);
    const result = new Promise<void>((resolve, reject) =>
      waiters.push({ resolve, reject }),
    );
    if (immediate) start();
    else if (!running && !timer) timer = setTimeout(start, delay);
    return result;
  }
  return {
    accept,
    save: (state: CalendarState) => enqueue(state, false),
    flush: (state: CalendarState) => enqueue(state, true),
    retry(state: CalendarState) {
      pending = {
        state: calendarSnapshot(state),
        json: JSON.stringify(calendarSnapshot(state)),
      };
      if (recovering)
        return recovering.then(() => enqueue(pending?.state ?? state, true));
      recovering = (async () => {
        await running;
        const stored = await transport.load();
        if (stored.storageVersion !== version) {
          if (
            stored.storageVersion === version + 1 &&
            uncertain &&
            sameCalendar(stored.state, uncertain.state)
          ) {
            version = stored.storageVersion;
            lastSaved = uncertain.json;
          } else
            throw new Error(
              "The calendar changed in another window. Export your current work, then reload before trying again.",
            );
        }
        failure = undefined;
        uncertain = undefined;
      })()
        .catch((error: unknown) => {
          failure = error;
          throw error;
        })
        .finally(() => {
          recovering = undefined;
        });
      return recovering.then(() => enqueue(pending?.state ?? state, true));
    },
    hasUnsavedChanges: () => !!(pending || running || recovering || failure),
  };
}
