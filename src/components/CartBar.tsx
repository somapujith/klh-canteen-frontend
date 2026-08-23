import { useCallback, useEffect, useRef, useState } from "react";

export interface CartBarLine {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  stockQty: number;
}

interface CartBarProps {
  lines: CartBarLine[];
  total: number;
  onCheckout: () => void;
  onUpdateQty: (menuItemId: string, qty: number) => void;
  onRemove: (menuItemId: string) => void;
  checkoutLabel?: string;
  /** Lets the host page mark the page body `inert` while the sheet covers it. */
  onExpandedChange?: (expanded: boolean) => void;
}

/**
 * Bottom-anchored cart summary shared by the student and guest menus.
 *
 * Layout by viewport: a full-bleed bar on phones (clear of the home indicator via
 * `pb-safe`), a floating card pinned bottom-right from `sm` up. Tapping the summary
 * expands an in-place sheet with per-line quantity controls so nothing about the
 * order is hidden behind a navigation step.
 *
 * It stays a disclosure rather than a dialog — the cart is a persistent utility, not
 * a task-blocking prompt — so the page behind it keeps working on wide screens. On
 * phones the sheet does cover the page, which is why `onExpandedChange` exists.
 */
/** Keeps the 36px chips visually small while meeting the 44px touch-target minimum. */
const STEP_HIT = "relative before:absolute before:inset-[-4px] before:content-['']";

/** Below `sm` the sheet covers the page, so it behaves modally. Above it, it does not. */
function matchCompact(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}

export function CartBar({
  lines,
  total,
  onCheckout,
  onUpdateQty,
  onRemove,
  checkoutLabel = "Checkout",
  onExpandedChange,
}: CartBarProps) {
  const [expanded, setExpanded] = useState(false);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  const [popKey, setPopKey] = useState(0);
  const prevCount = useRef(count);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(() => matchCompact());

  useEffect(() => {
    if (count > prevCount.current) setPopKey((n) => n + 1);
    prevCount.current = count;
  }, [count]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const onChange = () => setCompact(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Only the phone layout hides the page behind the sheet, so only it makes the
  // page inert. Marking a still-visible desktop page inert would strand the user.
  useEffect(() => {
    onExpandedChange?.(expanded && compact);
  }, [expanded, compact, onExpandedChange]);

  // Closing returns focus to the toggle: the sheet unmounts, and without this the
  // control the user was on disappears and focus falls back to <body>.
  const close = useCallback(({ restoreFocus = true } = {}) => {
    setExpanded(false);
    if (restoreFocus) toggleRef.current?.focus();
  }, []);

  // An empty cart collapses the sheet so a later add re-opens in the summary state.
  useEffect(() => {
    if (lines.length === 0) setExpanded(false);
  }, [lines.length]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded, close]);

  // On wide screens there is no scrim to click, so watch for a click landing
  // outside the panel. A scrim there would swallow the user's first click on the
  // menu behind it without ever explaining why.
  useEffect(() => {
    if (!expanded || compact) return;
    function onPointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) close({ restoreFocus: false });
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [expanded, compact, close]);

  /** Removing a line unmounts the focused button — hand focus to a live neighbour. */
  function handleDecrease(line: CartBarLine, index: number) {
    if (line.qty > 1) {
      onUpdateQty(line.menuItemId, line.qty - 1);
      return;
    }
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-cart-step]");
    const neighbour = buttons?.[index + 1] ?? buttons?.[index - 1];
    onRemove(line.menuItemId);
    if (neighbour) neighbour.focus();
    else toggleRef.current?.focus();
  }

  if (lines.length === 0) return null;

  return (
    <>
      <div aria-live="polite" role="status" className="sr-only">
        {count} item{count === 1 ? "" : "s"} in cart, total ₹{total.toFixed(2)}
      </div>

      {expanded && compact && (
        <div
          className="fixed inset-0 bg-gray-900/30 backdrop-blur-[2px] z-[45] sm:hidden"
          onClick={() => close()}
          aria-hidden="true"
        />
      )}

      <section
        aria-label="Cart summary"
        className="fixed inset-x-0 bottom-0 z-50 px-3 pb-safe sm:inset-x-auto sm:right-6 sm:bottom-6 sm:px-0 sm:pb-0"
      >
        <div
          ref={panelRef}
          className={`glass-panel rounded-2xl shadow-2xl border-gray-200/60 overflow-hidden mx-auto max-w-2xl sm:max-w-none sm:transition-[width] sm:duration-200 ${
            expanded ? "sm:w-[22rem] lg:w-[24rem]" : "sm:w-auto"
          }`}
        >
          {expanded && (
            <div id="cart-sheet" className="sheet-up border-b border-gray-100">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {count} item{count === 1 ? "" : "s"} in cart
                </p>
                <button
                  onClick={() => close()}
                  className="min-h-11 min-w-11 text-xs font-semibold text-gray-600 hover:text-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  Hide
                </button>
              </div>
              <ul ref={listRef} className="max-h-[min(40vh,20rem)] sm:max-h-[min(50vh,26rem)] overflow-y-auto overscroll-contain scroll-py-2 px-2 pb-2 space-y-1">
                {lines.map((line, index) => (
                  <li
                    key={line.menuItemId}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-gray-50/80 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">{line.name}</p>
                      <p className="text-xs text-gray-500">
                        ₹{line.price} × {line.qty} ={" "}
                        <span className="font-semibold text-gray-700">₹{(line.price * line.qty).toFixed(2)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        data-cart-step
                        aria-label={line.qty > 1 ? `Decrease ${line.name}` : `Remove ${line.name}`}
                        onClick={() => handleDecrease(line, index)}
                        className={`${STEP_HIT} w-9 h-9 rounded-lg active:scale-95 transition flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${
                          line.qty > 1
                            ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            : "bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 focus-visible:bg-red-50 focus-visible:text-red-600"
                        }`}
                      >
                        {line.qty > 1 ? (
                          <span aria-hidden="true">−</span>
                        ) : (
                          <svg className="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        )}
                      </button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums">{line.qty}</span>
                      <button
                        aria-label={`Increase ${line.name}`}
                        disabled={line.qty >= line.stockQty}
                        onClick={() => onUpdateQty(line.menuItemId, line.qty + 1)}
                        className={`${STEP_HIT} w-9 h-9 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 active:scale-95 transition flex items-center justify-center disabled:opacity-40 disabled:hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30`}
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-4 ${expanded ? "border-t border-gray-200/70" : ""}`}>
            <button
              ref={toggleRef}
              onClick={() => (expanded ? close({ restoreFocus: false }) : setExpanded(true))}
              aria-expanded={expanded}
              aria-controls="cart-sheet"
              aria-label={`Your order, ${count} item${count === 1 ? "" : "s"}, ₹${total.toFixed(2)}`}
              className="flex-1 min-w-0 overflow-hidden text-left rounded-xl px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <span
                aria-hidden="true"
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Your order
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </span>
              <span aria-hidden="true" className="flex items-baseline gap-1.5 mt-0.5 min-w-0">
                <span className="font-bold text-gray-900 text-base sm:text-lg tabular-nums truncate">₹{total.toFixed(2)}</span>
                <span
                  key={popKey}
                  className="count-pop hidden min-[360px]:inline shrink-0 text-xs sm:text-sm font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md whitespace-nowrap"
                >
                  {count} item{count === 1 ? "" : "s"}
                </span>
              </span>
            </button>

            <button
              onClick={onCheckout}
              className="shrink-0 rounded-xl bg-brand-600 text-white px-3 sm:px-5 py-2.5 font-semibold hover:bg-brand-700 active:scale-95 shadow-md shadow-brand-500/20 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition flex items-center gap-2"
            >
              {checkoutLabel}
              <svg className="hidden sm:block w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
