import { DestructiveAction } from "./DestructiveAction";
import { goalDeletionImpact } from "./actionPatterns";
import { useActionGuard, useUnsavedChanges } from "./ActionGuard";
import { useId, useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { useInterfaceText } from "./InterfaceLanguage";
import type { CalendarState, Goal, GoalEdit, Task } from "./types";
import * as cal from "./calendar";
import { errorMessage } from "./errors";

function initialEdit(goal: Goal, state: CalendarState): GoalEdit {
  const pending = state.tasks.filter(
    (task) => task.goalId === goal.id && task.status === "pending",
  );
  const ordered: Task[] = [];
  const seen = new Set<string>();
  function add(task: Task) {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    for (const key of task.dependsOn) {
      const dependency = pending.find((item) => item.id === key);
      if (dependency) add(dependency);
    }
    ordered.push(task);
  }
  pending.forEach(add);
  return {
    color: goal.color,
    name: goal.name,
    kind: goal.recurrence ? "recurring" : "project",
    perWeek: goal.recurrence?.perWeek ?? null,
    steps: goal.recurrence
      ? goal.recurrence.templates.map((step) => ({
          ...step,
          id: cal.id(),
          dependsOn: [],
        }))
      : ordered.map(({ id, title, minutes, dependsOn }) => ({
          id,
          title,
          minutes,
          dependsOn: [...dependsOn],
        })),
  };
}

export function GoalEditor({
  goal,
  state,
  onCancel,
  onSave,
  onDelete,
  onBackup,
}: {
  goal: Goal;
  state: CalendarState;
  onCancel: () => void;
  onSave: (edit: GoalEdit) => void;
  onDelete: () => void;
  onBackup: () => void;
}) {
  const deletion = goalDeletionImpact(state, goal.id);
  const errorId = useId();
  const t = useInterfaceText();
  const guard = useActionGuard();
  const [draft, setDraft] = useState(() => initialEdit(goal, state));
  useUnsavedChanges(draft);
  const [removed, setRemoved] = useState<GoalEdit | null>(null);
  const [error, setError] = useState("");
  const completed = state.tasks.filter(
    (task) => task.goalId === goal.id && task.status === "done",
  );
  function update(next: GoalEdit) {
    setDraft(next);
    setRemoved(null);
    setError("");
  }
  function editStep(id: string, patch: Partial<GoalEdit["steps"][number]>) {
    update({
      ...draft,
      steps: draft.steps.map((step) =>
        step.id === id ? { ...step, ...patch } : step,
      ),
    });
  }
  return (
    <form
      className="goal-editor"
      aria-describedby={error ? errorId : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          onSave(draft);
        } catch (caught) {
          setError(errorMessage(caught));
        }
      }}
    >
      <fieldset className="goal-colour-picker">
        <legend>{t("Goal colour")}</legend>
        <div className="goal-colour-options">
          {(
            [
              ["indigo", "Sage"],
              ["slate", "Slate blue"],
              ["amber", "Ochre"],
              ["rose", "Dusty plum"],
              ["clay", "Clay"],
              ["teal", "Muted teal"],
            ] as const
          ).map(([color, label]) => (
            <label key={color} data-goal-color={color}>
              <input
                type="radio"
                name="goal-colour"
                value={color}
                checked={draft.color === color}
                onChange={() => update({ ...draft, color })}
              />
              <span className="goal-colour-swatch" aria-hidden="true" />
              {t(label)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="two-fields">
        <label className="field">
          {t("Goal name")}
          <input
            autoFocus
            required
            maxLength={120}
            value={draft.name}
            onChange={(event) => update({ ...draft, name: event.target.value })}
          />
        </label>
        <label className="field">
          {t("Goal type")}
          <select
            value={draft.kind}
            onChange={(event) => {
              const recurring = event.target.value === "recurring";
              update({
                ...draft,
                kind: recurring ? "recurring" : "project",
                perWeek: recurring ? (draft.perWeek ?? 3) : null,
                steps: draft.steps.map((step) => ({
                  ...step,
                  dependsOn: recurring ? [] : step.dependsOn,
                })),
              });
            }}
          >
            <option value="project">{t("Project")}</option>
            <option value="recurring">{t("Recurring activity")}</option>
          </select>
        </label>
      </div>
      {draft.kind === "recurring" && (
        <label className="field">
          {t("Sessions per week")}
          <input
            type="number"
            min={1}
            max={7}
            required
            value={draft.perWeek ?? ""}
            onChange={(event) =>
              update({ ...draft, perWeek: Number(event.target.value) })
            }
          />
        </label>
      )}
      <p className="small muted">
        {draft.kind === "recurring"
          ? t(
              "Edit the activities repeated in future sessions. Recurrence changes rebuild upcoming sessions; completed work stays in your history.",
            )
          : goal.recurrence
            ? t(
                "Turning off recurrence replaces upcoming repeats with the project steps listed below. Completed work stays in your history.",
              )
            : t(
                "Edit pending steps, durations and prerequisites. Changed steps follow your goal settings; completed work stays unchanged.",
              )}
      </p>
      <div className="goal-edit-steps">
        {draft.steps.map((step, index) => (
          <section
            key={step.id}
            className="goal-edit-step"
            aria-label={t("Step {v0}", { v0: index + 1 })}
          >
            <div className="goal-edit-step-fields">
              <label className="field">
                {t("Step {v0} title", { v0: index + 1 })}
                <input
                  required
                  maxLength={180}
                  value={step.title}
                  onChange={(event) =>
                    editStep(step.id, { title: event.target.value })
                  }
                />
              </label>
              <label className="field">
                {t("Minutes")}
                <input
                  aria-label={t("Step {v0} minutes", { v0: index + 1 })}
                  required
                  type="number"
                  min={5}
                  max={60}
                  value={step.minutes}
                  onChange={(event) =>
                    editStep(step.id, { minutes: Number(event.target.value) })
                  }
                />
              </label>
            </div>
            {draft.kind === "project" &&
              (index > 0 || completed.length > 0) && (
                <details className="goal-edit-dependencies">
                  <summary>
                    {t("After")}
                    {t(": ")}
                    {step.dependsOn.length
                      ? [...completed, ...draft.steps]
                          .filter((item) => step.dependsOn.includes(item.id))
                          .map((item) => item.title)
                          .join(", ")
                      : t("No prerequisite")}
                  </summary>
                  {[...completed, ...draft.steps.slice(0, index)].map(
                    (item) => (
                      <label key={item.id} className="settings-checkbox">
                        <input
                          type="checkbox"
                          checked={step.dependsOn.includes(item.id)}
                          onChange={(event) =>
                            editStep(step.id, {
                              dependsOn: event.target.checked
                                ? [...step.dependsOn, item.id]
                                : step.dependsOn.filter(
                                    (key) => key !== item.id,
                                  ),
                            })
                          }
                        />
                        {item.title}
                        {completed.some((task) => task.id === item.id)
                          ? t(" (completed)")
                          : ""}
                      </label>
                    ),
                  )}
                </details>
              )}
            <button
              type="button"
              className="text-button danger-action"
              data-action="destructive"
              aria-label={t("Delete step {v0}", { v0: index + 1 })}
              onClick={() => {
                setRemoved(draft);
                setDraft({
                  ...draft,
                  steps: draft.steps
                    .filter((item) => item.id !== step.id)
                    .map((item) => ({
                      ...item,
                      dependsOn: item.dependsOn.filter(
                        (key) => key !== step.id,
                      ),
                    })),
                });
                setError("");
              }}
            >
              <Trash size={15} aria-hidden="true" />
              {t("Delete step")}
            </button>
          </section>
        ))}
      </div>
      {removed && (
        <div className="draft-removal-notice" role="status">
          <span>{t("Step deleted.")}</span>
          <button
            type="button"
            className="text-button"
            onClick={() => update(removed)}
          >
            {t("Undo deletion")}
          </button>
        </div>
      )}
      <button
        type="button"
        className="text-button add-step"
        disabled={draft.steps.length >= 30}
        onClick={() =>
          update({
            ...draft,
            steps: [
              ...draft.steps,
              { id: cal.id(), title: "", minutes: 15, dependsOn: [] },
            ],
          })
        }
      >
        <Plus size={16} aria-hidden="true" />
        {t("Create step")}
      </button>
      {completed.length > 0 && (
        <details className="goal-completed-history">
          <summary>
            {t("Completed steps ({v0})", { v0: completed.length })}
          </summary>
          <ul className="goal-task-list">
            {completed.map((task) => (
              <li key={task.id}>
                <span>
                  {task.title}
                  <small>
                    {task.minutes} {t("min")}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p id={errorId} className="inline-error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="dialog-actions">
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
        <button
          type="button"
          className="secondary"
          onClick={() => guard.request(onCancel)}
        >
          {t("Cancel")}
        </button>
        <button type="submit" className="primary">
          {t("Save goal")}
        </button>
      </div>
    </form>
  );
}
