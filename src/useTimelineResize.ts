import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent, KeyboardEvent, RefObject } from "react";
import type { CalendarState, Slot, Task, TimelineResizeEdge } from "./types";
import {
  draggableTimelineTask,
  timelineResizeRange,
  validateTimelinePreview,
} from "./timelineDrag";
import { slotGoalColor } from "./calendar";
import { errorMessage } from "./errors";

export function useTimelineResize({
  state,
  today,
  scrollRef,
  gridRef,
  onResize,
}: {
  state: CalendarState;
  today: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  gridRef: RefObject<HTMLDivElement | null>;
  onResize: (task: Task, start: number, minutes: number) => void;
}) {
  const latest = useRef({ state, today, onResize });
  const keyboardFocus = useRef<{ id: string; edge: TimelineResizeEdge } | null>(
    null,
  );
  useLayoutEffect(() => {
    const pending = keyboardFocus.current;
    if (!pending) return;
    keyboardFocus.current = null;
    const card = [
      ...(gridRef.current?.querySelectorAll<HTMLElement>(".timeline-event") ??
        []),
    ].find((element) => element.dataset.taskId === pending.id);
    card
      ?.querySelector<HTMLButtonElement>(`.event-resize-handle.${pending.edge}`)
      ?.focus();
  }, [state.revision, gridRef]);
  useEffect(() => {
    latest.current = { state, today, onResize };
  }, [state, today, onResize]);
  const active = useRef<{
    task: Task;
    edge: TimelineResizeEdge;
    handle: HTMLButtonElement;
    pointerId: number;
    originY: number;
    pointerY: number;
    scrollTop: number;
    height: number;
    moved: boolean;
    key: string;
  } | null>(null);
  const [preview, setPreview] = useState<{
    task: Task;
    color: ReturnType<typeof slotGoalColor>;
    start: number;
    minutes: number;
    error: string;
  } | null>(null);

  function cancel() {
    const drag = active.current;
    active.current = null;
    if (drag?.handle.hasPointerCapture(drag.pointerId))
      drag.handle.releasePointerCapture(drag.pointerId);
    setPreview(null);
  }

  function range() {
    const drag = active.current!;
    const delta =
      drag.pointerY -
      drag.originY +
      (scrollRef.current?.scrollTop ?? drag.scrollTop) -
      drag.scrollTop;
    const edge =
      drag.task.start + (drag.edge === "end" ? drag.task.minutes : 0);
    return timelineResizeRange(
      drag.task,
      drag.edge,
      edge + (delta / drag.height) * 1440,
    );
  }

  function refresh() {
    const drag = active.current;
    if (!drag?.moved) return;
    const next = range();
    const { state, today } = latest.current;
    const key = `${next.start}/${next.minutes}/${state.revision}`;
    if (drag.key === key) return;
    drag.key = key;
    let error = "";
    try {
      validateTimelinePreview(
        state,
        drag.task,
        drag.task.date,
        next.start,
        next.minutes,
        today,
      );
    } catch (caught) {
      error = errorMessage(caught);
    }
    setPreview((previous) =>
      previous ? { ...previous, ...next, error } : null,
    );
  }

  const resizing = preview !== null;
  useEffect(() => {
    if (!resizing) return;
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
    let frame = 0;
    function tick() {
      const drag = active.current;
      const scroll = scrollRef.current;
      if (drag?.moved && scroll) {
        const rect = scroll.getBoundingClientRect();
        const delta =
          drag.pointerY < rect.top + 36
            ? -8
            : drag.pointerY > rect.bottom - 36
              ? 8
              : 0;
        if (delta) scroll.scrollTop += delta;
        refresh();
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancel);
      const drag = active.current;
      active.current = null;
      if (drag?.handle.hasPointerCapture(drag.pointerId))
        drag.handle.releasePointerCapture(drag.pointerId);
    };
  }, [resizing, scrollRef]);

  function start(
    event: PointerEvent<HTMLButtonElement>,
    slot: Slot,
    edge: TimelineResizeEdge,
  ) {
    const task = draggableTimelineTask(latest.current.state, slot);
    if (!task || event.button !== 0 || active.current || !gridRef.current)
      return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = {
      task,
      edge,
      handle: event.currentTarget,
      pointerId: event.pointerId,
      originY: event.clientY,
      pointerY: event.clientY,
      scrollTop: scrollRef.current?.scrollTop ?? 0,
      height: gridRef.current.clientHeight,
      moved: false,
      key: "",
    };
    setPreview({
      task,
      color: slotGoalColor(latest.current.state, slot),
      start: task.start,
      minutes: task.minutes,
      error: "",
    });
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const drag = active.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    drag.pointerY = event.clientY;
    drag.moved ||= Math.abs(drag.pointerY - drag.originY) >= 3;
    refresh();
  }

  function finish(event: PointerEvent<HTMLButtonElement>) {
    const drag = active.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    move(event);
    const next = range();
    cancel();
    if (drag.moved)
      latest.current.onResize(drag.task, next.start, next.minutes);
  }

  function keyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    slot: Slot,
    edge: TimelineResizeEdge,
  ) {
    if (active.current || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const task = draggableTimelineTask(latest.current.state, slot);
    if (!task) return;
    event.preventDefault();
    event.stopPropagation();
    const step = (event.shiftKey ? 15 : 5) * (event.key === "ArrowUp" ? -1 : 1);
    const next = timelineResizeRange(
      task,
      edge,
      task.start + (edge === "end" ? task.minutes : 0) + step,
    );
    keyboardFocus.current = { id: task.id, edge };
    latest.current.onResize(task, next.start, next.minutes);
  }

  return { preview, start, move, finish, cancel, keyboard };
}
