import { useId } from "react";
import { useInterfaceText } from "./InterfaceLanguage";

export function AllDayToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useInterfaceText();
  const labelId = useId();
  return (
    <div className="all-day-toggle">
      <span id={labelId}>{t("All day")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        className={`all-day-switch ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}
