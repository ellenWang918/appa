import { useState } from "react";
import type { Goal, GoalColor } from "./types";
import { CalendarSection } from "./CalendarSection";
import type { CalendarSectionProps } from "./CalendarSection";
import { CalendarGroupItem } from "./CalendarGroupItem";
import { DestructiveAction } from "./DestructiveAction";
import { goalDeletionImpact } from "./actionPatterns";
import { useActionGuard } from "./ActionGuard";
import { Dot } from "./ui";
import { useInterfaceText } from "./InterfaceLanguage";

function GoalLinks({
  goals,
  muted,
  dim,
  onGoal,
}: {
  goals: Goal[];
  muted?: boolean;
  dim?: boolean;
  onGoal: (id: string) => void;
}) {
  return goals.map((goal) => (
    <button
      key={goal.id}
      className={`goal-link${dim ? " muted" : ""}`}
      onClick={() => onGoal(goal.id)}
    >
      <Dot color={muted ? "gray" : goal.color} />
      <span>{goal.name}</span>
    </button>
  ));
}
export function GoalNavigation({
  layout,
  onGoal,
  onToggleGoal,
  onSaveGoal,
  onDeleteGoal,
  ...calendar
}: CalendarSectionProps & {
  layout: "rail" | "dialog";
  onGoal: (id: string) => void;
  onToggleGoal: (id: string) => void;
  onSaveGoal: (id: string, name: string, color: GoalColor) => void;
  onDeleteGoal: (id: string) => void;
}) {
  const t = useInterfaceText();
  const guard = useActionGuard();
  const [editingId, setEditingId] = useState<string | null>(null);
  const beginEdit = (id: string) => guard.request(() => setEditingId(id));
  const finishEdit = () => setEditingId(null);
  const openGoal = (id: string) =>
    guard.request(() => {
      setEditingId(null);
      onGoal(id);
    });
  const { state } = calendar;
  const active = state.goals.filter((goal) => goal.status === "active");
  const later = state.goals.filter((goal) => goal.status === "later");
  const links = active.map((goal) => {
    return (
      <CalendarGroupItem
        key={goal.id}
        kind="goal"
        name={goal.name}
        color={goal.color}
        visible={goal.visible !== false}
        editing={editingId === goal.id}
        onEdit={() => beginEdit(goal.id)}
        onFinishEdit={finishEdit}
        onToggle={() => onToggleGoal(goal.id)}
        onOpen={() => openGoal(goal.id)}
        onSave={(name, color) => onSaveGoal(goal.id, name, color)}
        actions={(close) => {
          const deletion = goalDeletionImpact(state, goal.id);
          return (
            <>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  close();
                  openGoal(goal.id);
                }}
              >
                {t("View goal details")}
              </button>
              <DestructiveAction
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
                onBackup={calendar.onBackup}
                onConfirm={() => onDeleteGoal(goal.id)}
              />
            </>
          );
        }}
      />
    );
  });
  const laterLinks = (
    <GoalLinks goals={later} muted dim={layout === "rail"} onGoal={openGoal} />
  );
  return (
    <>
      <CalendarSection
        {...calendar}
        editing={editingId === "personal-calendar"}
        onEdit={() => beginEdit("personal-calendar")}
        onFinishEdit={finishEdit}
      />
      {layout === "rail" ? (
        <>
          <div className="goal-group">
            <h2>{t("Active goals")}</h2>
            {!active.length && (
              <p className="muted small">
                {t("Activate a saved goal or plan a new one.")}
              </p>
            )}
            {links}
          </div>
          {!!later.length && (
            <div className="goal-group later">
              <h2>{t("Later")}</h2>
              {laterLinks}
            </div>
          )}
        </>
      ) : (
        <>
          <h3>{t("Active goals")}</h3>
          {links}
          <h3 className="later-heading">{t("Later")}</h3>
          {later.length ? (
            laterLinks
          ) : (
            <p className="small muted">{t("Ideas can wait here.")}</p>
          )}
        </>
      )}
    </>
  );
}
