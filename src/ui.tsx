import { useInterfaceText } from "./InterfaceLanguage";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { GoalColor } from "./types";

export function IconButton({
  children,
  type = "button",
  showTooltip = true,
  ...props
}: ComponentPropsWithoutRef<"button"> & {
  "aria-label": string;
  showTooltip?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [tooltip, setTooltip] = useState<{
    left: number;
    top: number;
    above: boolean;
    host: HTMLElement;
  } | null>(null);
  function show() {
    const button = ref.current;
    if (!button || props.disabled || !showTooltip) return;
    const rect = button.getBoundingClientRect();
    const above = rect.top > 60;
    setTooltip({
      left: Math.max(
        100,
        Math.min(window.innerWidth - 100, rect.left + rect.width / 2),
      ),
      top: above ? rect.top - 8 : rect.bottom + 8,
      above,
      host: button.closest("dialog") || document.body,
    });
  }
  useEffect(() => {
    if (!tooltip) return;
    const hide = () => setTooltip(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        hide();
      }
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [tooltip]);
  return (
    <>
      <button
        {...props}
        type={type}
        ref={ref}
        aria-describedby={
          [props["aria-describedby"], tooltip ? id : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onMouseEnter={(event) => {
          show();
          props.onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          setTooltip(null);
          props.onMouseLeave?.(event);
        }}
        onFocus={(event) => {
          show();
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setTooltip(null);
          props.onBlur?.(event);
        }}
        onClick={(event) => {
          setTooltip(null);
          props.onClick?.(event);
        }}
      >
        {children}
      </button>
      {tooltip &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="button-tooltip"
            style={{
              left: tooltip.left,
              top: tooltip.top,
              transform: tooltip.above
                ? "translate(-50%, -100%)"
                : "translateX(-50%)",
            }}
          >
            {props["aria-label"]}
          </span>,
          tooltip.host,
        )}
    </>
  );
}

export function Dot({ color }: { color: GoalColor | "gray" }) {
  return <span className={`dot ${color}`} aria-hidden="true" />;
}
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const t = useInterfaceText();

  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`${wide ? "dialog wide" : "dialog"} ${className}`.trim()}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <header className="dialog-header">
        <h2 id="dialog-title">{title}</h2>
        <IconButton
          showTooltip={false}
          className="icon-button"
          onClick={onClose}
          aria-label={t("Close dialog")}
        >
          <X size={20} />
        </IconButton>
      </header>
      {children}
    </dialog>
  );
}
