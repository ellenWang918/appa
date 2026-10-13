import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Clock,
  GearSix,
  LockSimple,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import * as cal from "./calendar.mjs";
import { Planner, Settings, GoalDetails } from "./Dialogs.jsx";
import { Dialog, Dot } from "./ui.jsx";
import { desktop } from "./environment.mjs";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";

// Isolated visual-QA fixture; it never reads or writes the personal workspace.
const referenceMode =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("reference") === "evening-planner";
const dayFor = (zone) => (referenceMode ? "2026-10-12" : cal.localDate(zone));
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
function download(value, name = "appa-backup.json") {
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
const titleDate = (date) =>
  cal.dateLabel(date, { weekday: "short", day: "numeric", month: "long" });

export function App() {
  const [initial] = useState(load),
    [state, setState] = useState(initial.state),
    [saveError, setSaveError] = useState(initial.error),
    [error, setError] = useState(""),
    [view, setView] = useState("week"),
    [week, setWeek] = useState(() =>
      cal.monday(dayFor(initial.state.settings.timezone)),
    ),
    [selectedDay, setSelectedDay] = useState(() =>
      dayFor(initial.state.settings.timezone),
    ),
    [selectedTask, setSelectedTask] = useState(null),
    [modal, setModal] = useState(null),
    [goalId, setGoalId] = useState(null),
    [notice, setNotice] = useState(""),
    [today, setToday] = useState(() => dayFor(initial.state.settings.timezone));
  const fileInput = useRef(null),
    [pendingImport, setPendingImport] = useState(null),
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
  function change(fn, message = "") {
    try {
      setState(fn(state));
      setError("");
      setNotice(message);
    } catch (caught) {
      setError(caught.message);
    }
  }
  const active = state.goals.filter((goal) => goal.status === "active"),
    later = state.goals.filter((goal) => goal.status === "later");
  const days = Array.from({ length: 7 }, (_, i) => cal.addDays(week, i));
  const daySlots = cal.slotsFor(state, selectedDay),
    used = cal.budgetFor(state, selectedDay),
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
  const complete = (task) =>
    change(
      (previous) => cal.completeTask(previous, task.id, today),
      "Progress saved.",
    );
  function goToday() {
    setSelectedDay(today);
    setWeek(cal.monday(today));
    setSelectedTask(null);
  }
  async function readImport(event) {
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
      setError(caught.message);
    }
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            goToday();
          }}
        >
          Appa
        </a>
        <nav className="view-tabs" aria-label="Calendar view">
          <button
            className={view === "today" ? "selected" : ""}
            onClick={() => {
              setView("today");
              goToday();
            }}
          >
            Today
          </button>
          <button
            className={view === "week" ? "selected" : ""}
            onClick={() => setView("week")}
          >
            Week
          </button>
        </nav>
        <div className="week-navigation">
          <button
            className="icon-button"
            aria-label="Previous week"
            onClick={() => {
              const next = cal.addDays(week, -7);
              setWeek(next);
              setSelectedDay(next);
              setSelectedTask(null);
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <span>
            {view === "week"
              ? `${cal.dateLabel(week, { day: "numeric" })} – ${cal.dateLabel(cal.addDays(week, 6), { day: "numeric", month: "long", year: "numeric" })}`
              : titleDate(today)}
          </span>
          <button
            className="icon-button"
            aria-label="Next week"
            onClick={() => {
              const next = cal.addDays(week, 7);
              setWeek(next);
              setSelectedDay(next);
              setSelectedTask(null);
            }}
          >
            <ArrowRight size={16} />
          </button>
        </div>
        <button className="plan-button" onClick={() => setModal("planner")}>
          <Sparkle size={19} weight="fill" />
          Plan a goal
        </button>
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
          </div>
        </aside>
        <main
          className="calendar-area"
          aria-label={view === "week" ? "Week calendar" : "Today’s tasks"}
        >
          {view === "week" ? (
            <div
              key="week"
              className="week-scroll"
              tabIndex={0}
              role="region"
              aria-label="Scroll week calendar"
            >
              <div className="week-board">
                <div className="day-headers">
                  <div />
                  {days.map((date) => (
                    <button
                      className={`day-header ${date === selectedDay ? "current" : ""}`}
                      key={date}
                      onClick={() => {
                        setSelectedDay(date);
                        setSelectedTask(null);
                      }}
                    >
                      <span>
                        {cal.dateLabel(date, {
                          weekday: "short",
                          day: "numeric",
                        })}
                      </span>
                      {date === today && <strong>Today</strong>}
                    </button>
                  ))}
                </div>
                <div className="time-grid">
                  <div className="time-gutter">
                    {Array.from(
                      {
                        length:
                          Math.floor(
                            (state.settings.end - state.settings.start) / 30,
                          ) + 1,
                      },
                      (_, i) => {
                        const minute = state.settings.start + i * 30;
                        return (
                          <span
                            key={minute}
                            style={{
                              top: `${((i * 30) / (state.settings.end - state.settings.start)) * 100}%`,
                            }}
                          >
                            {cal.timeLabel(minute)}
                          </span>
                        );
                      },
                    )}
                  </div>
                  {days.map((date) => (
                    <div className="day-column" key={date}>
                      {Array.from(
                        {
                          length:
                            Math.floor(
                              (state.settings.end - state.settings.start) / 30,
                            ) + 1,
                        },
                        (_, i) => (
                          <div
                            className="grid-line"
                            key={i}
                            style={{
                              top: `${((i * 30) / (state.settings.end - state.settings.start)) * 100}%`,
                            }}
                          />
                        ),
                      )}
                      {cal.slotsFor(state, date).map((slot) => (
                        <CalendarEvent
                          key={slot.id}
                          slot={slot}
                          state={state}
                          onClick={() => {
                            setSelectedDay(date);
                            setSelectedTask(
                              slot.chosen?.id ||
                                (slot.tasks.length === 1
                                  ? slot.tasks[0].id
                                  : null),
                            );
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="today-agenda" key="today">
              <div className="agenda-heading">
                <div>
                  <span className="eyebrow">A LITTLE PROGRESS, EVERY DAY</span>
                  <h1>{titleDate(today)}</h1>
                  <p className="muted">One small step is enough to begin.</p>
                </div>
                <span className="budget-pill">
                  {cal.budgetFor(state, today)} / {state.settings.budget} min
                </span>
              </div>
              {cal.slotsFor(state, today).length ? (
                cal.slotsFor(state, today).map((slot) => (
                  <button
                    key={slot.id}
                    className={`agenda-card ${cal.goalFor(state, slot.tasks[0]).color}`}
                    onClick={() => {
                      setSelectedDay(today);
                      setSelectedTask(
                        slot.chosen?.id ||
                          (slot.tasks.length === 1 ? slot.tasks[0].id : null),
                      );
                    }}
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
                        {cal.goalFor(state, slot.tasks[0]).name} ·{" "}
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
        </main>
        <aside className="day-panel" aria-label="Selected day">
          <section className="day-summary">
            <h2>
              {selectedDay === today ? "Today · " : ""}
              {titleDate(selectedDay)}
            </h2>
            <p>
              <strong>
                {used} / {state.settings.budget} min
              </strong>{" "}
              planned
            </p>
            <progress
              value={used}
              max={state.settings.budget}
              aria-label="Daily time planned"
            />
          </section>
          <section className="next-step">
            <p className="section-label">
              {selectedDay === today ? "Next step" : "Scheduled step"}
            </p>
            {nextTask ? (
              <>
                <h1>{nextTask.title}</h1>
                <p className="task-goal">
                  <Dot color={cal.goalFor(state, nextTask).color} />
                  {cal.goalFor(state, nextTask).name}
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
                        (key) => state.tasks.find((t) => t.id === key)?.title,
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
                  className={cal.goalFor(state, slot.tasks[0]).color + "-text"}
                >
                  {new Set(slot.tasks.map((t) => t.goalId)).size > 1
                    ? "Multiple goals"
                    : cal.goalFor(state, slot.tasks[0]).name}
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
                          ? cal.goalFor(state, task).name + " · "
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
                    onClick={() => complete(slot.chosen)}
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
                    setSelectedDay(task.date);
                    setWeek(cal.monday(task.date));
                    setSelectedTask(task.id);
                  }}
                >
                  <Dot color={cal.goalFor(state, task).color} />
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
          onImport={() => fileInput.current.click()}
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
      {modal === "import" && (
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

function CalendarEvent({ slot, state, onClick }) {
  const task = slot.chosen || slot.tasks[0],
    goal = cal.goalFor(state, task),
    shared = slot.tasks.length > 1 && !slot.chosen,
    blocked = cal.isBlocked(state, task);
  const next = cal
      .slotsFor(state, slot.date)
      .find((other) => other.start > slot.start),
    available = (next?.start || state.settings.end) - slot.start,
    range = state.settings.end - state.settings.start;
  return (
    <button
      className={`calendar-event ${goal.color} ${shared ? "shared" : ""} ${slot.done ? "done" : ""} ${blocked ? "blocked" : ""} ${available < 28 ? "compact" : ""}`}
      style={{
        top: `${((slot.start - state.settings.start) / range) * 100}%`,
        height: `calc(${(slot.duration / range) * 100}% - 10px)`,
        minHeight: `min(${shared ? 134 : blocked ? 128 : 125}px, calc(${(available / range) * 100}% - 10px))`,
        maxHeight: `calc(${(available / range) * 100}% - 10px)`,
      }}
      title={`${shared ? "Choose one" : task.title} · ${goal.name}`}
      onClick={onClick}
      aria-label={`${shared ? "Choose one" : task.title}, ${slot.duration} minutes, ${cal.timeLabel(slot.start)}${blocked ? ", prerequisite unfinished" : ""}`}
    >
      {blocked && <LockSimple className="event-lock" size={14} />}
      <strong>
        {slot.done && <Check size={13} />}
        {!blocked && !slot.done && <Dot color={goal.color} />}
        {shared ? "Choose one" : task.title}
      </strong>
      <span className="event-minutes">
        {slot.duration} min{shared ? " reserved" : ""}
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
function Empty({ onPlan, hasGoals }) {
  return (
    <div className="empty-state">
      <Sparkle size={32} />
      <h2>
        {hasGoals
          ? "Nothing on your list today."
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
