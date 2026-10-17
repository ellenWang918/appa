import { api } from "./api";
import {
  initializeCalendarStorage,
  saveCalendar,
  acceptStoredCalendar,
  flushCalendar,
  storageScope,
} from "./calendarStorage";
import { FloatingChat } from "./FloatingChat";
import { CalendarSection } from "./CalendarSection";
import { calendarReplacementIsHighImpact } from "./actionPatterns";
import { ActionGuard, useActionGuard } from "./ActionGuard";
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
import { YearCalendar } from "./YearCalendar";
import { ResizableDayPanels } from "./ResizableDayPanels";
import { useHolidayCalendar } from "./useHolidayCalendar";
import { holidayLabel } from "./holidayDates";
import { InterfaceLanguage } from "./InterfaceLanguage";
import type { CalendarView } from "./CalendarViews";
import type { CalendarState, EventDraft, Slot, Task, TaskEdit } from "./types";
import { errorMessage } from "./errors";
import {
  ArrowRight,
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
import { Dialog, Dot, IconButton } from "./ui";
import { TaskCard } from "./TaskCard";
import { Toast } from "./Toast";
import { EventCreator } from "./EventCreator";
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
  const [initial, setInitial] = useState<ReturnType<typeof load> | null>(null);
  const [startupError, setStartupError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const legacy = load();
    let legacyBackup: string | undefined;
    try {
      legacyBackup = localStorage.getItem(STORAGE) ?? undefined;
    } catch {
      /* Recovery remains read-only. */
    }
    setStartupError("");
    void initializeCalendarStorage(
      referenceMode ? "reference" : "main",
      legacy.state,
      !!legacy.error,
      legacyBackup,
    )
      .then((result) => {
        if (!cancelled)
          setInitial({
            state: result.state ?? legacy.state,
            error: result.needsRecovery
              ? legacy.error ||
                "Your saved calendar could not be read. Import a backup or start fresh."
              : "",
          });
      })
      .catch((error) => {
        if (!cancelled) setStartupError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);
  if (!initial)
    return (
      <div className="startup-status" role={startupError ? "alert" : "status"}>
        <p>{startupError || "Opening your calendar…"}</p>
        {startupError && (
          <>
            <button
              className="secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
            <button
              className="text-button"
              onClick={() => download(localStorage.getItem(STORAGE) || "{}")}
            >
              Export previous browser data
            </button>
          </>
        )}
      </div>
    );
  return (
    <ActionGuard>
      <AppContent initial={initial} />
    </ActionGuard>
  );
}

function AppContent({ initial }: { initial: ReturnType<typeof load> }) {
  const guard = useActionGuard();
  const applyingRef = useRef(false);
  const [calendarApplying, setCalendarApplying] = useState(false);
  const [destructiveName, setDestructiveName] = useState("");
  const [state, setState] = useState(initial.state),
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
    [taskAnchor, setTaskAnchor] = useState<HTMLElement | null>(null),
    [eventDraft, setEventDraft] = useState<EventDraft | null>(null),
    [eventAnchor, setEventAnchor] = useState<HTMLElement | null>(null),
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
    eventTrigger = useRef<HTMLElement | null>(null),
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
    let cancelled = false;
    void saveCalendar(state)
      .then(() => {
        if (!cancelled) setSaveError("");
      })
      .catch((error) => {
        if (!cancelled) setSaveError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [state, persistBlocked]);
  useEffect(() => {
    function refresh() {
      if (applyingRef.current) return;
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
  const showVisibleYear = useCallback((year: string) => {
    setVisibleMonth((month) => `${year}${month.slice(4)}`);
    setMiniMonth((month) => `${year}${month.slice(4)}`);
  }, []);
  const timelineDate = view === "day" ? selectedDay : week;
  useEffect(() => {
    if (
      (view !== "day" && view !== "week") ||
      !timelineScroll.current ||
      !timeGrid.current
    )
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
  const displayState = cal.calendarDisplayState(state);
  const daySlots = [
      ...cal.allDaySlotsFor(displayState, selectedDay),
      ...cal.slotsFor(displayState, selectedDay),
    ],
    plannedMinutes = cal.plannedMinutesFor(displayState, selectedDay);
  const goal = state.goals.find((item) => item.id === goalId);
  const cardTask = selectedTask ? cal.taskFor(state, selectedTask) : undefined;
  const complete = (task: Task) =>
    change(
      (previous) => cal.completeTask(previous, task.id, today),
      "Progress saved.",
    );
  function openModal(next: Exclude<typeof modal, null>) {
    guard.request(() => {
      setEventDraft(null);
      setDetailsOpen(false);
      setDestructiveName("");
      setModal(next);
    });
  }
  function goToday() {
    guard.request(() => {
      setEventDraft(null);
      setDetailsOpen(false);
      setSelectedDay(today);
      setWeek(cal.weekStart(today, state.settings.weekStartsOn));
      setMiniMonth(monthStart(today));
      setVisibleMonth(monthStart(today));
      setMonthScrollRequest((request) => request + 1);
      setSelectedTask(null);
      setScrollToNowRequest((request) => request + 1);
    });
  }
  function selectDate(date: string, discardEventDraft = true) {
    const action = () => {
      if (discardEventDraft) setEventDraft(null);
      setDetailsOpen(false);
      setSelectedDay(date);
      setWeek(cal.weekStart(date, state.settings.weekStartsOn));
      setMiniMonth(monthStart(date));
      setVisibleMonth(monthStart(date));
      if (view === "month" || view === "year")
        setMonthScrollRequest((request) => request + 1);
      setSelectedTask(null);
    };
    if (discardEventDraft) guard.request(action);
    else guard.run(action);
  }
  function navigate(direction: number) {
    const date =
      view === "year"
        ? shiftMonth(visibleMonth, direction * 12)
        : view === "month"
          ? shiftMonth(visibleMonth, direction)
          : cal.addDays(
              view === "week" ? week : selectedDay,
              direction * (view === "week" ? 7 : 1),
            );
    selectDate(date);
  }
  function openSlot(slot: Slot, anchor: HTMLElement) {
    guard.request(() => {
      setTaskAnchor(anchor);
      selectDate(slot.date);
      setSelectedTask(slot.chosen?.id || slot.tasks[0].id);
      setDetailsOpen(true);
    });
  }
  function openEvent(
    date = selectedDay,
    start?: number,
    trigger?: HTMLElement,
    allDay = false,
  ) {
    guard.request(() => {
      setDetailsOpen(false);
      setModal(null);
      const eventDate = date;
      const eventStart = Math.max(
        0,
        Math.min(
          1435,
          start ??
            (eventDate === today ? Math.ceil(currentMinute / 30) * 30 : 540),
        ),
      );
      selectDate(eventDate);
      if (view === "year") setView("day");
      eventTrigger.current = trigger ?? null;
      setEventAnchor(null);
      setEventDraft({
        id: cal.id(),
        title: "",
        date: eventDate,
        start: eventStart,
        minutes: Math.min(30, 1440 - eventStart),
        allDay,
        reservationAllDay: allDay,
      });
    });
  }
  function closeEvent(restoreFocus = false) {
    guard.request(() => {
      setEventDraft(null);
      if (restoreFocus) eventTrigger.current?.focus({ preventScroll: true });
    });
  }
  function updateEventDraft(changes: Partial<TaskEdit>) {
    if (changes.date && changes.date !== eventDraft?.date)
      selectDate(changes.date, false);
    setEventDraft((previous) =>
      previous ? { ...previous, ...changes } : null,
    );
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
      setDestructiveName("");
      openModal("import");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }
  return (
    <InterfaceLanguage language={state.settings.language}>
      <div
        className="app-shell"
        inert={calendarApplying}
        aria-busy={calendarApplying}
      >
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
            className="rail-plan-button primary"
            onClick={(event) =>
              openEvent(selectedDay, undefined, event.currentTarget)
            }
          >
            <Plus size={15} />
            {t("Create event")}
          </button>
          <CalendarSection
            key={`${cal.personalCalendarFor(state)?.name}/${cal.personalCalendarFor(state)?.color}`}
            state={state}
            onToggle={() => {
              setState(cal.togglePersonalCalendar(state));
              setDetailsOpen(false);
            }}
            onSave={(name, color) => {
              setState(cal.editPersonalCalendar(state, name, color));
              setNotice("Calendar updated.");
            }}
            onDelete={() => {
              setState(cal.deletePersonalCalendar(state));
              setNotice("Calendar deleted.");
              setDetailsOpen(false);
            }}
            onBackup={() => download(state)}
          />
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
                  openModal("goal");
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
                    openModal("goal");
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
              onClick={() => openModal("goals")}
            >
              {t("Goals")}
            </button>
            {state.sample && (
              <>
                <span className="sample-label">{t("Example workspace")}</span>
                <button
                  className="text-button"
                  onClick={() => (setDestructiveName(""), openModal("reset"))}
                >
                  {t("Start fresh")}
                </button>
              </>
            )}
            <button
              className="settings-button"
              onClick={() => openModal("settings")}
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
        <div className="calendar-surface">
          <header className="topbar">
            <div className="mobile-tools">
              <IconButton
                className="icon-button"
                aria-label={t("Create event")}
                onClick={(event) =>
                  openEvent(selectedDay, undefined, event.currentTarget)
                }
              >
                <Plus size={18} />
              </IconButton>
              <IconButton
                className="icon-button"
                aria-label={t("Your goals")}
                onClick={() => openModal("goals")}
              >
                <List size={18} />
              </IconButton>
              <IconButton
                className="icon-button"
                aria-label={t("Settings")}
                onClick={() => openModal("settings")}
              >
                <GearSix size={18} />
              </IconButton>
            </div>
            <div className="calendar-title">
              <h1>
                {cal.dateLabel(
                  view === "month" || view === "year"
                    ? visibleMonth
                    : selectedDay,
                  view === "year"
                    ? { year: "numeric" }
                    : {
                        month: "long",
                        year: "numeric",
                      },
                  state.settings.language,
                )}
              </h1>
              {view !== "week" && (
                <span>
                  {view === "day"
                    ? cal.dateLabel(
                        selectedDay,
                        { weekday: "long" },
                        state.settings.language,
                      )
                    : view === "year"
                      ? t("Year view")
                      : t("Month view")}
                </span>
              )}
            </div>
            <div className="calendar-controls">
              <div className="week-navigation">
                <IconButton
                  className="icon-button"
                  aria-label={t("Previous {v0}", { v0: view })}
                  onClick={() => navigate(-1)}
                >
                  <CaretLeft size={15} />
                </IconButton>
                <IconButton
                  className="icon-button"
                  aria-label={t("Next {v0}", { v0: view })}
                  onClick={() => navigate(1)}
                >
                  <CaretRight size={15} />
                </IconButton>
              </div>
              <button className="today-button" onClick={goToday}>
                {t("Today")}
              </button>
              <nav className="view-tabs" aria-label={t("Calendar view")}>
                {(["day", "week", "month", "year"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={view === mode ? "selected" : ""}
                    aria-pressed={view === mode}
                    onClick={() =>
                      guard.request(() => {
                        setDetailsOpen(false);
                        setEventDraft(null);
                        if (mode === "month" && view !== "month") {
                          if (view === "year") selectDate(visibleMonth);
                          else setVisibleMonth(monthStart(selectedDay));
                        }
                        if (mode === "year" && view === "month")
                          selectDate(visibleMonth);
                        setView(mode);
                      })
                    }
                  >
                    {mode === "day"
                      ? t("Day")
                      : mode === "week"
                        ? t("Week")
                        : mode === "month"
                          ? t("Month")
                          : t("Year")}
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
                      download(
                        persistBlocked
                          ? localStorage.getItem(STORAGE) || state
                          : state,
                      );
                    } catch {
                      download(state);
                    }
                  }}
                >
                  {t("Export a copy")}
                </button>
              )}
              {persistBlocked && (
                <button
                  onClick={() => (setDestructiveName(""), openModal("reset"))}
                >
                  {t("Start fresh")}
                </button>
              )}
              <IconButton
                className="icon-button"
                aria-label={t("Dismiss message")}
                onClick={() => setError("")}
              >
                <X size={16} />
              </IconButton>
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
              <button onClick={() => openModal("recovery")}>
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
            <main
              className="calendar-area"
              aria-label={
                view === "week"
                  ? t("Week calendar")
                  : view === "month"
                    ? t("Month calendar")
                    : view === "year"
                      ? t("Year calendar")
                      : t("Day calendar")
              }
            >
              {view === "week" ? (
                <CalendarTimeline
                  dates={days}
                  state={displayState}
                  selectedDay={selectedDay}
                  selectedTask={selectedTask}
                  today={today}
                  holidays={holidays}
                  currentMinute={currentMinute}
                  onDate={selectDate}
                  onSlot={openSlot}
                  onCreate={openEvent}
                  draft={eventDraft}
                  onDraftAnchor={setEventAnchor}
                  scrollRef={timelineScroll}
                  gridRef={timeGrid}
                />
              ) : view === "month" ? (
                <MonthCalendar
                  month={monthStart(selectedDay)}
                  state={displayState}
                  selectedDay={selectedDay}
                  today={today}
                  holidays={holidays}
                  onSelect={(date) =>
                    guard.request(() => {
                      selectDate(date);
                      setView("day");
                    })
                  }
                  onSlot={openSlot}
                  onCreate={openEvent}
                  draft={eventDraft}
                  onDraftAnchor={setEventAnchor}
                  onVisibleMonth={showVisibleMonth}
                  scrollRequest={monthScrollRequest}
                />
              ) : view === "year" ? (
                <YearCalendar
                  year={selectedDay.slice(0, 4)}
                  selectedDay={selectedDay}
                  scrollRequest={monthScrollRequest}
                  onVisibleYear={showVisibleYear}
                  state={displayState}
                  today={today}
                  holidays={holidays}
                  onMonth={(month) =>
                    guard.request(() => {
                      selectDate(month);
                      setView("month");
                    })
                  }
                  onSelect={(date) =>
                    guard.request(() => {
                      selectDate(date);
                      setView("day");
                    })
                  }
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
                      </button>
                    ))}
                  </nav>
                  <ResizableDayPanels storageKey={`${STORAGE}.day-task-width`}>
                    <div className="day-timeline">
                      <CalendarTimeline
                        dates={[selectedDay]}
                        state={displayState}
                        selectedDay={selectedDay}
                        selectedTask={selectedTask}
                        today={today}
                        holidays={holidays}
                        currentMinute={currentMinute}
                        onDate={selectDate}
                        onSlot={openSlot}
                        onCreate={openEvent}
                        draft={eventDraft}
                        onDraftAnchor={setEventAnchor}
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
                                  data-goal-color={cal.slotGoalColor(
                                    state,
                                    slot,
                                  )}
                                  className={[
                                    "agenda-card",
                                    cal.goalFor(state, task)?.color ?? "indigo",
                                    selected ? "selected" : "",
                                    slot.done ? "done" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  onClick={(event) =>
                                    openSlot(slot, event.currentTarget)
                                  }
                                >
                                  <span className="agenda-time">
                                    {task.allDay
                                      ? t("All day")
                                      : cal.timeLabel(slot.start)}
                                  </span>
                                  <div>
                                    <h3>
                                      {slot.tasks.length > 1 && !slot.chosen
                                        ? t("Choose one")
                                        : task.title}
                                    </h3>
                                    <p>
                                      {cal.goalFor(state, task)?.name ??
                                        t("Event")}{" "}
                                      {t("·")}{" "}
                                      {task.allDay ? (
                                        t("All day")
                                      ) : (
                                        <>
                                          {slot.duration} {t("min")}
                                        </>
                                      )}
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
                          onCreate={() => openEvent()}
                          onPlan={() => openModal("planner")}
                          hasGoals={active.length > 0}
                        />
                      )}
                    </aside>
                  </ResizableDayPanels>
                </div>
              )}
              <FloatingChat
                state={state}
                onReference={(ref) =>
                  guard.request(() => {
                    if (
                      cal.taskFor(state, ref.id)?.goalId === null &&
                      cal.personalCalendarFor(state)?.visible === false
                    )
                      setState(cal.togglePersonalCalendar(state));
                    selectDate(ref.date);
                    setView("day");
                    setTaskAnchor(null);
                    setSelectedTask(ref.id);
                    setDetailsOpen(true);
                  })
                }
                onReviewEvent={(event) =>
                  guard.request(() => {
                    openEvent(
                      event.date,
                      event.start,
                      undefined,
                      !!event.allDay,
                    );
                    setEventDraft((draft) =>
                      draft ? { ...draft, ...event } : draft,
                    );
                  })
                }
                onApply={async (proposalId) => {
                  applyingRef.current = true;
                  setCalendarApplying(true);
                  try {
                    await flushCalendar(latestState.current);
                    const saved = await api("calendar/apply", {
                      scope: storageScope(),
                      proposalId,
                    });
                    if (!saved.state)
                      throw new Error(
                        "The calendar changes could not be loaded. Reopen Appa.",
                      );
                    acceptStoredCalendar(saved);
                    latestState.current = saved.state;
                    setState(saved.state);
                    setNotice("Calendar replanned.");
                  } finally {
                    applyingRef.current = false;
                    setCalendarApplying(false);
                  }
                }}
                onActivate={(open) =>
                  guard.request(() => {
                    setEventDraft(null);
                    setDetailsOpen(false);
                    open();
                  })
                }
                onReview={(plan, intention) =>
                  guard.request(() => {
                    setState((previous) => ({
                      ...previous,
                      draft: { intention, plan },
                    }));
                    openModal("planner");
                  })
                }
              />
            </main>
          </div>
        </div>
        {detailsOpen && cardTask && (
          <TaskCard
            key={cardTask.id}
            state={state}
            task={cardTask}
            anchor={taskAnchor}
            today={today}
            onClose={() => guard.request(() => setDetailsOpen(false))}
            onSave={(edit) => {
              const next = cal.editTask(state, cardTask.id, edit, today);
              setState(next);
              setError("");
              setNotice(
                cardTask.goalId === null
                  ? t("Event updated.")
                  : t("Task updated."),
              );
              guard.run(() => selectDate(edit.date));
              setSelectedTask(cardTask.id);
              setDetailsOpen(true);
            }}
            onComplete={() => complete(cardTask)}
            onRemove={() => {
              change(
                (previous) => cal.removeEvent(previous, cardTask.id),
                t("Event deleted."),
              );
              setDetailsOpen(false);
              setSelectedTask(null);
            }}
            onTask={(task) =>
              guard.request(() => {
                selectDate(task.date);
                setSelectedTask(task.id);
                setDetailsOpen(true);
              })
            }
            onChoice={(task) => {
              change((previous) =>
                cal.selectChoice(previous, task.date, task.slotId, task.id),
              );
              setSelectedTask(task.id);
            }}
          />
        )}
        {eventDraft && (
          <EventCreator
            key={eventDraft.id}
            draft={eventDraft}
            anchor={eventAnchor}
            trigger={eventTrigger.current}
            today={today}
            timezone={state.settings.timezone}
            onClose={closeEvent}
            onDraftChange={updateEventDraft}
            onSave={(event) => {
              const next = cal.createEvent(state, event, today);
              setState(next);
              setError("");
              setNotice(t("Event created."));
              guard.run(() => {
                closeEvent(true);
                selectDate(event.date);
              });
            }}
          />
        )}
        {state.undo && state.undo.label !== "Recovery" && (
          <Toast
            key={state.undo.revision}
            message={notice || state.undo.label}
            onUndo={() => change(cal.undoChange)}
          />
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
            onClose={() => guard.request(() => setModal(null))}
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
            onClose={() => guard.request(() => setModal(null))}
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
            onClose={() => guard.request(() => setModal(null))}
            onSave={(settings) => {
              setState(
                cal.updateSettings(state, settings, dayFor(settings.timezone)),
              );
              setModal(null);
              setNotice("Settings saved.");
            }}
            onExport={() => download(state)}
            onImport={() =>
              guard.request(() => {
                setModal(null);
                fileInput.current?.click();
              })
            }
          />
        )}
        {modal === "goals" && (
          <Dialog
            title={t("Your goals")}
            onClose={() => guard.request(() => setModal(null))}
          >
            <div className="dialog-body">
              <CalendarSection
                key={`${cal.personalCalendarFor(state)?.name}/${cal.personalCalendarFor(state)?.color}`}
                state={state}
                onToggle={() => {
                  setState(cal.togglePersonalCalendar(state));
                  setDetailsOpen(false);
                }}
                onSave={(name, color) => {
                  setState(cal.editPersonalCalendar(state, name, color));
                  setNotice("Calendar updated.");
                }}
                onDelete={() => {
                  setState(cal.deletePersonalCalendar(state));
                  setNotice("Calendar deleted.");
                  setDetailsOpen(false);
                }}
                onBackup={() => download(state)}
              />
              <h3>{t("Active goals")}</h3>
              {active.map((item) => (
                <button
                  className="goal-link"
                  key={item.id}
                  onClick={() => {
                    setGoalId(item.id);
                    openModal("goal");
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
                      openModal("goal");
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
                  onClick={() => (setDestructiveName(""), openModal("reset"))}
                >
                  {t("Start fresh")}
                </button>
              )}
            </div>
          </Dialog>
        )}
        {modal === "goal" && goal && (
          <GoalDetails
            onBackup={() => download(state)}
            key={goal.id}
            goal={goal}
            state={state}
            onClose={() => guard.request(() => setModal(null))}
            onDelete={() => {
              setState(cal.deleteGoal(state, goal.id, today));
              setModal(null);
              setNotice("Goal deleted.");
            }}
            onSave={(edit) => {
              setState(cal.editGoal(state, goal.id, edit, today));
              setNotice("Goal updated.");
            }}
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
            onClose={() => guard.request(() => setModal(null))}
          >
            <div className="dialog-body">
              <p>
                {t("This backup contains")} {pendingImport.goals.length}{" "}
                {t("goals and")} {pendingImport.tasks.length}{" "}
                {t(
                  "tasks. It will replace all current goals, events, repeating series, history and choices on this device.",
                )}
              </p>
              {!!pendingImport.eventSeries?.length && (
                <p>
                  {t("Includes {count} repeating event series.", {
                    count: pendingImport.eventSeries.length,
                  })}
                </p>
              )}
              <p className="muted">
                {t("Undo is available until your next change or reload.")}
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => download(state)}
              >
                {t("Export backup")}
              </button>
              {calendarReplacementIsHighImpact(state) && (
                <label className="field">
                  {t("Type {name} to confirm.", { name: "Appa" })}
                  <input
                    autoComplete="off"
                    value={destructiveName}
                    onChange={(event) => setDestructiveName(event.target.value)}
                  />
                </label>
              )}
              <div className="dialog-actions">
                <button className="secondary" onClick={() => setModal(null)}>
                  {t("Cancel")}
                </button>
                <button
                  className="primary danger-action"
                  disabled={
                    calendarReplacementIsHighImpact(state) &&
                    destructiveName !== "Appa"
                  }
                  data-action="destructive"
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
                  {t("Replace calendar")}
                </button>
              </div>
            </div>
          </Dialog>
        )}
        {modal === "reset" && (
          <Dialog
            title={t("Clear this calendar?")}
            onClose={() => guard.request(() => setModal(null))}
          >
            <div className="dialog-body">
              <p>
                {t(
                  "Clear all goals, events, repeating series, completed history and saved choices. Export a backup first if you want to keep them. Undo is available until your next change or reload.",
                )}
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => download(state)}
              >
                {t("Export backup")}
              </button>
              {calendarReplacementIsHighImpact(state) && (
                <label className="field">
                  {t("Type {name} to confirm.", { name: "Appa" })}
                  <input
                    autoComplete="off"
                    value={destructiveName}
                    onChange={(event) => setDestructiveName(event.target.value)}
                  />
                </label>
              )}
              <div className="dialog-actions">
                <button className="secondary" onClick={() => setModal(null)}>
                  {t("Keep this calendar")}
                </button>
                <button
                  className="primary danger-action"
                  disabled={
                    calendarReplacementIsHighImpact(state) &&
                    destructiveName !== "Appa"
                  }
                  data-action="destructive"
                  onClick={() => {
                    change(
                      (previous) => cal.resetWorkspace(previous, today),
                      "Fresh calendar ready.",
                    );
                    setPersistBlocked(false);
                    setModal(null);
                  }}
                >
                  {t("Clear calendar")}
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
  onCreate,
  onPlan,
  hasGoals,
}: {
  onCreate: () => void;
  onPlan: () => void;
  hasGoals: boolean;
}) {
  const t = useInterfaceText();

  return (
    <div className="empty-state">
      <Sparkle size={32} />
      <h2>{t("Nothing scheduled for this day.")}</h2>
      <p className="muted">
        {hasGoals
          ? t("Your next steps will appear here when they’re scheduled.")
          : t("Create an event, or ask Appa to help plan a goal.")}
      </p>
      <div className="empty-actions">
        <button className="primary" onClick={onCreate}>
          {t("Create event")}
        </button>
        <button className="secondary" onClick={onPlan}>
          {t("Plan a goal")}
        </button>
      </div>
    </div>
  );
}
