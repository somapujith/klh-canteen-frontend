import type { GuestOrder } from "../lib/guestSession";
import { formatWindowTime } from "../lib/collectionWindows";
import { formatOrderNumber } from "../lib/orderNumber";
import { statusPresentation } from "../lib/orderStatus";
import { Badge } from "./ui";

/**
 * What the card says under the token, per status.
 *
 * This is the only status copy left in this file. The label and the pill
 * colour come from lib/orderStatus now — this card used to carry its own word
 * for COOKED ("Prepared", against the token page's "Ready to collect"), which
 * is exactly the drift lib/orderStatus exists to stop. What stays local is the
 * second sentence, because it is specific to a walk-up guest standing at a
 * counter and has no equivalent on the student screens.
 *
 * Keyed off the raw wire string with a fallback, not off a Record<OrderStatus>:
 * a status this build has never seen must produce quiet, honest copy rather
 * than `undefined` rendered as a blank line.
 */
const STATUS_COPY: Record<string, string> = {
  PENDING: "Sent to the kitchen",
  PREPARING: "Being made right now",
  COOKED: "Prepared — collect it at the counter",
  DELIVERED: "Collected. Enjoy!",
  CANCELLED: "This order was cancelled.",
};

/* Icons are inline so the card carries no dependency and each one can inherit
   `currentColor` from the state it sits in. All are decorative: every state they
   mark is also spelled out in text next to them, so status never rides on colour
   or iconography alone. */
function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-12.5a.75.75 0 00-1.5 0V10c0 .27.14.52.37.65l3 1.75a.75.75 0 10.76-1.3l-2.63-1.53V5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.79a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function BellIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10 2a5 5 0 00-5 5v2.6c0 .5-.18.98-.5 1.36L3.3 12.3a.9.9 0 00.68 1.48h12.04a.9.9 0 00.68-1.48l-1.2-1.34a2.1 2.1 0 01-.5-1.36V7a5 5 0 00-5-5zM7.75 15.25a2.25 2.25 0 004.5 0h-4.5z" />
    </svg>
  );
}

function HandIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M9 2.75a1 1 0 011 1V9h.5V2.5a1 1 0 112 0V9h.5V4.25a1 1 0 112 0v6.19c0 3.2-2.1 6.06-5.28 6.53-2.3.34-4.13-.62-5.35-2.4L2.4 11.2a1.1 1.1 0 011.62-1.46L6 11.5V5.25a1 1 0 112 0V9h.5V3.75a1 1 0 011-1z" />
    </svg>
  );
}

/**
 * The order ticket a guest holds at the counter. There is no QR code anywhere in
 * this flow: the token number IS the ticket, so it is rendered as the hero of the
 * card — big enough to be read by staff across a busy counter without the guest
 * having to hand the phone over.
 */
export function GuestOrderCard({ order }: { order: GuestOrder }) {
  const { label, pillClass, tone } = statusPresentation(order.status);
  const isReady = tone === "ready";
  const isDone = tone === "done";
  // Branch on tone, not on the wire string: an unknown status resolves to
  // `neutral` and gets the same quiet amber treatment PENDING does, instead of
  // falling through every ternary into the "collected" styling and telling a
  // guest their food is done when nobody knows that.
  const isTerminalBad = tone === "cancelled";

  const token = formatOrderNumber(order.orderNumber);
  // Screen readers say "one thousand and forty-two" for 1042; spacing the digits
  // makes them read it the way it is called out at the counter: "one oh four two".
  const spokenToken = token.split("").join(" ");
  const counter = `${order.kitchen.toLowerCase()} counter`;

  const StatusIcon = isDone ? CheckIcon : isReady ? BellIcon : ClockIcon;

  return (
    <article className="bg-surface rounded-2xl flat-shadow border border-border overflow-hidden rise-in">
      {/* ---- Token hero ------------------------------------------------ */}
      <div
        className={`px-5 pt-4 pb-5 border-b transition-colors duration-300 motion-reduce:transition-none ${
          isReady
            ? "bg-success-50 border-success-100"
            : isDone || isTerminalBad
            ? "bg-surface-muted border-border"
            : "bg-warning-50 border-warning-100"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600 truncate">
            {order.kitchen} token
          </p>
          {/* The words and the colours come from lib/orderStatus — this card no
              longer prints the raw wire value ("COOKED") at a guest. */}
          <Badge
            className={`${pillClass} shrink-0 uppercase tracking-wide font-bold`}
            size="sm"
          >
            <StatusIcon className="h-3 w-3 shrink-0" />
            {label}
          </Badge>
        </div>

        <p
          className={`mt-1 font-black tabular-nums tracking-tight leading-[0.95] text-6xl sm:text-7xl ${
            isDone || isTerminalBad ? "text-gray-500" : "text-gray-900"
          }`}
          aria-hidden="true"
        >
          <span className="text-gray-500">#</span>
          {token}
        </p>
        <span className="sr-only">
          {order.kitchen} token number {spokenToken}
        </span>

        <p
          className={`mt-2.5 flex items-start gap-1.5 text-sm font-semibold ${
            isDone || isTerminalBad ? "text-gray-600" : "text-gray-800"
          }`}
        >
          <HandIcon className="h-4 w-4 shrink-0 mt-0.5 text-gray-500" />
          <span>
            {isDone ? `Handed over at the ${counter}` : `Show this number at the ${counter}`}
          </span>
        </p>
      </div>

      {/* ---- Progress + contents --------------------------------------- */}
      <div className="p-5 space-y-5">
        <p className="text-sm font-medium text-gray-600" aria-live="polite">
          {STATUS_COPY[order.status] ?? `Status: ${label}`}
        </p>

        {order.collectionAt && (
          <div className="flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm font-medium text-gray-700">
            <ClockIcon className="h-4 w-4 shrink-0 text-gray-500" />
            <span>Pre-booked for {formatWindowTime(order.collectionAt)}</span>
          </div>
        )}

        <ul className="space-y-1.5 rounded-xl bg-surface-muted p-3">
          {order.items.map((line) => (
            <li key={line.id} className="flex items-center justify-between text-sm font-medium text-gray-700">
              <span className="truncate pr-3">{line.menuItem.name}</span>
              <span className="text-gray-600 shrink-0 tabular-nums">× {line.quantity}</span>
            </li>
          ))}
          <li className="flex items-center justify-between pt-2 mt-1 border-t border-border font-semibold text-brand-900">
            <span>Total</span>
            <span className="tabular-nums">₹{order.totalAmount}</span>
          </li>
        </ul>
      </div>
    </article>
  );
}
