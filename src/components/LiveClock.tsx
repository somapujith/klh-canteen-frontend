import { useEffect, useState } from "react";

/**
 * A ticking clock, on the ticket, for the counter to glance at.
 *
 * WHY THIS EXISTS
 * A screenshot of a ticket is indistinguishable from the real thing — the
 * number, the colour and the status all photograph perfectly. The web platform
 * offers no way to block screenshots (that is an OS gesture; only a native app
 * can suppress it, via FLAG_SECURE on Android or equivalent), so the defence
 * cannot be prevention. It has to be something a still image cannot carry.
 *
 * A running second is exactly that. On a live screen the digits advance while
 * staff look at them; a screenshot is frozen, and its time is whenever it was
 * taken. Staff need no training beyond "the clock should be moving and it
 * should say now".
 *
 * Seconds are shown deliberately: minute-resolution would look identical to a
 * screenshot taken moments earlier, which is precisely the case being caught.
 */
export function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Aligned to the wall clock rather than a bare 1000ms interval, which
    // drifts and can visibly skip a second. Re-aligns after every tick, so a
    // backgrounded tab that resumes mid-second corrects itself immediately.
    let timer: number;
    const tick = () => {
      const current = new Date();
      setNow(current);
      timer = window.setTimeout(tick, 1000 - current.getMilliseconds());
    };
    timer = window.setTimeout(tick, 1000 - new Date().getMilliseconds());
    return () => window.clearTimeout(timer);
  }, []);

  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <span className={className}>
      {/* The dot pulses with the seconds — a second motion cue, readable at a
          glance even if the digits are too small to follow from across a
          counter. */}
      <span aria-hidden="true" className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current align-middle" />
      <span className="tabular-nums">{time}</span>
    </span>
  );
}
