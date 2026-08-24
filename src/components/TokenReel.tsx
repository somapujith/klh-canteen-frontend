import { useEffect, useId, useMemo, useRef } from "react";

/**
 * Spinning counter for the collection token (t-reel).
 *
 * Each digit gets its own clipped column. The strip inside it is parked on the
 * real digit while the token is hidden, so what sits under the blur is the
 * actual number — then the reveal spins it through whole 0-9 loops and lands
 * on the same digit it started from.
 *
 * Two things move together and neither is expressible as a static @keyframes:
 * the per-column transform (staggered, so the reels settle left to right) and
 * the streak, a vertical-only feGaussianBlur decaying to zero as each column
 * comes to rest. Both are timed from the CSS variables in index.css, read back
 * here with getComputedStyle.
 */

/** Whole 0-9 loops each column travels before landing. */
const SPINS = 3;

function readMs(styles: CSSStyleDeclaration, name: string, fallback: number): number {
  const raw = styles.getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return raw.endsWith("ms") ? value : value * 1000;
}

function readPx(styles: CSSStyleDeclaration, name: string, fallback: number): number {
  const value = parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

const cellsUp = (n: number) => `translateY(calc(var(--reel-cell) * -${n}))`;

export function TokenReel({
  digits,
  revealed,
  onSettled,
  className = "",
}: {
  digits: string;
  revealed: boolean;
  onSettled?: () => void;
  className?: string;
}) {
  // useId() emits colons, which are legal in an id but break url(#…) lookups.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rootRef = useRef<HTMLSpanElement>(null);
  const strips = useRef<(HTMLSpanElement | null)[]>([]);
  const blurs = useRef<(SVGFEGaussianBlurElement | null)[]>([]);
  const frameRef = useRef<number | null>(null);
  // Kept in a ref so a caller passing an inline arrow can't restart the spin.
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const chars = useMemo(() => digits.split(""), [digits]);

  useEffect(() => {
    if (!revealed) return;
    const root = rootRef.current;
    if (!root) return;

    const styles = getComputedStyle(root);
    const duration = readMs(styles, "--reel-dur", 1400);
    const stagger = readMs(styles, "--reel-stagger", 90);
    const spinBlur = readPx(styles, "--reel-spin-blur", 3);
    const ease = styles.getPropertyValue("--reel-ease").trim() || "cubic-bezier(0.16, 1, 0.3, 1)";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const land = (index: number, digit: number) => {
      const strip = strips.current[index];
      if (strip) strip.style.transform = cellsUp(SPINS * 10 + digit);
    };

    if (reduced) {
      chars.forEach((char, index) => {
        const digit = Number(char);
        if (!Number.isFinite(digit)) return;
        const strip = strips.current[index];
        if (!strip) return;
        strip.style.transition = "none";
        strip.style.filter = "";
        land(index, digit);
      });
      settledRef.current?.();
      return;
    }

    chars.forEach((char, index) => {
      const digit = Number(char);
      if (!Number.isFinite(digit)) return;
      const strip = strips.current[index];
      if (!strip) return;
      strip.style.filter = `url(#${uid}-${index})`;
      strip.style.transition = `transform ${duration}ms ${ease} ${index * stagger}ms`;
      land(index, digit);
    });

    const start = performance.now();
    const total = duration + stagger * Math.max(0, chars.length - 1);

    const step = (now: number) => {
      const elapsed = now - start;
      blurs.current.forEach((blur, index) => {
        if (!blur) return;
        // Each column runs its own window, offset by its stagger. Squared
        // falloff so the streak tracks how fast the strip is actually moving
        // rather than fading out on a straight line.
        const progress = Math.min(1, Math.max(0, (elapsed - index * stagger) / duration));
        const remaining = 1 - progress;
        blur.setAttribute("stdDeviation", `0 ${(spinBlur * remaining * remaining).toFixed(2)}`);
      });

      if (elapsed < total) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }

      blurs.current.forEach((blur) => blur?.setAttribute("stdDeviation", "0 0"));
      // Drop the filter entirely once it is at rest: a settled digit should be
      // painted text, not the output of a filter pass.
      strips.current.forEach((strip) => {
        if (strip) strip.style.filter = "";
      });
      frameRef.current = null;
      settledRef.current?.();
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [revealed, chars, uid]);

  return (
    <span
      ref={rootRef}
      className={`t-reel t-reel--token ${revealed ? "t-reel--spinning" : "t-reel--hidden"} ${className}`}
    >
      <svg aria-hidden="true" focusable="false" className="absolute h-0 w-0" style={{ position: "absolute" }}>
        <defs>
          {chars.map((_, index) => (
            <filter
              key={index}
              id={`${uid}-${index}`}
              x="-20%"
              y="-50%"
              width="140%"
              height="200%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur
                ref={(el) => {
                  blurs.current[index] = el;
                }}
                stdDeviation="0 0"
              />
            </filter>
          ))}
        </defs>
      </svg>

      {chars.map((char, index) => {
        const digit = Number(char);
        if (!/^\d$/.test(char)) {
          return (
            <span key={index} className="t-reel-static">
              {char}
            </span>
          );
        }

        // Cells run 0 .. SPINS*10 + digit, each showing its index mod 10, so
        // the strip both starts and ends on this column's digit.
        const cells = SPINS * 10 + digit + 1;

        return (
          <span key={index} className="t-reel-col">
            <span
              ref={(el) => {
                strips.current[index] = el;
              }}
              className="t-reel-strip"
              style={{ transform: cellsUp(digit) }}
            >
              {Array.from({ length: cells }, (_, cell) => (
                <span key={cell} className="t-reel-digit">
                  {cell % 10}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
