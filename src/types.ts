export type GoalColor = "indigo" | "teal" | "amber" | "rose" | "slate" | "clay";
export type CalendarView = "day" | "week" | "month" | "year";
export type TaskStatus = "pending" | "done" | "skipped" | "consolidated";
export type TimelineResizeEdge = "start" | "end";
export type EventRepeat =
  "daily" | "weekly" | "fortnightly" | "monthly" | "yearly";
export type EventRepeatChoice = EventRepeat | "none";
export interface EventSeries {
  id: string;
  repeat: EventRepeat;
  anchor: string;
  until?: string;
  title: string;
  start: number;
  minutes: number;
  allDay?: boolean;
  excludedDates: string[];
}
export interface Settings {
  useAvailableTime: boolean;
  start: number;
  end: number;
  timezone: string;
  language: string;
  showWeekNumbers: boolean;
  weekStartsOn: number;
  holidayCalendar: string;
}
export interface HolidayLocation {
  country: string;
  state?: string;
  region?: string;
  label: string;
}
export interface PublicHoliday {
  name: string;
  startMinute: number;
  endMinute: number;
}
export type HolidayLookup = (date: string) => readonly PublicHoliday[];
export interface PlanTask {
  title: string;
  minutes: number;
  dependsOn: number[];
}
export interface Plan {
  goalName: string;
  kind: "project" | "recurring";
  perWeek: number | null;
  clarification: string | null;
  tasks: PlanTask[];
}
export interface PlannerDraft {
  intention: string;
  plan: Plan | null;
}
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}
export interface Recurrence {
  perWeek: number;
  anchor: string;
  templates: Pick<PlanTask, "title" | "minutes">[];
}
export interface Goal {
  id: string;
  name: string;
  color: GoalColor;
  visible?: boolean;
  status: "active" | "later";
  recurrence: Recurrence | null;
}
export interface Task {
  id: string;
  // null identifies a standalone event with a fixed date and time.
  goalId: string | null;
  title: string;
  minutes: number;
  date: string;
  start: number;
  slotId: string;
  dependsOn: string[];
  status: TaskStatus;
  activityId?: string;
  occurrenceKey?: string;
  allDay?: boolean;
  eventSeriesId?: string;
  eventOccurrenceDate?: string;
}
export interface Slot {
  id: string;
  date: string;
  start: number;
  tasks: Task[];
  chosen: Task | undefined;
  done: boolean;
  duration: number;
}
export interface TaskEdit {
  title: string;
  date: string;
  start: number;
  minutes: number;
  allDay?: boolean;
  repeat?: EventRepeatChoice;
}
export interface Todo {
  id: string;
  title: string;
  minutes: number;
  done: boolean;
}
export type TodoMutation =
  | { action: "add"; title: string; minutes: number }
  | { action: "rename"; id: string; title: string }
  | { action: "complete" | "reopen" | "delete"; id: string }
  | { action: "schedule"; id: string; event: TaskEdit };
export interface TodoRequest {
  action:
    "list" | "add" | "rename" | "complete" | "reopen" | "delete" | "schedule";
  terms: string[];
  status: "pending" | "completed" | "all";
  items: { title: string; minutes: number }[];
  title: string | null;
  schedule: {
    date: string;
    start: number;
    minutes: number | null;
    allDay: boolean;
  } | null;
}
export interface TodoChange {
  id: string;
  before: Todo | null;
  after: Todo | null;
  event?: TaskEdit;
}
export interface EventDraft extends TaskEdit {
  id: string;
  reservationAllDay: boolean;
  unscheduled?: boolean;
  todoId?: string;
}
export interface GoalEdit {
  color?: GoalColor;
  name: string;
  kind: "project" | "recurring";
  perWeek: number | null;
  steps: Pick<Task, "id" | "title" | "minutes" | "dependsOn">[];
}
export interface RecoveryChange {
  id: string;
  title: string;
  from: string;
  to: string;
  status: TaskStatus;
}
export interface CalendarState {
  personalCalendar?: {
    name: string;
    color: GoalColor;
    visible: boolean;
  } | null;
  version: 1;
  revision: number;
  sample: boolean;
  lastRecoveryDay: string;
  draft: PlannerDraft | null;
  undo: { label: string; before: CalendarState; revision: number } | null;
  recovery: {
    date: string;
    moved: number;
    consolidated: number;
    changes: RecoveryChange[];
    choices: number;
  } | null;
  settings: Settings;
  goals: Goal[];
  tasks: Task[];
  todos?: Todo[];
  eventSeries?: EventSeries[];
  choices: Record<string, string>;
}
export interface ScheduleOptions {
  later?: boolean;
  today?: string;
}
export interface Account {
  id: string;
  label: string;
}
export interface Model {
  id: string;
  name: string;
}
export interface SessionResponse {
  storage?: "sqlite";
  csrf: string;
  connected: boolean;
  account: Account | null;
  accounts: Account[];
  models: Model[];
  remembered?: boolean;
  notice?: string;
  signOutPending?: boolean;
}
export interface ApiRequests {
  "calendar/load": { scope: string };
  "calendar/bootstrap": {
    scope: string;
    legacy: unknown;
    legacyError?: boolean;
    legacyBackup?: string;
  };
  "calendar/save": {
    scope: string;
    state: CalendarState;
    expectedVersion: number;
  };
  assistant: {
    scope: string;
    messages: ChatMessage[];
    message: string;
    model?: string;
  };
  "calendar/preview": { scope: string; selectionId: string; ids: string[] };
  "calendar/apply": { scope: string; proposalId: string };
  "todos/preview": { scope: string; selectionId: string; ids: string[] };
  "todos/apply": { scope: string; proposalId: string };
  session: undefined;
  models: undefined;
  "auth/start": { accountId: string | null };
  "auth/disconnect": Record<string, never>;
  plan: { intention: string; model?: string };
}
export interface ApiResponses {
  "calendar/load": StoredCalendar;
  "calendar/bootstrap": StoredCalendar;
  "calendar/save": StoredCalendar;
  assistant: AssistantResult;
  "calendar/preview": AssistantResult;
  "calendar/apply": StoredCalendar;
  "todos/preview": AssistantResult;
  "todos/apply": StoredCalendar;
  session: SessionResponse;
  models: { models: Model[] };
  "auth/start": { url: string };
  "auth/disconnect": { revoked: boolean; notice?: string };
  plan: { plan: Plan };
}

export interface StoredCalendar {
  state: CalendarState | null;
  storageVersion: number;
  needsRecovery?: boolean;
}
export interface CalendarReference {
  id: string;
  title: string;
  date: string;
  start: number;
  minutes: number;
  allDay?: boolean;
  status: TaskStatus;
  goalName: string | null;
  recurring: boolean;
}
export interface CalendarMove {
  id: string;
  title: string;
  fromDate: string;
  fromStart: number;
  toDate: string;
  toStart: number;
  minutes: number;
  allDay: boolean;
}
export interface CalendarQuery {
  terms: string[];
  from: string;
  to: string;
  start: number;
  end: number;
  operation: "agenda" | "last" | "count" | "availability";
  completedOnly: boolean;
}
export interface AssistantIntent {
  kind: "clarify" | "goal" | "event" | "search" | "reschedule" | "todo";
  message: string;
  query: CalendarQuery;
  plan: Plan | null;
  event: TaskEdit | null;
  destination: { from: string; to: string; start: number; end: number };
  todo?: TodoRequest | null;
}
export interface AssistantResult {
  kind:
    | "clarify"
    | "goal"
    | "event"
    | "answer"
    | "selection"
    | "proposal"
    | "todo_answer"
    | "todo_selection"
    | "todo_proposal";
  message: string;
  references: CalendarReference[];
  plan?: Plan;
  event?: TaskEdit;
  selectionId?: string;
  proposalId?: string;
  moves?: CalendarMove[];
  todos?: Todo[];
  todoRequest?: TodoRequest;
  todoChanges?: TodoChange[];
}
