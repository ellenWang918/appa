export type GoalColor = "indigo" | "teal" | "amber" | "rose";
export type TaskStatus = "pending" | "done" | "skipped" | "consolidated";
export interface Settings {
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
export interface Recurrence {
  perWeek: number;
  anchor: string;
  templates: Pick<PlanTask, "title" | "minutes">[];
}
export interface Goal {
  id: string;
  name: string;
  color: GoalColor;
  status: "active" | "later";
  recurrence: Recurrence | null;
}
export interface Task {
  id: string;
  goalId: string;
  title: string;
  minutes: number;
  date: string;
  start: number;
  slotId: string;
  dependsOn: string[];
  status: TaskStatus;
  activityId?: string;
  occurrenceKey?: string;
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
}
export interface GoalEdit {
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
  session: undefined;
  models: undefined;
  "auth/start": { accountId: string | null };
  "auth/disconnect": Record<string, never>;
  plan: { intention: string; model?: string };
}
export interface ApiResponses {
  session: SessionResponse;
  models: { models: Model[] };
  "auth/start": { url: string };
  "auth/disconnect": { revoked: boolean; notice?: string };
  plan: { plan: Plan };
}
