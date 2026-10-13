import { useEffect, useState } from "react";
import type {
  CalendarState,
  Goal,
  Plan,
  PlannerDraft,
  PlanTask,
  ScheduleOptions,
  SessionResponse,
  Settings as PlanningSettings,
} from "./types";
import { errorMessage } from "./errors";
import {
  Check,
  CheckCircle,
  Clock,
  DownloadSimple,
  Plus,
  Sparkle,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { Dialog, Dot } from "./ui";
import { api, session } from "./api";
import * as cal from "./calendar";
import { desktop, localPlace } from "./environment";
const minuteInput = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const parseMinute = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

interface PlannerProps {
  state: CalendarState;
  onClose: () => void;
  onDraft: (draft: PlannerDraft) => void;
  onApprove: (plan: Plan, options: ScheduleOptions) => void;
}
export function Planner({ state, onClose, onDraft, onApprove }: PlannerProps) {
  const [intention, setIntention] = useState(state.draft?.intention || ""),
    [plan, setPlan] = useState<Plan | null>(state.draft?.plan || null),
    [answer, setAnswer] = useState(""),
    [connection, setConnection] = useState<SessionResponse | null>(null),
    [model, setModel] = useState(""),
    [accountId, setAccountId] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [link, setLink] = useState(""),
    [placement, setPlacement] = useState("active");
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const result = await session();
        if (!alive) return;
        setConnection(result);
        if (result.connected && !result.models.length) {
          const data = await api("models");
          if (alive) setConnection({ ...result, models: data.models });
        }
      } catch (caught) {
        if (alive) setError(errorMessage(caught));
      }
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    onDraft({ intention, plan });
  }, [intention, plan]);
  async function connect() {
    setBusy("connect");
    setError("");
    try {
      const result = await api("auth/start", { accountId: accountId || null });
      setLink(result.url);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }
  async function checkConnection() {
    setBusy("check");
    setError("");
    try {
      const result = await session();
      if (!result.connected)
        throw new Error(
          "Finish signing in in the ChatGPT tab, then check again.",
        );
      const data = await api("models");
      setConnection({ ...result, models: data.models });
      setLink("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }
  async function generate() {
    setBusy("plan");
    setError("");
    try {
      const text = plan?.clarification
        ? `${intention}\n\nQuestion: ${plan.clarification}\nAnswer: ${answer}`
        : intention;
      const result = await api("plan", {
        intention: text,
        model: model || connection?.models[0]?.id,
      });
      if (plan?.clarification) setIntention(text);
      setPlan(result.plan);
      setAnswer("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }
  function editTask(index: number, patch: Partial<PlanTask>) {
    setPlan(
      (previous) =>
        previous && {
          ...previous,
          tasks: previous.tasks.map((task, i) =>
            i === index ? { ...task, ...patch } : task,
          ),
        },
    );
  }
  function removeTask(index: number) {
    setPlan(
      (previous) =>
        previous && {
          ...previous,
          tasks: previous.tasks
            .filter((_, i) => i !== index)
            .map((task) => ({
              ...task,
              dependsOn: task.dependsOn
                .filter((d) => d !== index)
                .map((d) => (d > index ? d - 1 : d)),
            })),
        },
    );
  }
  function approve() {
    try {
      if (!plan) throw new Error("Create or write a plan first.");
      onApprove(plan, {
        later: placement === "later",
      });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }
  return (
    <Dialog
      title={
        plan && !plan.clarification ? "Make this plan yours" : "Plan a goal"
      }
      onClose={onClose}
      wide
    >
      <div className="dialog-body planner-body">
        <p className="muted intro">
          A big intention. A few small steps. You decide what goes on your
          calendar.
        </p>
        <label className="field">
          What would you like to work toward?
          <textarea
            value={intention}
            maxLength={3600}
            rows={3}
            placeholder="I want to launch my design portfolio…"
            onChange={(event) => setIntention(event.target.value)}
            disabled={!!busy}
          />
        </label>
        <div className="connection-box">
          <div className="connection-title">
            <Sparkle size={20} />
            <strong>
              {connection?.connected
                ? "ChatGPT connected"
                : "Use your ChatGPT plan"}
            </strong>
            {connection?.connected && (
              <CheckCircle className="teal-text" size={19} />
            )}
          </div>
          {connection?.connected ? (
            <>
              <p className="small muted">
                {connection.account?.label} · Uses your existing plan limits.
              </p>
              <label className="field small">
                Model
                <select
                  value={model || connection.models[0]?.id || ""}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={!!busy}
                >
                  {connection.models.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="text-button small"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("disconnect");
                  try {
                    const result = await api("auth/disconnect", {});
                    setConnection(await session());
                    if (!result.revoked)
                      setError(
                        "Disconnected here. Open ChatGPT Settings to revoke the connection; remote revocation could not be confirmed.",
                      );
                  } catch (caught) {
                    setError(errorMessage(caught));
                  } finally {
                    setBusy("");
                  }
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="small muted">
                Connect your own eligible Plus or Pro account. Your calendar
                stays {localPlace}. Your goal text goes to OpenAI when you
                create a plan.
              </p>
              {connection && connection.accounts.length > 0 && (
                <label className="field small">
                  Account
                  <select
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                  >
                    <option value="">Connect another account</option>
                    {connection.accounts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {link ? (
                <div className="connect-actions">
                  <a
                    className="primary"
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Continue to ChatGPT
                  </a>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={checkConnection}
                  >
                    {busy === "check" ? "Checking…" : "I’ve signed in"}
                  </button>
                </div>
              ) : (
                <button
                  className="secondary"
                  onClick={connect}
                  disabled={!!busy || !connection}
                >
                  {busy === "connect"
                    ? "Preparing sign-in…"
                    : "Sign in with ChatGPT"}
                </button>
              )}
              <p className="fine-print">
                {desktop
                  ? "Reconnect after you quit and reopen the app."
                  : "Reconnect after the local app restarts."}{" "}
                <a
                  href="https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt"
                  target="_blank"
                  rel="noreferrer"
                >
                  How it works
                </a>
              </p>
            </>
          )}
        </div>
        {plan?.clarification && (
          <div className="clarification">
            <label className="field">
              {plan.clarification}
              <input
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="A little more context…"
                maxLength={300}
              />
            </label>
          </div>
        )}
        {(!plan || plan.clarification) && (
          <div className="planner-start-actions">
            <button
              className="primary"
              onClick={generate}
              disabled={
                !!busy ||
                !intention.trim() ||
                !connection?.connected ||
                (!!plan?.clarification && !answer.trim())
              }
            >
              {busy === "plan"
                ? "Creating your plan…"
                : plan?.clarification
                  ? "Continue planning"
                  : "Create an AI plan"}
              <Sparkle size={17} />
            </button>
            <button
              className="text-button"
              disabled={!!busy}
              onClick={() =>
                setPlan({
                  goalName: "",
                  kind: "project",
                  perWeek: null,
                  clarification: null,
                  tasks: [{ title: "", minutes: 15, dependsOn: [] }],
                })
              }
            >
              Write a plan myself
            </button>
          </div>
        )}
        {plan && !plan.clarification && (
          <div className="plan-editor">
            <div className="two-fields">
              <label className="field">
                Goal name
                <input
                  value={plan.goalName}
                  maxLength={120}
                  onChange={(event) =>
                    setPlan({ ...plan, goalName: event.target.value })
                  }
                />
              </label>
              <label className="field">
                Goal type
                <select
                  value={plan.kind}
                  onChange={(event) =>
                    setPlan({
                      ...plan,
                      kind:
                        event.target.value === "recurring"
                          ? "recurring"
                          : "project",
                      perWeek: event.target.value === "recurring" ? 3 : null,
                      tasks: plan.tasks.map((task) => ({
                        ...task,
                        dependsOn: [],
                      })),
                    })
                  }
                >
                  <option value="project">Project</option>
                  <option value="recurring">Recurring activity</option>
                </select>
              </label>
            </div>
            {plan.kind === "recurring" && (
              <label className="field">
                Sessions per week
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={plan.perWeek ?? ""}
                  onChange={(event) =>
                    setPlan({ ...plan, perWeek: Number(event.target.value) })
                  }
                />
              </label>
            )}
            <p className="small muted">
              Aim for 5–25 minutes per step. Larger steps can use up to 60
              minutes if they fit your available hours.
            </p>
            <div className="editable-tasks">
              {plan.tasks.map((task, index) => (
                <div className="editable-task" key={index}>
                  <span className="task-index">{index + 1}</span>
                  <div className="task-fields">
                    <label className="field">
                      <span className="sr-only">Step {index + 1}</span>
                      <input
                        aria-label={`Step ${index + 1} title`}
                        value={task.title}
                        maxLength={180}
                        placeholder="A small, specific action"
                        onChange={(event) =>
                          editTask(index, { title: event.target.value })
                        }
                      />
                    </label>
                    {plan.kind === "project" && index > 0 && (
                      <label className="dependency-field">
                        After
                        <select
                          aria-label={`Step ${index + 1} prerequisite`}
                          value={task.dependsOn[0] ?? ""}
                          onChange={(event) =>
                            editTask(index, {
                              dependsOn:
                                event.target.value === ""
                                  ? []
                                  : [Number(event.target.value)],
                            })
                          }
                        >
                          <option value="">No prerequisite</option>
                          {plan.tasks.slice(0, index).map((item, i) => (
                            <option value={i} key={i}>
                              {i + 1}. {item.title || "Untitled step"}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <label className="field duration-field">
                    <span className="sr-only">Step {index + 1} minutes</span>
                    <input
                      aria-label={`Step ${index + 1} minutes`}
                      type="number"
                      min="5"
                      max="60"
                      value={task.minutes}
                      onChange={(event) =>
                        editTask(index, { minutes: Number(event.target.value) })
                      }
                    />
                    <span>min</span>
                  </label>
                  <button
                    className="icon-button"
                    onClick={() => removeTask(index)}
                    aria-label={`Remove step ${index + 1}`}
                  >
                    <Trash size={18} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="text-button add-step"
              disabled={plan.tasks.length >= 30}
              onClick={() =>
                setPlan({
                  ...plan,
                  tasks: [
                    ...plan.tasks,
                    { title: "", minutes: 15, dependsOn: [] },
                  ],
                })
              }
            >
              <Plus size={16} />
              Add a step
            </button>
            <div className="capacity-box">
              <label className="field small">
                Where should this plan go?
                <select
                  value={placement}
                  onChange={(event) => setPlacement(event.target.value)}
                >
                  <option value="active">Add to active goals</option>
                  <option value="later">Save in Later</option>
                </select>
              </label>
              <p className="fine-print">
                {placement === "later"
                  ? "Keep the steps saved without scheduling them yet."
                  : "Schedule alongside your other active goals, within your available hours."}
              </p>
            </div>
            <div className="dialog-actions">
              <button
                className="text-button"
                onClick={() => {
                  setPlan(null);
                  setError("");
                }}
              >
                Back to intention
              </button>
              <button className="primary" onClick={approve}>
                {placement === "later" ? "Save in Later" : "Approve & schedule"}
                <Check size={17} />
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <p className="fine-print">
          Your draft is saved {localPlace}. Nothing is scheduled until you
          approve.
        </p>
      </div>
    </Dialog>
  );
}

interface SettingsProps {
  state: CalendarState;
  onClose: () => void;
  onSave: (settings: PlanningSettings) => void;
  onExport: () => void;
  onImport: () => void;
}
export function Settings({
  state,
  onClose,
  onSave,
  onExport,
  onImport,
}: SettingsProps) {
  const [settings, setSettings] = useState(state.settings),
    [error, setError] = useState("");
  return (
    <Dialog title="Make room for your goals" onClose={onClose}>
      <form
        className="dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onSave(settings);
          } catch (caught) {
            setError(errorMessage(caught));
          }
        }}
      >
        <p className="muted intro">Choose when Appa can schedule your goals.</p>
        <div className="two-fields">
          <label className="field">
            Available from
            <input
              type="time"
              value={minuteInput(settings.start)}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  start: parseMinute(event.target.value),
                })
              }
              required
            />
          </label>
          <label className="field">
            Until
            <input
              type="time"
              value={minuteInput(settings.end)}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  end: parseMinute(event.target.value),
                })
              }
              required
            />
          </label>
        </div>
        <label className="field">
          Timezone
          <select
            value={settings.timezone}
            onChange={(event) =>
              setSettings({ ...settings, timezone: event.target.value })
            }
          >
            {[
              ...new Set([
                "Australia/Brisbane",
                "Australia/Sydney",
                "Australia/Perth",
                "Pacific/Auckland",
                "Europe/London",
                "America/New_York",
                settings.timezone,
              ]),
            ].map((zone) => (
              <option key={zone}>{zone}</option>
            ))}
          </select>
        </label>
        <p className="small muted">
          Pending steps are rearranged to fit. When time is tight, a shared slot
          lets you choose one activity.
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save settings
          </button>
        </div>
        <div className="backup-section">
          <h3>Keep a copy</h3>
          <p className="small muted">
            {desktop
              ? "Your goals and progress are saved on this computer. Export a backup before reinstalling or moving to another computer. You can import a backup from the browser prototype here."
              : "Your goals and progress live in this browser on this device. Export a backup before clearing browser data."}
          </p>
          <div className="connect-actions">
            <button type="button" className="secondary" onClick={onExport}>
              <DownloadSimple size={17} />
              Export backup
            </button>
            <button type="button" className="secondary" onClick={onImport}>
              <UploadSimple size={17} />
              Import backup
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
export function GoalDetails({
  goal,
  state,
  onClose,
  onActivate,
}: {
  goal: Goal;
  state: CalendarState;
  onClose: () => void;
  onActivate: () => void;
}) {
  const [error, setError] = useState("");
  const tasks = state.tasks.filter(
    (task) =>
      task.goalId === goal.id && ["done", "pending"].includes(task.status),
  );
  const history = state.tasks.filter(
    (task) =>
      task.goalId === goal.id &&
      ["skipped", "consolidated"].includes(task.status),
  );
  return (
    <Dialog title={goal.name} onClose={onClose}>
      <div className="dialog-body">
        <div className="goal-status">
          <Dot color={goal.color} />
          {goal.status === "active" ? "Active goal" : "Saved for later"}
          {goal.recurrence && ` · ${goal.recurrence.perWeek} sessions / week`}
        </div>
        <p className="muted">
          {tasks.filter((task) => task.status === "done").length} steps
          completed · {tasks.filter((task) => task.status === "pending").length}{" "}
          pending
        </p>
        {goal.status === "later" && tasks.length > 0 && (
          <div className="capacity-box goal-activation">
            <p className="small muted">
              Add this saved goal to your calendar alongside your other active
              goals. Steps will fit within your available hours.
            </p>
            <button
              className="primary full"
              onClick={() => {
                try {
                  onActivate();
                } catch (caught) {
                  setError(errorMessage(caught));
                }
              }}
            >
              Make this goal active
            </button>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
        {tasks.length ? (
          <ul className="goal-task-list">
            {tasks.slice(0, 15).map((task) => (
              <li key={task.id}>
                {task.status === "done" ? (
                  <CheckCircle size={18} />
                ) : (
                  <Clock size={18} />
                )}
                <span>
                  {task.title}
                  <small>
                    {task.minutes} min
                    {goal.status === "active"
                      ? ` · ${cal.dateLabel(task.date, { day: "numeric", month: "short" })}`
                      : ""}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            This goal has no steps yet. Plan it when you’re ready.
          </p>
        )}
        {history.length > 0 && (
          <details className="missed-history">
            <summary>{history.length} missed occurrences</summary>
            <ul className="goal-task-list">
              {history.map((task) => (
                <li key={task.id}>
                  <Clock size={18} />
                  <span>
                    {task.title}
                    <small>
                      {cal.dateLabel(task.occurrenceKey || task.date, {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      ·{" "}
                      {task.status === "skipped"
                        ? "Skipped after another choice"
                        : "Consolidated on return"}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Dialog>
  );
}
