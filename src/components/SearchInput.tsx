import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Search field whose clear button dissolves the query instead of blanking it.
 *
 * The typed text flies up, blurs out and leaves a short warm streak behind each
 * word, while the placeholder rises into the empty field. The point is that a
 * clear reads as an event — on the order board you clear a token filter dozens
 * of times a shift, and an instant blank gives no feedback that anything moved.
 *
 * Why per-frame JS instead of @keyframes:
 *
 * 1. Each word gets its own streak, so the gradient stack has to be measured
 *    from the rendered glyphs — word count and geometry are only known at the
 *    moment of the clear.
 * 2. The streak's rise/peak/fall envelope is not a static keyframe: the peak
 *    sits at --glow-peak-at of the run and the fall is longer than the rise,
 *    per word, staggered.
 *
 * The layer stack (see .t-clear in index.css): the real <input> is transparent
 * and unpadded, the mirror draws the glyphs while a value exists, the fake
 * placeholder owns the post-clear empty state, and the glow layer multiplies
 * over both. Tuning lives in the CSS variables on :root and is read back here
 * with getComputedStyle, so a change there applies on the next clear.
 */

/** Streak color, gray-900. Multiplied over the field, so it darkens rather than paints. */
const GLOW_RGB = "17, 24, 39";

interface WordRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

interface Tuning {
  dur: number;
  outDur: number;
  inDur: number;
  outFly: number;
  inFly: number;
  blur: number;
  glowDelay: number;
  peakAt: number;
  glowOpacity: number;
  spread: number;
  stagger: number;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * cubic-bezier(0.22, 1, 0.36, 1) — the same curve the stylesheet names for
 * --clear-out-ease / --clear-in-ease, solved by Newton then bisection so the
 * JS-driven frames match anything CSS animates with those variables.
 */
function easeOutQuint(t: number): number {
  const x1 = 0.22;
  const x2 = 0.36;
  const y1 = 1;
  const y2 = 1;
  const curve = (a: number, b: number, u: number) =>
    ((1 - u) * (1 - u) * 3 * a + (1 - u) * 3 * u * b + u * u) * u;
  const slope = (a: number, b: number, u: number) =>
    3 * (1 - u) * (1 - u) * a + 6 * (1 - u) * u * (b - a) + 3 * u * u * (1 - b);

  let u = t;
  for (let i = 0; i < 6; i++) {
    const d = slope(x1, x2, u);
    if (d < 1e-6) break;
    const x = curve(x1, x2, u) - t;
    if (Math.abs(x) < 1e-5) break;
    u -= x / d;
  }
  return curve(y1, y2, clamp01(u));
}

/** Rise to the peak, then a longer fall — the shape a streak of light has. */
function envelope(p: number, peakAt: number): number {
  if (p <= 0 || p >= 1) return 0;
  const raw = p < peakAt ? p / peakAt : 1 - (p - peakAt) / (1 - peakAt);
  // Smoothstep so the peak has no corner in it.
  return raw * raw * (3 - 2 * raw);
}

function readTuning(): Tuning {
  const cs = getComputedStyle(document.documentElement);
  const num = (name: string, fallback: number) => {
    const parsed = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    dur: num("--clear-dur", 1000),
    outDur: num("--clear-out-dur", 400),
    inDur: num("--clear-in-dur", 400),
    outFly: num("--clear-out-fly", 12),
    inFly: num("--clear-in-fly", 12),
    blur: num("--clear-blur", 2),
    glowDelay: num("--glow-delay", 50),
    peakAt: num("--glow-peak-at", 0.15),
    glowOpacity: num("--glow-opacity", 0.85),
    spread: num("--glow-spread", 1.5),
    stagger: num("--glow-stagger", 70),
  };
}

/**
 * Split on whitespace but keep the gaps, so the mirror renders the query at the
 * exact width the input had and every word is individually measurable.
 */
function toSegments(text: string): string[] {
  return text.split(/(\s+)/).filter((segment) => segment.length > 0);
}

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Required: the visible placeholder is aria-hidden decoration, so the field needs its own name. */
  label: string;
  /** Box classes for the wrapper — border, radius, padding, surface, width. */
  className?: string;
  /** Optional decoration pinned inside the wrapper's left padding. */
  leadingIcon?: ReactNode;
  inputMode?: "text" | "numeric" | "search";
  id?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className = "",
  leadingIcon,
  inputMode,
  id,
}: SearchInputProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  // The text the mirror keeps drawing after the input has already been emptied.
  // Null means "not clearing" — the mirror just follows `value`.
  const [frozen, setFrozen] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const mirror = mirrorRef.current;
    const fake = placeholderRef.current;
    const glow = glowRef.current;
    if (mirror) mirror.style.cssText = "";
    if (fake) fake.style.cssText = "";
    if (glow) {
      glow.style.opacity = "";
      glow.style.background = "";
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setFrozen(null);
  }, [stop]);

  useEffect(() => reset, [reset]);

  // Runs once `frozen` has painted, so the word spans exist and can be measured
  // before the first frame moves them.
  useLayoutEffect(() => {
    if (frozen === null) return;
    const wrap = wrapRef.current;
    const mirror = mirrorRef.current;
    const fake = placeholderRef.current;
    const glow = glowRef.current;
    if (!wrap || !mirror || !fake || !glow) return;

    const tuning = readTuning();
    const wrapRect = wrap.getBoundingClientRect();
    const wrapStyle = getComputedStyle(wrap);
    // Absolute children are positioned against the padding box, so word offsets
    // have to drop the border to line up with the layers they sit under.
    const borderLeft = parseFloat(wrapStyle.borderLeftWidth) || 0;
    const borderTop = parseFloat(wrapStyle.borderTopWidth) || 0;

    const rects: WordRect[] = Array.from(mirror.querySelectorAll(".t-clear-word")).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        cx: rect.left - wrapRect.left - borderLeft + rect.width / 2,
        cy: rect.top - wrapRect.top - borderTop + rect.height / 2,
        w: rect.width,
        h: rect.height,
      };
    });

    // The glow stack alone lasts past the text: last word's stagger + envelope.
    const total = tuning.glowDelay + Math.max(0, rects.length - 1) * tuning.stagger + tuning.dur;
    const started = performance.now();
    glow.style.opacity = "1";
    fake.style.opacity = "0";

    const frame = (now: number) => {
      const elapsed = now - started;

      const out = easeOutQuint(clamp01(elapsed / tuning.outDur));
      const lift = -tuning.outFly * out;
      mirror.style.transform = `translateY(${lift}px)`;
      mirror.style.opacity = String(1 - out);
      mirror.style.filter = `blur(${tuning.blur * out}px)`;

      // The placeholder mirrors that math in the other direction, starting only
      // once the query is gone so the two never overlap mid-flight.
      const back = easeOutQuint(clamp01((elapsed - tuning.outDur) / tuning.inDur));
      fake.style.transform = `translateY(${tuning.inFly * (1 - back)}px)`;
      fake.style.opacity = String(back);

      // One streak per word, riding along with the glyphs as they lift.
      const layers: string[] = [];
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        const local = (elapsed - tuning.glowDelay - i * tuning.stagger) / tuning.dur;
        const alpha = envelope(local, tuning.peakAt) * tuning.glowOpacity;
        if (alpha <= 0.001) continue;
        // Wide and flat: a streak left along the line the word travelled, not a
        // blob sitting on top of it. It trails the glyphs rather than tracking
        // them exactly, which is what makes it read as a wake.
        const rx = (rect.w / 2 + rect.h * 0.4) * tuning.spread;
        const ry = rect.h * tuning.spread * 0.5;
        const cy = rect.cy + lift * 0.6;
        layers.push(
          `radial-gradient(${rx}px ${ry}px at ${rect.cx}px ${cy}px, ` +
            `rgba(${GLOW_RGB}, ${alpha.toFixed(3)}) 0%, rgba(${GLOW_RGB}, 0) 62%)`
        );
      }
      glow.style.background = layers.join(", ");

      if (elapsed >= total) {
        reset();
        return;
      }
      frameRef.current = requestAnimationFrame(frame);
    };

    frameRef.current = requestAnimationFrame(frame);
    return stop;
  }, [frozen, reset, stop]);

  const handleClear = useCallback(() => {
    if (!value) return;
    inputRef.current?.focus();

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      reset();
      onChange("");
      return;
    }

    stop();
    setFrozen(value);
    onChange("");
  }, [onChange, reset, stop, value]);

  const handleChange = useCallback(
    (next: string) => {
      // Typing during a dissolve wins: kill the animation rather than let a
      // ghost of the old query hang over the new one.
      if (frozen !== null) reset();
      onChange(next);
    },
    [frozen, onChange, reset]
  );

  const shown = frozen ?? value;
  const clearing = frozen !== null;
  const wrapClass = [
    "t-clear",
    clearing ? "is-clearing" : "",
    shown ? "has-value" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={wrapRef} className={wrapClass}>
      {leadingIcon}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            handleClear();
          }
        }}
        aria-label={label}
        autoComplete="off"
      />

      <div ref={mirrorRef} className="t-clear-mirror" aria-hidden="true">
        {toSegments(shown).map((segment, i) =>
          /\s/.test(segment) ? (
            <span key={i} style={{ whiteSpace: "pre" }}>
              {segment}
            </span>
          ) : (
            <span key={i} className="t-clear-word">
              {segment}
            </span>
          )
        )}
      </div>

      {/* The field's only placeholder. The native one is deliberately unset: it
          would double-render underneath this layer the moment a clear lands,
          and it cannot be flown in. */}
      <div ref={placeholderRef} className="t-clear-placeholder" aria-hidden="true">
        <span className="text-gray-400 font-medium">{placeholder}</span>
      </div>

      <div ref={glowRef} className="t-clear-glow" aria-hidden="true" />

      <button
        type="button"
        onClick={handleClear}
        aria-label={`Clear ${label.toLowerCase()}`}
        tabIndex={value ? 0 : -1}
        className="t-clear-btn absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
      >
        <span aria-hidden="true" className="text-sm leading-none">
          ✕
        </span>
      </button>
    </div>
  );
}
