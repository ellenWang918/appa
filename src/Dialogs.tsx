import { DestructiveAction } from "./DestructiveAction";
import { goalDeletionImpact } from "./actionPatterns";
import { useInterfaceText } from "./InterfaceLanguage";
import { useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";
import type {
  CalendarState,
  Goal,
  GoalEdit,
  Plan,
  PlannerDraft,
  PlanTask,
  ScheduleOptions,
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
import { api } from "./api";
import * as cal from "./calendar";
import { desktop, localPlace } from "./environment";
import { CalendarSettings } from "./CalendarSettings";
import { GoalSettings } from "./GoalSettings";
import { GoalEditor } from "./GoalEditor";
import {
  ChatgptSignIn,
  UserSettings,
  useChatgptConnection,
} from "./ChatgptAccount";
interface PlannerProps {
  state: CalendarState;
  onClose: () => void;
  onDraft: (draft: PlannerDraft) => void;
  onApprove: (plan: Plan, options: ScheduleOptions) => void;
}
export function Planner({ state, onClose, onDraft, onApprove }: PlannerProps) {
  const t = useInterfaceText();

  const [intention, setIntention] = useState(state.draft?.intention || ""),
    [plan, updatePlan] = useState<Plan | null>(state.draft?.plan || null),
    [answer, setAnswer] = useState(""),
    [model, setModel] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [placement, setPlacement] = useState("active");
  const [editingIntention, setEditingIntention] = useState(false);
  const [removedPlan, setRemovedPlan] = useState<Plan | null>(null);
  const showingPlan = !!plan && !plan.clarification && !editingIntention;
  function setPlan(value: SetStateAction<Plan | null>) {
    setRemovedPlan(null);
    updatePlan(value);
  }
  const auth = useChatgptConnection(true);
  const connection = auth.connection;
  const selectedModel =
    connection?.models.find((item) => item.id === model)?.id ||
    connection?.models[0]?.id ||
    "";
  useEffect(() => {
    onDraft({ intention, plan });
  }, [intention, plan]);
  async function generate() {
    setBusy("plan");
    setError("");
    try {
      const text = plan?.clarification
        ? `${intention}\n\nQuestion: ${plan.clarification}\nAnswer: ${answer}`
        : intention;
      const result = await api("plan", {
        intention: text,
        model: selectedModel || undefined,
      });
      if (plan?.clarification) setIntention(text);
      setPlan(result.plan);
      setEditingIntention(false);
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
    setRemovedPlan(plan);
    updatePlan(
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
      title={showingPlan ? t("Make this plan yours") : t("Plan a goal")}
      onClose={onClose}
      wide
    >
      <div className="dialog-body planner-body">
        <p className="muted intro">
          {t(
            "A big intention. A few small steps. You decide what goes on your calendar.",
          )}
        </p>
        <label className="field">
          {t("What would you like to work toward?")}
          <textarea
            value={intention}
            maxLength={3600}
            rows={3}
            placeholder={t("I want to launch my design portfolio…")}
            onChange={(event) => setIntention(event.target.value)}
            disabled={!!busy}
          />
        </label>
        {connection && !connection.connected && (
          <div className="connection-box">
            <div className="connection-title">
              <Sparkle size={20} aria-hidden="true" />
              <strong>{t("Use your ChatGPT plan")}</strong>
            </div>
            <ChatgptSignIn auth={auth} disabled={!!busy} />
          </div>
        )}
        {connection?.connected && (
          <label className="field small planner-model">
            {t("Model")}
            <select
              value={selectedModel}
              onChange={(event) => setModel(event.target.value)}
              disabled={!!busy || !connection.models.length}
            >
              {connection.models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(auth.error || connection?.notice) && (
          <p className="inline-error" role="alert">
            {t(auth.error || connection?.notice || "")}
          </p>
        )}
        {plan?.clarification && (
          <div className="clarification">
            <label className="field">
              {plan.clarification}
              <input
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={t("A little more context…")}
                maxLength={300}
              />
            </label>
          </div>
        )}
        {!showingPlan && (
          <div className="planner-start-actions">
            {plan && !plan.clarification && (
              <button
                className="primary"
                onClick={() => setEditingIntention(false)}
                disabled={!!busy}
              >
                {t("Continue editing plan")}
              </button>
            )}
            <button
              className={plan && !plan.clarification ? "supporting" : "primary"}
              onClick={generate}
              disabled={
                !!busy ||
                !intention.trim() ||
                !connection?.connected ||
                !selectedModel ||
                (!!plan?.clarification && !answer.trim())
              }
            >
              {busy === "plan"
                ? t("Creating your plan…")
                : plan?.clarification
                  ? t("Continue planning")
                  : plan
                    ? t("Create a new AI plan")
                    : t("Create an AI plan")}
              <Sparkle size={17} />
            </button>
            {!plan && (
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
                {t("Write a plan myself")}
              </button>
            )}
          </div>
        )}
        {showingPlan && plan && (
          <div className="plan-editor">
            <div className="two-fields">
              <label className="field">
                {t("Goal name")}
                <input
                  value={plan.goalName}
                  maxLength={120}
                  onChange={(event) =>
                    setPlan({ ...plan, goalName: event.target.value })
                  }
                />
              </label>
              <label className="field">
                {t("Goal type")}
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
                  <option value="project">{t("Project")}</option>
                  <option value="recurring">{t("Recurring activity")}</option>
                </select>
              </label>
            </div>
            {plan.kind === "recurring" && (
              <label className="field">
                {t("Sessions per week")}
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
              {t(
                "Aim for 5–25 minutes per step. Larger steps can use up to 60 minutes.",
              )}
            </p>
            <div className="editable-tasks">
              {plan.tasks.map((task, index) => (
                <div className="editable-task" key={index}>
                  <span className="task-index">{index + 1}</span>
                  <div className="task-fields">
                    <label className="field">
                      <span className="sr-only">
                        {t("Step")} {index + 1}
                      </span>
                      <input
                        aria-label={t("Step {v0} title", { v0: index + 1 })}
                        value={task.title}
                        maxLength={180}
                        placeholder={t("A small, specific action")}
                        onChange={(event) =>
                          editTask(index, { title: event.target.value })
                        }
                      />
                    </label>
                    {plan.kind === "project" && index > 0 && (
                      <label className="dependency-field">
                        {t("After")}
                        <select
                          aria-label={t("Step {v0} prerequisite", {
                            v0: index + 1,
                          })}
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
                          <option value="">{t("No prerequisite")}</option>
                          {plan.tasks.slice(0, index).map((item, i) => (
                            <option value={i} key={i}>
                              {i + 1}
                              {t(".")} {item.title || t("Untitled step")}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <label className="field duration-field">
                    <span className="sr-only">
                      {t("Step")} {index + 1} {t("minutes")}
                    </span>
                    <input
                      aria-label={t("Step {v0} minutes", { v0: index + 1 })}
                      type="number"
                      min="5"
                      max="60"
                      value={task.minutes}
                      onChange={(event) =>
                        editTask(index, { minutes: Number(event.target.value) })
                      }
                    />
                    <span>{t("min")}</span>
                  </label>
                  <button
                    className="text-button danger-action remove-step"
                    data-action="destructive"
                    onClick={() => removeTask(index)}
                    aria-label={t("Delete step {v0}", { v0: index + 1 })}
                  >
                    <Trash size={18} />
                    {t("Delete step")}
                  </button>
                </div>
              ))}
            </div>
            {removedPlan && (
              <div className="draft-removal-notice" role="status">
                <span>{t("Step deleted.")}</span>
                <button
                  className="text-button"
                  onClick={() => setPlan(removedPlan)}
                >
                  {t("Undo deletion")}
                </button>
              </div>
            )}
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
              {t("Create step")}
            </button>
            <div className="capacity-box">
              <label className="field small">
                {t("Where should this plan go?")}
                <select
                  value={placement}
                  onChange={(event) => setPlacement(event.target.value)}
                >
                  <option value="active">{t("Add to active goals")}</option>
                  <option value="later">{t("Save in Later")}</option>
                </select>
              </label>
              <p className="fine-print">
                {placement === "later"
                  ? t("Keep the steps saved without scheduling them yet.")
                  : t(
                      "Schedule alongside your other active goals, following your goal settings.",
                    )}
              </p>
            </div>
            <div className="dialog-actions">
              <button
                className="text-button"
                onClick={() => {
                  setEditingIntention(true);
                  setError("");
                }}
              >
                {t("Back to intention")}
              </button>
              <button className="primary" onClick={approve}>
                {placement === "later"
                  ? t("Save in Later")
                  : t("Approve & schedule")}
                <Check size={17} />
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {t(error)}
          </p>
        )}
        <p className="fine-print">
          {t("Your draft is saved")} {localPlace}
          {t(". Nothing is scheduled until you approve.")}
        </p>
      </div>
    </Dialog>
  );
}

interface SettingsProps {
  state: CalendarState;
  onClose: () => void;
  onChange: (settings: PlanningSettings) => void;
  onExport: () => void;
  onImport: () => void;
}
const settingsSections = [
  { id: "user", label: "User" },
  { id: "calendar", label: "Calendar settings" },
  { id: "goals", label: "Goal settings" },
  { id: "backup", label: "Backup" },
] as const;

export function Settings({
  state,
  onClose,
  onChange,
  onExport,
  onImport,
}: SettingsProps) {
  const t = useInterfaceText();

  const [error, setError] = useState("");
  const [section, setSection] =
    useState<(typeof settingsSections)[number]["id"]>("user");
  const panel = useRef<HTMLDivElement>(null);
  function applySettings(settings: PlanningSettings) {
    try {
      onChange(settings);
      setError("");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }
  return (
    <Dialog
      title={t("Settings")}
      onClose={onClose}
      wide
      className="settings-dialog"
    >
      <div className="settings-layout">
        <nav className="settings-menu" aria-label={t("Settings sections")}>
          {settingsSections.map((item) => (
            <button
              key={item.id}
              id={`settings-menu-${item.id}`}
              type="button"
              aria-current={section === item.id ? "page" : undefined}
              aria-controls="settings-panel"
              onClick={() => {
                setSection(item.id);
                setError("");
                panel.current?.scrollTo(0, 0);
              }}
            >
              {t(item.label)}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          <div
            ref={panel}
            id="settings-panel"
            className="settings-panel"
            role="region"
            aria-labelledby={`settings-menu-${section}`}
          >
            <div hidden={section !== "user"}>
              <UserSettings />
            </div>
            {section === "calendar" && (
              <CalendarSettings
                settings={state.settings}
                onChange={applySettings}
              />
            )}
            {section === "goals" && (
              <GoalSettings
                settings={state.settings}
                onChange={applySettings}
              />
            )}
            {section === "backup" && (
              <fieldset className="settings-section">
                <legend>{t("Backup")}</legend>
                <p className="small muted">
                  {desktop
                    ? t(
                        "Your goals and progress are saved on this computer. Export a backup before reinstalling or moving to another computer. You can import a backup from the browser prototype here.",
                      )
                    : t(
                        "Your goals and progress live in this browser on this device. Export a backup before clearing browser data.",
                      )}
                </p>
                <div className="connect-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={onExport}
                  >
                    <DownloadSimple size={17} />
                    {t("Export backup")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={onImport}
                  >
                    <UploadSimple size={17} />
                    {t("Import backup")}
                  </button>
                </div>
              </fieldset>
            )}
            {error && (
              <div className="inline-error" role="alert">
                <p>{t(error)}</p>
                <p>{t("Your previous settings are still in use.")}</p>
              </div>
            )}
          </div>
          <div className="dialog-actions settings-actions">
            <p className="settings-autosave">
              {t("Changes apply and save automatically.")}
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
export function GoalDetails({
  goal,
  state,
  onClose,
  onActivate,
  onSave,
  onDelete,
  onBackup,
}: {
  goal: Goal;
  state: CalendarState;
  onClose: () => void;
  onActivate: () => void;
  onSave: (edit: GoalEdit) => void;
  onDelete: () => void;
  onBackup: () => void;
}) {
  const deletion = goalDeletionImpact(state, goal.id);
  const t = useInterfaceText();

  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const tasks = state.tasks.filter(
    (task) =>
      task.goalId === goal.id && ["done", "pending"].includes(task.status),
  );
  const history = state.tasks.filter(
    (task) =>
      task.goalId === goal.id &&
      ["skipped", "consolidated"].includes(task.status),
  );
  if (editing)
    return (
      <Dialog title={t("Edit goal")} onClose={onClose} wide>
        <div className="dialog-body">
          <GoalEditor
            onBackup={onBackup}
            goal={goal}
            state={state}
            onDelete={onDelete}
            onCancel={() => setEditing(false)}
            onSave={(edit) => {
              onSave(edit);
              setEditing(false);
            }}
          />
        </div>
      </Dialog>
    );
  return (
    <Dialog title={goal.name} onClose={onClose}>
      <div className="dialog-body">
        <div className="goal-status">
          <Dot color={goal.color} />
          {goal.status === "active" ? t("Active goal") : t("Saved for later")}
          {goal.recurrence &&
            t(" · {v0} sessions / week", { v0: goal.recurrence.perWeek })}
        </div>
        <p className="muted">
          {tasks.filter((task) => task.status === "done").length}{" "}
          {t("steps completed ·")}{" "}
          {tasks.filter((task) => task.status === "pending").length}{" "}
          {t("pending")}
        </p>
        {goal.status === "active" && (
          <div className="goal-edit-action">
            <button className="supporting" onClick={() => setEditing(true)}>
              {t("Edit goal")}
            </button>
          </div>
        )}
        {goal.status === "later" && (
          <DestructiveAction
            onBackup={onBackup}
            label="Delete goal"
            resourceName={goal.name}
            impact={deletion.impact}
            description={t(
              "Delete {name}, its {count} steps (including {completed} completed), repeating sessions and saved choices? Export a backup in Settings first if you want to keep this history.",
              {
                name: goal.name,
                count: deletion.count,
                completed: deletion.completed,
              },
            )}
            onConfirm={onDelete}
          />
        )}
        {goal.status === "later" && tasks.length > 0 && (
          <div className="capacity-box goal-activation">
            <p className="small muted">
              {t(
                "Add this saved goal to your calendar alongside your other active goals. Steps follow your goal settings.",
              )}
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
              {t("Make this goal active")}
            </button>
            {error && (
              <p className="inline-error" role="alert">
                {t(error)}
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
                    {task.minutes} {t("min")}
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
            {t("This goal has no steps yet. Plan it when you’re ready.")}
          </p>
        )}
        {history.length > 0 && (
          <details className="missed-history">
            <summary>
              {history.length} {t("missed occurrences")}
            </summary>
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
                      {t("·")}{" "}
                      {task.status === "skipped"
                        ? t("Skipped after another choice")
                        : t("Consolidated on return")}
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
