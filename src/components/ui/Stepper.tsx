export interface StepperProps {
  qty: number;
  /** Stock ceiling. `+` disables at this value rather than letting the server reject it. */
  max: number;
  /** Names the item in both aria-labels — see the note on ambiguity below. */
  itemName: string;
  onChange: (next: number) => void;
  /** Called instead of onChange when decrementing away from 1. */
  onRemove: () => void;
  className?: string;
}

/**
 * Keeps the 36px chips visually small while meeting the 44px touch-target
 * minimum: a transparent -4px inset pseudo-element extends the hit area past
 * the painted box without changing layout or pushing the two chips apart.
 * Same trick, same value, as the cart sheet's controls.
 */
const STEP_HIT = "relative before:absolute before:inset-[-4px] before:content-['']";

function TrashIcon() {
  return (
    <svg className="w-4 h-4" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

/**
 * Quantity −/+ control, extracted from the cart sheet so checkout can stop
 * using `<input type="number">` (whose spinners are unstyleable, tiny, and
 * absent on mobile keyboards) and match the control users already know.
 *
 * At qty 1 the minus becomes a trash icon and calls `onRemove`. Decrementing to
 * zero and leaving an invisible 0-quantity line in the cart is the alternative,
 * and it is worse: the row stays, occupying space, doing nothing.
 *
 * Every label names the item. Screen-reader users tab through a list of these,
 * and eight buttons all announcing "Increase" gives no way to tell which line
 * is about to change.
 *
 * NOTE: the caller is responsible for focus after `onRemove` — removing a line
 * unmounts the focused button, and focus falls back to <body> unless the list
 * owner hands it to a live neighbour. CartBar's handleDecrease shows the
 * pattern; this primitive cannot do it, since it cannot see its siblings.
 */
export function Stepper({ qty, max, itemName, onChange, onRemove, className = "" }: StepperProps) {
  const isLast = qty <= 1;

  function handleDecrease() {
    if (isLast) onRemove();
    else onChange(qty - 1);
  }

  return (
    <div className={`flex items-center gap-1 shrink-0 ${className}`}>
      <button
        type="button"
        aria-label={isLast ? `Remove ${itemName}` : `Decrease ${itemName}`}
        onClick={handleDecrease}
        className={`${STEP_HIT} w-9 h-9 rounded-lg active:scale-95 transition flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${
          isLast
            ? "bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 focus-visible:bg-red-50 focus-visible:text-red-600"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        {isLast ? <TrashIcon /> : <span aria-hidden="true">−</span>}
      </button>

      {/* tabular-nums so the row does not jog sideways stepping 9 -> 10. */}
      <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>

      <button
        type="button"
        aria-label={`Increase ${itemName}`}
        disabled={qty >= max}
        onClick={() => onChange(qty + 1)}
        className={`${STEP_HIT} w-9 h-9 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 active:scale-95 transition flex items-center justify-center disabled:opacity-40 disabled:hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30`}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
