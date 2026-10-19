import type {
  AssistantIntent,
  AssistantResult,
  CalendarQuery,
  CalendarReference,
  CalendarState,
  CalendarMove,
  Task,
} from "../src/types.js";
import type { CalendarStore } from "./calendar-store.js";
import { validateTodoRequest } from "./todo-assistant.js";
import {
  addDays,
  localDate,
  localMinute,
  goalFor,
  availableHours,
  slotsFor,
  applyCalendarMoves,
  taskFor,
  validatePlan,
  createEvent,
} from "../src/calendar.js";
import {
  eventOccurrenceDates,
  eventForSeriesDate,
} from "../src/eventRepeat.js";

export function isoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function validateIntent(
  input: unknown,
  state: CalendarState,
): AssistantIntent {
  if (!input || typeof input !== "object")
    throw new Error(
      "Appa could not understand the response. Try asking in a different way.",
    );
  const intent = input as AssistantIntent;
  if (
    !["clarify", "goal", "event", "search", "reschedule", "todo"].includes(
      intent.kind,
    ) ||
    typeof intent.message !== "string" ||
    intent.message.length > 4000
  )
    throw new Error("Appa returned an invalid calendar response. Try again.");
  if (intent.kind === "goal") {
    intent.plan = validatePlan(intent.plan);
    if (intent.plan.clarification) {
      intent.kind = "clarify";
      intent.message = intent.plan.clarification;
    }
  }
  if (intent.kind === "event") {
    if (!intent.event)
      throw new Error("The event proposal is missing. Try again.");
    createEvent(state, intent.event);
  }
  if (intent.kind === "todo") intent.todo = validateTodoRequest(intent.todo);
  if (["search", "reschedule"].includes(intent.kind)) {
    const query = intent.query;
    if (
      !query ||
      !Array.isArray(query.terms) ||
      query.terms.length > 8 ||
      query.terms.some(
        (term) => typeof term !== "string" || !term.trim() || term.length > 100,
      ) ||
      !isoDate(query.from) ||
      !isoDate(query.to) ||
      query.from > query.to ||
      !Number.isInteger(query.start) ||
      !Number.isInteger(query.end) ||
      query.start < 0 ||
      query.end > 1440 ||
      query.start >= query.end ||
      !["agenda", "last", "count", "availability"].includes(query.operation) ||
      typeof query.completedOnly !== "boolean"
    )
      throw new Error("Please specify a valid date range and time window.");
  }
  if (intent.kind === "reschedule") {
    const d = intent.destination;
    if (
      !d ||
      !isoDate(d.from) ||
      !isoDate(d.to) ||
      d.from > d.to ||
      !Number.isInteger(d.start) ||
      !Number.isInteger(d.end) ||
      d.start < 0 ||
      d.end > 1440 ||
      d.start >= d.end ||
      d.to > addDays(d.from, 90)
    )
      throw new Error(
        "Choose a destination range of up to 90 days and valid times.",
      );
  }
  return {
    ...intent,
    plan: intent.kind === "goal" ? intent.plan : null,
    event: intent.kind === "event" ? intent.event : null,
    todo: intent.kind === "todo" ? intent.todo : null,
  };
}
const matches = (text: string, terms: string[]) =>
  !terms.length ||
  terms.some((term) =>
    text.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
  );
export function calendarReference(
  state: CalendarState,
  task: Task,
): CalendarReference {
  return {
    id: task.id,
    title: task.title,
    date: task.date,
    start: task.start,
    minutes: task.minutes,
    allDay: task.allDay,
    status: task.status,
    goalName: goalFor(state, task)?.name ?? null,
    recurring: !!(task.eventSeriesId || task.activityId),
  };
}
export function retrieveCalendar(
  store: CalendarStore,
  scope: string,
  state: CalendarState,
  query: CalendarQuery,
) {
  const found = new Map<string, Task>();
  for (const task of store.matchingTasks(
    scope,
    query.terms,
    query.from,
    query.to,
  ))
    found.set(task.id, task);
  let occurrences = 0;
  for (const series of state.eventSeries ?? []) {
    if (
      !matches(
        `${series.title} ${state.personalCalendar?.name ?? ""}`,
        query.terms,
      )
    )
      continue;
    for (const date of eventOccurrenceDates(series, query.from, query.to)) {
      if (++occurrences > 100_000)
        throw new Error(
          "That date range contains too many repeating events. Please narrow the dates.",
        );
      const task = eventForSeriesDate(state, series, date);
      if (
        task &&
        matches(
          `${task.title} ${state.personalCalendar?.name ?? ""}`,
          query.terms,
        )
      )
        found.set(task.id, task);
    }
  }
  const today = localDate(state.settings.timezone),
    minute = localMinute(state.settings.timezone);
  return [...found.values()]
    .filter(
      (task) =>
        task.date >= query.from &&
        task.date <= query.to &&
        ["pending", "done"].includes(task.status) &&
        !(
          task.status === "pending" &&
          task.goalId !== null &&
          goalFor(state, task)?.status !== "active"
        ) &&
        (!query.completedOnly || task.status === "done") &&
        (task.allDay ||
          (task.start < query.end &&
            task.start + task.minutes > query.start)) &&
        (query.operation !== "last" ||
          task.date < today ||
          (task.date === today && (task.allDay || task.start <= minute))),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start - b.start ||
        a.id.localeCompare(b.id),
    );
}
export const clock = (minute: number) =>
  `${Math.floor(minute / 60)
    .toString()
    .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
export function answerCalendar(
  state: CalendarState,
  query: CalendarQuery,
  tasks: Task[],
): AssistantResult {
  if (query.operation === "availability") {
    if (query.to > addDays(query.from, 31))
      throw new Error("Ask about availability over at most 31 days at a time.");
    const lines: string[] = [];
    const hours = availableHours(state.settings);
    for (let date = query.from; date <= query.to; date = addDays(date, 1)) {
      let cursor = Math.max(hours.start, query.start);
      const end = Math.min(hours.end, query.end);
      for (const slot of slotsFor(state, date)) {
        if (slot.start > cursor && cursor < end)
          lines.push(
            `${date}: ${clock(cursor)}–${clock(Math.min(slot.start, end))}`,
          );
        cursor = Math.max(cursor, slot.start + slot.duration);
        if (cursor >= end) break;
      }
      if (cursor < end) lines.push(`${date}: ${clock(cursor)}–${clock(end)}`);
    }
    return {
      kind: "answer",
      message: lines.length
        ? `Free time within your scheduling hours (${state.settings.timezone}):\n${lines.join("\n")}`
        : "No free time was found in that window.",
      references: [],
    };
  }
  let selected = tasks;
  if (query.operation === "last") selected = tasks.slice(-1);
  const references = selected
    .slice(0, 100)
    .map((task) => calendarReference(state, task));
  if (!selected.length)
    return {
      kind: "answer",
      message: `No matching calendar records were found from ${query.from} to ${query.to} (${state.settings.timezone}).`,
      references,
    };
  const detail = (task: Task) =>
    `${task.title} — ${task.date}${task.allDay ? " · All day" : ` · ${clock(task.start)}–${clock(task.start + task.minutes)}`} · ${task.status === "done" ? "marked completed" : "recorded appointment/task; not marked completed"}`;
  const message =
    query.operation === "count"
      ? `${tasks.length} matching ${query.completedOnly ? "completed " : ""}calendar entries from ${query.from} to ${query.to}.${tasks.length > 100 ? " Showing the first 100 records." : ""}`
      : query.operation === "last"
        ? `Your most recent matching recorded entry, searched from ${query.from} to ${query.to} (${state.settings.timezone}):\n${detail(selected[0])}`
        : `${selected.length} matching calendar entries from ${query.from} to ${query.to} (${state.settings.timezone}):\n${selected.slice(0, 20).map(detail).join("\n")}${selected.length > 20 ? "\nOpen the event references below to inspect more records." : ""}${selected.length > 100 ? "\nOnly the first 100 references are shown; narrow the dates to inspect the rest." : ""}`;
  return { kind: "answer", message, references };
}

export function proposeCalendarMoves(
  state: CalendarState,
  selected: CalendarReference[],
  query: CalendarQuery,
  destination: AssistantIntent["destination"],
): CalendarMove[] {
  if (!selected.length || selected.length > 100)
    throw new Error("Select 1–100 entries to move.");
  const today = localDate(state.settings.timezone),
    minute = localMinute(state.settings.timezone);
  const ids = new Set(selected.map((ref) => ref.id));
  if (ids.size !== selected.length)
    throw new Error("Select each entry only once.");
  const tasks = selected.map((ref) => {
    const task = taskFor(state, ref.id);
    if (!task || task.status !== "pending" || task.date < today)
      throw new Error(
        "Only pending entries dated today or later can be replanned.",
      );
    return task;
  });
  // Place prerequisites first; check retained dependent steps before final application.
  const ordered: Task[] = [],
    visited = new Set<string>();
  function visit(task: Task) {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    for (const key of task.dependsOn) {
      const dep = tasks.find((item) => item.id === key);
      if (dep) visit(dep);
    }
    ordered.push(task);
  }
  tasks.forEach(visit);
  const working = structuredClone(state);
  working.tasks = working.tasks.filter((task) => !ids.has(task.id));
  const moves: CalendarMove[] = [];
  for (const task of ordered) {
    const hours =
      task.goalId === null
        ? { start: 0, end: 1440 }
        : availableHours(state.settings);
    let placed = false;
    for (
      let date = destination.from > today ? destination.from : today;
      date <= destination.to && !placed;
      date = addDays(date, 1)
    ) {
      if (
        task.dependsOn.some((key) => {
          const before = working.tasks.find((item) => item.id === key);
          return before?.status === "pending" && before.date >= date;
        })
      )
        continue;
      if (task.allDay) {
        if (date >= query.from && date <= query.to) continue;
        moves.push({
          id: task.id,
          title: task.title,
          fromDate: task.date,
          fromStart: task.start,
          toDate: date,
          toStart: 0,
          minutes: task.minutes,
          allDay: true,
        });
        working.tasks.push({ ...task, date, slotId: task.id });
        placed = true;
        continue;
      }
      const begin = Math.max(
        hours.start,
        destination.start,
        date === today ? Math.ceil(minute / 15) * 15 : 0,
      );
      const end = Math.min(hours.end, destination.end);
      for (
        let start = Math.ceil(begin / 15) * 15;
        start + task.minutes <= end;
        start += 15
      ) {
        if (
          date >= query.from &&
          date <= query.to &&
          start < query.end &&
          start + task.minutes > query.start
        )
          continue;
        if (
          slotsFor(working, date).some(
            (slot) =>
              start < slot.start + slot.duration &&
              start + task.minutes > slot.start,
          )
        )
          continue;
        moves.push({
          id: task.id,
          title: task.title,
          fromDate: task.date,
          fromStart: task.start,
          toDate: date,
          toStart: start,
          minutes: task.minutes,
          allDay: false,
        });
        working.tasks.push({ ...task, date, start, slotId: task.id });
        placed = true;
        break;
      }
    }
    if (!placed)
      throw new Error(
        `No free time was found for “${task.title}”. Choose a wider destination range or fewer entries.`,
      );
  }
  applyCalendarMoves(state, moves, today);
  return moves;
}
