import { useInterfaceText } from "./InterfaceLanguage";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
} from "react";
import { DotsSixVertical } from "@phosphor-icons/react";

const minimumWidth = 240;
const defaultWidth = 320;
const maximumWidth = 640;
const minimumTimelineWidth = 240;
const dividerWidth = 12;

function loadWidth(storageKey: string): number {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) {
      const width = Number(saved);
      if (
        Number.isFinite(width) &&
        width >= minimumWidth &&
        width <= maximumWidth
      )
        return width;
    }
  } catch {
    // An unavailable layout preference must not prevent opening the calendar.
  }
  return defaultWidth;
}

export function ResizableDayPanels({
  storageKey,
  children,
}: {
  storageKey: string;
  children: [ReactNode, ReactNode];
}) {
  const t = useInterfaceText();

  const layout = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    previousWidth: number;
    width: number;
  } | null>(null);
  const [preferredWidth, setPreferredWidth] = useState(() =>
    loadWidth(storageKey),
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const maxWidth = containerWidth
    ? Math.max(
        minimumWidth,
        Math.min(
          maximumWidth,
          Math.floor(containerWidth - minimumTimelineWidth - dividerWidth),
        ),
      )
    : maximumWidth;
  const width = Math.min(preferredWidth, maxWidth);
  const clamp = (value: number) =>
    Math.max(minimumWidth, Math.min(maxWidth, Math.round(value)));

  useLayoutEffect(() => {
    const element = layout.current;
    if (!element) return;
    setContainerWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) =>
      setContainerWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (dragging) return;
    try {
      localStorage.setItem(storageKey, String(preferredWidth));
    } catch {
      // The chosen width remains usable for this session without storage.
    }
  }, [storageKey, preferredWidth, dragging]);

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
      previousWidth: preferredWidth,
      width,
    };
    setDragging(true);
  }

  function moveResize(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.width = clamp(active.startWidth + active.startX - event.clientX);
    setPreferredWidth(active.width);
  }

  function finishResize(event: PointerEvent<HTMLDivElement>, cancel = false) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreferredWidth(cancel ? active.previousWidth : active.width);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (drag.current) return;
    const step = event.shiftKey ? 40 : 10;
    const next =
      event.key === "ArrowLeft"
        ? width + step
        : event.key === "ArrowRight"
          ? width - step
          : event.key === "Home"
            ? minimumWidth
            : event.key === "End"
              ? maxWidth
              : null;
    if (next === null) return;
    event.preventDefault();
    setPreferredWidth(clamp(next));
  }

  return (
    <div
      className={`day-layout${dragging ? " is-resizing" : ""}`}
      ref={layout}
      style={{ "--day-task-width": `${width}px` } as CSSProperties}
    >
      {children[0]}
      <div
        className="day-resize-handle"
        role="separator"
        aria-label={t("Resize task list")}
        aria-orientation="vertical"
        aria-controls="day-task-list"
        aria-valuemin={minimumWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        aria-valuetext={t("{v0} pixels", { v0: width })}
        tabIndex={0}
        title={t("Drag to resize task list. Double-click to reset.")}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={(event) => finishResize(event)}
        onPointerCancel={(event) => finishResize(event, true)}
        onLostPointerCapture={(event) => finishResize(event, true)}
        onKeyDown={resizeWithKeyboard}
        onDoubleClick={() => setPreferredWidth(defaultWidth)}
      >
        <DotsSixVertical size={12} aria-hidden="true" />
      </div>
      {children[1]}
    </div>
  );
}
