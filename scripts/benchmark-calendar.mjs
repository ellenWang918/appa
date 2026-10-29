import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as cal from "../dist/runtime/src/calendar.js";
import { createCalendarQueries } from "../dist/runtime/src/calendarQueries.js";
import { openCalendarStore } from "../dist/runtime/server/calendar-store.js";

const directory = await mkdtemp(
  path.join(os.tmpdir(), "appa-calendar-benchmark-"),
);
const today = cal.localDate("Australia/Brisbane");
const measurements = [];
try {
  for (const count of [1000, 5000, 10000]) {
    const state = cal.blank(today);
    state.tasks = Array.from({ length: count }, (_, index) => ({
      id: `synthetic-${index}`,
      goalId: null,
      title: "Synthetic event",
      date: cal.addDays(today, -count + index),
      start: 0,
      minutes: 1440,
      slotId: `slot-${index}`,
      status: "done",
      dependsOn: [],
      allDay: true,
    }));
    const store = openCalendarStore(path.join(directory, String(count)));
    try {
      let started = performance.now();
      let version = store.bootstrap("main", state).storageVersion;
      const bootstrapMs = performance.now() - started;
      const saves = [];
      for (let index = 0; index < 3; index++) {
        state.draft = { intention: `Draft ${index}`, plan: null };
        started = performance.now();
        version = store.save("main", state, version).storageVersion;
        saves.push(performance.now() - started);
      }
      started = performance.now();
      for (let year = 2024; year <= 2028; year++)
        createCalendarQueries(state).scheduledDates(
          `${year}-01-01`,
          `${year}-12-31`,
        );
      measurements.push({
        events: count,
        bootstrapMs: Math.round(bootstrapMs),
        draftSaveMedianMs: Math.round(saves.sort((a, b) => a - b)[1]),
        fiveYearQueriesMs: Math.round(performance.now() - started),
      });
    } finally {
      store.close();
    }
  }
  console.log(
    JSON.stringify(
      {
        node: process.version,
        fixture:
          "Completed all-day events on distinct historical dates; 3 draft-only saves per size; 5 Year indexes, excluding DOM and HTTP.",
        measurements,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
