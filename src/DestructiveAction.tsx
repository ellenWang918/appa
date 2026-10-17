import { useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { Dialog } from "./ui";
import { useInterfaceText } from "./InterfaceLanguage";
import { errorMessage } from "./errors";

export function DestructiveAction({
  label,
  description,
  resourceName,
  impact,
  onConfirm,
  onBackup,
}: {
  label: string;
  description: string;
  resourceName: string;
  impact: "low" | "moderate" | "high";
  onConfirm: () => void;
  onBackup?: () => void;
}) {
  const t = useInterfaceText();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  function confirm() {
    try {
      onConfirm();
      setOpen(false);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }
  return (
    <>
      <button
        type="button"
        className="text-button danger-action"
        data-action="destructive"
        onClick={() => {
          setError("");
          setTyped("");
          if (impact === "low") confirm();
          else setOpen(true);
        }}
      >
        <Trash size={15} aria-hidden="true" />
        {t(label)}
      </button>
      {!open && error && (
        <p role="alert" className="inline-error">
          {t(error)}
        </p>
      )}
      {open && (
        <Dialog title={t(label)} onClose={() => setOpen(false)}>
          <div className="dialog-body">
            <p>{description}</p>
            <p className="small muted">
              {t("Undo is available until your next change or reload.")}
            </p>
            {onBackup && (
              <button type="button" className="text-button" onClick={onBackup}>
                {t("Export backup")}
              </button>
            )}
            {impact === "high" && (
              <label className="field">
                {t("Type {name} to confirm.", { name: resourceName })}
                <input
                  autoComplete="off"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                />
              </label>
            )}
            {error && (
              <p role="alert" className="inline-error">
                {t(error)}
              </p>
            )}
            <div className="dialog-actions">
              <button
                autoFocus
                type="button"
                className="secondary"
                onClick={() => setOpen(false)}
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="primary danger-action"
                data-action="destructive"
                disabled={impact === "high" && typed !== resourceName}
                onClick={confirm}
              >
                {t(label)}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
