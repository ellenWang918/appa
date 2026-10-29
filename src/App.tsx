import { initializeCalendarStorage } from "./calendarStorage";
import { FloatingChat } from "./FloatingChat";
import { GoalNavigation } from "./GoalNavigation";
import { useCalendarWorkspace } from "./useCalendarWorkspace";
import { useCalendarNavigation } from "./useCalendarNavigation";
import { useCalendarQueries } from "./useCalendarQueries";
import { calendarReplacementIsHighImpact } from "./actionPatterns";
import { ActionGuard, useActionGuard } from "./ActionGuard";
import { useInterfaceText } from "./InterfaceLanguage";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { MiniCalendar, MonthCalendar } from "./CalendarViews";
import { CalendarTimeline } from "./CalendarTimeline";
import { YearCalendar } from "./YearCalendar";
import { ResizableDayPanels } from "./ResizableDayPanels";
import { useHolidayCalendar } from "./useHolidayCalendar";
import { holidayLabel } from "./holidayDates";
import { InterfaceLanguage } from "./InterfaceLanguage";
import { monthStart, weekNumber } from "./calendarDates";
import type { CalendarState, EventDraft, Slot, Task, Todo } from "./types";
import { TodoPanel } from "./TodoPanel";
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
  ListChecks,
  Plus,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import * as cal from "./calendar";
import { moveTimelineTask, resizeTimelineTask } from "./timelineDrag";
import { Planner, Settings, GoalDetails } from "./Dialogs";
import { Dialog, IconButton } from "./ui";
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
  const {
    state,
    setState,
    latestState,
    saveError,
    persistBlocked,
    setPersistBlocked,
    error,
    setError,
    notice,
    setNotice,
    change,
    retrySave,
    retryingSave,
    applyProposal,
    applyingRef,
    calendarApplying,
  } = useCalendarWorkspace(initial);
  const navigation = useCalendarNavigation(
    dayFor(initial.state.settings.timezone),
    state.settings.weekStartsOn,
  );
  const {
    view,
    setView,
    miniMonth,
    setMiniMonth,
    visibleMonth,
    setVisibleMonth,
    monthScrollRequest,
    week,
    setWeek,
    selectedDay,
    setSelectedDay,
    scrollToNowRequest,
    showVisibleMonth,
    showVisibleYear,
  } = navigation;
  const [draggedTodo, setDraggedTodo] = useState<Todo | null>(null);
  const [todoPanelOpen, setTodoPanelOpen] = useState(true);
  const [destructiveName, setDestructiveName] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [taskAnchor, setTaskAnchor] = useState<HTMLElement | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [eventAnchor, setEventAnchor] = useState<HTMLElement | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [eventRevealRequest, setEventRevealRequest] = useState(0);
  const pendingEventReveal = useRef<{
    id: string;
    start: number;
    allDay: boolean;
  } | null>(null);
  const [modal, setModal] = useState<
    | "planner"
    | "settings"
    | "goals"
    | "goal"
    | "import"
    | "reset"
    | "recovery"
    | null
  >(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [today, setToday] = useState(() =>
    dayFor(initial.state.settings.timezone),
  );
  const [currentMinute, setCurrentMinute] = useState(() =>
    referenceMode ? 1080 : cal.localMinute(initial.state.settings.timezone),
  );
  const t = useInterfaceText(state.settings.language);

  const fileInput = useRef<HTMLInputElement>(null),
    eventTrigger = useRef<HTMLElement | null>(null),
    timelineScroll = useRef<HTMLDivElement>(null),
    timeGrid = useRef<HTMLDivElement>(null),
    [pendingImport, setPendingImport] = useState<CalendarState | null>(null),
    todayRef = useRef(today);
  const { lookup: holidays, error: holidayError } = useHolidayCalendar(
    state.settings,
  );
  useEffect(() => {
    document.documentElement.lang = state.settings.language;
  }, [state.settings.language]);
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
  const active = state.goals.filter((goal) => goal.status === "active");
  const days = Array.from({ length: 7 }, (_, i) => cal.addDays(week, i));
  const timelineDate = view === "day" ? selectedDay : week;
  useEffect(() => {
    if (
      (view !== "day" && view !== "week") ||
      !timelineScroll.current ||
      !timeGrid.current
    )
      return;
    // Creation reveals its box once; ordinary navigation still opens at now.
    const scroller = timelineScroll.current;
    const reveal = pendingEventReveal.current;
    pendingEventReveal.current = null;
    if (reveal) {
      const card = reveal.allDay
        ? scroller.querySelector<HTMLElement>(".all-day-event.selected")
        : [...scroller.querySelectorAll<HTMLElement>(".timeline-event")].find(
            (element) => element.dataset.taskId === reveal.id,
          );
      if (card) {
        const viewport = scroller.getBoundingClientRect();
        const bounds = card.getBoundingClientRect();
        scroller.scrollLeft +=
          bounds.left -
          viewport.left -
          Math.max(8, (scroller.clientWidth - bounds.width) / 2);
        if (reveal.allDay) {
          const cell = card.closest<HTMLElement>(".all-day-cell");
          if (cell)
            cell.scrollTop += bounds.top - cell.getBoundingClientRect().top - 8;
        } else {
          const headingHeight =
            scroller.querySelector<HTMLElement>(".timeline-heading")
              ?.offsetHeight ?? 0;
          scroller.scrollTop +=
            bounds.top -
            viewport.top -
            headingHeight -
            Math.min(64, scroller.clientHeight / 5);
        }
        return;
      }
    }
    const minute =
      reveal?.start ??
      (referenceMode ? 1080 : cal.localMinute(state.settings.timezone));
    // Clock ticks and task edits preserve manual scrolling in either timeline.
    timelineScroll.current.scrollTop = Math.max(
      0,
      ((minute - 60) / (24 * 60)) * timeGrid.current.clientHeight,
    );
  }, [
    timelineDate,
    view,
    state.settings.timezone,
    scrollToNowRequest,
    eventRevealRequest,
  ]);
  const displayState = useMemo(() => cal.calendarDisplayState(state), [state]);
  const displayQueries = useCalendarQueries(state);
  const daySlots = [
      ...displayQueries.slotsFor(selectedDay, null, true),
      ...displayQueries.slotsFor(selectedDay),
    ],
    plannedMinutes = displayQueries
      .slotsFor(selectedDay)
      .reduce((sum, slot) => sum + slot.duration, 0);
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
      navigation.goToday(today);
      setSelectedTask(null);
    });
  }
  function selectDate(date: string, discardEventDraft = true) {
    const action = () => {
      if (discardEventDraft) setEventDraft(null);
      setDetailsOpen(false);
      navigation.selectDate(date);
      setSelectedTask(null);
    };
    if (discardEventDraft) guard.request(action);
    else guard.run(action);
  }
  function navigate(direction: number) {
    selectDate(navigation.adjacentDate(direction));
  }
  function openSlot(slot: Slot, anchor: HTMLElement) {
    guard.request(() => {
      setTaskAnchor(anchor);
      selectDate(slot.date);
      setSelectedTask(slot.chosen?.id || slot.tasks[0].id);
      setDetailsOpen(true);
    });
  }
  function moveCard(
    task: Task,
    date: string,
    start: number,
    minutes = task.minutes,
  ) {
    guard.request(() => {
      try {
        const previous = latestState.current;
        const next =
          minutes === task.minutes
            ? moveTimelineTask(previous, task, date, start, today)
            : resizeTimelineTask(previous, task, start, minutes, today);
        if (next === previous) return;
        setState(next);
        setEventDraft(null);
        setDetailsOpen(false);
        setTaskAnchor(null);
        setSelectedTask(task.id);
        setSelectedDay(date);
        setMiniMonth(monthStart(date));
        setError("");
        setNotice(
          minutes !== task.minutes
            ? t("Duration updated.")
            : task.goalId === null
              ? t("Event moved.")
              : t("Task moved."),
        );
      } catch (caught) {
        setError(errorMessage(caught));
      }
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
  function updateEventDraft(changes: Partial<EventDraft>) {
    if (changes.date && changes.date !== eventDraft?.date)
      selectDate(changes.date, false);
    setEventDraft((previous) =>
      previous ? { ...previous, ...changes } : null,
    );
  }
  function addTodo(title: string) {
    const next = cal.addTodo(latestState.current, title);
    setState(next);
    setError("");
    setNotice(t("Added to To do list."));
  }
  function scheduleTodo(
    todo: Todo,
    date: string,
    start: number,
    allDay = false,
  ) {
    setDraggedTodo(null);
    guard.request(() => {
      try {
        const next = cal.scheduleTodo(
          latestState.current,
          todo.id,
          date,
          start,
          today,
          allDay,
        );
        setState(next);
        setEventDraft(null);
        setDetailsOpen(false);
        setTaskAnchor(null);
        setSelectedDay(date);
        setMiniMonth(monthStart(date));
        setSelectedTask(todo.id);
        setError("");
        setNotice(t("To do scheduled."));
      } catch (caught) {
        setError(errorMessage(caught));
      }
    });
  }
  function openTodoSchedule(todo: Todo, trigger: HTMLElement) {
    guard.request(() => {
      openEvent(selectedDay, undefined, trigger);
      setEventDraft((previous) =>
        previous
          ? {
              ...previous,
              title: todo.title,
              minutes: todo.minutes,
              start: Math.min(previous.start, 1440 - todo.minutes),
              todoId: todo.id,
            }
          : null,
      );
    });
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
  const goalNavigation = {
    state,
    onGoal: (id: string) => {
      setGoalId(id);
      openModal("goal");
    },
    onToggleGoal: (id: string) => {
      setState((current) => cal.toggleGoalVisibility(current, id));
      setDetailsOpen(false);
    },
    onSaveGoal: (
      id: string,
      name: string,
      color: Parameters<typeof cal.editGoalCalendar>[3],
    ) => {
      setState(cal.editGoalCalendar(latestState.current, id, name, color));
      setNotice(t("Goal updated."));
    },
    onDeleteGoal: (id: string) => {
      setState(cal.deleteGoal(latestState.current, id, todayRef.current));
      setNotice(t("Goal deleted."));
      setDetailsOpen(false);
    },
    onToggle: () => {
      setState(cal.togglePersonalCalendar);
      setDetailsOpen(false);
    },
    onSave: (
      name: string,
      color: Parameters<typeof cal.editPersonalCalendar>[2],
    ) => {
      setState(cal.editPersonalCalendar(latestState.current, name, color));
      setNotice("Calendar updated.");
    },
    onDelete: () => {
      setState(cal.deletePersonalCalendar);
      setNotice("Calendar deleted.");
      setDetailsOpen(false);
    },
    onBackup: () => download(latestState.current),
  };
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
            onToday={goToday}
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
          <GoalNavigation layout="rail" {...goalNavigation} />
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
                <button className="today-button" onClick={goToday}>
                  {t("Today")}
                </button>
                <IconButton
                  className="icon-button"
                  aria-label={t("Next {v0}", { v0: view })}
                  onClick={() => navigate(1)}
                >
                  <CaretRight size={15} />
                </IconButton>
              </div>
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
              <IconButton
                className="todo-panel-toggle"
                aria-label={t("To do list")}
                aria-expanded={todoPanelOpen}
                aria-controls="todo-list-panel"
                onClick={() => {
                  setDraggedTodo(null);
                  setTodoPanelOpen((open) => !open);
                }}
              >
                <ListChecks size={17} aria-hidden="true" />
                <span className="todo-toggle-label">{t("To do list")}</span>
              </IconButton>
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
              {saveError && !persistBlocked && (
                <button
                  disabled={retryingSave}
                  onClick={() => void retrySave()}
                >
                  {retryingSave ? t("Retrying save…") : t("Retry save")}
                </button>
              )}
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
              <IconButton
                className="icon-button"
                aria-label={t("Dismiss recovery notice")}
                onClick={() =>
                  setState((previous) => ({ ...previous, recovery: null }))
                }
              >
                <X size={16} />
              </IconButton>
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
                  state={state}
                  selectedDay={selectedDay}
                  selectedTask={selectedTask}
                  today={today}
                  holidays={holidays}
                  currentMinute={currentMinute}
                  onDate={selectDate}
                  onSlot={openSlot}
                  onMove={moveCard}
                  draggedTodo={draggedTodo}
                  onScheduleTodo={scheduleTodo}
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
                  draggedTodo={draggedTodo}
                  onScheduleTodo={scheduleTodo}
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
                        className={`day-date-button ${date === selectedDay ? "selected" : ""} ${date === today ? "is-today" : ""} ${cal.isWeekend(date) ? "is-weekend" : ""} ${holidays(date).length ? "has-holiday" : ""}`}
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
                        state={state}
                        selectedDay={selectedDay}
                        selectedTask={selectedTask}
                        today={today}
                        holidays={holidays}
                        currentMinute={currentMinute}
                        onDate={selectDate}
                        onSlot={openSlot}
                        onMove={moveCard}
                        draggedTodo={draggedTodo}
                        onScheduleTodo={scheduleTodo}
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
                onCreateEvent={(event) => {
                  const next = cal.createEvent(
                    latestState.current,
                    event,
                    todayRef.current,
                  );
                  const created = next.tasks[next.tasks.length - 1];
                  setState(
                    cal.personalCalendarFor(next)?.visible === false
                      ? cal.togglePersonalCalendar(next)
                      : next,
                  );
                  setError("");
                  setNotice(t("Event created."));
                  setEventDraft(null);
                  setDetailsOpen(false);
                  setTaskAnchor(null);
                  navigation.selectDate(event.date);
                  if (view === "month" || view === "year") setView("day");
                  setSelectedTask(created.id);
                  pendingEventReveal.current = {
                    id: created.id,
                    start: created.start,
                    allDay: !!created.allDay,
                  };
                  setEventRevealRequest((request) => request + 1);
                }}
                onReference={(ref) =>
                  guard.request(() => {
                    const referencedTask = cal.taskFor(state, ref.id);
                    if (
                      referencedTask?.goalId === null &&
                      cal.personalCalendarFor(state)?.visible === false
                    )
                      setState(cal.togglePersonalCalendar(state));
                    else if (
                      referencedTask?.goalId &&
                      state.goals.some(
                        (goal) =>
                          goal.id === referencedTask.goalId &&
                          goal.visible === false,
                      )
                    )
                      setState(
                        cal.toggleGoalVisibility(state, referencedTask.goalId),
                      );
                    selectDate(ref.date);
                    setView("day");
                    setTaskAnchor(null);
                    setSelectedTask(ref.id);
                    setDetailsOpen(true);
                  })
                }
                onApply={applyProposal}
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
            <TodoPanel
              open={todoPanelOpen}
              todos={state.todos ?? []}
              color={cal.personalCalendarFor(state)?.color ?? "slate"}
              onAdd={addTodo}
              onToggle={(id) =>
                change(
                  (previous) => cal.toggleTodo(previous, id),
                  t("To do updated."),
                )
              }
              onDrag={setDraggedTodo}
              onSchedule={openTodoSchedule}
            />
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
            onSaveTodo={(title) => {
              addTodo(title);
              guard.run(() => closeEvent(true));
            }}
            onSave={(event) => {
              const next = eventDraft.todoId
                ? cal.scheduleTodo(
                    state,
                    eventDraft.todoId,
                    event.date,
                    event.start,
                    today,
                    !!event.allDay,
                    event,
                  )
                : cal.createEvent(state, event, today);
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
            onChange={(settings) => {
              const next = cal.updateSettings(
                latestState.current,
                settings,
                dayFor(settings.timezone),
              );
              setState(next);
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
              <GoalNavigation layout="dialog" {...goalNavigation} />
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
              <p>
                {t(
                  "This also replaces your current To do list. The backup includes {count} to dos.",
                  { count: pendingImport.todos?.length ?? 0 },
                )}
              </p>
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
              {!!state.todos?.length && (
                <p>{t("Your To do list will also be cleared.")}</p>
              )}
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
