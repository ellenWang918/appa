import { useLayoutEffect, useRef, useState } from "react";

export function useFloatingCard(
  anchor: HTMLElement | null,
  layoutKey = "",
  keepPositionOnCardResize = false,
) {
  const ref = useRef<HTMLElement>(null);
  const anchorRect = useRef<DOMRect | null>(null);
  const [position, setPosition] = useState({ left: 16, top: 80 });

  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    function positionCard() {
      if (!card) return;
      if (anchor?.isConnected)
        anchorRect.current = anchor.getBoundingClientRect();
      const rect = anchorRect.current;
      const width = card.offsetWidth,
        height = card.offsetHeight;
      const gap = 12,
        margin = 16;
      const preferredLeft =
        rect && rect.right + gap + width <= window.innerWidth - margin
          ? rect.right + gap
          : rect
            ? rect.left - gap - width
            : window.innerWidth - width - margin;
      const next = {
        left: Math.max(
          margin,
          Math.min(preferredLeft, window.innerWidth - width - margin),
        ),
        top: Math.max(
          margin,
          Math.min(rect?.top ?? 80, window.innerHeight - height - margin),
        ),
      };
      setPosition((previous) =>
        previous.left === next.left && previous.top === next.top
          ? previous
          : next,
      );
    }
    positionCard();
    const observer = new ResizeObserver((entries) => {
      if (
        !keepPositionOnCardResize ||
        entries.some((entry) => entry.target === anchor)
      ) {
        positionCard();
        return;
      }
      // Form sections may shrink or expand. Keep the user's location and only
      // shift the card when its new size would extend outside the viewport.
      setPosition((previous) => {
        const next = {
          left: Math.max(
            16,
            Math.min(previous.left, window.innerWidth - card.offsetWidth - 16),
          ),
          top: Math.max(
            16,
            Math.min(previous.top, window.innerHeight - card.offsetHeight - 16),
          ),
        };
        return previous.left === next.left && previous.top === next.top
          ? previous
          : next;
      });
    });
    observer.observe(card);
    if (anchor) observer.observe(anchor);
    window.addEventListener("resize", positionCard);
    window.addEventListener("scroll", positionCard, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", positionCard);
      window.removeEventListener("scroll", positionCard, true);
    };
  }, [anchor, layoutKey, keepPositionOnCardResize]);

  return { ref, position };
}
