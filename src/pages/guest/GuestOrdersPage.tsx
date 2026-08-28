import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { guestApi, type GuestOrder } from "../../lib/guestSession";
import { GuestNav } from "../../components/GuestNav";
import { SkeletonRow } from "../../components/LoadingState";
import { Badge, Button, EmptyState } from "../../components/ui";
import { useGuestOrderStream } from "../../hooks/useGuestOrderStream";
import { formatOrderNumber } from "../../lib/orderNumber";
import { isActiveStatus, statusPresentation } from "../../lib/orderStatus";

/**
 * FALLBACK ONLY — see the note in GuestOrderStatusPage. The live stream is the
 * primary transport; this timer runs only while it is disconnected.
 */
const POLL_INTERVAL_MS = 8_000;

type Filter = "ALL" | "ACTIVE" | "COMPLETED";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "ACTIVE", label: "Active" },
  { id: "COMPLETED", label: "Completed" },
];

/**
 * Day buckets are computed off local midnight, not off a 24h delta from now —
 * the same reasoning, and the same code, as OrderHistoryPage. A guest session
 * rarely spans a day boundary, but it can (a tab left open overnight), and
 * "Yesterday" read at 9am must not depend on the hour it was placed.
 */
function dayLabel(iso: string): string {
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return "Earlier";

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(created)) / 86_400_000);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return created.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: created.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function timeLabel(iso: string): string {
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return "";
  return created.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Everything ordered under the current guest session — cleared when the tab closes. */
export function GuestOrdersPage() {
  // `null` until the first fetch resolves, distinct from `[]` (loaded, genuinely
  // none). Collapsing the two rendered the empty state as a false claim for the
  // whole loading window.
  const [orders, setOrders] = useState<GuestOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");

  // Read by the stream handler, which must not close over a stale render.
  const ordersRef = useRef<GuestOrder[]>([]);
  ordersRef.current = orders ?? [];

  const load = useCallback(async (isBackground: boolean) => {
    if (!isBackground) setOrders(null);
    try {
      setOrders(await guestApi.listOrders());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your orders");
      // Leaving `orders` at null here would strand the page on its skeleton
      // with the error card above it, promising rows that are never coming.
      if (!isBackground) setOrders([]);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  /**
   * Every ORDER_UPDATE on this stream belongs to this guest session. A status
   * for an order this list has never seen means the list itself is stale — an
   * order placed in another tab of the same session — so refetch rather than
   * inventing a row from a delta that carries no items or totals.
   */
  const streamHandlers = useMemo(
    () => ({
      onStatus: (delta: { orderId: string; status: string }) => {
        if (!ordersRef.current.some((o) => o.id === delta.orderId)) {
          void load(true);
          return;
        }
        setOrders((current) =>
          current?.map((o) =>
            o.id === delta.orderId ? { ...o, status: delta.status as GuestOrder["status"] } : o
          ) ?? current
        );
      },
      onResync: () => void load(true),
    }),
    [load]
  );

  const { connected } = useGuestOrderStream(streamHandlers);

  useEffect(() => {
    if (connected) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load, connected]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (filter === "ACTIVE") return orders.filter((o) => isActiveStatus(o.status));
    if (filter === "COMPLETED") return orders.filter((o) => !isActiveStatus(o.status));
    return orders;
  }, [orders, filter]);

  // Insertion order is preserved by Map, and the list arrives newest-first, so
  // the sections come out in the same order without a second sort.
  const groups = useMemo(() => {
    const byDay = new Map<string, GuestOrder[]>();
    for (const order of filtered) {
      const key = dayLabel(order.createdAt);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(order);
      else byDay.set(key, [order]);
    }
    return [...byDay];
  }, [filtered]);

  const loading = orders === null;

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <GuestNav title="My orders" backTo="/g" />

      <div className="mx-auto w-full max-w-lg px-4 pt-4">
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-danger-100 bg-danger-50 p-4 text-sm text-danger-700"
          >
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={() => load(false)} className="shrink-0">
              Retry
            </Button>
          </div>
        )}

        {/* Filters stay mounted through loading so the control row does not pop
            into place under the user's thumb when the fetch lands. */}
        <div role="tablist" aria-label="Filter orders" className="flex gap-2">
          {FILTERS.map(({ id, label }) => {
            const selected = filter === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(id)}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                  selected
                    ? "bg-brand-600 text-white"
                    : "border border-border bg-surface text-gray-600 hover:bg-surface-hover hover:text-gray-900"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="mt-5 space-y-3" role="status" aria-live="polite">
            <span className="sr-only">Loading your orders…</span>
            <div aria-hidden="true" className="space-y-3">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <EmptyState
            icon={<ReceiptIcon />}
            title={
              filter === "ALL"
                ? "You haven't ordered anything yet"
                : filter === "ACTIVE"
                  ? "Nothing in progress"
                  : "No completed orders"
            }
            description={
              filter === "ALL"
                ? "Orders you place at the counter show up here until you close this tab."
                : "Try a different filter, or start a new order."
            }
            action={
              <Link
                to="/g"
                className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                Browse the menu
              </Link>
            }
          />
        )}

        {!loading &&
          groups.map(([day, dayOrders]) => (
            <section key={day} className="mt-6 first:mt-5">
              <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                {day}
              </h2>
              <div className="space-y-2.5">
                {dayOrders.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}

/**
 * A compact row, not the full GuestOrderCard.
 *
 * This list used to stack one 76px-token ticket per order, so a guest with
 * three orders scrolled past three hero numbers to find the one they wanted —
 * the token is the right hero on the *status* page, where there is exactly one
 * order in view, and the wrong one in a list whose job is to let you pick.
 * The token still leads the row, just at reading size.
 */
function OrderRow({ order }: { order: GuestOrder }) {
  const { label, pillClass } = statusPresentation(order.status);
  const summary = order.items.map((line) => `${line.menuItem.name} ×${line.quantity}`).join(", ");

  return (
    <Link
      to={`/g/order/${order.id}`}
      className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-semibold tabular-nums text-brand-900">
            #{formatOrderNumber(order.orderNumber)}
          </span>
          <span className="ml-2 text-xs uppercase tracking-wide text-gray-500">{order.kitchen}</span>
          <span className="ml-2 text-xs text-gray-500">{timeLabel(order.createdAt)}</span>
        </div>
        <Badge className={pillClass}>{label}</Badge>
      </div>
      <p className="mt-1.5 truncate text-sm text-gray-600">{summary}</p>
      <p className="mt-1.5 font-semibold tabular-nums text-brand-900">₹{order.totalAmount}</p>
    </Link>
  );
}

function ReceiptIcon() {
  return (
    <svg className="h-7 w-7" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 3.75h12v16.5l-2.25-1.5-2.25 1.5-2.25-1.5-2.25 1.5L6 18.75V3.75Z"
      />
      <path strokeLinecap="round" d="M9.75 8.25h4.5M9.75 12h4.5" />
    </svg>
  );
}
