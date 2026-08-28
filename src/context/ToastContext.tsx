import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type?: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TOAST_DURATION_MS = 3000;
/** Older toasts are dropped past this. A stack tall enough to cover the screen
    is worse than a missed message, and the region is `aria-live` anyway. */
const MAX_VISIBLE = 3;

/* Monotonic, module-scoped. The previous `Math.random().toString(36).substr(2,9)`
   used a deprecated API and could collide — two toasts fired in the same tick
   with the same id meant dismissing one dismissed both. */
let nextToastId = 0;

/** Per-toast countdown that can be paused and resumed without losing elapsed time. */
interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  /** ms still owed when the timer was last paused. */
  remaining: number;
  /** performance-independent start stamp of the current running stretch. */
  startedAt: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, Timer>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const resume = useCallback(
    (id: number) => {
      const timer = timers.current.get(id);
      // Already running (handle set) or gone — nothing to restart.
      if (!timer || timer.handle) return;
      timer.startedAt = Date.now();
      timer.handle = setTimeout(() => dismiss(id), timer.remaining);
    },
    [dismiss]
  );

  const pause = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (!timer?.handle) return;
    clearTimeout(timer.handle);
    timer.handle = null;
    // Deduct only what actually elapsed, so a series of brief hovers cannot
    // keep resetting the toast to a full 3s the way a naive restart would.
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = nextToastId++;
      setToasts((prev) => {
        const next = [...prev, { id, message, type }];
        // Drop the oldest beyond the cap, and cancel its pending timer so a
        // stale callback cannot fire against an id that is no longer mounted.
        for (const dropped of next.slice(0, Math.max(0, next.length - MAX_VISIBLE))) {
          const timer = timers.current.get(dropped.id);
          if (timer?.handle) clearTimeout(timer.handle);
          timers.current.delete(dropped.id);
        }
        return next.slice(-MAX_VISIBLE);
      });

      timers.current.set(id, {
        handle: setTimeout(() => dismiss(id), TOAST_DURATION_MS),
        remaining: TOAST_DURATION_MS,
        startedAt: Date.now(),
      });
    },
    [dismiss]
  );

  // Unmount with timers still pending would leave setTimeout callbacks calling
  // setState on a dead tree.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) if (timer.handle) clearTimeout(timer.handle);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container */}
      <div
        role="status"
        aria-live="polite"
        /* z-60 + lifted above the CartBar on phones, per the overlay stacking
           table in src/index.css. The cart owns the full bottom edge below `sm`,
           so a bottom-4 toast landed on its Checkout button and, being
           pointer-events-auto, swallowed taps for the 3s it was up. */
        className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] sm:bottom-4 left-1/2 -translate-x-1/2 z-60 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            /* Hover and focus both hold the countdown: a keyboard user tabbing
               to the dismiss button gets the same reprieve as a mouse user
               reading the message. */
            onMouseEnter={() => pause(toast.id)}
            onMouseLeave={() => resume(toast.id)}
            onFocus={() => pause(toast.id)}
            onBlur={() => resume(toast.id)}
            className={`
              pointer-events-auto flex items-center gap-3 pl-4 pr-1 py-1 rounded-2xl shadow-lg border text-sm font-medium
              rise-in
              ${toast.type === "success" ? "bg-success-50 text-green-900 border-success-100" : ""}
              ${toast.type === "error" ? "bg-danger-50 text-danger-700 border-danger-100" : ""}
              ${toast.type === "info" ? "bg-gray-900 text-white border-gray-800" : ""}
            `}
          >
            {toast.type === "success" && (
              <svg aria-hidden="true" className="w-5 h-5 shrink-0 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span className="py-2">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 w-11 h-11 -my-1 flex items-center justify-center rounded-2xl opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current transition-opacity"
            >
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
