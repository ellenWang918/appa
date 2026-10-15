import { useInterfaceText } from "./InterfaceLanguage";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  MiniCalendar,
  MonthCalendar,
  monthStart,
  shiftMonth,
  weekNumber,
} from "./CalendarViews";
import { CalendarTimeline } from "./CalendarTimeline";
import { ResizableDayPanels } from "./ResizableDayPanels";
import { useHolidayCalendar } from "./useHolidayCalendar";
import { holidayLabel } from "./holidayDates";
import { InterfaceLanguage } from "./InterfaceLanguage";
import type { CalendarView } from "./CalendarViews";
import type { CalendarState, Slot, Task } from "./types";
import { errorMessage } from "./errors";
import {
  ArrowRight,
  ArrowUp,
  CalendarDots,
  CaretLeft,
  CaretRight,
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
const dayFor = (zone?: string, now = new Date()) =>
  referenceMode ? "2026-10-12" : cal.localDate(zone, now);
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
        ? cal.validateBackup(
            JSON.parse(raw),
            referenceMode ? dayFor() : undefined,
          )
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
const titleDate = (date: string, language = "en-AU") =>
  cal.dateLabel(
    date,
    { weekday: "short", day: "numeric", month: "long" },
    language,
  );

export function App() {
  const [initial] = useState(load),
    [state, setState] = useState(initial.state),
    [saveError, setSaveError] = useState(initial.error),
    [error, setError] = useState(""),
    [view, setView] = useState<CalendarView>("week"),
    [miniMonth, setMiniMonth] = useState(() =>
      monthStart(dayFor(initial.state.settings.timezone)),
    ),
    [visibleMonth, setVisibleMonth] = useState(() =>
      monthStart(dayFor(initial.state.settings.timezone)),
    ),
    [monthScrollRequest, setMonthScrollRequest] = useState(0),
    [detailsOpen, setDetailsOpen] = useState(false),
    [composer, setComposer] = useState(""),
    [week, setWeek] = useState(() =>
      cal.weekStart(
        dayFor(initial.state.settings.timezone),
        initial.state.settings.weekStartsOn,
      ),
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
    [today, setToday] = useState(() => dayFor(initial.state.settings.timezone)),
    [currentMinute, setCurrentMinute] = useState(() =>
      referenceMode ? 1080 : cal.localMinute(initial.state.settings.timezone),
    ),
    [scrollToNowRequest, setScrollToNowRequest] = useState(0);
  const t = useInterfaceText(state.settings.language);

  const fileInput = useRef<HTMLInputElement>(null),
    timelineScroll = useRef<HTMLDivElement>(null),
    timeGrid = useRef<HTMLDivElement>(null),
    [pendingImport, setPendingImport] = useState<CalendarState | null>(null),
    [persistBlocked, setPersistBlocked] = useState(!!initial.error),
    todayRef = useRef(today),
    latestState = useRef(state);
  const { lookup: holidays, error: holidayError } = useHolidayCalendar(
    state.settings,
  );
  useEffect(() => {
    setWeek(cal.weekStart(selectedDay, state.settings.weekStartsOn));
  }, [selectedDay, state.settings.weekStartsOn]);
  useEffect(() => {
    document.documentElement.lang = state.settings.language;
  }, [state.settings.language]);
  useEffect(() => {
    latestState.current = state;
  }, [state]);
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
      const now = new Date(),
        date = dayFor(state.settings.timezone, now),
        minute = referenceMode
          ? 1080
          : cal.localMinute(state.settings.timezone, now),
        old = todayRef.current;
      setToday(date);
      setCurrentMinute(minute);
      if (date !== old) {
        const startsOn = latestState.current.settings.weekStartsOn;
        setSelectedDay((previous) => (previous === old ? date : previous));
        setWeek((previous) =>
          previous === cal.weekStart(old, startsOn)
            ? cal.weekStart(date, startsOn)
            : previous,
        );
        todayRef.current = date;
      }
      if (persistBlocked) return;
      try {
        const previous = latestState.current;
        const next = cal.extendRecurrences(
          cal.catchUp(previous, date, minute),
          date,
        );
        latestState.current = next;
        setState(next);
      } catch (caught) {
        setError(errorMessage(caught));
      }
    }
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      refresh();
      timer = setTimeout(tick, 60000 - (Date.now() % 60000));
    }
    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    tick();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
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
  const days = Array.from({ length: 7 }, (_, i) => cal.addDays(week, i));
  const showVisibleMonth = useCallback((month: string) => {
    setVisibleMonth(month);
    setMiniMonth(month);
  }, []);
  const timelineDate = view === "day" ? selectedDay : week;
  useEffect(() => {
    if (view === "month" || !timelineScroll.current || !timeGrid.current)
      return;
    const minute = referenceMode
      ? 1080
      : cal.localMinute(state.settings.timezone);
    // Clock ticks and task edits preserve manual scrolling in either timeline.
    timelineScroll.current.scrollTop = Math.max(
      0,
      ((minute - 60) / (24 * 60)) * timeGrid.current.clientHeight,
    );
  }, [timelineDate, view, state.settings.timezone, scrollToNowRequest]);
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
    setWeek(cal.weekStart(today, state.settings.weekStartsOn));
    setMiniMonth(monthStart(today));
    setVisibleMonth(monthStart(today));
    setMonthScrollRequest((request) => request + 1);
    setSelectedTask(null);
    setScrollToNowRequest((request) => request + 1);
  }
  function selectDate(date: string) {
    setSelectedDay(date);
    setWeek(cal.weekStart(date, state.settings.weekStartsOn));
    setMiniMonth(monthStart(date));
    setVisibleMonth(monthStart(date));
    if (view === "month") setMonthScrollRequest((request) => request + 1);
    setSelectedTask(null);
  }
  function navigate(direction: number) {
    const date =
      view === "month"
        ? shiftMonth(visibleMonth, direction)
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
      if (file.size > 20e6)
        throw new Error("Choose a backup smaller than 20 MB.");
      const raw = cal.validateBackup(
        JSON.parse(await file.text()),
        referenceMode ? dayFor() : undefined,
      );
      setPendingImport(raw);
      setModal("import");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }
  return (
    <InterfaceLanguage language={state.settings.language}>
      <div className="app-shell">
        <header className="topbar">
          <div className="mobile-tools">
            <button
              className="icon-button"
              aria-label={t("Your goals")}
              onClick={() => setModal("goals")}
            >
              <List size={18} />
            </button>
            <button
              className="icon-button"
              aria-label={t("Settings")}
              onClick={() => setModal("settings")}
            >
              <GearSix size={18} />
            </button>
          </div>
          <div className="calendar-title">
            <h1>
              {cal.dateLabel(
                view === "month" ? visibleMonth : selectedDay,
                {
                  month: "long",
                  year: "numeric",
                },
                state.settings.language,
              )}
            </h1>
            <span>
              {view === "week"
                ? state.settings.showWeekNumbers
                  ? t("Week {v0}", {
                      v0: weekNumber(week, state.settings.weekStartsOn),
                    })
                  : t("Week view")
                : view === "day"
                  ? cal.dateLabel(
                      selectedDay,
                      { weekday: "long" },
                      state.settings.language,
                    )
                  : t("Month view")}
            </span>
          </div>
          <div className="calendar-controls">
            <div className="week-navigation">
              <button
                className="icon-button"
                aria-label={t("Previous {v0}", { v0: view })}
                onClick={() => navigate(-1)}
              >
                <CaretLeft size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={t("Next {v0}", { v0: view })}
                onClick={() => navigate(1)}
              >
                <CaretRight size={15} />
              </button>
            </div>
            <button className="today-button" onClick={goToday}>
              {t("Today")}
            </button>
            <nav className="view-tabs" aria-label={t("Calendar view")}>
              {(["day", "week", "month"] as const).map((mode) => (
                <button
                  key={mode}
                  className={view === mode ? "selected" : ""}
                  aria-pressed={view === mode}
                  onClick={() => {
                    if (mode === "month" && view !== "month")
                      setVisibleMonth(monthStart(selectedDay));
                    setView(mode);
                  }}
                >
                  {mode === "day"
                    ? t("Day")
                    : mode === "week"
                      ? t("Week")
                      : t("Month")}
                </button>
              ))}
            </nav>
          </div>
        </header>
        {holidayError && (
          <div className="alert" role="alert">
            {t(holidayError)}
          </div>
        )}
        {(error || saveError) && (
          <div className="alert" role="alert">
            <span>{t(error || saveError)}</span>
            {saveError && (
              <button
                onClick={() => {
                  if (!persistBlocked) return download(state);
                  try {
                    download(localStorage.getItem(STORAGE) || state);
                  } catch {
                    download(state);
                  }
                }}
              >
                {t("Export a copy")}
              </button>
            )}
            {persistBlocked && (
              <button onClick={() => setModal("reset")}>
                {t("Start fresh")}
              </button>
            )}
            <button
              className="icon-button"
              aria-label={t("Dismiss message")}
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {state.recovery && (
          <div className="recovery" role="status">
            <span>
              <strong>{t("A fresh start for today.")}</strong> {t("Moved")}{" "}
              {state.recovery.moved} {t("tasks and consolidated")}{" "}
              {state.recovery.consolidated}{" "}
              {t("older repeats. Project steps stay in order.")}
            </span>
            <button onClick={() => setModal("recovery")}>
              {t("Review changes")}
            </button>
            {state.undo?.label === "Recovery" && (
              <button onClick={() => change(cal.undoChange)}>
                {t("Undo recovery")}
              </button>
            )}
          </div>
        )}
        <div className="workspace">
          <aside className="goals-rail" aria-label={t("Goals")}>
            <a
              className="brand"
              href="#"
              onClick={(event) => {
                event.preventDefault();
                goToday();
              }}
            >
              <CalendarDots size={24} weight="fill" />
              <span>{t("Appa")}</span>
            </a>
            <MiniCalendar
              month={miniMonth}
              selectedDay={selectedDay}
              today={today}
              settings={state.settings}
              holidays={holidays}
              onMonth={setMiniMonth}
              onSelect={selectDate}
            />
            <button
              className="rail-plan-button"
              onClick={() => setModal("planner")}
            >
              <Plus size={15} />
              {t("Plan a goal")}
            </button>
            <div className="goal-group">
              <h2>{t("Active goals")}</h2>
              {active.length === 0 && (
                <p className="muted small">
                  {t("Activate a saved goal or plan a new one.")}
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
                <h2>{t("Later")}</h2>
                {later.length === 0 && (
                  <p className="muted small">{t("Ideas can wait here.")}</p>
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
                {t("Goals")}
              </button>
              {state.sample && (
                <>
                  <span className="sample-label">{t("Example workspace")}</span>
                  <button
                    className="text-button"
                    onClick={() => setModal("reset")}
                  >
                    {t("Start fresh")}
                  </button>
                </>
              )}
              <button
                className="settings-button"
                onClick={() => setModal("settings")}
              >
                <GearSix size={17} />
                {t("Settings")}
              </button>
              {cal.weekStart(today, state.settings.weekStartsOn) !== week && (
                <button className="text-button" onClick={goToday}>
                  {t("Return to this week")}
                </button>
              )}
              <div className="workspace-identity">
                <Laptop size={23} />
                <div>
                  <strong>{t("Local workspace")}</strong>
                  <span>
                    {desktop
                      ? t("Saved on this computer")
                      : t("Saved in this browser")}
                  </span>
                </div>
              </div>
            </div>
          </aside>
          <main
            className="calendar-area"
            aria-label={
              view === "week"
                ? t("Week calendar")
                : view === "month"
                  ? t("Month calendar")
                  : t("Day calendar")
            }
          >
            {view === "week" ? (
              <CalendarTimeline
                dates={days}
                state={state}
                selectedDay={selectedDay}
                selectedTask={selectedTask}
                today={today}
                holidays={holidays}
                currentMinute={currentMinute}
                onDate={selectDate}
                onSlot={openSlot}
                scrollRef={timelineScroll}
                gridRef={timeGrid}
              />
            ) : view === "month" ? (
              <MonthCalendar
                month={monthStart(selectedDay)}
                state={state}
                selectedDay={selectedDay}
                today={today}
                holidays={holidays}
                onSelect={(date) => {
                  selectDate(date);
                  setView("day");
                }}
                onSlot={openSlot}
                onVisibleMonth={showVisibleMonth}
                scrollRequest={monthScrollRequest}
              />
            ) : (
              <div className="day-view" key="day">
                <nav className="day-date-strip" aria-label={t("Choose day")}>
                  <span className="day-week-label">
                    {state.settings.showWeekNumbers &&
                      t("Week {v0}", {
                        v0: weekNumber(week, state.settings.weekStartsOn),
                      })}
                  </span>
                  {days.map((date) => (
                    <button
                      key={date}
                      className={`day-date-button ${date === selectedDay ? "selected" : ""} ${date === today ? "is-today" : ""} ${[0, 6].includes(new Date(date + "T12:00:00Z").getUTCDay()) ? "is-weekend" : ""} ${holidays(date).length ? "has-holiday" : ""}`}
                      aria-label={t("View {v0}", {
                        v0: cal.dateLabel(
                          date,
                          {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          },
                          state.settings.language,
                        ),
                      })}
                      title={
                        holidays(date).map(holidayLabel).join(" · ") ||
                        undefined
                      }
                      aria-pressed={date === selectedDay}
                      aria-current={date === today ? "date" : undefined}
                      onClick={() => selectDate(date)}
                    >
                      <strong>{Number(date.slice(-2))}</strong>
                      <span>
                        {cal.dateLabel(
                          date,
                          { weekday: "short" },
                          state.settings.language,
                        )}
                      </span>
                      {holidays(date).length > 0 && (
                        <small className="header-holiday">
                          {holidays(date).map(holidayLabel).join(" · ")}
                        </small>
                      )}
                    </button>
                  ))}
                </nav>
                <ResizableDayPanels storageKey={`${STORAGE}.day-task-width`}>
                  <div className="day-timeline">
                    <CalendarTimeline
                      dates={[selectedDay]}
                      state={state}
                      selectedDay={selectedDay}
                      selectedTask={selectedTask}
                      today={today}
                      holidays={holidays}
                      currentMinute={currentMinute}
                      onDate={selectDate}
                      onSlot={openSlot}
                      scrollRef={timelineScroll}
                      gridRef={timeGrid}
                    />
                  </div>
                  <aside
                    id="day-task-list"
                    className="day-task-list"
                    aria-label={t("Tasks for selected day")}
                    tabIndex={0}
                  >
                    <header className="day-task-heading">
                      <h2>{t("Tasks")}</h2>
                      <p>{titleDate(selectedDay, state.settings.language)}</p>
                      {holidays(selectedDay).map((holiday) => (
                        <p
                          className="day-holiday"
                          key={`${holiday.name}/${holiday.startMinute}`}
                        >
                          {holidayLabel(holiday)}
                        </p>
                      ))}
                      <span>
                        {plannedMinutes} {t("min planned")}
                      </span>
                    </header>
                    {daySlots.length ? (
                      <ul className="day-task-items">
                        {daySlots.map((slot) => {
                          const task = slot.chosen || slot.tasks[0];
                          const selected = slot.tasks.some(
                            (item) => item.id === selectedTask,
                          );
                          return (
                            <li key={slot.id}>
                              <button
                                className={[
                                  "agenda-card",
                                  cal.goalFor(state, task)!.color,
                                  selected ? "selected" : "",
                                  slot.done ? "done" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                onClick={() => openSlot(slot)}
                              >
                                <span className="agenda-time">
                                  {cal.timeLabel(slot.start)}
                                </span>
                                <div>
                                  <h3>
                                    {slot.tasks.length > 1 && !slot.chosen
                                      ? t("Choose one")
                                      : task.title}
                                  </h3>
                                  <p>
                                    {cal.goalFor(state, task)!.name} {t("·")}{" "}
                                    {slot.duration} {t("min")}
                                    {slot.tasks.length > 1 && !slot.chosen
                                      ? t(" reserved")
                                      : ""}
                                  </p>
                                </div>
                                {slot.done ? (
                                  <CheckCircle
                                    size={18}
                                    aria-label={t("Completed")}
                                  />
                                ) : cal.isBlocked(state, task) ? (
                                  <LockSimple
                                    size={18}
                                    aria-label={t("Prerequisite unfinished")}
                                  />
                                ) : (
                                  <ArrowRight size={18} />
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <Empty
                        onPlan={() => setModal("planner")}
                        hasGoals={active.length > 0}
                      />
                    )}
                  </aside>
                </ResizableDayPanels>
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
                aria-label={t("Describe a goal")}
                value={composer}
                maxLength={3600}
                placeholder={t("Tell Appa what matters…")}
                onChange={(event) => setComposer(event.target.value)}
              />
              <button aria-label={t("Plan this goal")} type="submit">
                <ArrowUp size={19} weight="bold" />
              </button>
            </form>
          </main>
          {detailsOpen && (
            <Dialog
              title={titleDate(selectedDay, state.settings.language)}
              onClose={() => setDetailsOpen(false)}
            >
              <aside className="day-panel" aria-label={t("Selected day")}>
                <section className="day-summary">
                  <p>
                    <strong>
                      {plannedMinutes} {t("min")}
                    </strong>{" "}
                    {t("planned")}
                  </p>
                </section>
                <section className="next-step">
                  <p className="section-label">
                    {selectedDay === today
                      ? t("Next step")
                      : t("Scheduled step")}
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
                        {nextTask.minutes} {t("min")}
                      </p>
                      <button
                        className="primary full"
                        disabled={
                          selectedDay !== today ||
                          cal.isBlocked(state, nextTask)
                        }
                        onClick={() => complete(nextTask)}
                      >
                        {cal.isBlocked(state, nextTask) ? (
                          <>
                            <LockSimple size={17} />
                            {t("Finish the prerequisite first")}
                          </>
                        ) : selectedDay !== today ? (
                          t("Available on this day")
                        ) : (
                          t("Mark complete")
                        )}
                      </button>
                      {cal.isBlocked(state, nextTask) && (
                        <p className="small muted">
                          {t("After:")}{" "}
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
                          ? t("Make room for one thing.")
                          : daySlots.length && daySlots.every((s) => s.done)
                            ? t("You made progress.")
                            : t("A little breathing room.")}
                      </h1>
                      <p className="muted leading">
                        {shared.length
                          ? t(
                              "Choose an activity below to make it your next step.",
                            )
                          : daySlots.length
                            ? t("Your planned steps for this day are complete.")
                            : t("There are no steps scheduled for this day.")}
                      </p>
                      {!active.length && (
                        <button
                          className="primary full"
                          onClick={() => setModal("planner")}
                        >
                          {t("Plan your first goal")}
                        </button>
                      )}
                    </>
                  )}
                </section>
                {shared.map((slot) => (
                  <section className="shared-section" key={slot.id}>
                    <h2>
                      {t("Choose one (")}
                      {cal.timeLabel(slot.start)}
                      {t(")")}
                    </h2>
                    <p className="muted">
                      {slot.duration} {t("min")}{" "}
                      {slot.chosen ? t("planned") : t("reserved")}{" "}
                      <span className="separator">{t("·")}</span>{" "}
                      <span
                        className={
                          cal.goalFor(state, slot.tasks[0])!.color + "-text"
                        }
                      >
                        {new Set(slot.tasks.map((t) => t.goalId)).size > 1
                          ? t("Multiple goals")
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
                              {task.minutes} {t("min")}
                              {cal.isBlocked(state, task)
                                ? t(" · prerequisite unfinished")
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
                          {t("Complete")} {slot.chosen.title}
                        </button>
                      )}
                  </section>
                ))}
                {future.length > 0 && (
                  <section className="future-section">
                    <p className="section-label">
                      {t("Later steps")}{" "}
                      <span className="muted">{t("(scheduled)")}</span>
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
                            {t("·")} {task.minutes} {t("min")}
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
            <button onClick={() => change(cal.undoChange)}>{t("Undo")}</button>
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
          <Dialog
            title={t("Your recovery summary")}
            onClose={() => setModal(null)}
          >
            <div className="dialog-body">
              <p className="muted">
                {state.recovery.choices || 0}{" "}
                {t("shared slots need a choice. Nothing was marked complete.")}
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
                        {t("→")}{" "}
                        {item.status === "consolidated"
                          ? t("Consolidated missed repeat")
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
                {t("Undo this recovery")}
              </button>
            </div>
          </Dialog>
        )}
        {modal === "planner" && (
          <Planner
            state={state}
            onClose={() => setModal(null)}
            onDraft={(draft) =>
              setState((previous) => ({ ...previous, draft }))
            }
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
              setNotice("Settings saved.");
            }}
            onExport={() => download(state)}
            onImport={() => fileInput.current?.click()}
          />
        )}
        {modal === "goals" && (
          <Dialog title={t("Your goals")} onClose={() => setModal(null)}>
            <div className="dialog-body">
              <h3>{t("Active goals")}</h3>
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
              <h3 className="later-heading">{t("Later")}</h3>
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
                <p className="small muted">{t("Ideas can wait here.")}</p>
              )}
              {state.sample && (
                <button
                  className="text-button"
                  onClick={() => setModal("reset")}
                >
                  {t("Start fresh")}
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
          <Dialog
            title={t("Restore this backup?")}
            onClose={() => setModal(null)}
          >
            <div className="dialog-body">
              <p>
                {t("This backup contains")} {pendingImport.goals.length}{" "}
                {t("goals and")} {pendingImport.tasks.length}{" "}
                {t("tasks. It will replace the calendar in this browser.")}
              </p>
              <p className="muted">
                {t("You can undo the import immediately afterward.")}
              </p>
              <div className="dialog-actions">
                <button className="secondary" onClick={() => setModal(null)}>
                  {t("Cancel")}
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    change(
                      (previous) =>
                        cal.importBackup(
                          previous,
                          pendingImport,
                          referenceMode ? dayFor() : undefined,
                        ),
                      "Backup restored.",
                    );
                    setPersistBlocked(false);
                    setModal(null);
                    goToday();
                  }}
                >
                  {t("Restore backup")}
                </button>
              </div>
            </div>
          </Dialog>
        )}
        {modal === "reset" && (
          <Dialog
            title={t("Start with a fresh calendar?")}
            onClose={() => setModal(null)}
          >
            <div className="dialog-body">
              <p>
                {t(
                  "Remove the example goals and plan something of your own. You can undo this change.",
                )}
              </p>
              <div className="dialog-actions">
                <button className="secondary" onClick={() => setModal(null)}>
                  {t("Keep this calendar")}
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
                  {t("Start fresh")}
                </button>
              </div>
            </div>
          </Dialog>
        )}
      </div>
    </InterfaceLanguage>
  );
}

function Empty({
  onPlan,
  hasGoals,
}: {
  onPlan: () => void;
  hasGoals: boolean;
}) {
  const t = useInterfaceText();

  return (
    <div className="empty-state">
      <Sparkle size={32} />
      <h2>
        {hasGoals
          ? t("Nothing scheduled for this day.")
          : t("What would you like to make progress on?")}
      </h2>
      <p className="muted">
        {hasGoals
          ? t("Your next steps will appear here when they’re scheduled.")
          : t("Start with one goal. Turn it into small, doable steps.")}
      </p>
      <button className="primary" onClick={onPlan}>
        {t("Plan a goal")}
      </button>
    </div>
  );
}
