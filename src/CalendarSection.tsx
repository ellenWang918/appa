import type { CalendarState, GoalColor } from "./types";
import { personalCalendarFor } from "./calendar";
import { useInterfaceText } from "./InterfaceLanguage";
import { DestructiveAction } from "./DestructiveAction";
import { CalendarGroupItem } from "./CalendarGroupItem";

export interface CalendarSectionProps {
  state: CalendarState;
  onToggle: () => void;
  onSave: (name: string, color: GoalColor) => void;
  onDelete: () => void;
  onBackup: () => void;
}

export function CalendarSection({
  state,
  onToggle,
  onSave,
  onDelete,
  onBackup,
  editing,
  onEdit,
  onFinishEdit,
}: CalendarSectionProps & {
  editing: boolean;
  onEdit: () => void;
  onFinishEdit: () => void;
}) {
  const t = useInterfaceText();
  const group = personalCalendarFor(state);
  const count = state.tasks.filter((task) => task.goalId === null).length;
  const completed = state.tasks.filter(
    (task) => task.goalId === null && task.status === "done",
  ).length;
  return (
    <section
      className="goal-group personal-calendar"
      aria-label={t("Calendar")}
    >
      <h2>{t("Calendar")}</h2>
      {!group ? (
        <p className="small muted">
          {t("Create an event to start a new personal calendar.")}
        </p>
      ) : (
        <CalendarGroupItem
          name={group.name}
          color={group.color}
          visible={group.visible}
          editing={editing}
          onEdit={onEdit}
          onFinishEdit={onFinishEdit}
          onToggle={onToggle}
          onSave={onSave}
          actions={() => (
            <DestructiveAction
              label="Delete calendar"
              resourceName={group.name}
              impact={
                count >= 30 || completed >= 10
                  ? "high"
                  : count || state.eventSeries?.length
                    ? "moderate"
                    : "low"
              }
              description={t(
                "Delete {name} and all its personal events, completed history and repeating series? Goal tasks will stay.",
                { name: group.name },
              )}
              onBackup={onBackup}
              onConfirm={onDelete}
            />
          )}
        />
      )}
    </section>
  );
}
