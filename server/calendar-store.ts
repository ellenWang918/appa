import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { StoredCalendar, Task } from "../src/types.js";
import { validateBackup } from "../src/calendar.js";

export class CalendarConflict extends Error {}
export function calendarScope(value: unknown) {
  if (value !== "main" && value !== "reference")
    throw new Error("Choose a valid calendar workspace.");
  return value;
}
export function openCalendarStore(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(directory, "calendar.sqlite"));
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=FULL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS workspace (scope TEXT PRIMARY KEY, version INTEGER NOT NULL, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_backup (scope TEXT PRIMARY KEY, source TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS event (scope TEXT NOT NULL REFERENCES workspace(scope), id TEXT NOT NULL, date TEXT NOT NULL, start INTEGER NOT NULL, search_text TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(scope,id));
    CREATE INDEX IF NOT EXISTS event_date ON event(scope,date,start);
    CREATE TABLE IF NOT EXISTS goal (scope TEXT NOT NULL REFERENCES workspace(scope), id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(scope,id));
    CREATE TABLE IF NOT EXISTS event_series (scope TEXT NOT NULL REFERENCES workspace(scope), id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(scope,id));
    CREATE TABLE IF NOT EXISTS change_history (id INTEGER PRIMARY KEY, scope TEXT NOT NULL, previous_state TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS proposal (id TEXT PRIMARY KEY, scope TEXT NOT NULL, version INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, expires INTEGER NOT NULL);
    PRAGMA user_version=1;
  `);
  function load(scope: string): StoredCalendar {
    const row = db
      .prepare("SELECT version,state FROM workspace WHERE scope=?")
      .get(scope);
    return row
      ? {
          storageVersion: Number(row.version),
          state: validateBackup(JSON.parse(String(row.state))),
        }
      : { storageVersion: 0, state: null };
  }
  function save(
    scope: string,
    input: unknown,
    expectedVersion: number,
    migration?: unknown,
  ): StoredCalendar {
    const state = validateBackup(input);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
      throw new Error("Refresh the calendar before saving.");
    db.exec("BEGIN IMMEDIATE");
    try {
      const previous = db
        .prepare("SELECT version,state FROM workspace WHERE scope=?")
        .get(scope);
      if ((previous ? Number(previous.version) : 0) !== expectedVersion)
        throw new CalendarConflict(
          "The calendar changed in another window. Export your current work, then reload before trying again.",
        );
      if (previous)
        db.prepare(
          "INSERT INTO change_history(scope,previous_state,created) VALUES (?,?,?)",
        ).run(scope, String(previous.state), new Date().toISOString());
      const version = expectedVersion + 1;
      db.prepare(
        "INSERT INTO workspace(scope,version,state) VALUES (?,?,?) ON CONFLICT(scope) DO UPDATE SET version=excluded.version,state=excluded.state",
      ).run(scope, version, JSON.stringify(state));
      if (migration !== undefined)
        db.prepare(
          "INSERT OR IGNORE INTO migration_backup(scope,source,created) VALUES (?,?,?)",
        ).run(
          scope,
          typeof migration === "string" ? migration : JSON.stringify(migration),
          new Date().toISOString(),
        );
      for (const table of ["event", "goal", "event_series"])
        db.prepare(`DELETE FROM ${table} WHERE scope=?`).run(scope);
      const insert = db.prepare(
        "INSERT INTO event(scope,id,date,start,search_text,data) VALUES (?,?,?,?,?,?)",
      );
      for (const task of state.tasks)
        insert.run(
          scope,
          task.id,
          task.date,
          task.start,
          `${task.title} ${state.goals.find((goal) => goal.id === task.goalId)?.name ?? state.personalCalendar?.name ?? ""}`,
          JSON.stringify(task),
        );
      for (const goal of state.goals)
        db.prepare("INSERT INTO goal(scope,id,data) VALUES (?,?,?)").run(
          scope,
          goal.id,
          JSON.stringify(goal),
        );
      for (const series of state.eventSeries ?? [])
        db.prepare(
          "INSERT INTO event_series(scope,id,data) VALUES (?,?,?)",
        ).run(scope, series.id, JSON.stringify(series));
      db.prepare(
        "DELETE FROM change_history WHERE scope=? AND id NOT IN (SELECT id FROM change_history WHERE scope=? ORDER BY id DESC LIMIT 100)",
      ).run(scope, scope);
      db.exec("COMMIT");
      return { state, storageVersion: version };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return {
    load,
    save,
    bootstrap(
      scope: string,
      legacy: unknown,
      legacyError = false,
      legacyBackup?: string,
    ) {
      const current = load(scope);
      if (current.state) return current;
      if (legacyError) return { ...current, needsRecovery: true };
      return save(scope, legacy, 0, legacyBackup ?? legacy);
    },
    matchingTasks(
      scope: string,
      terms: string[],
      from: string,
      to: string,
    ): Task[] {
      const clause = terms.length
        ? ` AND (${terms.map(() => "instr(lower(search_text),lower(?))>0").join(" OR ")})`
        : "";
      return db
        .prepare(
          `SELECT data FROM event WHERE scope=? AND date>=? AND date<=?${clause} ORDER BY date,start`,
        )
        .all(scope, from, to, ...terms)
        .map((row) => JSON.parse(String(row.data)) as Task);
    },
    putProposal(scope: string, kind: string, data: unknown, version: number) {
      const id = randomUUID();
      db.prepare("DELETE FROM proposal WHERE expires<?").run(Date.now());
      db.prepare(
        "INSERT INTO proposal(id,scope,version,kind,data,expires) VALUES (?,?,?,?,?,?)",
      ).run(
        id,
        scope,
        version,
        kind,
        JSON.stringify(data),
        Date.now() + 30 * 60_000,
      );
      return id;
    },
    proposal(scope: string, id: string, kind: string) {
      const row = db
        .prepare(
          "SELECT version,data FROM proposal WHERE id=? AND scope=? AND kind=? AND expires>?",
        )
        .get(id, scope, kind, Date.now());
      if (!row)
        throw new Error(
          "This proposal expired. Ask Appa for a fresh proposal.",
        );
      if (Number(row.version) !== load(scope).storageVersion)
        throw new CalendarConflict(
          "The calendar changed since this proposal. Ask Appa to prepare new times before applying changes.",
        );
      return {
        data: JSON.parse(String(row.data)) as unknown,
        version: Number(row.version),
      };
    },
    removeProposal(id: string) {
      db.prepare("DELETE FROM proposal WHERE id=?").run(id);
    },
    close() {
      db.close();
    },
  };
}
export type CalendarStore = ReturnType<typeof openCalendarStore>;
