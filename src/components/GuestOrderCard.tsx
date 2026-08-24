import type { GuestOrder } from "../lib/guestSession";
import { formatWindowTime } from "../lib/collectionWindows";
import { formatOrderNumber } from "../lib/orderNumber";

const STEPS: { status: GuestOrder["status"]; label: string }[] = [
  { status: "PENDING", label: "Placed" },
  { status: "COOKED", label: "Prepared" },
  { status: "DELIVERED", label: "Collected" },
];

const STATUS_COPY: Record<GuestOrder["status"], string> = {
  PENDING: "Sent to the kitchen",
  PREPARING: "Being made right now",
  COOKED: "Prepared — collect it at the counter",
  DELIVERED: "Collected. Enjoy!",
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
  // PREPARING is retired from the flow; a legacy order still in it sits
  // between "Placed" and "Prepared", so light up the first step only.
  const currentIndex =
    order.status === "PREPARING" ? 0 : STEPS.findIndex((s) => s.status === order.status);
  const isReady = order.status === "COOKED";
  const isDone = order.status === "DELIVERED";

  const token = formatOrderNumber(order.orderNumber);
  // Screen readers say "one thousand and forty-two" for 1042; spacing the digits
  // makes them read it the way it is called out at the counter: "one oh four two".
  const spokenToken = token.split("").join(" ");
  const counter = `${order.kitchen.toLowerCase()} counter`;

  const StatusIcon = isDone ? CheckIcon : isReady ? BellIcon : ClockIcon;

  return (
    <article className="bg-surface rounded-2xl flat-shadow border border-gray-100 overflow-hidden rise-in">
      {/* ---- Token hero ------------------------------------------------ */}
      <div
        className={`px-5 pt-4 pb-5 border-b transition-colors duration-300 motion-reduce:transition-none ${
          isReady
            ? "bg-emerald-50 border-emerald-100"
            : isDone
            ? "bg-surface-muted border-gray-200"
            : "bg-amber-50 border-amber-100"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-600 truncate">
            {order.kitchen} token
          </p>
          <span
            className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              isReady
                ? "bg-emerald-600 text-white"
                : isDone
                ? "bg-gray-200 text-gray-700"
                : "bg-amber-500 text-amber-950"
            }`}
          >
            <StatusIcon className="h-3 w-3" />
            {order.status}
          </span>
        </div>

        <p
          className={`mt-1 font-black tabular-nums tracking-tight leading-[0.95] text-6xl sm:text-7xl ${
            isDone ? "text-gray-500" : "text-gray-900"
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
            isDone ? "text-gray-600" : "text-gray-800"
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
          {STATUS_COPY[order.status]}
        </p>

        <ol className="flex items-center gap-1.5" aria-label="Order progress">
          {STEPS.map((step, idx) => {
            const reached = idx <= currentIndex;
            const isCurrent = idx === currentIndex;
            return (
              <li
                key={step.status}
                className="flex-1 min-w-0"
                aria-current={isCurrent ? "step" : undefined}
              >
                <div
                  className={`h-1.5 rounded-full transition-colors duration-300 motion-reduce:transition-none ${
                    reached ? "bg-brand-600" : "bg-gray-200"
                  }`}
                />
                <span
                  className={`mt-1.5 flex items-center gap-1 text-[11px] font-semibold ${
                    reached ? "text-brand-700" : "text-gray-500"
                  }`}
                >
                  {reached && !isCurrent && <CheckIcon className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{step.label}</span>
                  <span className="sr-only">
                    {isCurrent ? "— current step" : reached ? "— done" : "— not yet"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

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
          <li className="flex items-center justify-between pt-2 mt-1 border-t border-gray-200 font-semibold text-brand-900">
            <span>Total</span>
            <span className="tabular-nums">₹{order.totalAmount}</span>
          </li>
        </ul>
      </div>
    </article>
  );
}
