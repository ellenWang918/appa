import type {
  CalendarState,
  EventRepeat,
  EventSeries,
  GoalColor,
  GoalEdit,
  Plan,
  PlannerDraft,
  ScheduleOptions,
  Settings,
  Slot,
  Task,
  TaskEdit,
  CalendarMove,
  Todo,
  TodoMutation,
} from "./types.js";
import {
  DEFAULT_CALENDAR_PREFERENCES,
  INTERFACE_LANGUAGES,
  isHolidayCalendar,
} from "./calendarPreferences.js";
import {
  eventForSeriesDate,
  eventOccurrenceDates,
  isEventOccurrence,
  isEventRepeat,
  seriesCanShareDate,
  virtualEventForId,
  virtualEventsForDate,
} from "./eventRepeat.js";

export const COLORS: GoalColor[] = [
  "indigo",
  "slate",
  "amber",
  "rose",
  "clay",
  "teal",
];
export function personalCalendarFor(state: CalendarState) {
  return state.personalCalendar === undefined
    ? { name: "Personal tasks", color: "slate" as GoalColor, visible: true }
    : state.personalCalendar;
}
export function editPersonalCalendar(
  state: CalendarState,
  name: string,
  color: GoalColor,
) {
  const group = personalCalendarFor(state);
  if (!group) throw new Error("This calendar is no longer available.");
  if (!name.trim() || name.trim().length > 120)
    throw new Error("Enter a calendar name of 1–120 characters.");
  if (!COLORS.includes(color))
    throw new Error("Choose a valid calendar colour.");
  const next = copy(state);
  next.personalCalendar = { ...group, name: name.trim(), color };
  return commit(state, next, "Calendar updated");
}
export function togglePersonalCalendar(state: CalendarState) {
  const group = personalCalendarFor(state);
  if (!group) return state;
  return { ...state, personalCalendar: { ...group, visible: !group.visible } };
}
export function deletePersonalCalendar(state: CalendarState) {
  const next = copy(state);
  const ids = new Set(
    next.tasks.filter((task) => task.goalId === null).map((task) => task.id),
  );
  next.tasks = next.tasks.filter((task) => task.goalId !== null);
  next.eventSeries = [];
  next.personalCalendar = null;
  for (const [key, value] of Object.entries(next.choices))
    if (ids.has(value)) delete next.choices[key];
  return commit(state, next, "Calendar deleted");
}
export function calendarDisplayState(state: CalendarState): CalendarState {
  return personalCalendarFor(state)?.visible === false
    ? {
        ...state,
        tasks: state.tasks.filter((task) => task.goalId !== null),
        eventSeries: [],
      }
    : state;
}
export const availableHours = (settings: Settings) =>
  settings.useAvailableTime === false
    ? { start: 0, end: 1440 }
    : { start: settings.start, end: settings.end };
export const id = () => globalThis.crypto.randomUUID();
export const copy = <T>(value: T): T => structuredClone(value);
export function localDate(timeZone = "Australia/Brisbane", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((key) => parts.find((p) => p.type === key)!.value)
    .join("-");
}
export function localMinute(timeZone = "Australia/Brisbane", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return (
    Number(parts.find((p) => p.type === "hour")!.value) * 60 +
    Number(parts.find((p) => p.type === "minute")!.value)
  );
}
export const addDays = (date: string, count: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + count * 86400000)
    .toISOString()
    .slice(0, 10);
export function weekStart(date: string, startsOn = 1) {
  return addDays(
    date,
    -((new Date(date + "T12:00:00Z").getUTCDay() - startsOn + 7) % 7),
  );
}
export function isWeekend(date: string) {
  return [0, 6].includes(new Date(date + "T12:00:00Z").getUTCDay());
}
export const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = {},
  language = "en-AU",
) =>
  new Intl.DateTimeFormat(language, { timeZone: "UTC", ...options }).format(
    new Date(date + "T12:00:00Z"),
  );
export const clockTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export function timeLabel(minute: number) {
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}
export function seed(today = localDate()): CalendarState {
  return {
    version: 1,
    revision: 0,
    sample: true,
    lastRecoveryDay: today,
    draft: null,
    undo: null,
    recovery: null,
    settings: {
      ...DEFAULT_CALENDAR_PREFERENCES,
      useAvailableTime: true,
      start: 1080,
      end: 1260,
      timezone: "Australia/Brisbane",
    },
    goals: [
      {
        id: "portfolio",
        name: "Launch portfolio",
        color: "indigo",
        status: "active",
        recurrence: null,
      },
      {
        id: "move",
        name: "Move more",
        color: "teal",
        status: "active",
        recurrence: {
          perWeek: 1,
          anchor: today,
          templates: [{ title: "Stretch", minutes: 25 }],
        },
      },
      {
        id: "japanese",
        name: "Learn Japanese",
        color: "amber",
        status: "later",
        recurrence: null,
      },
    ],
    choices: {},
    tasks: [
      {
        id: "outline",
        goalId: "portfolio",
        title: "List three projects",
        minutes: 20,
        date: today,
        start: 1080,
        slotId: "outline-slot",
        dependsOn: [],
        status: "pending",
      },
      {
        id: "draft",
        goalId: "portfolio",
        title: "Draft a case study",
        minutes: 25,
        date: addDays(today, 1),
        start: 1080,
        slotId: "draft-slot",
        dependsOn: ["outline"],
        status: "pending",
      },
      {
        id: "review",
        goalId: "portfolio",
        title: "Review the draft",
        minutes: 15,
        date: addDays(today, 2),
        start: 1080,
        slotId: "review-slot",
        dependsOn: ["draft"],
        status: "pending",
      },
      {
        id: "walk",
        goalId: "move",
        title: "Walk",
        minutes: 15,
        date: today,
        start: 1110,
        slotId: "move-slot",
        dependsOn: [],
        status: "pending",
        activityId: "move",
        occurrenceKey: addDays(today, -1),
      },
      {
        id: "stretch",
        goalId: "move",
        title: "Stretch",
        minutes: 25,
        date: today,
        start: 1110,
        slotId: "move-slot",
        dependsOn: [],
        status: "pending",
        activityId: "move",
        occurrenceKey: today,
      },
    ],
  };
}
export function blank(today = localDate()): CalendarState {
  return { ...seed(today), sample: false, goals: [], tasks: [] };
}
export const isBlocked = (state: CalendarState, task: Task) =>
  task.dependsOn.some(
    (taskId) => state.tasks.find((t) => t.id === taskId)?.status !== "done",
  );
export const goalFor = (state: CalendarState, task: Task) =>
  state.goals.find((g) => g.id === task.goalId);
export function slotGoalColor(state: CalendarState, slot: Slot) {
  if (slot.tasks.every((task) => task.goalId === null))
    return personalCalendarFor(state)?.color;
  if (slot.chosen) return goalFor(state, slot.chosen)?.color;
  const goalId = slot.tasks[0]?.goalId;
  if (goalId == null || slot.tasks.some((task) => task.goalId !== goalId))
    return undefined;
  return goalFor(state, slot.tasks[0])?.color;
}
export function slotsFor(
  state: CalendarState,
  date: string,
  ignoreId: string | null = null,
  allDay = false,
): Slot[] {
  const groups = new Map<string, Task[]>();
  for (const task of [...state.tasks, ...virtualEventsForDate(state, date)]) {
    if (
      task.id === ignoreId ||
      task.date !== date ||
      !!task.allDay !== allDay ||
      !["pending", "done"].includes(task.status) ||
      (task.goalId !== null && goalFor(state, task)?.status !== "active")
    )
      continue;
    if (!groups.has(task.slotId)) groups.set(task.slotId, []);
    groups.get(task.slotId)!.push(task);
  }
  return [...groups]
    .map(([slotId, tasks]) => {
      const chosenId = state.choices[`${date}/${slotId}`];
      const done = tasks.find((t) => t.status === "done");
      const chosen = done || tasks.find((t) => t.id === chosenId);
      return {
        id: slotId,
        date,
        start: Math.min(...tasks.map((t) => t.start)),
        tasks,
        chosen,
        done: !!done,
        duration: chosen
          ? chosen.minutes
          : Math.max(...tasks.map((t) => t.minutes)),
      };
    })
    .sort((a, b) => a.start - b.start);
}
export const allDaySlotsFor = (state: CalendarState, date: string) =>
  slotsFor(state, date, null, true);
export const plannedMinutesFor = (state: CalendarState, date: string) =>
  slotsFor(state, date).reduce((sum, slot) => sum + slot.duration, 0);
function fits(
  state: CalendarState,
  date: string,
  start: number,
  minutes: number,
  ignoreId: string,
) {
  const slots = slotsFor(state, date, ignoreId);
  const hours = availableHours(state.settings);
  return (
    start >= hours.start &&
    start + minutes <= hours.end &&
    slots.every(
      (s) => start + minutes <= s.start || start >= s.start + s.duration,
    )
  );
}
function place(
  state: CalendarState,
  task: Task,
  date: string,
  {
    conflict = false,
    earliest = availableHours(state.settings).start,
  }: { conflict?: boolean; earliest?: number } = {},
) {
  const duration = task.minutes;
  const hours = availableHours(state.settings);
  const now =
    state.settings.useAvailableTime === false
      ? {
          date: localDate(state.settings.timezone),
          minute: Math.ceil(localMinute(state.settings.timezone) / 5) * 5,
        }
      : null;
  if (duration > hours.end - hours.start)
    throw new Error(
      `“${task.title}” is longer than your available hours. Edit its duration first.`,
    );
  for (let day = 0; day < 730; day++) {
    const target = addDays(date, day),
      first =
        day === 0
          ? Math.max(
              earliest,
              hours.start,
              now?.date === target ? now.minute : 0,
            )
          : Math.max(hours.start, now?.date === target ? now.minute : 0);
    const existing = slotsFor(state, target, task.id);
    if (conflict && task.activityId) {
      const related = existing.find(
        (s) =>
          !s.done &&
          !s.chosen &&
          s.start >= first &&
          s.tasks.some((t) => t.activityId === task.activityId),
      );
      if (related) {
        const longest = Math.max(
          duration,
          ...related.tasks.map((t) => t.minutes),
        );
        if (
          related.start + longest <= hours.end &&
          existing.every(
            (s) =>
              s.id === related.id ||
              related.start + longest <= s.start ||
              related.start >= s.start + s.duration,
          )
        ) {
          delete state.choices[`${target}/${related.id}`];
          Object.assign(task, {
            date: target,
            start: related.start,
            slotId: related.id,
          });
          return;
        }
      }
    }
    for (let start = first; start + duration <= hours.end; start += 5) {
      if (fits(state, target, start, duration, task.id)) {
        Object.assign(task, { date: target, start, slotId: id() });
        return;
      }
    }
    if (conflict && day === 0) {
      const pending = existing.filter(
        (s) => !s.done && !s.chosen && s.start >= first,
      );
      for (let begin = 0; begin < pending.length; begin++)
        for (let end = begin; end < pending.length; end++) {
          const group = pending.slice(begin, end + 1),
            longest = Math.max(
              duration,
              ...group.flatMap((s) => s.tasks.map((t) => t.minutes)),
            );
          const start = group[0].start,
            keys = new Set(group.map((s) => s.id));
          if (
            start + longest > hours.end ||
            existing.some(
              (s) =>
                !keys.has(s.id) &&
                start < s.start + s.duration &&
                start + longest > s.start,
            )
          )
            continue;
          const slotId = group[0].id;
          for (const slot of group) {
            delete state.choices[`${target}/${slot.id}`];
            for (const member of slot.tasks)
              Object.assign(member, { slotId, start });
          }
          Object.assign(task, { date: target, start, slotId });
          return;
        }
    }
  }
  throw new Error("No feasible date was found. Review your available hours.");
}
function moveDependents(state: CalendarState) {
  if (!state.tasks.length) return;
  for (let pass = 0; pass < state.tasks.length; pass++) {
    let changed = false;
    for (const task of state.tasks.filter(
      (t) => t.status === "pending" && goalFor(state, t)?.status === "active",
    )) {
      const latest = task.dependsOn
        .map((dependency) => state.tasks.find((t) => t.id === dependency))
        .filter((t): t is Task => !!t && t.status !== "done")
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (latest && task.date <= latest.date) {
        place(state, task, addDays(latest.date, 1));
        changed = true;
      }
    }
    if (!changed) return;
  }
  throw new Error("Task dependencies could not be scheduled.");
}
function snapshot(state: CalendarState) {
  const result = copy(state);
  result.undo = null;
  return result;
}
export function taskFor(state: CalendarState, taskId: string) {
  return (
    state.tasks.find((task) => task.id === taskId) ??
    virtualEventForId(state, taskId)
  );
}
function materializeTask(state: CalendarState, taskId: string) {
  const task = taskFor(state, taskId);
  if (task && !state.tasks.some((item) => item.id === taskId))
    state.tasks.push(task);
  return task;
}
function commit(before: CalendarState, after: CalendarState, label: string) {
  if (label !== "Recovery") after.recovery = null;
  after.revision = before.revision + 1;
  after.undo = { label, before: snapshot(before), revision: after.revision };
  return after;
}
export function applyCalendarMoves(
  state: CalendarState,
  moves: CalendarMove[],
  today = localDate(state.settings.timezone),
) {
  if (
    !moves.length ||
    moves.length > 100 ||
    new Set(moves.map((move) => move.id)).size !== moves.length
  )
    throw new Error("Choose 1–100 distinct calendar entries to move.");
  const next = copy(state);
  for (const move of moves) {
    const task = materializeTask(next, move.id);
    if (
      !task ||
      task.status !== "pending" ||
      (task.goalId !== null && goalFor(next, task)?.status !== "active")
    )
      throw new Error("Only pending calendar entries can be moved.");
    if (
      task.date !== move.fromDate ||
      task.start !== move.fromStart ||
      task.minutes !== move.minutes ||
      !!task.allDay !== move.allDay
    )
      throw new Error("The calendar changed. Ask Appa for a fresh proposal.");
    if (
      !validDate(move.toDate) ||
      move.toDate < today ||
      !Number.isInteger(move.toStart) ||
      move.toStart < 0 ||
      move.toStart + task.minutes > 1440 ||
      (task.allDay && move.toStart !== 0)
    )
      throw new Error("Choose a valid future date and time for each entry.");
    if (
      task.goalId !== null &&
      (move.toStart < availableHours(next.settings).start ||
        move.toStart + task.minutes > availableHours(next.settings).end)
    )
      throw new Error("Goal tasks must stay within your available hours.");
    for (const [key, id] of Object.entries(next.choices))
      if (id === task.id) delete next.choices[key];
    task.date = move.toDate;
    task.start = move.toStart;
    task.slotId = id();
  }
  for (const task of next.tasks.filter((item) => item.status === "pending"))
    for (const dependency of task.dependsOn) {
      const before = next.tasks.find((item) => item.id === dependency);
      if (before?.status === "pending" && before.date >= task.date)
        throw new Error(
          "Keep unfinished prerequisites on earlier dates than their dependent steps. Include the dependent steps or choose another date range.",
        );
    }
  validateBackup(next, today);
  return commit(state, next, "Calendar replanned");
}
export function editTask(
  state: CalendarState,
  taskId: string,
  edit: TaskEdit,
  today = localDate(state.settings.timezone),
) {
  const next = copy(state);
  const task = materializeTask(next, taskId);
  if (
    !task ||
    task.status !== "pending" ||
    (task.goalId !== null && goalFor(next, task)?.status !== "active")
  )
    throw new Error("Only pending tasks in active goals can be edited.");
  if (task.goalId === null) {
    const series = next.eventSeries?.find(
      (item) => item.id === task.eventSeriesId,
    );
    const repeat = edit.repeat ?? series?.repeat ?? "none";
    if (repeat !== (series?.repeat ?? "none")) {
      if (series)
        stopSeriesFrom(next, series, task.eventOccurrenceDate!, task.id);
    }
    validateEvent(next, edit, task.id);
    if (repeat !== (series?.repeat ?? "none") && repeat !== "none")
      attachEventSeries(next, task, edit, repeat);
    Object.assign(task, eventDetails(edit));
    if (!edit.allDay) delete task.allDay;
    validateRepeatConflicts(next, today);
    return commit(state, next, "Event updated");
  }
  if (edit.repeat && edit.repeat !== "none")
    throw new Error("Repeat is available for standalone events only.");
  if (edit.allDay)
    throw new Error("All day is available for standalone events only.");
  if (
    typeof edit.title !== "string" ||
    !edit.title.trim() ||
    edit.title.trim().length > 180
  )
    throw new Error("Enter a task name of 1–180 characters.");
  if (!validDate(edit.date) || edit.date < today)
    throw new Error("Choose today or a future date.");
  if (!Number.isInteger(edit.minutes) || edit.minutes < 5 || edit.minutes > 60)
    throw new Error("Choose a duration of 5–60 minutes.");
  if (
    !Number.isInteger(edit.start) ||
    edit.start < availableHours(next.settings).start ||
    edit.start + edit.minutes > availableHours(next.settings).end
  )
    throw new Error("Choose a time within your available hours.");
  const moved = task.date !== edit.date || task.start !== edit.start;
  if (moved) {
    if (
      task.dependsOn.some((key) => {
        const prerequisite = next.tasks.find((item) => item.id === key);
        return (
          prerequisite &&
          prerequisite.status !== "done" &&
          prerequisite.date >= edit.date
        );
      })
    )
      throw new Error("Schedule this task after its unfinished prerequisites.");
    if (
      next.tasks.some(
        (item) =>
          item.status === "pending" &&
          item.dependsOn.includes(task.id) &&
          item.date <= edit.date,
      )
    )
      throw new Error(
        "Move the later steps first, then schedule this task before them.",
      );
    const choiceKey = `${task.date}/${task.slotId}`;
    if (next.choices[choiceKey] === task.id) delete next.choices[choiceKey];
    task.slotId = id();
  }
  Object.assign(task, edit, { title: edit.title.trim() });
  // Check both the destination and the reservation left behind in a shared slot.
  for (const date of new Set([
    state.tasks.find((item) => item.id === taskId)!.date,
    task.date,
  ])) {
    const slots = slotsFor(next, date);
    if (
      slots.some(
        (slot, index) =>
          (slot.tasks[0].goalId !== null &&
            (slot.start < availableHours(next.settings).start ||
              slot.start + slot.duration >
                availableHours(next.settings).end)) ||
          (index > 0 &&
            slot.start < slots[index - 1].start + slots[index - 1].duration),
      )
    )
      throw new Error(
        "This time overlaps another task or shared reservation. Choose a free time.",
      );
  }
  return commit(state, next, "Task updated");
}

function validateEvent(
  state: CalendarState,
  event: TaskEdit,
  ignoreId: string | null = null,
) {
  if (
    typeof event.title !== "string" ||
    !event.title.trim() ||
    event.title.trim().length > 180
  )
    throw new Error("Enter an event name of 1–180 characters.");
  if (!validDate(event.date)) throw new Error("Choose a valid date.");
  if (event.allDay !== undefined && typeof event.allDay !== "boolean")
    throw new Error("Choose whether this event is all day.");
  if (
    event.repeat !== undefined &&
    event.repeat !== "none" &&
    !isEventRepeat(event.repeat)
  )
    throw new Error("Choose a valid repeat interval.");
  if (event.allDay) return;
  if (
    !Number.isInteger(event.start) ||
    event.start < 0 ||
    event.start >= 1440 ||
    !Number.isInteger(event.minutes) ||
    event.minutes < 5 ||
    event.start + event.minutes > 1440
  )
    throw new Error(
      "Choose an end time at least 5 minutes after the start, within the same day.",
    );
  if (
    slotsFor(state, event.date, ignoreId).some(
      (slot) =>
        event.start < slot.start + slot.duration &&
        event.start + event.minutes > slot.start,
    )
  )
    throw new Error(
      "This time overlaps another event or planned task. Choose a free time.",
    );
}

function eventDetails(event: TaskEdit): TaskEdit {
  return {
    title: event.title.trim(),
    date: event.date,
    start: event.allDay ? 0 : event.start,
    minutes: event.allDay ? 1440 : event.minutes,
    ...(event.allDay ? { allDay: true } : {}),
  };
}

function attachEventSeries(
  state: CalendarState,
  task: Task,
  edit: TaskEdit,
  repeat: EventRepeat,
) {
  const details = eventDetails(edit);
  const series: EventSeries = {
    id: id(),
    repeat,
    anchor: edit.date,
    title: details.title,
    start: details.start,
    minutes: details.minutes,
    ...(details.allDay ? { allDay: true } : {}),
    excludedDates: [],
  };
  (state.eventSeries ??= []).push(series);
  task.eventSeriesId = series.id;
  task.eventOccurrenceDate = edit.date;
}

function stopSeriesFrom(
  state: CalendarState,
  series: EventSeries,
  date: string,
  keepId: string,
) {
  if (date <= series.anchor) {
    state.eventSeries = state.eventSeries?.filter(
      (item) => item.id !== series.id,
    );
  } else {
    series.until = addDays(date, -1);
    series.excludedDates = series.excludedDates.filter(
      (value) => value <= series.until!,
    );
  }
  state.tasks = state.tasks.filter((task) => {
    if (task.eventSeriesId !== series.id || task.eventOccurrenceDate! < date)
      return true;
    if (task.id === keepId || task.status === "done") {
      delete task.eventSeriesId;
      delete task.eventOccurrenceDate;
      return true;
    }
    delete state.choices[`${task.date}/${task.slotId}`];
    return false;
  });
}

const overlaps = (
  a: Pick<Task, "start" | "minutes">,
  b: Pick<Task, "start" | "minutes">,
) => a.start < b.start + b.minutes && a.start + a.minutes > b.start;

function validateRepeatConflicts(state: CalendarState, today: string) {
  validateSchedule(state, today);
  const series = state.eventSeries ?? [];
  const rank = { daily: 0, weekly: 1, fortnightly: 2, monthly: 3, yearly: 4 };
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const a = series[i],
        b = series[j];
      if (a.allDay || b.allDay || !overlaps(a, b) || !seriesCanShareDate(a, b))
        continue;
      const from = [today, a.anchor, b.anchor].sort().at(-1)!;
      // Gregorian months repeat after 400 years; 800 also preserves fortnight parity.
      const cycleEnd = `${Math.min(9999, Number(from.slice(0, 4)) + 800)}-12-31`;
      const through = [
        cycleEnd,
        a.until ?? cycleEnd,
        b.until ?? cycleEnd,
      ].sort()[0];
      if (through < from) continue;
      const rarer = rank[a.repeat] > rank[b.repeat] ? a : b;
      for (const date of eventOccurrenceDates(rarer, from, through)) {
        const eventA = eventForSeriesDate(state, a, date);
        const eventB = eventForSeriesDate(state, b, date);
        if (
          eventA &&
          eventB &&
          !eventA.allDay &&
          !eventB.allDay &&
          overlaps(eventA, eventB)
        )
          throw new Error(
            "This repeat overlaps another event. Choose a different time or repeat interval.",
          );
      }
    }
  }
}

function validateEventSeries(input: unknown): EventSeries[] | undefined {
  if (input === undefined) return;
  if (!Array.isArray(input))
    throw new Error("The backup contains invalid event repeats.");
  const series = input.map((value: EventSeries) => {
    if (
      !value ||
      typeof value.id !== "string" ||
      !/^[A-Za-z0-9_-]+$/.test(value.id) ||
      !isEventRepeat(value.repeat) ||
      !validDate(value.anchor) ||
      (value.until !== undefined &&
        (!validDate(value.until) || value.until < value.anchor)) ||
      typeof value.title !== "string" ||
      !value.title.trim() ||
      value.title.length > 180 ||
      !Number.isInteger(value.start) ||
      value.start < 0 ||
      !Number.isInteger(value.minutes) ||
      value.minutes < 5 ||
      value.start + value.minutes > 1440 ||
      (value.allDay !== undefined && typeof value.allDay !== "boolean") ||
      (value.allDay && (value.start !== 0 || value.minutes !== 1440)) ||
      !Array.isArray(value.excludedDates) ||
      value.excludedDates.some(
        (date) =>
          !validDate(date) ||
          !isEventOccurrence({ ...value, excludedDates: [] }, date),
      )
    )
      throw new Error("The backup contains an invalid event repeat.");
    return {
      id: value.id,
      repeat: value.repeat,
      anchor: value.anchor,
      title: value.title,
      start: value.start,
      minutes: value.minutes,
      excludedDates: [...new Set(value.excludedDates)],
      ...(value.until ? { until: value.until } : {}),
      ...(value.allDay ? { allDay: true } : {}),
    };
  });
  if (new Set(series.map((item) => item.id)).size !== series.length)
    throw new Error("The backup has duplicate event repeats.");
  return series;
}

export function createEvent(
  state: CalendarState,
  event: TaskEdit,
  today = localDate(state.settings.timezone),
) {
  if (typeof event.title === "string" && !event.title.trim())
    event = { ...event, title: "New event" };
  validateEvent(state, event);
  const next = copy(state);
  if (!personalCalendarFor(next))
    next.personalCalendar = {
      name: "Personal tasks",
      color: "slate",
      visible: true,
    };
  const task: Task = {
    ...eventDetails(event),
    id: id(),
    goalId: null,
    slotId: id(),
    dependsOn: [],
    status: "pending",
  };
  next.tasks.push(task);
  if (event.repeat && event.repeat !== "none") {
    attachEventSeries(next, task, event, event.repeat);
    validateRepeatConflicts(next, today);
  }
  return commit(state, next, "Event created");
}

export function removeEvent(state: CalendarState, eventId: string) {
  const event = taskFor(state, eventId);
  if (!event || event.goalId !== null)
    throw new Error("This event is no longer available.");
  const next = copy(state);
  next.tasks = next.tasks.filter((task) => task.id !== eventId);
  const series = next.eventSeries?.find(
    (item) => item.id === event.eventSeriesId,
  );
  if (
    series &&
    event.eventOccurrenceDate &&
    !series.excludedDates.includes(event.eventOccurrenceDate)
  )
    series.excludedDates.push(event.eventOccurrenceDate);
  delete next.choices[`${event.date}/${event.slotId}`];
  return commit(state, next, "Event deleted");
}
export function addTodo(state: CalendarState, title: string, minutes = 30) {
  if (typeof title !== "string" || !title.trim() || title.trim().length > 180)
    throw new Error("Enter a task name of 1–180 characters.");
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440)
    throw new Error("Choose a duration of 5–1440 minutes.");
  const next = copy(state);
  next.todos = [
    ...(next.todos ?? []),
    { id: id(), title: title.trim(), minutes, done: false },
  ];
  return commit(state, next, "To do added");
}
export function toggleTodo(state: CalendarState, todoId: string) {
  const next = copy(state);
  const todo = next.todos?.find((item) => item.id === todoId);
  if (!todo) throw new Error("This to do is no longer available.");
  todo.done = !todo.done;
  return commit(state, next, todo.done ? "To do completed" : "To do reopened");
}
export function applyTodoMutations(
  state: CalendarState,
  mutations: TodoMutation[],
  today = localDate(state.settings.timezone),
) {
  if (!Array.isArray(mutations) || !mutations.length || mutations.length > 100)
    throw new Error("Choose 1–100 to do changes.");
  const ids = mutations.flatMap((item) =>
    item.action === "add" ? [] : [item.id],
  );
  if (new Set(ids).size !== ids.length)
    throw new Error("Choose each to do only once.");
  let next = copy(state);
  for (const mutation of mutations) {
    if (mutation.action === "add") {
      next = addTodo(next, mutation.title, mutation.minutes);
      continue;
    }
    const todo = next.todos?.find((item) => item.id === mutation.id);
    if (!todo) throw new Error("This to do is no longer available.");
    if (mutation.action === "schedule") {
      next = scheduleTodo(
        next,
        todo.id,
        mutation.event.date,
        mutation.event.start,
        today,
        !!mutation.event.allDay,
        mutation.event,
      );
    } else if (mutation.action === "delete") {
      next.todos = next.todos!.filter((item) => item.id !== mutation.id);
    } else if (mutation.action === "rename") {
      if (
        typeof mutation.title !== "string" ||
        !mutation.title.trim() ||
        mutation.title.trim().length > 180
      )
        throw new Error("Enter a task name of 1–180 characters.");
      todo.title = mutation.title.trim();
    } else if (mutation.action === "complete" || mutation.action === "reopen") {
      todo.done = mutation.action === "complete";
    } else throw new Error("This to do action is not supported.");
  }
  validateBackup(next, today);
  return commit(state, next, "To do list updated");
}
export function scheduleTodo(
  state: CalendarState,
  todoId: string,
  date: string,
  start: number,
  today = localDate(state.settings.timezone),
  allDay = false,
  details?: TaskEdit,
) {
  const todo = state.todos?.find((item) => item.id === todoId);
  if (!todo || todo.done)
    throw new Error("Only unfinished to dos can be scheduled.");
  const next = createEvent(
    state,
    details ?? {
      title: todo.title,
      date,
      start: allDay ? 0 : start,
      minutes: allDay ? 1440 : todo.minutes,
      ...(allDay ? { allDay: true } : {}),
    },
    today,
  );
  next.tasks[next.tasks.length - 1].id = todo.id;
  next.todos = next.todos?.filter((item) => item.id !== todoId);
  if (next.personalCalendar) next.personalCalendar.visible = true;
  next.undo!.label = "To do scheduled";
  return next;
}
export function selectChoice(
  state: CalendarState,
  date: string,
  slotId: string,
  taskId: string,
) {
  const next = copy(state),
    slot = slotsFor(next, date).find((s) => s.id === slotId),
    task = slot?.tasks.find((t) => t.id === taskId);
  if (!slot || !task || slot.done || task.status !== "pending")
    throw new Error("This activity is no longer available.");
  next.choices[`${date}/${slotId}`] = taskId;
  const updated = slotsFor(next, date).find((s) => s.id === slotId)!;
  if (
    updated.start + updated.duration > availableHours(next.settings).end ||
    slotsFor(next, date).some(
      (s) =>
        s.id !== slotId &&
        updated.start < s.start + s.duration &&
        updated.start + updated.duration > s.start,
    )
  )
    throw new Error(
      "That choice no longer fits. Free some time or choose a shorter activity.",
    );
  return commit(state, next, "Activity choice");
}
export function completeTask(
  state: CalendarState,
  taskId: string,
  today = localDate(state.settings.timezone),
) {
  const next = copy(state),
    task = materializeTask(next, taskId);
  if (
    !task ||
    task.status !== "pending" ||
    task.date !== today ||
    isBlocked(next, task)
  )
    throw new Error("This task is not actionable today.");
  const slot = (
    task.allDay ? allDaySlotsFor(next, task.date) : slotsFor(next, task.date)
  ).find((s) => s.id === task.slotId);
  if (
    !slot ||
    slot.done ||
    (slot.tasks.length > 1 && slot.chosen?.id !== task.id)
  )
    throw new Error("Choose one activity before completing this slot.");
  task.status = "done";
  next.choices[`${task.date}/${task.slotId}`] = task.id;
  for (const alternative of slot.tasks)
    if (alternative.id !== task.id && alternative.activityId)
      alternative.status = "skipped";
  return commit(state, next, "Task completion");
}
export function catchUp(
  state: CalendarState,
  today = localDate(state.settings.timezone),
  minute = availableHours(state.settings).start,
  force = false,
) {
  if (!force && state.lastRecoveryDay === today) return state;
  const next = copy(state),
    beforeDates = new Map(state.tasks.map((t) => [t.id, t.date]));
  const overdue = next.tasks.filter(
    (t) =>
      t.status === "pending" &&
      t.date < today &&
      goalFor(next, t)?.status === "active",
  );
  next.lastRecoveryDay = today;
  if (!overdue.length) return next;
  const recurring = new Map();
  let consolidated = 0;
  for (const task of overdue
    .filter((t) => t.activityId)
    .sort((a, b) => b.date.localeCompare(a.date))) {
    if (recurring.has(task.activityId)) {
      task.status = "consolidated";
      consolidated++;
    } else recurring.set(task.activityId, task.id);
  }
  const hours = availableHours(next.settings);
  const target = minute >= hours.end ? addDays(today, 1) : today;
  for (const task of overdue
    .filter((t) => t.status === "pending")
    .sort((a, b) => a.date.localeCompare(b.date)))
    place(next, task, target, {
      conflict: true,
      earliest:
        target === today
          ? Math.max(hours.start, Math.ceil(minute / 5) * 5)
          : hours.start,
    });
  moveDependents(next);
  const moved = next.tasks.filter(
    (t) => t.date !== beforeDates.get(t.id),
  ).length;
  const changes = next.tasks
    .filter(
      (t) =>
        t.date !== beforeDates.get(t.id) ||
        (t.status === "consolidated" &&
          state.tasks.find((old) => old.id === t.id)?.status !==
            "consolidated"),
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      from: beforeDates.get(t.id)!,
      to: t.date,
      status: t.status,
    }));
  const choices = slotsFor(next, target).filter(
    (slot) => slot.tasks.length > 1 && !slot.done && !slot.chosen,
  ).length;
  next.recovery = { date: today, moved, consolidated, changes, choices };
  return commit(state, next, "Recovery");
}
export function undoChange(state: CalendarState) {
  if (!state.undo || state.undo.revision !== state.revision)
    throw new Error("There is no current change to undo.");
  const restored = copy(state.undo.before);
  restored.revision = state.revision + 1;
  restored.undo = null;
  restored.lastRecoveryDay = state.lastRecoveryDay;
  restored.recovery = null;
  return restored;
}
export function validatePlan(input: unknown): Plan {
  const plan = input as Plan | null | undefined;
  if (
    !plan ||
    typeof plan.goalName !== "string" ||
    !plan.goalName.trim() ||
    plan.goalName.length > 120 ||
    !["project", "recurring"].includes(plan.kind)
  )
    throw new Error("The plan needs a goal name and a valid goal type.");
  if (plan.clarification && typeof plan.clarification === "string")
    return { ...plan, tasks: [] };
  if (
    !Array.isArray(plan.tasks) ||
    !plan.tasks.length ||
    plan.tasks.length > 30
  )
    throw new Error("Add between 1 and 30 tasks.");
  if (
    plan.kind === "recurring" &&
    (typeof plan.perWeek !== "number" ||
      !Number.isInteger(plan.perWeek) ||
      plan.perWeek < 1 ||
      plan.perWeek > 7)
  )
    throw new Error("Choose 1–7 sessions per week.");
  const tasks = plan.tasks.map((t, index) => {
    if (
      typeof t.title !== "string" ||
      !t.title.trim() ||
      t.title.length > 180 ||
      !Number.isInteger(t.minutes) ||
      t.minutes < 5 ||
      t.minutes > 60
    )
      throw new Error(
        "Each task needs a title and a duration of 5–60 minutes.",
      );
    if (
      !Array.isArray(t.dependsOn) ||
      t.dependsOn.some((d) => !Number.isInteger(d) || d < 0 || d >= index)
    )
      throw new Error(
        "A prerequisite must refer to an earlier task. Reorder or remove the dependency.",
      );
    return {
      title: t.title.trim(),
      minutes: t.minutes,
      dependsOn: [...new Set(t.dependsOn)],
    };
  });
  return {
    goalName: plan.goalName.trim(),
    kind: plan.kind,
    perWeek: plan.kind === "recurring" ? plan.perWeek : null,
    clarification: null,
    tasks,
  };
}
export function approvePlan(
  state: CalendarState,
  raw: unknown,
  {
    later = false,
    today = localDate(state.settings.timezone),
  }: ScheduleOptions = {},
) {
  const plan = validatePlan(raw);
  if (plan.clarification)
    throw new Error("Answer the clarification before scheduling.");
  const next = copy(state);
  const goalId = id(),
    goal: CalendarState["goals"][number] = {
      id: goalId,
      name: plan.goalName,
      color: COLORS[next.goals.length % COLORS.length],
      status: later ? "later" : "active",
      recurrence:
        plan.kind === "recurring"
          ? {
              perWeek: plan.perWeek!,
              anchor: today,
              templates: plan.tasks.map((t) => ({
                title: t.title,
                minutes: t.minutes,
              })),
            }
          : null,
    };
  next.goals.push(goal);
  const created: Task[] = [];
  for (let index = 0; index < plan.tasks.length; index++) {
    const source = plan.tasks[index],
      task: Task = {
        id: id(),
        goalId,
        title: source.title,
        minutes: source.minutes,
        date: today,
        start: availableHours(next.settings).start,
        slotId: id(),
        dependsOn: source.dependsOn.map((d) => created[d].id),
        status: "pending",
      };
    if (plan.kind === "recurring") {
      task.activityId = goalId;
      task.occurrenceKey = addDays(
        today,
        Math.floor((index * 7) / plan.perWeek!),
      );
      task.dependsOn = [];
    }
    created.push(task);
    const dependencies = task.dependsOn
      .map((key) => created.find((t) => t.id === key)?.date)
      .filter((date): date is string => !!date)
      .sort();
    const first =
      plan.kind === "recurring"
        ? task.occurrenceKey!
        : dependencies.length
          ? addDays(dependencies.at(-1)!, 1)
          : today;
    task.date = first;
    if (!later) place(next, task, first, { conflict: true });
    next.tasks.push(task);
  }
  if (!later) moveDependents(next);
  next.draft = null;
  next.sample = false;
  return commit(state, next, later ? "Saved in Later" : "Plan approved");
}
export function deleteGoal(
  state: CalendarState,
  goalId: string,
  today = localDate(state.settings.timezone),
) {
  if (!state.goals.some((goal) => goal.id === goalId))
    throw new Error("This goal is no longer available.");
  const next = copy(state);
  const removedIds = new Set(
    next.tasks.filter((task) => task.goalId === goalId).map((task) => task.id),
  );
  next.goals = next.goals.filter((goal) => goal.id !== goalId);
  next.tasks = next.tasks.filter((task) => !removedIds.has(task.id));
  for (const task of next.tasks)
    task.dependsOn = task.dependsOn.filter((key) => !removedIds.has(key));
  for (const [key, taskId] of Object.entries(next.choices))
    if (removedIds.has(taskId)) delete next.choices[key];
  try {
    validateBackup(next, today);
  } catch {
    throw new Error(
      "This goal could not be deleted because a remaining shared reservation would conflict. Move the other activity to a free time, then try again.",
    );
  }
  return commit(state, next, "Goal deleted");
}

export function editGoal(
  state: CalendarState,
  goalId: string,
  edit: GoalEdit,
  today = localDate(state.settings.timezone),
) {
  const next = copy(state);
  const goal = next.goals.find((item) => item.id === goalId);
  if (!goal || goal.status !== "active")
    throw new Error("Only active goals can be edited.");
  if (edit.color !== undefined && !COLORS.includes(edit.color))
    throw new Error("Choose a valid goal colour.");
  if (
    typeof edit.name !== "string" ||
    !edit.name.trim() ||
    edit.name.trim().length > 120
  )
    throw new Error("Enter a goal name of 1–120 characters.");
  if (!["project", "recurring"].includes(edit.kind))
    throw new Error("Choose a valid goal type.");
  const originalPending = state.tasks.filter(
    (task) => task.goalId === goalId && task.status === "pending",
  );
  const completed = state.tasks.filter(
    (task) => task.goalId === goalId && task.status === "done",
  );
  if (
    !Array.isArray(edit.steps) ||
    edit.steps.length > Math.max(30, originalPending.length) ||
    (!edit.steps.length && (edit.kind === "recurring" || !completed.length))
  )
    throw new Error(
      "Keep at least one step, or a completed step, and add no more than 30 steps.",
    );
  if (
    edit.kind === "recurring" &&
    (!Number.isInteger(edit.perWeek) || edit.perWeek! < 1 || edit.perWeek! > 7)
  )
    throw new Error("Choose 1–7 sessions per week.");
  const allowed = new Set(completed.map((task) => task.id));
  const ids = new Set<string>();
  const steps = edit.steps.map((step) => {
    if (
      typeof step.id !== "string" ||
      !step.id ||
      ids.has(step.id) ||
      (state.tasks.some((task) => task.id === step.id) &&
        !originalPending.some((task) => task.id === step.id))
    )
      throw new Error("Each editable step needs its own valid identity.");
    if (
      typeof step.title !== "string" ||
      !step.title.trim() ||
      step.title.trim().length > 180 ||
      !Number.isInteger(step.minutes) ||
      step.minutes < 5 ||
      step.minutes > 60
    )
      throw new Error(
        "Each task needs a title and a duration of 5–60 minutes.",
      );
    if (
      !Array.isArray(step.dependsOn) ||
      (edit.kind === "recurring" && step.dependsOn.length) ||
      step.dependsOn.some((key) => !allowed.has(key))
    )
      throw new Error(
        "Choose completed or earlier steps as prerequisites. Recurring activities cannot have prerequisites.",
      );
    ids.add(step.id);
    allowed.add(step.id);
    return {
      ...step,
      title: step.title.trim(),
      dependsOn: [...new Set(step.dependsOn)],
    };
  });
  goal.name = edit.name.trim();
  if (edit.color !== undefined) goal.color = edit.color;
  const wasRecurring = !!goal.recurrence;
  const templates = steps.map(({ title, minutes }) => ({ title, minutes }));
  const recurringUnchanged =
    wasRecurring &&
    edit.kind === "recurring" &&
    goal.recurrence!.perWeek === edit.perWeek &&
    JSON.stringify(goal.recurrence!.templates) === JSON.stringify(templates);
  if (recurringUnchanged) return commit(state, next, "Goal updated");
  if (edit.kind === "recurring") {
    const anchor =
      wasRecurring && goal.recurrence!.perWeek === edit.perWeek
        ? goal.recurrence!.anchor
        : today;
    goal.recurrence = { anchor, perWeek: edit.perWeek!, templates };
    validateRecurringHours(next.goals, next.settings);
    next.tasks = next.tasks.filter(
      (task) => task.goalId !== goalId || task.status !== "pending",
    );
  } else {
    goal.recurrence = null;
    next.tasks = next.tasks.filter(
      (task) => task.goalId !== goalId || task.status !== "pending",
    );
    // Historical occurrences keep their progress and schedule after recurrence is disabled.
    for (const task of next.tasks.filter((task) => task.goalId === goalId)) {
      delete task.activityId;
      delete task.occurrenceKey;
    }
    const pending = steps.map((step) => {
      const old = !wasRecurring
        ? originalPending.find((task) => task.id === step.id)
        : undefined;
      const task: Task = old
        ? { ...copy(old), ...step }
        : {
            ...step,
            goalId,
            status: "pending",
            date: today,
            start: availableHours(next.settings).start,
            slotId: id(),
          };
      return { task, old };
    });
    // Keep existing reservations for steps whose duration and prerequisites did not change.
    const unchanged = pending.filter(
      ({ task, old }) =>
        old &&
        task.minutes === old.minutes &&
        JSON.stringify(task.dependsOn) === JSON.stringify(old.dependsOn),
    );
    next.tasks.push(...unchanged.map(({ task }) => task));
    const kept = new Set(unchanged.map(({ task }) => task.id));
    for (const { task, old } of pending.filter(
      ({ task }) => !kept.has(task.id),
    )) {
      const dependencies = task.dependsOn
        .map((key) => next.tasks.find((item) => item.id === key))
        .filter((item): item is Task => !!item && item.status !== "done");
      const first = [
        today,
        old?.date || today,
        ...dependencies.map((item) => addDays(item.date, 1)),
      ]
        .sort()
        .at(-1)!;
      place(next, task, first);
      next.tasks.push(task);
    }
    moveDependents(next);
  }
  for (const [key, taskId] of Object.entries(next.choices)) {
    if (
      !next.tasks.some(
        (task) => task.id === taskId && `${task.date}/${task.slotId}` === key,
      )
    )
      delete next.choices[key];
  }
  const scheduled =
    edit.kind === "recurring" ? extendRecurrences(next, today, goalId) : next;
  const remaining = new Map(scheduled.tasks.map((task) => [task.id, task]));
  scheduled.tasks = state.tasks
    .flatMap((task) => {
      const updated = remaining.get(task.id);
      remaining.delete(task.id);
      return updated ? [updated] : [];
    })
    .concat([...remaining.values()]);
  validateBackup(scheduled, today);
  return commit(state, scheduled, "Goal updated");
}
export function activateGoal(
  state: CalendarState,
  goalId: string,
  {
    today = localDate(state.settings.timezone),
  }: Pick<ScheduleOptions, "today"> = {},
) {
  const next = copy(state),
    goal = next.goals.find((g) => g.id === goalId);
  if (!goal || goal.status !== "later")
    throw new Error("This goal is already active.");
  goal.status = "active";
  if (goal.recurrence) goal.recurrence.anchor = today;
  const pending = next.tasks.filter(
    (t) => t.goalId === goalId && t.status === "pending",
  );
  for (let i = 0; i < pending.length; i++) {
    const task = pending[i];
    if (goal.recurrence)
      task.occurrenceKey = addDays(
        today,
        Math.floor((i * 7) / goal.recurrence.perWeek),
      );
    place(
      next,
      task,
      goal.recurrence
        ? task.occurrenceKey!
        : task.date < today
          ? today
          : task.date,
    );
  }
  moveDependents(next);
  return commit(state, next, "Goal activated");
}
export function extendRecurrences(
  state: CalendarState,
  today = localDate(state.settings.timezone),
  goalId?: string,
) {
  const next = copy(state);
  for (const goal of next.goals.filter(
    (g) =>
      g.status === "active" && g.recurrence && (!goalId || g.id === goalId),
  )) {
    const { anchor, perWeek, templates } = goal.recurrence!;
    const days = Math.floor(
        (Date.parse(today) - Date.parse(anchor)) / 86400000,
      ),
      first = Math.max(0, Math.floor((days * perWeek) / 7) - 1);
    for (let n = first; n < first + perWeek * 3 + 3; n++) {
      const date = addDays(anchor, Math.floor((n * 7) / perWeek));
      if (date < today || date > addDays(today, 14)) continue;
      if (
        next.tasks.some(
          (t) => t.activityId === goal.id && t.occurrenceKey === date,
        )
      )
        continue;
      const source = templates[n % templates.length],
        task: Task = {
          id: id(),
          goalId: goal.id,
          title: source.title,
          minutes: source.minutes,
          date,
          start: availableHours(next.settings).start,
          slotId: id(),
          dependsOn: [],
          status: "pending",
          activityId: goal.id,
          occurrenceKey: date,
        };
      place(next, task, date);
      next.tasks.push(task);
    }
  }
  return next;
}
export function updateSettings(
  state: CalendarState,
  settings: Settings,
  today = localDate(settings.timezone),
) {
  const next = copy(state);
  next.settings = validateSettings(settings);
  validateRecurringHours(next.goals, next.settings);
  const hours = availableHours(next.settings);
  const previousHours = availableHours(state.settings);
  if (
    hours.start <= previousHours.start &&
    hours.end >= previousHours.end &&
    next.settings.timezone === state.settings.timezone
  ) {
    validateSchedule(next, today);
    return commit(state, next, "Calendar settings");
  }
  for (const date of new Set(
    next.tasks
      .filter((t) => t.status === "done" && t.date >= today)
      .map((t) => t.date),
  )) {
    const finished = slotsFor(next, date).filter(
      (s) => s.done && s.tasks[0].goalId !== null,
    );
    if (
      finished.some(
        (s) => s.start < hours.start || s.start + s.duration > hours.end,
      )
    )
      throw new Error(
        "These settings exclude work already completed today. Include that time, or change the settings tomorrow.",
      );
  }
  const tasks = next.tasks
    .filter(
      (t) =>
        t.status === "pending" &&
        t.date >= today &&
        goalFor(next, t)?.status === "active",
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  const originals = [...new Set(tasks.map((t) => t.date))].flatMap((date) =>
    slotsFor(state, date)
      .filter((slot) =>
        slot.tasks.some((t) => t.goalId !== null && t.status === "pending"),
      )
      .map((slot) => ({
        ...slot,
        wasDone: slot.done,
        tasks: slot.tasks.filter((t) => t.status === "pending"),
        chosen: slot.done ? null : slot.chosen,
        duration: slot.done
          ? Math.max(
              ...slot.tasks
                .filter((t) => t.status === "pending")
                .map((t) => t.minutes),
            )
          : slot.duration,
      })),
  );
  for (const task of tasks) task.date = "9999-01-01";
  for (const original of originals) {
    const representative = {
      ...next.tasks.find((t) => t.id === original.tasks[0].id)!,
      minutes: original.duration,
    };
    place(
      next,
      representative,
      original.wasDone ? addDays(original.date, 1) : original.date,
      { conflict: !original.chosen },
    );
    for (const member of original.tasks) {
      const task = next.tasks.find((t) => t.id === member.id)!;
      Object.assign(task, {
        date: representative.date,
        start: representative.start,
        slotId: representative.slotId,
      });
    }
    if (original.chosen)
      next.choices[`${representative.date}/${representative.slotId}`] =
        original.chosen.id;
  }
  moveDependents(next);
  validateSchedule(next, today);
  return commit(state, next, "Planning settings");
}
function validateSettings(input: unknown): Settings {
  const s = input as Settings | null | undefined;
  if (!s) throw new Error("Choose valid goal settings.");
  const useAvailableTime =
    s.useAvailableTime === undefined ? true : s.useAvailableTime;
  if (typeof useAvailableTime !== "boolean")
    throw new Error("Choose whether to set available time.");
  const validHours =
    Number.isInteger(s.start) &&
    Number.isInteger(s.end) &&
    s.start >= 0 &&
    s.end <= 1440 &&
    s.end - s.start >= 5;
  if (useAvailableTime && !validHours)
    throw new Error(
      "Available hours must span at least 5 minutes within one day.",
    );
  try {
    if (typeof s.timezone !== "string" || !s.timezone)
      throw new Error("Missing timezone");
    new Intl.DateTimeFormat("en", { timeZone: s.timezone }).format();
  } catch {
    throw new Error("Choose a valid timezone.");
  }
  const language =
    s.language === undefined
      ? DEFAULT_CALENDAR_PREFERENCES.language
      : s.language;
  const showWeekNumbers =
    s.showWeekNumbers === undefined
      ? DEFAULT_CALENDAR_PREFERENCES.showWeekNumbers
      : s.showWeekNumbers;
  const weekStartsOn =
    s.weekStartsOn === undefined
      ? DEFAULT_CALENDAR_PREFERENCES.weekStartsOn
      : s.weekStartsOn;
  const holidayCalendar =
    s.holidayCalendar === undefined
      ? DEFAULT_CALENDAR_PREFERENCES.holidayCalendar
      : s.holidayCalendar;
  if (!INTERFACE_LANGUAGES.some((entry) => entry.value === language))
    throw new Error("Choose a supported interface language.");
  if (typeof showWeekNumbers !== "boolean")
    throw new Error("Choose whether to show week numbers.");
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6)
    throw new Error("Choose a valid first day of the week.");
  if (!isHolidayCalendar(holidayCalendar))
    throw new Error("Choose a supported public holiday calendar.");
  return {
    useAvailableTime,
    start: validHours ? s.start : 1080,
    end: validHours ? s.end : 1260,
    timezone: s.timezone,
    language,
    showWeekNumbers,
    weekStartsOn,
    holidayCalendar,
  };
}
function validateRecurringHours(
  goals: CalendarState["goals"],
  settings: Settings,
) {
  const hours = availableHours(settings);
  const availableMinutes = hours.end - hours.start;
  for (const goal of goals)
    if (
      goal.status === "active" &&
      goal.recurrence?.templates.some((t) => t.minutes > availableMinutes)
    )
      throw new Error(
        `Recurring steps for “${goal.name}” exceed your available hours. Increase the available window first.`,
      );
}
function validateSchedule(state: CalendarState, today: string) {
  const hours = availableHours(state.settings);
  for (const date of new Set(
    state.tasks.filter((t) => t.date >= today).map((t) => t.date),
  )) {
    const slots = slotsFor(state, date);
    if (
      slots.some(
        (s, i) =>
          (s.tasks[0].goalId !== null &&
            (s.start < hours.start || s.start + s.duration > hours.end)) ||
          (i > 0 && s.start < slots[i - 1].start + slots[i - 1].duration),
      )
    )
      throw new Error(
        "The backup schedule exceeds capacity or has overlapping slots.",
      );
  }
}
export function validateBackup(input: unknown, today?: string): CalendarState {
  const raw = input as CalendarState | null | undefined;
  if (
    !raw ||
    raw.version !== 1 ||
    !Array.isArray(raw.goals) ||
    !Array.isArray(raw.tasks)
  )
    throw new Error("This is not a supported calendar backup.");
  const settings = validateSettings(raw.settings);
  today ??= localDate(settings.timezone);
  const goals = raw.goals.map((g) => {
    if (
      typeof g.id !== "string" ||
      typeof g.name !== "string" ||
      !g.name.trim() ||
      g.name.length > 120 ||
      !COLORS.includes(g.color) ||
      !["active", "later"].includes(g.status)
    )
      throw new Error("The backup contains an invalid goal.");
    if (
      g.recurrence &&
      (!Number.isInteger(g.recurrence.perWeek) ||
        g.recurrence.perWeek < 1 ||
        g.recurrence.perWeek > 7 ||
        !validDate(g.recurrence.anchor) ||
        !Array.isArray(g.recurrence.templates) ||
        !g.recurrence.templates.length ||
        g.recurrence.templates.some(
          (t) =>
            typeof t.title !== "string" ||
            !t.title.trim() ||
            !Number.isInteger(t.minutes) ||
            t.minutes < 5 ||
            t.minutes > 60,
        ))
    )
      throw new Error("The backup contains an invalid recurring goal.");
    return {
      id: g.id,
      name: g.name,
      color: g.color,
      status: g.status,
      recurrence: g.recurrence ? copy(g.recurrence) : null,
    };
  });
  if (new Set(goals.map((g) => g.id)).size !== goals.length)
    throw new Error("The backup has duplicate goals.");
  validateRecurringHours(goals, settings);
  const eventSeries = validateEventSeries(raw.eventSeries);
  const tasks = raw.tasks.map((t) => {
    if (
      typeof t.id !== "string" ||
      (t.goalId !== null && !goals.some((g) => g.id === t.goalId)) ||
      typeof t.title !== "string" ||
      !t.title.trim() ||
      t.title.length > 180 ||
      !Number.isInteger(t.minutes) ||
      t.minutes < 5 ||
      t.minutes > (t.goalId === null ? 1440 : 60) ||
      !validDate(t.date) ||
      !Number.isInteger(t.start) ||
      t.start < 0 ||
      t.start + t.minutes > 1440 ||
      typeof t.slotId !== "string" ||
      !Array.isArray(t.dependsOn) ||
      !["pending", "done", "skipped", "consolidated"].includes(t.status)
    )
      throw new Error("The backup contains an invalid task.");
    if (
      (t.allDay !== undefined && typeof t.allDay !== "boolean") ||
      (t.allDay && (t.goalId !== null || t.start !== 0 || t.minutes !== 1440))
    )
      throw new Error("The backup contains an invalid all-day event.");
    if (t.eventSeriesId !== undefined || t.eventOccurrenceDate !== undefined) {
      const series = eventSeries?.find((item) => item.id === t.eventSeriesId);
      if (
        t.goalId !== null ||
        !series ||
        !validDate(t.eventOccurrenceDate) ||
        !isEventOccurrence(series, t.eventOccurrenceDate)
      )
        throw new Error("The backup contains an invalid event occurrence.");
    }
    if (
      t.goalId === null &&
      (t.dependsOn.length > 0 ||
        t.activityId !== undefined ||
        t.occurrenceKey !== undefined ||
        !["pending", "done"].includes(t.status) ||
        raw.tasks.some(
          (other) =>
            other.id !== t.id &&
            other.date === t.date &&
            other.slotId === t.slotId,
        ))
    )
      throw new Error("The backup contains an invalid standalone event.");
    if (
      t.activityId &&
      (t.activityId !== t.goalId ||
        !validDate(t.occurrenceKey) ||
        !goals.find((g) => g.id === t.goalId)?.recurrence)
    )
      throw new Error("The backup contains an invalid recurring occurrence.");
    return {
      id: t.id,
      goalId: t.goalId,
      title: t.title,
      minutes: t.minutes,
      date: t.date,
      start: t.start,
      slotId: t.slotId,
      dependsOn: [...t.dependsOn],
      status: t.status,
      ...(t.allDay ? { allDay: true } : {}),
      ...(t.eventSeriesId
        ? {
            eventSeriesId: t.eventSeriesId,
            eventOccurrenceDate: t.eventOccurrenceDate,
          }
        : {}),
      ...(t.activityId
        ? { activityId: t.activityId, occurrenceKey: t.occurrenceKey }
        : {}),
    };
  });
  if (new Set(tasks.map((t) => t.id)).size !== tasks.length)
    throw new Error("The backup has duplicate tasks.");
  const occurrences = tasks
    .filter((task) => task.eventSeriesId)
    .map((task) => `${task.eventSeriesId}/${task.eventOccurrenceDate}`);
  if (new Set(occurrences).size !== occurrences.length)
    throw new Error("The backup has duplicate event occurrences.");
  const visited = new Set(),
    visiting = new Set();
  function visit(t: Task) {
    if (visiting.has(t.id))
      throw new Error("The backup has a dependency cycle.");
    if (visited.has(t.id)) return;
    visiting.add(t.id);
    for (const key of t.dependsOn) {
      const dep = tasks.find((d) => d.id === key);
      if (!dep || dep.goalId !== t.goalId)
        throw new Error("The backup has an invalid prerequisite.");
      visit(dep);
    }
    visiting.delete(t.id);
    visited.add(t.id);
  }
  tasks.forEach(visit);
  const draft = validDraft(raw.draft) ? copy(raw.draft) : null;
  if (
    raw.personalCalendar !== undefined &&
    raw.personalCalendar !== null &&
    (typeof raw.personalCalendar.name !== "string" ||
      !raw.personalCalendar.name.trim() ||
      raw.personalCalendar.name.length > 120 ||
      !COLORS.includes(raw.personalCalendar.color) ||
      typeof raw.personalCalendar.visible !== "boolean")
  )
    throw new Error("The backup contains an invalid calendar group.");
  const next: CalendarState = {
    ...(raw.personalCalendar !== undefined
      ? { personalCalendar: copy(raw.personalCalendar) }
      : {}),
    version: 1,
    revision: Number.isInteger(raw.revision) ? raw.revision : 0,
    sample: !!raw.sample,
    goals,
    tasks,
    ...(raw.todos !== undefined
      ? { todos: validateTodos(raw.todos, tasks) }
      : {}),
    ...(eventSeries ? { eventSeries } : {}),
    settings,
    choices: {},
    draft,
    undo: null,
    recovery: null,
    lastRecoveryDay: validDate(raw.lastRecoveryDay) ? raw.lastRecoveryDay : "",
  };
  for (const [key, value] of Object.entries(raw.choices || {}))
    if (tasks.some((t) => `${t.date}/${t.slotId}` === key && t.id === value))
      next.choices[key] = value;
  validateRepeatConflicts(next, today);
  return next;
}
function validateTodos(input: unknown, tasks: Task[]): Todo[] {
  if (!Array.isArray(input))
    throw new Error("The backup contains an invalid to do list.");
  const seen = new Set(tasks.map((task) => task.id));
  return input.map((todo) => {
    if (
      !todo ||
      typeof todo.id !== "string" ||
      !todo.id ||
      seen.has(todo.id) ||
      typeof todo.title !== "string" ||
      !todo.title.trim() ||
      todo.title.length > 180 ||
      typeof todo.done !== "boolean" ||
      !Number.isInteger(todo.minutes) ||
      todo.minutes < 5 ||
      todo.minutes > 1440
    )
      throw new Error("The backup contains an invalid to do list.");
    seen.add(todo.id);
    return {
      id: todo.id,
      title: todo.title,
      minutes: todo.minutes,
      done: todo.done,
    };
  });
}
function validDate(date: unknown): date is string {
  return (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date + "T12:00:00Z")) &&
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date
  );
}
function validDraft(input: unknown): input is PlannerDraft {
  const draft = input as PlannerDraft | null | undefined;
  if (
    !draft ||
    typeof draft.intention !== "string" ||
    draft.intention.length > 4000
  )
    return false;
  const p = draft.plan;
  if (p === null) return true;
  if (
    !p ||
    typeof p.goalName !== "string" ||
    p.goalName.length > 120 ||
    !["project", "recurring"].includes(p.kind) ||
    !Array.isArray(p.tasks) ||
    p.tasks.length > 30 ||
    (p.clarification !== null && typeof p.clarification !== "string")
  )
    return false;
  return p.tasks.every(
    (t, i) =>
      typeof t.title === "string" &&
      t.title.length <= 180 &&
      Number.isFinite(t.minutes) &&
      Array.isArray(t.dependsOn) &&
      t.dependsOn.every((d) => Number.isInteger(d) && d >= 0 && d < i),
  );
}
export function importBackup(
  state: CalendarState,
  raw: unknown,
  today?: string,
) {
  return commit(state, validateBackup(raw, today), "Backup import");
}
export function resetWorkspace(
  state: CalendarState,
  today = localDate(state.settings.timezone),
) {
  return commit(state, blank(today), "Fresh workspace");
}
