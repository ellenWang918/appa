import { test } from "node:test";
import assert from "node:assert/strict";
import Holidays from "date-holidays";
import * as c from "../dist/runtime/src/calendar.js";
import {
  automaticHolidayCalendar,
  DEFAULT_CALENDAR_PREFERENCES,
} from "../dist/runtime/src/calendarPreferences.js";
import {
  indexHolidays,
  holidayLabel,
} from "../dist/runtime/src/holidayDates.js";

import { interfaceText } from "../dist/runtime/src/i18n.js";

test("Interface messages interpolate values once, fall back to English and preserve unknown text", () => {
  assert.equal(interfaceText("en-AU", "Week {v0}", { v0: 42 }), "Week 42");
  assert.equal(interfaceText("future-language", "Settings"), "Settings");
  assert.equal(
    interfaceText("en-AU", "Uncatalogued message"),
    "Uncatalogued message",
  );
  assert.equal(
    interfaceText("en-AU", "{name}", { name: "A goal {v0}" }),
    "A goal {v0}",
  );
  for (const key of ["__proto__", "constructor", "toString"])
    assert.equal(interfaceText(key, key), key);
});

const today = "2026-10-15";
test("Older calendars receive display preferences without losing goals or progress", () => {
  const old = c.seed(today);
  old.settings = {
    start: 1080,
    end: 1260,
    timezone: "Australia/Brisbane",
    budget: 30,
  };
  const restored = c.validateBackup(JSON.parse(JSON.stringify(old)), today);
  assert.deepEqual(restored.settings, {
    useAvailableTime: true,
    start: 1080,
    end: 1260,
    timezone: "Australia/Brisbane",
    ...DEFAULT_CALENDAR_PREFERENCES,
  });
  assert.deepEqual(restored.tasks, old.tasks);
  assert.deepEqual(restored.goals, old.goals);
});

test("Calendar preferences preserve task placement and choices, round-trip in backups, and undo", () => {
  const state = c.selectChoice(c.seed(today), today, "move-slot", "walk");
  const settings = {
    ...state.settings,
    weekStartsOn: 0,
    showWeekNumbers: false,
    holidayCalendar: "AU.NSW",
  };
  const next = c.updateSettings(state, settings, today);
  assert.deepEqual(next.tasks, state.tasks);
  assert.deepEqual(next.choices, state.choices);
  assert.deepEqual(next.goals, state.goals);
  assert.deepEqual(
    c.validateBackup(JSON.parse(JSON.stringify(next)), today).settings,
    settings,
  );
  const imported = c.importBackup(c.blank(today), next, today);
  assert.deepEqual(imported.settings, settings);
  assert.deepEqual(imported.tasks, state.tasks);
  assert.deepEqual(c.undoChange(next).settings, state.settings);
  assert.equal(
    c.updateSettings(next, { ...settings, timezone: "Europe/London" }, today)
      .settings.holidayCalendar,
    "AU.NSW",
  );
});

test("Malformed new preferences are rejected on reload and settings save", () => {
  for (const [field, value] of [
    ["language", "zh-CN"],
    ["language", null],
    ["showWeekNumbers", "false"],
    ["showWeekNumbers", null],
    ["weekStartsOn", -1],
    ["weekStartsOn", 7],
    ["weekStartsOn", 1.5],
    ["weekStartsOn", null],
    ["holidayCalendar", "AU.UNKNOWN"],
    ["holidayCalendar", "__proto__"],
    ["holidayCalendar", null],
  ]) {
    const state = c.seed(today);
    const settings = { ...state.settings, [field]: value };
    assert.throws(
      () => c.updateSettings(state, settings, today),
      undefined,
      `${field}: ${value}`,
    );
    state.settings = settings;
    assert.throws(
      () => c.validateBackup(state, today),
      undefined,
      `${field}: ${value}`,
    );
  }
});

test("Timezone defaults resolve Australian regions and overseas calendars without guessing UTC", () => {
  for (const [zone, calendar] of Object.entries({
    "Australia/Brisbane": "AU.QLD",
    "Australia/Lindeman": "AU.QLD",
    "Australia/Sydney": "AU.NSW",
    "Australia/Canberra": "AU.ACT",
    "Australia/Perth": "AU.WA",
    "Europe/London": "GB",
    "Asia/Tokyo": "JP",
    UTC: "none",
  }))
    assert.equal(automaticHolidayCalendar(zone), calendar, zone);
  assert.equal(automaticHolidayCalendar("not-a-zone"), "none");
});

test("Custom week starts handle month and year boundaries", () => {
  assert.equal(c.weekStart("2027-01-01", 1), "2026-12-28");
  assert.equal(c.weekStart("2027-01-01", 0), "2026-12-27");
  assert.equal(c.weekStart("2027-01-01", 6), "2026-12-26");
  assert.equal(c.weekStart("2026-10-18", 0), "2026-10-18");
  assert.equal(c.weekStart("2026-10-18"), "2026-10-12");
});

test("Queensland public holidays include regional dates, substitute days and the Christmas Eve evening", () => {
  const calendar = new Holidays("AU", "QLD", {
    languages: "en",
    types: ["public"],
  });
  const days = indexHolidays(calendar.getHolidays(2026), "Australia/Brisbane");
  for (const [date, name] of Object.entries({
    "2026-01-01": "New Year's Day",
    "2026-01-26": "Australia Day",
    "2026-04-03": "Good Friday",
    "2026-04-06": "Easter Monday",
    "2026-04-25": "Anzac Day",
    "2026-05-04": "Labour Day",
    "2026-10-05": "King's Birthday",
    "2026-12-25": "Christmas Day",
    "2026-12-26": "Boxing Day",
    "2026-12-28": "Boxing Day (substitute day)",
  }))
    assert.ok(
      days.get(date)?.some((holiday) => holiday.name === name),
      `${date}: ${name}`,
    );
  assert.equal(days.has("2026-04-27"), false);
  const evening = days.get("2026-12-24")[0];
  assert.equal(evening.startMinute, 1080);
  assert.equal(evening.endMinute, 1440);
  assert.equal(holidayLabel(evening), "Christmas Eve (from 6:00 pm)");
  const national = new Holidays("AU", { languages: "en", types: ["public"] });
  assert.equal(
    indexHolidays(national.getHolidays(2026), "Australia/Sydney").has(
      "2026-05-04",
    ),
    false,
  );
});

test("Holiday indexing preserves local dates, multi-day spans and partial hours, excludes observances and deduplicates", () => {
  const record = {
    date: "2026-12-31 18:00:00",
    start: new Date("2026-12-31T08:00:00Z"),
    end: new Date("2027-01-02T00:00:00Z"),
    name: "Regional holiday",
    type: "public",
  };
  const days = indexHolidays(
    [record, record, { ...record, name: "Observance", type: "observance" }],
    "Australia/Brisbane",
  );
  assert.deepEqual(
    [...days.keys()],
    ["2026-12-31", "2027-01-01", "2027-01-02"],
  );
  assert.deepEqual(days.get("2026-12-31"), [
    { name: record.name, startMinute: 1080, endMinute: 1440 },
  ]);
  assert.deepEqual(days.get("2027-01-01"), [
    { name: record.name, startMinute: 0, endMinute: 1440 },
  ]);
  assert.equal(
    holidayLabel(days.get("2027-01-02")[0]),
    "Regional holiday (until 10:00 am)",
  );
});
