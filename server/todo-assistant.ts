import type {
  AssistantResult,
  CalendarState,
  TodoRequest,
  TodoMutation,
  TodoChange,
} from "../src/types.js";
import { applyTodoMutations, localDate, localMinute } from "../src/calendar.js";
import type { CalendarStore } from "./calendar-store.js";

export function validateTodoRequest(input: unknown): TodoRequest {
  const request = input as TodoRequest | null;
  if (
    !request ||
    ![
      "list",
      "add",
      "rename",
      "complete",
      "reopen",
      "delete",
      "schedule",
    ].includes(request.action) ||
    !["pending", "completed", "all"].includes(request.status) ||
    !Array.isArray(request.terms) ||
    request.terms.length > 8 ||
    request.terms.some(
      (term) => typeof term !== "string" || !term.trim() || term.length > 180,
    ) ||
    !Array.isArray(request.items) ||
    request.items.length > 100 ||
    request.items.some(
      (item) =>
        !item ||
        typeof item.title !== "string" ||
        !item.title.trim() ||
        item.title.length > 180 ||
        !Number.isInteger(item.minutes) ||
        item.minutes < 5 ||
        item.minutes > 1440,
    )
  )
    throw new Error("Appa returned an invalid to do request. Try again.");
  if (request.action === "add" && !request.items.length)
    throw new Error("Give the new to do a name.");
  if (
    request.action === "rename" &&
    (typeof request.title !== "string" ||
      !request.title.trim() ||
      request.title.length > 180)
  )
    throw new Error("Give the to do a new name.");
  if (request.action === "schedule") {
    const schedule = request.schedule;
    const date = schedule && new Date(schedule.date + "T12:00:00Z");
    if (
      !schedule ||
      typeof schedule.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(schedule.date) ||
      !date ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== schedule.date ||
      !Number.isInteger(schedule.start) ||
      schedule.start < 0 ||
      schedule.start > 1435 ||
      typeof schedule.allDay !== "boolean" ||
      (schedule.minutes !== null &&
        (!Number.isInteger(schedule.minutes) ||
          schedule.minutes < 5 ||
          schedule.minutes > 1440))
    )
      throw new Error("Specify a date and valid time to schedule this to do.");
  }
  return {
    action: request.action,
    terms: request.terms.map((term) => term.trim()),
    status: request.status,
    items:
      request.action === "add"
        ? request.items.map((item) => ({
            title: item.title.trim(),
            minutes: item.minutes,
          }))
        : [],
    title: request.action === "rename" ? request.title!.trim() : null,
    schedule:
      request.action === "schedule"
        ? {
            date: request.schedule!.date,
            start: request.schedule!.start,
            minutes: request.schedule!.minutes,
            allDay: request.schedule!.allDay,
          }
        : null,
  };
}

function matchingTodos(state: CalendarState, request: TodoRequest) {
  return (state.todos ?? []).filter(
    (todo) =>
      (!request.terms.length ||
        request.terms.some((term) =>
          todo.title.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
        )) &&
      (request.status === "all" ||
        todo.done === (request.status === "completed")) &&
      ((request.action !== "complete" && request.action !== "schedule") ||
        !todo.done) &&
      (request.action !== "reopen" || todo.done),
  );
}

function currentTimes(state: CalendarState, mutations: TodoMutation[]) {
  const today = localDate(state.settings.timezone);
  const minute = localMinute(state.settings.timezone);
  for (const mutation of mutations) {
    if (mutation.action !== "schedule") continue;
    if (
      mutation.event.date < today ||
      (!mutation.event.allDay &&
        mutation.event.date === today &&
        mutation.event.start < minute)
    )
      throw new Error(
        "That time has passed. Choose a future time for this to do.",
      );
  }
}

function mutationsFor(
  state: CalendarState,
  request: TodoRequest,
  ids: string[],
): TodoMutation[] {
  if (request.action === "add")
    return request.items.map((item) => ({
      action: "add",
      title: item.title,
      minutes: item.minutes,
    }));
  if (request.action === "list")
    throw new Error("Viewing the list does not change it.");
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length)
    throw new Error("Select 1–100 distinct to dos.");
  if (["rename", "schedule"].includes(request.action) && ids.length !== 1)
    throw new Error("Choose one to do to rename or schedule.");
  return ids.map((id): TodoMutation => {
    const todo = state.todos?.find((item) => item.id === id);
    if (!todo) throw new Error("This to do is no longer available.");
    if (request.action === "schedule") {
      const schedule = request.schedule!;
      return {
        action: "schedule",
        id,
        event: {
          title: todo.title,
          date: schedule.date,
          start: schedule.allDay ? 0 : schedule.start,
          minutes: schedule.allDay ? 1440 : (schedule.minutes ?? todo.minutes),
          ...(schedule.allDay ? { allDay: true } : {}),
        },
      };
    }
    if (request.action === "rename")
      return { action: "rename", id, title: request.title! };
    return { action: request.action as "complete" | "reopen" | "delete", id };
  });
}

function proposal(
  store: CalendarStore,
  scope: string,
  state: CalendarState,
  request: TodoRequest,
  ids: string[],
  version: number,
): AssistantResult {
  const mutations = mutationsFor(state, request, ids);
  currentTimes(state, mutations);
  const next = applyTodoMutations(state, mutations);
  const changes: TodoChange[] = [];
  const before = new Map((state.todos ?? []).map((todo) => [todo.id, todo]));
  const after = new Map((next.todos ?? []).map((todo) => [todo.id, todo]));
  for (const [id, todo] of before) {
    const updated = after.get(id);
    if (
      updated &&
      updated.title === todo.title &&
      updated.minutes === todo.minutes &&
      updated.done === todo.done
    )
      continue;
    const scheduled = mutations.find(
      (mutation) => mutation.action === "schedule" && mutation.id === id,
    );
    changes.push({
      id,
      before: todo,
      after: updated ?? null,
      ...(scheduled?.action === "schedule" ? { event: scheduled.event } : {}),
    });
  }
  for (const [id, todo] of after)
    if (!before.has(id)) changes.push({ id, before: null, after: todo });
  if (!changes.length)
    return {
      kind: "todo_answer",
      message: "Those to dos already match your request. Nothing changed.",
      references: [],
      todos: [],
    };
  const proposalId = store.putProposal(scope, "todos", mutations, version);
  return {
    kind: "todo_proposal",
    message:
      "Review these to do changes before applying. Nothing has changed yet; one Undo restores the whole change.",
    references: [],
    proposalId,
    todoRequest: request,
    todoChanges: changes,
  };
}

export function prepareTodoResult(
  store: CalendarStore,
  scope: string,
  state: CalendarState,
  request: TodoRequest,
  version: number,
): AssistantResult {
  request = validateTodoRequest(request);
  if (request.action === "add")
    return proposal(store, scope, state, request, [], version);
  const matches = matchingTodos(state, request);
  const details = matches
    .slice(0, 20)
    .map(
      (todo, index) =>
        `${index + 1}. ${todo.title} — ${todo.done ? "completed" : "pending"}`,
    )
    .join("\n");
  if (!matches.length)
    return {
      kind: "todo_answer",
      message: "No to dos match that request. Nothing changed.",
      references: [],
      todos: [],
    };
  if (request.action === "list")
    return {
      kind: "todo_answer",
      message: `Found ${matches.length} matching to dos.${matches.length > 100 ? " Showing the first 100; narrow your request to see others." : ""}\n${details}`,
      references: [],
      todos: matches.slice(0, 100),
    };
  if (matches.length > 100)
    throw new Error("Narrow your request to at most 100 to dos.");
  const selectionId = store.putProposal(
    scope,
    "todo-selection",
    { request, ids: matches.map((todo) => todo.id) },
    version,
  );
  return {
    kind: "todo_selection",
    message: `Select the to dos to ${request.action}, then review the changes. Nothing has changed yet.\n${details}`,
    references: [],
    selectionId,
    todos: matches,
    todoRequest: request,
  };
}

export function previewTodoResult(
  store: CalendarStore,
  scope: string,
  selectionId: string,
  ids: string[],
): AssistantResult {
  const selected = store.proposal(scope, selectionId, "todo-selection");
  const data = selected.data as { request: TodoRequest; ids: string[] };
  if (!Array.isArray(ids) || ids.some((id) => !data.ids.includes(id)))
    throw new Error("Choose from the listed to dos.");
  const state = store.load(scope).state!;
  return proposal(
    store,
    scope,
    state,
    validateTodoRequest(data.request),
    ids,
    selected.version,
  );
}

export function applyTodoProposal(
  store: CalendarStore,
  scope: string,
  proposalId: string,
) {
  const selected = store.proposal(scope, proposalId, "todos");
  const state = store.load(scope).state!;
  const mutations = selected.data as TodoMutation[];
  currentTimes(state, mutations);
  const next = applyTodoMutations(state, mutations);
  const saved = store.save(scope, next, selected.version);
  store.removeProposal(proposalId);
  return { ...saved, state: next };
}
