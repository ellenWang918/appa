import type {
  CalendarState,
  GoalColor,
  GoalEdit,
  Plan,
  PlannerDraft,
  ScheduleOptions,
  Settings,
  Slot,
  Task,
  TaskEdit,
} from "./types.js";
import {
  DEFAULT_CALENDAR_PREFERENCES,
  INTERFACE_LANGUAGES,
  isHolidayCalendar,
} from "./calendarPreferences.js";

export const COLORS: GoalColor[] = ["indigo", "teal", "amber", "rose"];
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
export function monday(date: string) {
  return weekStart(date, 1);
}
export function weekStart(date: string, startsOn = 1) {
  return addDays(
    date,
    -((new Date(date + "T12:00:00Z").getUTCDay() - startsOn + 7) % 7),
  );
}
export const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = {},
  language = "en-AU",
) =>
  new Intl.DateTimeFormat(language, { timeZone: "UTC", ...options }).format(
    new Date(date + "T12:00:00Z"),
  );
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
export function slotsFor(
  state: CalendarState,
  date: string,
  ignoreId: string | null = null,
): Slot[] {
  const groups = new Map<string, Task[]>();
  for (const task of state.tasks) {
    if (
      task.id === ignoreId ||
      task.date !== date ||
      !["pending", "done"].includes(task.status) ||
      goalFor(state, task)?.status !== "active"
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
  return (
    start >= state.settings.start &&
    start + minutes <= state.settings.end &&
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
    earliest = state.settings.start,
  }: { conflict?: boolean; earliest?: number } = {},
) {
  const duration = task.minutes;
  if (duration > state.settings.end - state.settings.start)
    throw new Error(
      `“${task.title}” is longer than your available hours. Edit its duration first.`,
    );
  for (let day = 0; day < 730; day++) {
    const target = addDays(date, day),
      first =
        day === 0
          ? Math.max(earliest, state.settings.start)
          : state.settings.start;
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
          related.start + longest <= state.settings.end &&
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
    for (
      let start = first;
      start + duration <= state.settings.end;
      start += 5
    ) {
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
            start + longest > state.settings.end ||
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
function commit(before: CalendarState, after: CalendarState, label: string) {
  if (label !== "Recovery") after.recovery = null;
  after.revision = before.revision + 1;
  after.undo = { label, before: snapshot(before), revision: after.revision };
  return after;
}
export function editTask(
  state: CalendarState,
  taskId: string,
  edit: TaskEdit,
  today = localDate(state.settings.timezone),
) {
  const next = copy(state);
  const task = next.tasks.find((item) => item.id === taskId);
  if (
    !task ||
    task.status !== "pending" ||
    goalFor(next, task)?.status !== "active"
  )
    throw new Error("Only pending tasks in active goals can be edited.");
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
    edit.start < next.settings.start ||
    edit.start + edit.minutes > next.settings.end
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
          slot.start < next.settings.start ||
          slot.start + slot.duration > next.settings.end ||
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
    updated.start + updated.duration > next.settings.end ||
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
    task = next.tasks.find((t) => t.id === taskId);
  if (
    !task ||
    task.status !== "pending" ||
    task.date !== today ||
    isBlocked(next, task)
  )
    throw new Error("This task is not actionable today.");
  const slot = slotsFor(next, task.date).find((s) => s.id === task.slotId);
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
  minute = state.settings.start,
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
  const target = minute >= next.settings.end ? addDays(today, 1) : today;
  for (const task of overdue
    .filter((t) => t.status === "pending")
    .sort((a, b) => a.date.localeCompare(b.date)))
    place(next, task, target, {
      conflict: true,
      earliest:
        target === today
          ? Math.max(next.settings.start, Math.ceil(minute / 5) * 5)
          : next.settings.start,
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
        start: next.settings.start,
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
            start: next.settings.start,
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
          start: next.settings.start,
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
  if (
    next.settings.start === state.settings.start &&
    next.settings.end === state.settings.end &&
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
    const finished = slotsFor(next, date).filter((s) => s.done);
    if (
      finished.some(
        (s) => s.start < settings.start || s.start + s.duration > settings.end,
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
      .filter((slot) => slot.tasks.some((t) => t.status === "pending"))
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
  if (
    !s ||
    !Number.isInteger(s.start) ||
    !Number.isInteger(s.end) ||
    s.start < 0 ||
    s.end > 1440 ||
    s.end - s.start < 5
  )
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
    start: s.start,
    end: s.end,
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
  const availableMinutes = settings.end - settings.start;
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
  for (const date of new Set(
    state.tasks.filter((t) => t.date >= today).map((t) => t.date),
  )) {
    const slots = slotsFor(state, date);
    if (
      slots.some(
        (s, i) =>
          s.start < state.settings.start ||
          s.start + s.duration > state.settings.end ||
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
  const tasks = raw.tasks.map((t) => {
    if (
      typeof t.id !== "string" ||
      !goals.some((g) => g.id === t.goalId) ||
      typeof t.title !== "string" ||
      !t.title.trim() ||
      t.title.length > 180 ||
      !Number.isInteger(t.minutes) ||
      t.minutes < 5 ||
      t.minutes > 60 ||
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
      ...(t.activityId
        ? { activityId: t.activityId, occurrenceKey: t.occurrenceKey }
        : {}),
    };
  });
  if (new Set(tasks.map((t) => t.id)).size !== tasks.length)
    throw new Error("The backup has duplicate tasks.");
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
  const next: CalendarState = {
    version: 1,
    revision: Number.isInteger(raw.revision) ? raw.revision : 0,
    sample: !!raw.sample,
    goals,
    tasks,
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
  validateSchedule(next, today);
  return next;
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
