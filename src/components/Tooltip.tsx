import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Hover/focus label for a control that shows only an icon.
 *
 * Two things drive the shape of this:
 *
 * 1. It renders into document.body rather than next to the trigger. The admin
 *    tab row is `overflow-x-auto` so it can scroll on narrow screens, and
 *    overflow-x also clips vertically — a bubble positioned under a tab would
 *    be cut off or would add a scrollbar. Fixed positioning off the trigger's
 *    measured rect sidesteps the container entirely.
 *
 * 2. The bubble is aria-hidden. Every caller already names its control with
 *    aria-label, so exposing the same string again makes a screen reader say it
 *    twice. This is decoration for sighted pointer and keyboard users; the
 *    accessible name is the caller's job.
 */

/** Long enough that sweeping the pointer across a row does not flash every label. */
const OPEN_DELAY_MS = 120;

interface Position {
  x: number;
  y: number;
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const hide = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPosition(null);
  }, []);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
  }, []);

  const show = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(place, OPEN_DELAY_MS);
  }, [place]);

  // Focus opens immediately — a keyboard user has already committed to the
  // control, so the anti-flicker delay only makes the label feel laggy.
  const showNow = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setPosition(null);
    place();
  }, [place]);

  useEffect(() => () => hide(), [hide]);

  useEffect(() => {
    if (!position) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    // The row scrolls and the page can resize under a pinned bubble. Capture
    // catches scrolls inside the tab strip, which do not bubble to window.
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [position, hide]);

  return (
    <span
      ref={triggerRef}
      className="inline-flex shrink-0"
      onPointerEnter={show}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocusCapture={showNow}
      onBlurCapture={hide}
    >
      {children}
      {position !== null &&
        createPortal(
          <span
            role="tooltip"
            aria-hidden="true"
            style={{ left: position.x, top: position.y }}
            className="pointer-events-none fixed z-50 -translate-x-1/2 rounded-lg bg-gray-900 px-2 py-1 text-xs font-semibold text-white shadow-lg"
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  );
}
