import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEventInput } from "../dist/runtime/src/eventComposer.js";

const today = "2026-10-28";
const parse = (text, date = today) => parseEventInput(text, date);

test("Inline composition extracts the reference event and preserves exact token offsets", () => {
  const text = "Review launch notes Fri 2:55 PM for 45 min";
  const result = parse(text);
  assert.equal(result.issue, null);
  assert.deepEqual(result.event, {
    title: "Review launch notes",
    date: "2026-10-30",
    start: 895,
    minutes: 45,
    allDay: false,
    repeat: "none",
  });
  assert.deepEqual(
    result.tokens.map((item) => item.kind),
    ["date", "time", "duration"],
  );
  for (const [index, item] of result.tokens.entries()) {
    assert.equal(text.slice(item.start, item.end), item.text);
    if (index) assert.ok(result.tokens[index - 1].end <= item.start);
  }
  assert.equal(text, "Review launch notes Fri 2:55 PM for 45 min");
});

test("Event title extraction removes scheduling syntax but keeps ordinary title words", () => {
  for (const [text, title] of [
    [
      "Add lunch with Alex on tomorrow at 2pm for 45 minutes",
      "lunch with Alex",
    ],
    ["Can you add an event called Lunch tomorrow at 14:00?", "Lunch"],
    [
      "Please create event Review launch notes on Friday at 14:55",
      "Review launch notes",
    ],
    ["Schedule meeting with Alex tomorrow at 9am", "meeting with Alex"],
    ["Prepare for launch on 30 October at 10:00", "Prepare for launch"],
    ["Lunch, tomorrow at noon, with Alex", "Lunch, with Alex"],
  ])
    assert.equal(parse(text).event?.title, title, text);
  assert.equal(parse("tomorrow at noon").event.title, "New event");
});

test("Dates are resolved from the caller's calendar day and exact numeric dates are validated", () => {
  assert.equal(
    parse("Lunch tomorrow at noon", "2026-12-31").event.date,
    "2027-01-01",
  );
  assert.equal(
    parse("Lunch this Friday at noon", "2026-10-30").event.date,
    "2026-10-30",
  );
  assert.equal(
    parse("Lunch Friday at noon", "2026-10-30").event.date,
    "2026-11-06",
  );
  assert.equal(
    parse("Lunch day after tomorrow at noon").event.date,
    "2026-10-30",
  );
  assert.equal(parse("Lunch on 30/10 at 12:00").event.date, "2026-10-30");
  assert.equal(
    parse("Lunch on October 30, 2026 at noon").event.date,
    "2026-10-30",
  );
  assert.equal(
    parse("Lunch on 30th Oct 2026 at noon").event.date,
    "2026-10-30",
  );
  assert.equal(parse("Lunch on 1 January at noon").event.date, "2027-01-01");
  assert.equal(parse("Holiday 2028-02-29 all day").event.date, "2028-02-29");
  for (const text of [
    "Lunch 2026-02-30 at noon",
    "Lunch 31/11 at noon",
    "Lunch 3/4 at noon",
    "Lunch on February 29 2027 at noon",
  ])
    assert.equal(parse(text).event, null, text);
});

test("Explicit clock ranges, durations, repeats and all-day events become one bounded event", () => {
  assert.equal(parse("Review tomorrow at 12am").event.start, 0);
  assert.equal(parse("Review tomorrow at 12pm").event.start, 720);
  assert.equal(parse("Review tomorrow at 14").event.start, 840);
  assert.equal(parse("Review tomorrow at 14:00").event.minutes, 30);
  assert.equal(parse("Review tomorrow at 2–3pm").event.minutes, 60);
  assert.equal(parse("Review tomorrow from 23:30 to 00:00").event.minutes, 30);
  assert.equal(parse("Review tomorrow 23:30–24:00").event.minutes, 30);
  assert.equal(parse("Review tomorrow at 9am for 1h30m").event.minutes, 90);
  assert.equal(
    parse("Review tomorrow at 9am for 1 hour and 15 minutes").event.minutes,
    75,
  );
  assert.equal(parse("Review tomorrow at 9am for 1.5 hours").event.minutes, 90);
  assert.equal(parse("Review every Friday at 9am").event.repeat, "weekly");
  assert.equal(
    parse("Review tomorrow at 9am every two weeks").event.repeat,
    "fortnightly",
  );
  assert.deepEqual(parse("Holiday tomorrow all day yearly").event, {
    title: "Holiday",
    date: "2026-10-29",
    start: 0,
    minutes: 1440,
    allDay: true,
    repeat: "yearly",
  });
});

test("Incomplete, ambiguous and invalid event-like input stays in the composer", () => {
  for (const text of [
    "Lunch tomorrow",
    "Lunch at 2pm",
    "Lunch tomorrow at 2",
    "Lunch Friday or Saturday at 2pm",
    "Lunch tomorrow at 2pm or 4pm",
    "Lunch tomorrow at 25:00",
    "Lunch tomorrow at 13pm",
    "Lunch tomorrow at 2:75pm",
    "Lunch tomorrow at 23:50",
    "Lunch tomorrow 11pm–1am",
    "Lunch tomorrow at 14:00–15:00 for 45 min",
    "Lunch tomorrow at 14:00 for 2 min",
    "Lunch tomorrow at 14:00 for 1.01 hours",
    "Lunch tomorrow at 14:00 for 45",
    "Lunch tomorrow all day at 2pm",
    "Lunch tomorrow at 2pm weekly daily",
    "Lunch tomorrow at 2pm for 30min and 45min",
    "Lunch in 30 minutes",
    "Lunch tomorrow at 2pm for -30 minutes",
    "Lunch tomorrow at 2pm for 30–45 minutes",
    "Lunch tomorrow at 14:00:00",
    "Lunch tomorrow at 2pm PST",
    "Lunch tomorrow at 2pm every weekday",
    "Lunch tomorrow at 2pm every 2 days",
  ]) {
    const result = parse(text);
    assert.equal(result.candidate, true, text);
    assert.equal(result.event, null, text);
    assert.ok(result.issue, text);
  }
  assert.equal(parse("Lunch tomorrow").details.date, "2026-10-29");
  assert.equal(parse("Lunch at 2pm").details.start, 840);
});

test("Calendar questions, management commands and to-do scheduling cannot create new events", () => {
  for (const text of [
    "What is on tomorrow at 2pm?",
    "When was my last haircut?",
    "Show tomorrow at 2pm",
    "Please move lunch tomorrow at 2pm",
    "Can you delete lunch tomorrow at 2pm",
    "Reschedule lunch tomorrow at 2pm",
    "Mark lunch tomorrow at 2pm complete",
    "Schedule my to do call Mum tomorrow at 2pm",
    "Schedule call Mum from my list tomorrow at 2pm",
    "Schedule it tomorrow at 2pm",
    "Make it tomorrow at 2pm",
    "Schedule this task tomorrow at 2pm",
    "Add milk to my todo list",
    "Add a goal to learn French tomorrow at 2pm",
    "Help me plan my week tomorrow at 2pm",
    "Hello Appa",
  ]) {
    const result = parse(text);
    assert.equal(result.candidate, false, text);
    assert.equal(result.event, null, text);
    assert.deepEqual(result.tokens, [], text);
  }
});
