import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import {
  MiniCalendar,
  MonthCalendar,
  clockTime,
  monthStart,
  shiftMonth,
  weekNumber,
} from "./CalendarViews";
import type { CalendarView } from "./CalendarViews";
import type { CalendarState, Slot, Task } from "./types";
import { errorMessage } from "./errors";
import {
  ArrowRight,
  ArrowUp,
  CalendarDots,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  GearSix,
  LockSimple,
  Laptop,
  List,
  Plus,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import * as cal from "./calendar";
import { Planner, Settings, GoalDetails } from "./Dialogs";
import { Dialog, Dot } from "./ui";
import { desktop } from "./environment";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";

// Isolated visual-QA fixture; it never reads or writes the personal workspace.
const referenceMode =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("reference") === "evening-planner";
const dayFor = (zone?: string) =>
  referenceMode ? "2026-10-12" : cal.localDate(zone);
// Keep the original storage keys so the Appa rename preserves saved goals.
const STORAGE = referenceMode
  ? "ai-goal-calendar.reference.v1"
  : "ai-goal-calendar.v1";
function firstWorkspace() {
  if (!desktop) return cal.seed(dayFor());
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const state = cal.blank(cal.localDate(timezone));
  state.settings.timezone = timezone;
  return state;
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE);
    return {
      state: raw
        ? cal.validateBackup(JSON.parse(raw), dayFor())
        : firstWorkspace(),
      error: "",
    };
  } catch {
    return {
      state: cal.blank(),
      error:
        "Your saved calendar could not be read. Export a copy before starting fresh.",
    };
  }
}
function download(value: CalendarState | string, name = "appa-backup.json") {
  const url = URL.createObjectURL(
    new Blob(
      [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
      { type: "application/json" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const titleDate = (date: string) =>
  cal.dateLabel(date, { weekday: "short", day: "numeric", month: "long" });

export function App() {
  const [initial] = useState(load),
    [state, setState] = useState(initial.state),
    [saveError, setSaveError] = useState(initial.error),
    [error, setError] = useState(""),
    [view, setView] = useState<CalendarView>("week"),
    [miniMonth, setMiniMonth] = useState(() =>
      monthStart(dayFor(initial.state.settings.timezone)),
    ),
    [showWeekends, setShowWeekends] = useState(false),
    [detailsOpen, setDetailsOpen] = useState(false),
    [composer, setComposer] = useState(""),
    [week, setWeek] = useState(() =>
      cal.monday(dayFor(initial.state.settings.timezone)),
    ),
    [selectedDay, setSelectedDay] = useState(() =>
      dayFor(initial.state.settings.timezone),
    ),
    [selectedTask, setSelectedTask] = useState<string | null>(null),
    [modal, setModal] = useState<
      | "planner"
      | "settings"
      | "goals"
      | "goal"
      | "import"
      | "reset"
      | "recovery"
      | null
    >(null),
    [goalId, setGoalId] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [today, setToday] = useState(() => dayFor(initial.state.settings.timezone));
  const fileInput = useRef<HTMLInputElement>(null),
    weekScroll = useRef<HTMLDivElement>(null),
    [pendingImport, setPendingImport] = useState<CalendarState | null>(null),
    [persistBlocked, setPersistBlocked] = useState(!!initial.error),
    todayRef = useRef(today);
  useEffect(() => {
    if (persistBlocked) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
      setSaveError("");
    } catch {
      setSaveError(
        "Changes could not be saved. Export a backup to keep your progress.",
      );
    }
  }, [state, persistBlocked]);
  useEffect(() => {
    function refresh() {
      const date = dayFor(state.settings.timezone),
        old = todayRef.current;
      setToday(date);
      if (date !== old) {
        setSelectedDay((previous) => (previous === old ? date : previous));
        setWeek((previous) =>
          previous === cal.monday(old) ? cal.monday(date) : previous,
        );
        todayRef.current = date;
      }
      if (persistBlocked) return;
      setState((previous) =>
        cal.extendRecurrences(
          cal.catchUp(
            previous,
            date,
            referenceMode ? 1080 : cal.localMinute(previous.settings.timezone),
          ),
          date,
        ),
      );
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [state.settings.timezone, persistBlocked]);
  function change(fn: (state: CalendarState) => CalendarState, message = "") {
    try {
      setState(fn(state));
      setError("");
      setNotice(message);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }
  const active = state.goals.filter((goal) => goal.status === "active"),
    later = state.goals.filter((goal) => goal.status === "later");
  const weekendWork = state.tasks.some(
    (task) =>
      ["pending", "done"].includes(task.status) &&
      cal.goalFor(state, task)?.status === "active" &&
      task.date >= cal.addDays(week, 5) &&
      task.date <= cal.addDays(week, 6),
  );
  const weekendSelected =
    selectedDay >= cal.addDays(week, 5) && selectedDay <= cal.addDays(week, 6);
  const days = Array.from(
    { length: showWeekends || weekendWork || weekendSelected ? 7 : 5 },
    (_, i) => cal.addDays(week, i),
  );
  const weekSlots = days.map((date) => ({
    date,
    slots: cal.slotsFor(state, date),
  }));
  const shortestSlot = weekSlots
    .flatMap(({ slots }) => slots)
    .reduce((minutes, slot) => Math.min(minutes, slot.duration), 60);
  // Give short, consecutive steps enough space for a readable single line.
  const hourHeight = Math.max(70, Math.ceil((24 * 60) / shortestSlot));
  const timelineStart = Math.min(
    9 * 60,
    Math.floor(state.settings.start / 60) * 60,
  );
  const timelineEnd = Math.max(
    19 * 60,
    Math.ceil(state.settings.end / 60) * 60,
  );
  const timelineRange = timelineEnd - timelineStart;
  const hours = Array.from(
    { length: timelineRange / 60 + 1 },
    (_, i) => timelineStart + i * 60,
  );
  const gridStyle = {
    "--day-count": days.length,
    "--hour-count": timelineRange / 60,
    "--hour-height": `${hourHeight}px`,
  } as CSSProperties;
  const earliest = state.tasks
    .filter(
      (task) =>
        task.date >= week &&
        task.date <= cal.addDays(week, 6) &&
        task.status === "pending" &&
        cal.goalFor(state, task)?.status === "active",
    )
    .reduce((start, task) => Math.min(start, task.start), state.settings.start);
  useEffect(() => {
    if (view !== "week" || !weekScroll.current) return;
    weekScroll.current.scrollTop = Math.max(
      0,
      ((earliest - timelineStart - 60) / 60) * hourHeight,
    );
  }, [week, view, timelineStart, earliest, hourHeight]);
  const daySlots = cal.slotsFor(state, selectedDay),
    plannedMinutes = cal.plannedMinutesFor(state, selectedDay),
    remaining = daySlots
      .flatMap((slot) => slot.tasks)
      .filter((task) => task.status === "pending");
  const nextTask =
    state.tasks.find(
      (task) =>
        task.id === selectedTask &&
        task.date === selectedDay &&
        task.status === "pending",
    ) ||
    remaining.find(
      (task) =>
        !cal.isBlocked(state, task) &&
        daySlots.find((slot) => slot.id === task.slotId)?.tasks.length === 1,
    ) ||
    remaining.find(
      (task) =>
        !cal.isBlocked(state, task) &&
        daySlots.find((slot) => slot.id === task.slotId)?.chosen?.id ===
          task.id,
    );
  const future = state.tasks
    .filter(
      (task) =>
        task.status === "pending" &&
        task.date > selectedDay &&
        cal.goalFor(state, task)?.status === "active",
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
    .slice(0, 2);
  const shared = daySlots.filter((slot) => slot.tasks.length > 1 && !slot.done);
  const goal = state.goals.find((item) => item.id === goalId);
  const complete = (task: Task) =>
    change(
      (previous) => cal.completeTask(previous, task.id, today),
      "Progress saved.",
    );
  function goToday() {
    setSelectedDay(today);
    setWeek(cal.monday(today));
    setMiniMonth(monthStart(today));
    setSelectedTask(null);
  }
  function selectDate(date: string) {
    setSelectedDay(date);
    setWeek(cal.monday(date));
    setMiniMonth(monthStart(date));
    setSelectedTask(null);
  }
  function navigate(direction: number) {
    const date =
      view === "month"
        ? shiftMonth(selectedDay, direction)
        : cal.addDays(
            view === "week" ? week : selectedDay,
            direction * (view === "week" ? 7 : 1),
          );
    selectDate(date);
  }
  function openSlot(slot: Slot) {
    selectDate(slot.date);
    setSelectedTask(
      slot.chosen?.id || (slot.tasks.length === 1 ? slot.tasks[0].id : null),
    );
    setDetailsOpen(true);
  }
  async function readImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 2e6)
        throw new Error("Choose a backup smaller than 2 MB.");
      const raw = cal.validateBackup(JSON.parse(await file.text()), today);
      setPendingImport(raw);
      setModal("import");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="mobile-tools">
          <button
            className="icon-button"
            aria-label="Your goals"
            onClick={() => setModal("goals")}
          >
            <List size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Settings & backup"
            onClick={() => setModal("settings")}
          >
            <GearSix size={18} />
          </button>
        </div>
        <div className="calendar-title">
          <h1>
            {cal.dateLabel(selectedDay, { month: "long", year: "numeric" })}
          </h1>
          <span>
            {view === "week"
              ? `Week ${weekNumber(week)}`
              : view === "day"
                ? cal.dateLabel(selectedDay, { weekday: "long" })
                : "Month view"}
          </span>
        </div>
        <div className="calendar-controls">
          <div className="week-navigation">
            <button
              className="icon-button"
              aria-label={`Previous ${view}`}
              onClick={() => navigate(-1)}
            >
              <CaretLeft size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={`Next ${view}`}
              onClick={() => navigate(1)}
            >
              <CaretRight size={15} />
            </button>
          </div>
          <button className="today-button" onClick={goToday}>
            Today
          </button>
          <nav className="view-tabs" aria-label="Calendar view">
            {(["day", "week", "month"] as const).map((mode) => (
              <button
                key={mode}
                className={view === mode ? "selected" : ""}
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </nav>
          {view === "week" && (
            <button
              className="weekend-toggle"
              aria-label="Show weekends"
              aria-pressed={days.length === 7}
              title={
                weekendWork
                  ? "This week includes weekend tasks"
                  : weekendSelected
                    ? "The selected day is on the weekend"
                    : "Show or hide weekends"
              }
              disabled={weekendWork || weekendSelected}
              onClick={() => setShowWeekends(!showWeekends)}
            >
              {days.length === 7 ? "7 days" : "5 days"}
            </button>
          )}
        </div>
      </header>
      {(error || saveError) && (
        <div className="alert" role="alert">
          <span>{error || saveError}</span>
          {saveError && (
            <button
              onClick={() => download(localStorage.getItem(STORAGE) || state)}
            >
              Export a copy
            </button>
          )}
          {persistBlocked && (
            <button onClick={() => setModal("reset")}>Start fresh</button>
          )}
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {state.recovery && (
        <div className="recovery" role="status">
          <span>
            <strong>A fresh start for today.</strong> Moved{" "}
            {state.recovery.moved} tasks and consolidated{" "}
            {state.recovery.consolidated} older repeats. Project steps stay in
            order.
          </span>
          <button onClick={() => setModal("recovery")}>Review changes</button>
          {state.undo?.label === "Recovery" && (
            <button onClick={() => change(cal.undoChange)}>
              Undo recovery
            </button>
          )}
        </div>
      )}
      <div className="workspace">
        <aside className="goals-rail" aria-label="Goals">
          <a
            className="brand"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              goToday();
            }}
          >
            <CalendarDots size={24} weight="fill" />
            <span>Appa</span>
          </a>
          <MiniCalendar
            month={miniMonth}
            selectedDay={selectedDay}
            today={today}
            onMonth={setMiniMonth}
            onSelect={selectDate}
          />
          <button
            className="rail-plan-button"
            onClick={() => setModal("planner")}
          >
            <Plus size={15} />
            Plan a goal
          </button>
          <div className="goal-group">
            <h2>Active goals</h2>
            {active.length === 0 && (
              <p className="muted small">
                Activate a saved goal or plan a new one.
              </p>
            )}
            {active.map((item) => (
              <button
                key={item.id}
                className="goal-link"
                onClick={() => {
                  setGoalId(item.id);
                  setModal("goal");
                }}
              >
                <Dot color={item.color} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          {later.length > 0 && (
            <div className="goal-group later">
              <h2>Later</h2>
              {later.length === 0 && (
                <p className="muted small">Ideas can wait here.</p>
              )}
              {later.map((item) => (
                <button
                  key={item.id}
                  className="goal-link muted"
                  onClick={() => {
                    setGoalId(item.id);
                    setModal("goal");
                  }}
                >
                  <Dot color="gray" />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="rail-footer">
            <button
              className="mobile-goals-button"
              onClick={() => setModal("goals")}
            >
              Goals
            </button>
            {state.sample && (
              <>
                <span className="sample-label">Example workspace</span>
                <button
                  className="text-button"
                  onClick={() => setModal("reset")}
                >
                  Start fresh
                </button>
              </>
            )}
            <button
              className="settings-button"
              onClick={() => setModal("settings")}
            >
              <GearSix size={17} />
              Settings & backup
            </button>
            {cal.monday(today) !== week && (
              <button className="text-button" onClick={goToday}>
                Return to this week
              </button>
            )}
            <div className="workspace-identity">
              <Laptop size={23} />
              <div>
                <strong>Local workspace</strong>
                <span>
                  {desktop ? "Saved on this computer" : "Saved in this browser"}
                </span>
              </div>
            </div>
          </div>
        </aside>
        <main
          className="calendar-area"
          aria-label={
            view === "week"
              ? "Week calendar"
              : view === "month"
                ? "Month calendar"
                : "Day tasks"
          }
        >
          {view === "week" ? (
            <div
              key="week"
              className="week-scroll"
              ref={weekScroll}
              tabIndex={0}
              role="region"
              aria-label="Scroll week calendar"
            >
              <div className="week-board" style={gridStyle}>
                <div className="day-headers">
                  <div />
                  {days.map((date) => (
                    <button
                      className={`day-header ${date === selectedDay ? "current" : ""}`}
                      key={date}
                      aria-pressed={date === selectedDay}
                      onClick={() => selectDate(date)}
                    >
                      <span>{cal.dateLabel(date, { weekday: "short" })}</span>
                      <strong>{Number(date.slice(-2))}</strong>
                      {date === today && <span className="sr-only">Today</span>}
                    </button>
                  ))}
                </div>
                <div className="time-grid">
                  <div className="time-gutter">
                    {hours.map((minute) => {
                      return (
                        <span
                          key={minute}
                          style={{
                            top: `${((minute - timelineStart) / timelineRange) * 100}%`,
                          }}
                        >
                          {clockTime(minute)}
                        </span>
                      );
                    })}
                  </div>
                  {weekSlots.map(({ date, slots }) => (
                    <div className="day-column" key={date}>
                      {hours.map((minute) => (
                        <div
                          className="grid-line"
                          key={minute}
                          style={{
                            top: `${((minute - timelineStart) / timelineRange) * 100}%`,
                          }}
                        />
                      ))}
                      {slots.map((slot, index) => (
                        <CalendarEvent
                          key={slot.id}
                          slot={slot}
                          state={state}
                          timelineStart={timelineStart}
                          timelineEnd={timelineEnd}
                          available={
                            (slots[index + 1]?.start ?? timelineEnd) -
                            slot.start
                          }
                          selected={slot.tasks.some(
                            (task) => task.id === selectedTask,
                          )}
                          onClick={() => openSlot(slot)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : view === "month" ? (
            <MonthCalendar
              month={monthStart(selectedDay)}
              state={state}
              selectedDay={selectedDay}
              today={today}
              onSelect={(date) => {
                selectDate(date);
                setView("day");
              }}
              onSlot={openSlot}
            />
          ) : (
            <div className="today-agenda" key="day">
              <div className="agenda-heading">
                <div>
                  <span className="eyebrow">YOUR DAY, AT A GLANCE</span>
                  <h1>{titleDate(selectedDay)}</h1>
                  <p className="muted">One small step is enough to begin.</p>
                </div>
              </div>
              {daySlots.length ? (
                daySlots.map((slot) => (
                  <button
                    key={slot.id}
                    className={`agenda-card ${cal.goalFor(state, slot.tasks[0])!.color}`}
                    onClick={() => openSlot(slot)}
                  >
                    <span className="agenda-time">
                      {cal.timeLabel(slot.start)}
                    </span>
                    <div>
                      <h3>
                        {slot.tasks.length > 1 && !slot.chosen
                          ? "Choose one"
                          : (slot.chosen || slot.tasks[0]).title}
                      </h3>
                      <p>
                        {cal.goalFor(state, slot.tasks[0])!.name} ·{" "}
                        {slot.duration} min
                        {slot.tasks.length > 1 && !slot.chosen
                          ? " reserved"
                          : ""}
                      </p>
                    </div>
                    {slot.done ? (
                      <CheckCircle size={24} />
                    ) : cal.isBlocked(state, slot.tasks[0]) ? (
                      <LockSimple size={20} />
                    ) : (
                      <ArrowRight size={22} />
                    )}
                  </button>
                ))
              ) : (
                <Empty
                  onPlan={() => setModal("planner")}
                  hasGoals={active.length > 0}
                />
              )}
            </div>
          )}
          <form
            className="planning-composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (composer.trim()) {
                setState((previous) => ({
                  ...previous,
                  draft: { intention: composer.trim(), plan: null },
                }));
                setComposer("");
              }
              setModal("planner");
            }}
          >
            <CalendarDots size={23} weight="fill" />
            <input
              aria-label="Describe a goal"
              value={composer}
              maxLength={3600}
              placeholder="Tell Appa what matters…"
              onChange={(event) => setComposer(event.target.value)}
            />
            <button aria-label="Plan this goal" type="submit">
              <ArrowUp size={19} weight="bold" />
            </button>
          </form>
        </main>
        {detailsOpen && (
          <Dialog
            title={titleDate(selectedDay)}
            onClose={() => setDetailsOpen(false)}
          >
            <aside className="day-panel" aria-label="Selected day">
              <section className="day-summary">
                <p>
                  <strong>{plannedMinutes} min</strong> planned
                </p>
              </section>
              <section className="next-step">
                <p className="section-label">
                  {selectedDay === today ? "Next step" : "Scheduled step"}
                </p>
                {nextTask ? (
                  <>
                    <h1>{nextTask.title}</h1>
                    <p className="task-goal">
                      <Dot color={cal.goalFor(state, nextTask)!.color} />
                      {cal.goalFor(state, nextTask)!.name}
                    </p>
                    <p className="task-duration">
                      <Clock size={24} />
                      {nextTask.minutes} min
                    </p>
                    <button
                      className="primary full"
                      disabled={
                        selectedDay !== today || cal.isBlocked(state, nextTask)
                      }
                      onClick={() => complete(nextTask)}
                    >
                      {cal.isBlocked(state, nextTask) ? (
                        <>
                          <LockSimple size={17} />
                          Finish the prerequisite first
                        </>
                      ) : selectedDay !== today ? (
                        "Available on this day"
                      ) : (
                        "Mark complete"
                      )}
                    </button>
                    {cal.isBlocked(state, nextTask) && (
                      <p className="small muted">
                        After:{" "}
                        {nextTask.dependsOn
                          .map(
                            (key) =>
                              state.tasks.find((t) => t.id === key)?.title,
                          )
                          .join(", ")}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h1>
                      {shared.length
                        ? "Make room for one thing."
                        : daySlots.length && daySlots.every((s) => s.done)
                          ? "You made progress."
                          : "A little breathing room."}
                    </h1>
                    <p className="muted leading">
                      {shared.length
                        ? "Choose an activity below to make it your next step."
                        : daySlots.length
                          ? "Your planned steps for this day are complete."
                          : "There are no steps scheduled for this day."}
                    </p>
                    {!active.length && (
                      <button
                        className="primary full"
                        onClick={() => setModal("planner")}
                      >
                        Plan your first goal
                      </button>
                    )}
                  </>
                )}
              </section>
              {shared.map((slot) => (
                <section className="shared-section" key={slot.id}>
                  <h2>Choose one ({cal.timeLabel(slot.start)})</h2>
                  <p className="muted">
                    {slot.duration} min {slot.chosen ? "planned" : "reserved"}{" "}
                    <span className="separator">·</span>{" "}
                    <span
                      className={
                        cal.goalFor(state, slot.tasks[0])!.color + "-text"
                      }
                    >
                      {new Set(slot.tasks.map((t) => t.goalId)).size > 1
                        ? "Multiple goals"
                        : cal.goalFor(state, slot.tasks[0])!.name}
                    </span>
                  </p>
                  <div className="activity-options">
                    {slot.tasks.map((task) => (
                      <label
                        className={`activity-option ${cal.isBlocked(state, task) ? "disabled" : ""}`}
                        key={task.id}
                      >
                        <input
                          type="radio"
                          name={slot.id}
                          checked={slot.chosen?.id === task.id}
                          disabled={cal.isBlocked(state, task)}
                          onChange={() => {
                            change((previous) =>
                              cal.selectChoice(
                                previous,
                                selectedDay,
                                slot.id,
                                task.id,
                              ),
                            );
                            setSelectedTask(task.id);
                          }}
                        />
                        <span>
                          {task.title}
                          <small>
                            {new Set(slot.tasks.map((t) => t.goalId)).size > 1
                              ? cal.goalFor(state, task)!.name + " · "
                              : ""}
                            {task.minutes} min
                            {cal.isBlocked(state, task)
                              ? " · prerequisite unfinished"
                              : ""}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {slot.chosen &&
                    selectedDay === today &&
                    nextTask?.id !== slot.chosen.id && (
                      <button
                        className="secondary full"
                        onClick={() => {
                          if (slot.chosen) complete(slot.chosen);
                        }}
                      >
                        Complete {slot.chosen.title}
                      </button>
                    )}
                </section>
              ))}
              {future.length > 0 && (
                <section className="future-section">
                  <p className="section-label">
                    Later steps <span className="muted">(scheduled)</span>
                  </p>
                  {future.map((task) => (
                    <button
                      className="future-task"
                      key={task.id}
                      onClick={() => {
                        selectDate(task.date);
                        setSelectedTask(task.id);
                      }}
                    >
                      <Dot color={cal.goalFor(state, task)!.color} />
                      <span>
                        <strong>{task.title}</strong>
                        <small>
                          {cal
                            .dateLabel(task.date, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })
                            .replace(",", "")}{" "}
                          · {task.minutes} min
                        </small>
                      </span>
                      {cal.isBlocked(state, task) && <LockSimple size={15} />}
                    </button>
                  ))}
                </section>
              )}
            </aside>
          </Dialog>
        )}
      </div>
      {state.undo && state.undo.label !== "Recovery" && (
        <div className="undo-toast" role="status">
          <CheckCircle size={18} />
          <span>{notice || state.undo.label}</span>
          <button onClick={() => change(cal.undoChange)}>Undo</button>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={readImport}
      />
      {modal === "recovery" && state.recovery && (
        <Dialog title="Your recovery summary" onClose={() => setModal(null)}>
          <div className="dialog-body">
            <p className="muted">
              {state.recovery.choices || 0} shared slots need a choice. Nothing
              was marked complete.
            </p>
            <ul className="goal-task-list">
              {state.recovery.changes?.map((item) => (
                <li key={item.id}>
                  <Clock size={18} />
                  <span>
                    {item.title}
                    <small>
                      {cal.dateLabel(item.from, {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      →{" "}
                      {item.status === "consolidated"
                        ? "Consolidated missed repeat"
                        : cal.dateLabel(item.to, {
                            day: "numeric",
                            month: "short",
                          })}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
            <button
              className="secondary full"
              onClick={() => {
                change(cal.undoChange);
                setModal(null);
              }}
            >
              Undo this recovery
            </button>
          </div>
        </Dialog>
      )}
      {modal === "planner" && (
        <Planner
          state={state}
          onClose={() => setModal(null)}
          onDraft={(draft) => setState((previous) => ({ ...previous, draft }))}
          onApprove={(plan, options) => {
            setState(
              cal.extendRecurrences(
                cal.approvePlan(state, plan, { ...options, today }),
                today,
              ),
            );
            setModal(null);
            goToday();
            setNotice(
              options.later ? "Saved for later." : "Your plan is ready.",
            );
          }}
        />
      )}
      {modal === "settings" && (
        <Settings
          state={state}
          onClose={() => setModal(null)}
          onSave={(settings) => {
            setState(
              cal.updateSettings(state, settings, dayFor(settings.timezone)),
            );
            setModal(null);
            setNotice("Planning settings saved.");
          }}
          onExport={() => download(state)}
          onImport={() => fileInput.current?.click()}
        />
      )}
      {modal === "goals" && (
        <Dialog title="Your goals" onClose={() => setModal(null)}>
          <div className="dialog-body">
            <h3>Active goals</h3>
            {active.map((item) => (
              <button
                className="goal-link"
                key={item.id}
                onClick={() => {
                  setGoalId(item.id);
                  setModal("goal");
                }}
              >
                <Dot color={item.color} />
                <span>{item.name}</span>
              </button>
            ))}
            <h3 className="later-heading">Later</h3>
            {later.length ? (
              later.map((item) => (
                <button
                  className="goal-link"
                  key={item.id}
                  onClick={() => {
                    setGoalId(item.id);
                    setModal("goal");
                  }}
                >
                  <Dot color="gray" />
                  <span>{item.name}</span>
                </button>
              ))
            ) : (
              <p className="small muted">Ideas can wait here.</p>
            )}
            {state.sample && (
              <button className="text-button" onClick={() => setModal("reset")}>
                Start fresh
              </button>
            )}
          </div>
        </Dialog>
      )}
      {modal === "goal" && goal && (
        <GoalDetails
          goal={goal}
          state={state}
          onClose={() => setModal(null)}
          onActivate={() => {
            setState(
              cal.extendRecurrences(
                cal.activateGoal(state, goal.id, { today }),
                today,
              ),
            );
            setModal(null);
            setNotice("Goal activated.");
          }}
        />
      )}
      {modal === "import" && pendingImport && (
        <Dialog title="Restore this backup?" onClose={() => setModal(null)}>
          <div className="dialog-body">
            <p>
              This backup contains {pendingImport.goals.length} goals and{" "}
              {pendingImport.tasks.length} tasks. It will replace the calendar
              in this browser.
            </p>
            <p className="muted">
              You can undo the import immediately afterward.
            </p>
            <div className="dialog-actions">
              <button className="secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="primary"
                onClick={() => {
                  change(
                    (previous) =>
                      cal.importBackup(previous, pendingImport, today),
                    "Backup restored.",
                  );
                  setPersistBlocked(false);
                  setModal(null);
                  goToday();
                }}
              >
                Restore backup
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {modal === "reset" && (
        <Dialog
          title="Start with a fresh calendar?"
          onClose={() => setModal(null)}
        >
          <div className="dialog-body">
            <p>
              Remove the example goals and plan something of your own. You can
              undo this change.
            </p>
            <div className="dialog-actions">
              <button className="secondary" onClick={() => setModal(null)}>
                Keep this calendar
              </button>
              <button
                className="primary"
                onClick={() => {
                  change(
                    (previous) => cal.resetWorkspace(previous, today),
                    "Fresh calendar ready.",
                  );
                  setPersistBlocked(false);
                  setModal(null);
                }}
              >
                Start fresh
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function CalendarEvent({
  slot,
  state,
  onClick,
  timelineStart,
  timelineEnd,
  available,
  selected,
}: {
  slot: Slot;
  state: CalendarState;
  onClick: () => void;
  timelineStart: number;
  timelineEnd: number;
  available: number;
  selected: boolean;
}) {
  const task = slot.chosen || slot.tasks[0],
    goal = cal.goalFor(state, task),
    shared = slot.tasks.length > 1 && !slot.chosen,
    blocked = cal.isBlocked(state, task);
  const range = timelineEnd - timelineStart;
  if (!goal) return null;
  return (
    <button
      className={`calendar-event ${goal.color} ${shared ? "shared" : ""} ${slot.done ? "done" : ""} ${blocked ? "blocked" : ""} ${slot.duration < 40 ? "compact" : ""} ${selected ? "selected" : ""}`}
      style={{
        top: `${((slot.start - timelineStart) / range) * 100}%`,
        height: `min(max(18px, calc(${(slot.duration / range) * 100}% - 2px)), calc(${(available / range) * 100}% - 1px))`,
        maxHeight: `calc(${(available / range) * 100}% - 1px)`,
      }}
      title={`${shared ? "Choose one" : task.title} · ${goal.name}`}
      onClick={onClick}
      aria-label={`${shared ? "Choose one" : task.title}, ${slot.duration} minutes, ${cal.timeLabel(slot.start)}${blocked ? ", prerequisite unfinished" : ""}`}
    >
      <strong>
        {slot.done && <Check size={13} />}
        {blocked && <LockSimple size={11} />}
        {shared ? "Choose one" : task.title}
        {slot.duration < 40 && (
          <span className="event-start">{clockTime(slot.start)}</span>
        )}
      </strong>
      <span className="event-minutes">
        {clockTime(slot.start)} – {clockTime(slot.start + slot.duration)}
      </span>
      {shared ? (
        <span className="event-options">
          {slot.tasks.map((t) => `${t.title} ${t.minutes} min`).join(" / ")}
        </span>
      ) : (
        <small>{goal.name}</small>
      )}
    </button>
  );
}
function Empty({
  onPlan,
  hasGoals,
}: {
  onPlan: () => void;
  hasGoals: boolean;
}) {
  return (
    <div className="empty-state">
      <Sparkle size={32} />
      <h2>
        {hasGoals
          ? "Nothing scheduled for this day."
          : "What would you like to make progress on?"}
      </h2>
      <p className="muted">
        {hasGoals
          ? "Your next steps will appear here when they’re scheduled."
          : "Start with one goal. Turn it into small, doable steps."}
      </p>
      <button className="primary" onClick={onPlan}>
        Plan a goal
      </button>
    </div>
  );
}
