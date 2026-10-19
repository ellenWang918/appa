import type { CalendarState } from "./types.js";

export function createDraftProtection(onBlocked: (action: () => void) => void) {
  const drafts = new Map<object, boolean>();
  let bypass = false;
  const run = (action: () => void) => {
    const previous = bypass;
    bypass = true;
    try {
      action();
    } finally {
      bypass = previous;
    }
  };
  return {
    drafts,
    run,
    request(action: () => void) {
      if (!bypass && [...drafts.values()].some(Boolean))
        onBlocked(() => run(action));
      else run(action);
    },
  };
}

export function goalDeletionImpact(state: CalendarState, goalId: string) {
  const tasks = state.tasks.filter((task) => task.goalId === goalId);
  const completed = tasks.filter((task) => task.status === "done").length;
  return {
    count: tasks.length,
    completed,
    impact:
      tasks.length >= 30 || completed >= 10
        ? ("high" as const)
        : tasks.length
          ? ("moderate" as const)
          : ("low" as const),
  };
}

export function calendarReplacementIsHighImpact(state: CalendarState) {
  return (
    state.tasks.length + (state.todos?.length ?? 0) >= 30 ||
    state.todos?.some((todo) => todo.done) ||
    state.tasks.some((task) => task.status === "done") ||
    (!state.sample &&
      (state.goals.length > 0 ||
        state.tasks.length > 0 ||
        !!state.eventSeries?.length ||
        !!state.todos?.length))
  );
}
