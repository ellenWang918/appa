import { useEffect, useState } from "react";
import { CheckCircle, X } from "@phosphor-icons/react";
import { IconButton } from "./ui";
import { useInterfaceText } from "./InterfaceLanguage";

export function Toast({
  message,
  onUndo,
}: {
  message: string;
  onUndo: () => void;
}) {
  const t = useInterfaceText();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="undo-toast" role="status">
      <CheckCircle size={18} aria-hidden="true" />
      <span>{message}</span>
      <button onClick={onUndo}>{t("Undo")}</button>
      <IconButton
        className="toast-dismiss"
        showTooltip={false}
        aria-label={t("Dismiss notification")}
        onClick={() => setVisible(false)}
      >
        <X size={16} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
