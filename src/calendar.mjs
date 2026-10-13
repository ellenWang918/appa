export const COLORS = ["indigo", "teal", "amber", "rose"];
export const id = () => globalThis.crypto.randomUUID();
export const copy = (value) => structuredClone(value);
export function localDate(timeZone = "Australia/Brisbane", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((key) => parts.find((p) => p.type === key).value)
    .join("-");
}
export function localMinute(timeZone = "Australia/Brisbane") {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  return (
    Number(parts.find((p) => p.type === "hour").value) * 60 +
    Number(parts.find((p) => p.type === "minute").value)
  );
}
export const addDays = (date, count) =>
  new Date(Date.parse(date + "T12:00:00Z") + count * 86400000)
    .toISOString()
    .slice(0, 10);
export function monday(date) {
  return addDays(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
}
export const dateLabel = (date, options = {}) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", ...options }).format(
    new Date(date + "T12:00:00Z"),
  );
export function timeLabel(minute) {
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}
export function seed(today = localDate()) {
  return {
    version: 1,
    revision: 0,
    sample: true,
    lastRecoveryDay: today,
    draft: null,
    undo: null,
    recovery: null,
    settings: {
      budget: 60,
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
export function blank(today = localDate()) {
  return { ...seed(today), sample: false, goals: [], tasks: [] };
}
export const isBlocked = (state, task) =>
  task.dependsOn.some(
    (taskId) => state.tasks.find((t) => t.id === taskId)?.status !== "done",
  );
export const goalFor = (state, task) =>
  state.goals.find((g) => g.id === task.goalId);
export function slotsFor(state, date, ignoreId = null) {
  const groups = new Map();
  for (const task of state.tasks) {
    if (
      task.id === ignoreId ||
      task.date !== date ||
      !["pending", "done"].includes(task.status) ||
      goalFor(state, task)?.status !== "active"
    )
      continue;
    if (!groups.has(task.slotId)) groups.set(task.slotId, []);
    groups.get(task.slotId).push(task);
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
export const budgetFor = (state, date) =>
  slotsFor(state, date).reduce((sum, slot) => sum + slot.duration, 0);
function fits(state, date, start, minutes, ignoreId) {
  const slots = slotsFor(state, date, ignoreId);
  return (
    start >= state.settings.start &&
    start + minutes <= state.settings.end &&
    slots.reduce((n, s) => n + s.duration, 0) + minutes <=
      state.settings.budget &&
    slots.every(
      (s) => start + minutes <= s.start || start >= s.start + s.duration,
    )
  );
}
function place(
  state,
  task,
  date,
  { conflict = false, earliest = state.settings.start } = {},
) {
  const duration = task.minutes;
  if (
    duration > state.settings.budget ||
    duration > state.settings.end - state.settings.start
  )
    throw new Error(
      `“${task.title}” is longer than your available daily time. Edit its duration first.`,
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
          s.start >= first &&
          s.tasks.some((t) => t.activityId === task.activityId),
      );
      if (related) {
        const longest = Math.max(duration, related.duration),
          used = existing.reduce((n, s) => n + s.duration, 0);
        if (
          used - related.duration + longest <= state.settings.budget &&
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
      const pending = existing.filter((s) => !s.done && s.start >= first);
      const used = existing.reduce((n, s) => n + s.duration, 0);
      for (let begin = 0; begin < pending.length; begin++)
        for (let end = begin; end < pending.length; end++) {
          const group = pending.slice(begin, end + 1),
            longest = Math.max(duration, ...group.map((s) => s.duration));
          const start = group[0].start,
            freed = group.reduce((n, s) => n + s.duration, 0),
            keys = new Set(group.map((s) => s.id));
          if (
            used - freed + longest > state.settings.budget ||
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
  throw new Error("No feasible date was found. Review your planning limits.");
}
function moveDependents(state) {
  for (let pass = 0; pass < state.tasks.length; pass++) {
    let changed = false;
    for (const task of state.tasks.filter(
      (t) => t.status === "pending" && goalFor(state, t)?.status === "active",
    )) {
      const latest = task.dependsOn
        .map((dependency) => state.tasks.find((t) => t.id === dependency))
        .filter((t) => t?.status !== "done")
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
function snapshot(state) {
  const result = copy(state);
  result.undo = null;
  return result;
}
function commit(before, after, label) {
  if (label !== "Recovery") after.recovery = null;
  after.revision = before.revision + 1;
  after.undo = { label, before: snapshot(before), revision: after.revision };
  return after;
}
export function selectChoice(state, date, slotId, taskId) {
  const next = copy(state),
    slot = slotsFor(next, date).find((s) => s.id === slotId),
    task = slot?.tasks.find((t) => t.id === taskId);
  if (!task || slot.done || task.status !== "pending")
    throw new Error("This activity is no longer available.");
  next.choices[`${date}/${slotId}`] = taskId;
  const updated = slotsFor(next, date).find((s) => s.id === slotId);
  if (
    budgetFor(next, date) > next.settings.budget ||
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
  state,
  taskId,
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
  if (slot.done || (slot.tasks.length > 1 && slot.chosen?.id !== task.id))
    throw new Error("Choose one activity before completing this slot.");
  task.status = "done";
  next.choices[`${task.date}/${task.slotId}`] = task.id;
  for (const alternative of slot.tasks)
    if (alternative.id !== task.id && alternative.activityId)
      alternative.status = "skipped";
  return commit(state, next, "Task completion");
}
export function catchUp(
  state,
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
      from: beforeDates.get(t.id),
      to: t.date,
      status: t.status,
    }));
  const choices = slotsFor(next, target).filter(
    (slot) => slot.tasks.length > 1 && !slot.done && !slot.chosen,
  ).length;
  next.recovery = { date: today, moved, consolidated, changes, choices };
  return commit(state, next, "Recovery");
}
export function undoChange(state) {
  if (!state.undo || state.undo.revision !== state.revision)
    throw new Error("There is no current change to undo.");
  const restored = copy(state.undo.before);
  restored.revision = state.revision + 1;
  restored.undo = null;
  restored.lastRecoveryDay = state.lastRecoveryDay;
  restored.recovery = null;
  return restored;
}
export function validatePlan(plan) {
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
    (!Number.isInteger(plan.perWeek) || plan.perWeek < 1 || plan.perWeek > 7)
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
  state,
  raw,
  { later = false, today = localDate(state.settings.timezone) } = {},
) {
  const plan = validatePlan(raw);
  if (plan.clarification)
    throw new Error("Answer the clarification before scheduling.");
  const next = copy(state);
  const goalId = id(),
    goal = {
      id: goalId,
      name: plan.goalName,
      color: COLORS[next.goals.length % COLORS.length],
      status: later ? "later" : "active",
      recurrence:
        plan.kind === "recurring"
          ? {
              perWeek: plan.perWeek,
              anchor: today,
              templates: plan.tasks.map((t) => ({
                title: t.title,
                minutes: t.minutes,
              })),
            }
          : null,
    };
  next.goals.push(goal);
  const created = [];
  for (let index = 0; index < plan.tasks.length; index++) {
    const source = plan.tasks[index],
      task = {
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
        Math.floor((index * 7) / plan.perWeek),
      );
      task.dependsOn = [];
    }
    created.push(task);
    const dependencies = task.dependsOn
      .map((key) => created.find((t) => t.id === key)?.date)
      .filter(Boolean)
      .sort();
    const first =
      plan.kind === "recurring"
        ? task.occurrenceKey
        : dependencies.length
          ? addDays(dependencies.at(-1), 1)
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
export function activateGoal(
  state,
  goalId,
  { today = localDate(state.settings.timezone) } = {},
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
        ? task.occurrenceKey
        : task.date < today
          ? today
          : task.date,
    );
  }
  moveDependents(next);
  return commit(state, next, "Goal activated");
}
export function extendRecurrences(
  state,
  today = localDate(state.settings.timezone),
) {
  const next = copy(state);
  for (const goal of next.goals.filter(
    (g) => g.status === "active" && g.recurrence,
  )) {
    const { anchor, perWeek, templates } = goal.recurrence;
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
        task = {
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
  state,
  settings,
  today = localDate(settings.timezone),
) {
  const next = copy(state);
  next.settings = { ...settings };
  validateSettings(next.settings);
  for (const date of new Set(
    next.tasks
      .filter((t) => t.status === "done" && t.date >= today)
      .map((t) => t.date),
  )) {
    const finished = slotsFor(next, date).filter((s) => s.done);
    if (
      finished.reduce((n, s) => n + s.duration, 0) > settings.budget ||
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
      ...next.tasks.find((t) => t.id === original.tasks[0].id),
      minutes: original.duration,
    };
    place(
      next,
      representative,
      original.wasDone ? addDays(original.date, 1) : original.date,
      { conflict: true },
    );
    const merged = next.tasks.some(
      (t) =>
        t.date === representative.date && t.slotId === representative.slotId,
    );
    for (const member of original.tasks) {
      const task = next.tasks.find((t) => t.id === member.id);
      Object.assign(task, {
        date: representative.date,
        start: representative.start,
        slotId: representative.slotId,
      });
    }
    if (original.chosen && !merged)
      next.choices[`${representative.date}/${representative.slotId}`] =
        original.chosen.id;
  }
  moveDependents(next);
  return commit(state, next, "Planning settings");
}
function validateSettings(s) {
  if (
    !s ||
    !Number.isInteger(s.start) ||
    !Number.isInteger(s.end) ||
    s.start < 0 ||
    s.end > 1440 ||
    s.end <= s.start ||
    !Number.isInteger(s.budget) ||
    s.budget < 5 ||
    s.budget > 180 ||
    s.budget > s.end - s.start
  )
    throw new Error(
      "Daily time must be 5–180 minutes and fit inside your available hours.",
    );
  try {
    new Intl.DateTimeFormat("en", { timeZone: s.timezone }).format();
  } catch {
    throw new Error("Choose a valid timezone.");
  }
}
export function validateBackup(raw, today = localDate()) {
  if (
    !raw ||
    raw.version !== 1 ||
    !Array.isArray(raw.goals) ||
    !Array.isArray(raw.tasks) ||
    raw.goals.length > 100 ||
    raw.tasks.length > 5000
  )
    throw new Error("This is not a supported calendar backup.");
  validateSettings(raw.settings);
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
  function visit(t) {
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
  const next = {
    version: 1,
    revision: Number.isInteger(raw.revision) ? raw.revision : 0,
    sample: !!raw.sample,
    goals,
    tasks,
    settings: { ...raw.settings },
    choices: {},
    draft,
    undo: null,
    recovery: null,
    lastRecoveryDay: validDate(raw.lastRecoveryDay) ? raw.lastRecoveryDay : "",
  };
  for (const [key, value] of Object.entries(raw.choices || {}))
    if (tasks.some((t) => `${t.date}/${t.slotId}` === key && t.id === value))
      next.choices[key] = value;
  for (const date of new Set(
    tasks.filter((t) => t.date >= today).map((t) => t.date),
  )) {
    const slots = slotsFor(next, date);
    if (
      budgetFor(next, date) > next.settings.budget ||
      slots.some(
        (s, i) =>
          s.start < next.settings.start ||
          s.start + s.duration > next.settings.end ||
          (i > 0 && s.start < slots[i - 1].start + slots[i - 1].duration),
      )
    )
      throw new Error(
        "The backup schedule exceeds capacity or has overlapping slots.",
      );
  }
  return next;
}
function validDate(date) {
  return (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date + "T12:00:00Z")) &&
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date
  );
}
function validDraft(draft) {
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
  state,
  raw,
  today = localDate(state.settings.timezone),
) {
  return commit(state, validateBackup(raw, today), "Backup import");
}
export function resetWorkspace(
  state,
  today = localDate(state.settings.timezone),
) {
  return commit(state, blank(today), "Fresh workspace");
}
