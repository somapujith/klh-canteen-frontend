import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { Navbar } from "../../components/Navbar";
import { TokenReel } from "../../components/TokenReel";
import { formatOrderNumber } from "../../lib/orderNumber";
import { useSSE, type OrderStatusDelta } from "../../hooks/useSSE";
import { statusPresentation } from "../../lib/orderStatus";
import { LiveClock } from "../../components/LiveClock";

interface OrderDetail {
  id: string;
  status: string;
  totalAmount: string;
  orderNumber: number;
  kitchen: string;
  items: { quantity: number; menuItem: { name: string } }[];
}

/**
 * Collection is by token number now — orders no longer carry a QR of their own
 * (the printed poster QR that walks guests to the menu is a separate thing and
 * is unaffected). The number is the only thing counter staff read off this
 * screen, so it is the page's single dominant element: everything else on the
 * ticket is deliberately quieter than it.
 */
export function OrderTokenPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Bumping this re-runs the fetch effect, which is what Try again does.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const ids = id.split(",").filter(Boolean);
    setError(null);
    Promise.all(
      ids.map(orderId => apiClient.get<OrderDetail>(`/orders/${orderId}`, token ?? undefined))
    )
      .then(fetched => {
        if (!cancelled) setOrders(fetched);
      })
      .catch((err: unknown) => {
        // Without this the page sat on its loading skeleton forever — the worst
        // possible screen to strand someone on right after they have paid.
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your token");
      });
    return () => {
      cancelled = true;
    };
  }, [id, token, reloadKey]);

  // Live status. The backend already pushes ORDER_UPDATE to the order owner's
  // own channel whenever an admin advances it (sseService.emitOrderStatusChanged
  // -> subjectAudience), and the guest status page has always consumed it —
  // this page simply never subscribed, so a student watching their token saw
  // PENDING until they reloaded. Patch from the delta rather than refetching:
  // the whole point is that the person standing at the counter sees "Ready"
  // the moment the kitchen marks it.
  useSSE(["ORDER_UPDATE"], {
    onDelta: (delta) => {
      if (delta.kind !== "ORDER_STATUS") return;
      const { orderId, status } = delta as OrderStatusDelta;
      setOrders((prev) =>
        prev.map((order) => (order.id === orderId ? { ...order, status } : order)),
      );
    },
    // Local state can no longer be trusted (missed events, or a payload this
    // build doesn't understand) — go back to the server.
    onResync: () => setReloadKey((key) => key + 1),
  });

  if (error && orders.length === 0) {
    return (
      <div className="min-h-screen bg-surface-muted fade-in">
        <Navbar title="Your Token" backTo="/student" />
        <div className="mx-auto w-full max-w-sm px-4 pb-16 pt-10 sm:max-w-md">
          <div role="alert" className="rounded-2xl bg-surface p-6 text-center flat-shadow">
            <h1 className="text-lg font-bold tracking-tight text-gray-900">Could not load your token</h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{error}</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Your order is placed. Find it any time under order history.
            </p>
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              className="mt-5 w-full rounded-xl bg-brand-700 px-4 py-3 text-sm font-bold text-white"
            >
              Try again
            </button>
            <Link
              to="/student/orders"
              className="mt-3 block text-sm font-semibold text-brand-700 underline underline-offset-4"
            >
              Go to order history
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (orders.length === 0) return <TokenPageSkeleton />;

  const multiple = orders.length > 1;
  // Every ticket handed over — the page has nothing left to ask of the student.
  const allCollected = orders.every((order) => order.status === "DELIVERED");

  return (
    <div className="min-h-screen bg-surface-muted fade-in">
      <Navbar title="Your Token" backTo="/student" />
      <div className="mx-auto w-full max-w-sm px-4 pb-16 pt-6 sm:max-w-md">
        <header className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {allCollected
              ? multiple
                ? "All collected"
                : "Collected"
              : multiple
                ? `${orders.length} tokens for your order`
                : "Order placed"}
          </h1>
          <p className="mx-auto mt-1.5 max-w-[19rem] text-sm leading-relaxed text-gray-500">
            {allCollected
              ? "Enjoy your food."
              : multiple
                ? "Each counter has its own number. Reveal the matching one when you collect."
                : "Reveal your number at the counter to collect."}
          </p>
        </header>

        <div className="mt-7 space-y-10">
          {orders.map((order, index) => (
            <OrderTicket key={order.id} order={order} index={index} total={orders.length} />
          ))}
        </div>
      </div>
    </div>
  );
}

function OrderTicket({ order, index, total }: { order: OrderDetail; index: number; total: number }) {
  const digits = formatOrderNumber(order.orderNumber);
  const kitchen = order.kitchen.toLowerCase();
  // Each ticket reveals on its own — a student collecting from two counters
  // shows one number at a time.
  const [revealed, setRevealed] = useState(false);

  /**
   * Collected turns the whole ticket green.
   *
   * The point is the counter's glance, not the student's: a handed-over order
   * must look different from a waiting one across a queue, so re-presenting
   * the same live screen reads as already-done rather than as a fresh ticket.
   *
   * It does NOT defeat a screenshot taken before collection — that image stays
   * white forever. The LiveClock below is what catches that case.
   */
  const collected = order.status === "DELIVERED";

  // A collected ticket shows its number unconditionally: the reveal control is
  // gone by then, so gating on `revealed` would leave it blurred with no way
  // to unblur it. There is nothing left to protect — the order is handed over.
  const showNumber = revealed || collected;

  return (
    <article
      aria-label={total > 1 ? `Ticket ${index + 1} of ${total}, ${kitchen}` : `${kitchen} ticket`}
      className={`relative rounded-3xl flat-shadow flat-shadow-hover rise-in transition-colors duration-500 ${
        collected ? "bg-success-50 ring-2 ring-success-500" : "bg-surface"
      }`}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/* Kitchen band — names the counter this token is valid at. */}
      <div
        className={`flex items-center justify-between gap-3 rounded-t-3xl px-5 py-3 text-white transition-colors duration-500 ${
          collected ? "bg-success-600" : "bg-brand-700"
        }`}
      >
        <h2 className="truncate text-[0.7rem] font-bold uppercase tracking-[0.22em]">
          {collected ? "Collected" : `${order.kitchen} Token`}
        </h2>
        {total > 1 && (
          <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-[0.65rem] font-bold tabular-nums tracking-widest">
            {index + 1} / {total}
          </span>
        )}
      </div>

      {/* Hero — the number, at arm's-length size. */}
      <div className="px-5 pb-7 pt-6 text-center">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-gray-400">
          Token number
        </p>

        <div className="relative mt-1.5">
          {/* Spaced digits so screen readers say "zero zero four two" — the way a
              student would read it out — instead of "forty-two". Announced on
              reveal rather than sitting in the accessibility tree from the
              start, so the number is hidden for everyone until it is asked for. */}
          {showNumber ? (
            <span className="sr-only" aria-live="polite">
              Token number {digits.split("").join(" ")}.
              {collected ? " This order has been collected." : " Use the hide token button to hide it again."}
            </span>
          ) : (
            <span className="sr-only">Token number hidden. Use the show token button to reveal it.</span>
          )}

          <span
            aria-hidden="true"
            className={`flex items-start justify-center transition-colors duration-500 ${
              collected ? "text-success-700" : "text-brand-900"
            }`}
          >
            {/* The hash belongs to the number, so it hides with it. */}
            <span
              className={`mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl ${
                collected ? "text-success-400" : "text-brand-300"
              }`}
              style={showNumber ? undefined : { filter: "blur(var(--reel-hide-blur))" }}
            >
              #
            </span>
            <TokenReel
              digits={digits}
              revealed={showNumber}
              className="-my-[0.15em] text-[4.75rem] font-black leading-none tracking-tight sm:text-8xl"
            />
          </span>

          {/* Sits over the blurred number rather than under it: revealing must
              not reflow the ticket the student is already looking at.
              Suppressed once collected — the number has done its job, and
              offering to reveal it again invites exactly the second showing
              this change is meant to discourage. */}
          {!revealed && !collected && (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-bold text-white flat-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2"
            >
              <EyeIcon />
              Show token
            </button>
          )}
        </div>

        <div className="mt-5">
          <StatusPill status={order.status} />
        </div>

        {/* The liveness cue. Present on every ticket, not just collected ones:
            the fraud it catches is a screenshot taken BEFORE collection, so the
            clock has to be running on the screen staff check at handover. */}
        <p
          className={`mt-3 text-xs font-bold ${collected ? "text-success-700" : "text-gray-400"}`}
          aria-hidden="true"
        >
          <LiveClock />
        </p>

        <p className="mx-auto mt-4 max-w-[17rem] text-sm leading-relaxed text-gray-500">
          {collected ? (
            <>
              Collected from the <span className="font-semibold text-gray-700">{kitchen}</span> counter.
              Nothing left to do.
            </>
          ) : revealed ? (
            <>
              Show or read out this number at the{" "}
              <span className="font-semibold text-gray-700">{kitchen}</span> counter.
            </>
          ) : (
            <>
              Reveal it at the <span className="font-semibold text-gray-700">{kitchen}</span> counter when
              you are ready to collect.
            </>
          )}
        </p>

        {/* Deliberately NOT the mirror of "Show token", which is an overlay
            centred on the number: a hide control in that position would cover
            the very digits the student is holding up to the counter. It sits
            below the copy instead, quiet enough not to compete with the number
            and reachable once the handover is done. */}
        {revealed && !collected && (
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="mx-auto mt-3 flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-gray-500 transition-colors hover:bg-surface-muted hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <EyeOffIcon />
            Hide token
          </button>
        )}
      </div>

      {/* Perforation — the notches make each stacked ticket read as one object. */}
      <div aria-hidden="true" className="relative">
        <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-surface-muted" />
        <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-surface-muted" />
        <div className="mx-6 border-t-2 border-dashed border-gray-200" />
      </div>

      {/* Stub — secondary detail, recessed so it never competes with the number. */}
      <div className="rounded-b-3xl bg-surface-hover px-5 py-4">
        <h3 className="sr-only">Items in this order</h3>
        <ul className="divide-y divide-gray-200/70">
          {order.items.map((line, idx) => (
            <li key={idx} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="text-gray-700">{line.menuItem.name}</span>
              <span className="shrink-0 font-medium tabular-nums text-gray-500">×{line.quantity}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-3">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gray-500">
            Total
          </span>
          <span className="text-lg font-bold tabular-nums text-brand-900">₹{order.totalAmount}</span>
        </div>
      </div>
    </article>
  );
}

/**
 * Status never relies on colour alone: icon + word carry it on their own.
 *
 * The words and the colours now come from lib/orderStatus — the wire values are
 * still shown as what they mean to the person holding the phone rather than as
 * the database spells them ("COOKED" is not what someone waiting at a counter
 * is listening for), but that mapping is no longer this page's private copy of
 * the truth. Only the icon stays local, because it is specific to this pill.
 */
const TONE_ICON: Record<string, string> = {
  neutral: "M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  progress: "M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  ready:
    "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1h6z",
  done: "M5 13l4 4L19 7",
  cancelled: "M15 9l-6 6M9 9l6 6",
};

function EyeIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12Z"
      />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M10.6 10.6a2.75 2.75 0 003.8 3.8M9.9 5.4A9.6 9.6 0 0112 5.25c6 0 9.75 6.75 9.75 6.75a17 17 0 01-3.2 4.05M6.5 6.55A17 17 0 002.25 12S6 18.75 12 18.75c1 0 1.93-.19 2.8-.5"
      />
    </svg>
  );
}

function StatusPill({ status }: { status: string }) {
  const { label, pillClass, tone } = statusPresentation(status);
  return (
    <span
      // The word "Placed" also appears in the progress steps below, so tests
      // need an unambiguous handle on the pill itself.
      data-testid="order-status"
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.12em] transition-colors ${pillClass}`}
    >
      <svg className="h-3.5 w-3.5 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d={TONE_ICON[tone]} />
      </svg>
      {label}
    </span>
  );
}

function TokenPageSkeleton() {
  return (
    <div className="min-h-screen bg-surface-muted fade-in">
      <Navbar title="Your Token" backTo="/student" />
      <div className="mx-auto w-full max-w-sm px-4 pb-16 pt-6 sm:max-w-md" role="status" aria-live="polite">
        <span className="sr-only">Loading your token…</span>
        <div aria-hidden="true" className="animate-pulse">
          <div className="mx-auto h-5 w-40 rounded-full bg-gray-200" />
          <div className="mx-auto mt-2.5 h-3.5 w-56 rounded-full bg-gray-200/80" />
          <div className="mt-7 rounded-3xl bg-surface flat-shadow">
            <div className="h-11 rounded-t-3xl bg-gray-200" />
            <div className="flex flex-col items-center px-5 pb-7 pt-6">
              <div className="h-3 w-28 rounded-full bg-gray-200" />
              <div className="mt-3 h-[4.75rem] w-52 rounded-2xl bg-gray-200" />
              <div className="mt-5 h-7 w-28 rounded-full bg-gray-200" />
            </div>
            <div className="mx-6 border-t-2 border-dashed border-gray-200" />
            <div className="space-y-2.5 rounded-b-3xl bg-surface-hover px-5 py-4">
              <div className="h-3.5 w-3/4 rounded-full bg-gray-200" />
              <div className="h-3.5 w-1/2 rounded-full bg-gray-200" />
              <div className="h-4 w-1/3 rounded-full bg-gray-200" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
