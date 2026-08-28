import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { Navbar } from "../../components/Navbar";
import { SkeletonRow } from "../../components/LoadingState";
import { Badge, EmptyState } from "../../components/ui";
import { useSSE, type OrderStatusDelta } from "../../hooks/useSSE";
import { formatOrderNumber } from "../../lib/orderNumber";
import { isActiveStatus, statusPresentation } from "../../lib/orderStatus";

interface OrderSummary {
  id: string;
  status: string;
  totalAmount: string;
  orderNumber: number;
  createdAt: string;
  items: { quantity: number; menuItem: { name: string } }[];
}

type Filter = "ALL" | "ACTIVE" | "COMPLETED";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "ACTIVE", label: "Active" },
  { id: "COMPLETED", label: "Completed" },
];

/**
 * Day buckets are computed off local midnight, not off a 24h/48h delta from
 * now: an order placed at 11pm yesterday must say "Yesterday" when you look at
 * it at 9am today, which an hours-since comparison gets wrong.
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
    // A bare "12 Mar" is ambiguous once the history spans a year boundary.
    year: created.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function timeLabel(iso: string): string {
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return "";
  return created.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function OrderHistoryPage() {
  const { token } = useAuth();
  // `null` until the first fetch resolves, distinct from `[]` (loaded, genuinely
  // none) — the same distinction ActiveOrdersBanner documents. Collapsing the
  // two rendered "No orders yet" as a false claim for the whole loading window.
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [searchParams] = useSearchParams();
  // Arriving from the navbar's Active Orders button (?filter=active) should
  // land straight on that tab, not make the student re-select it every time.
  const initialFilter: Filter = searchParams.get("filter") === "active" ? "ACTIVE" : "ALL";
  const [filter, setFilter] = useState<Filter>(initialFilter);

  const fetchOrders = useCallback(() => {
    return apiClient.get<OrderSummary[]>("/orders/my", token ?? undefined).then(setOrders);
  }, [token]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Status changes arrive fully described, so patch the row instead of refetching the list.
  useSSE(["ORDER_UPDATE"], {
    onDelta: (delta) => {
      if (delta.kind === "ORDER_STATUS") {
        const { orderId, status } = delta as OrderStatusDelta;
        setOrders((prev) => prev?.map((o) => (o.id === orderId ? { ...o, status } : o)) ?? prev);
      } else {
        fetchOrders();
      }
    },
    onResync: () => fetchOrders(),
  });

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (filter === "ACTIVE") return orders.filter((o) => isActiveStatus(o.status));
    if (filter === "COMPLETED") return orders.filter((o) => !isActiveStatus(o.status));
    return orders;
  }, [orders, filter]);

  // Insertion order is preserved by Map, and the list arrives newest-first, so
  // the sections come out in the same order without a second sort.
  const groups = useMemo(() => {
    const byDay = new Map<string, OrderSummary[]>();
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
    <div className="min-h-screen bg-surface-muted fade-in">
      <Navbar title="Order History" backTo="/student" />
      <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-4">
        {/* Filters stay mounted through loading so the control row does not pop
            into place under the user's thumb when the fetch lands. */}
        <div
          role="tablist"
          aria-label="Filter orders"
          className="flex gap-1 rounded-2xl border border-border bg-surface p-1 flat-shadow"
        >
          {FILTERS.map(({ id, label }) => {
            const selected = filter === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(id)}
                className={`flex-1 min-h-10 rounded-xl px-4 text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                  selected
                    ? "bg-brand-600 text-white shadow-sm shadow-brand-500/30"
                    : "text-gray-500 hover:bg-surface-hover hover:text-gray-900"
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
                ? "No orders yet"
                : filter === "ACTIVE"
                  ? "Nothing in progress"
                  : "No completed orders"
            }
            description={
              filter === "ALL"
                ? "Your orders will show up here once you place one."
                : "Try a different filter, or start a new order."
            }
            action={
              <Link
                to="/student"
                className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                Browse the menu
              </Link>
            }
          />
        )}

        {!loading &&
          groups.map(([day, dayOrders]) => (
            <section key={day} className="mt-7 first:mt-6">
              <div className="mb-3 flex items-center gap-3 px-1">
                <h2 className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-gray-400">
                  {day}
                </h2>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-3">
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

/** Left accent rail colour, keyed off the same tone the status pill already uses. */
const RAIL_TONE_CLASSES: Record<string, string> = {
  neutral: "bg-gray-300",
  progress: "bg-warning-600",
  ready: "bg-success-600",
  done: "bg-gray-300",
  cancelled: "bg-danger-600",
};

function OrderRow({ order }: { order: OrderSummary }) {
  const { label, pillClass, tone } = statusPresentation(order.status);
  const summary = order.items.map((i) => `${i.menuItem.name} ×${i.quantity}`).join(", ");
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <Link
      to={`/student/order/${order.id}`}
      className="group relative flex overflow-hidden rounded-2xl border border-border bg-surface flat-shadow transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg hover:shadow-gray-900/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <span aria-hidden="true" className={`w-1.5 shrink-0 ${RAIL_TONE_CLASSES[tone]}`} />
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight tabular-nums text-gray-900">
                #{formatOrderNumber(order.orderNumber)}
              </span>
              <span className="text-xs font-medium text-gray-400">{timeLabel(order.createdAt)}</span>
            </div>
            <p className="mt-1 truncate text-sm text-gray-500">{summary}</p>
          </div>
          <Badge className={`${pillClass} shrink-0`}>{label}</Badge>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-3">
          <span className="text-xs font-medium text-gray-400">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          <span className="text-base font-bold tabular-nums text-gray-900">
            ₹{order.totalAmount}
          </span>
        </div>
      </div>
      <svg
        aria-hidden="true"
        className="mr-4 mt-4 h-4 w-4 shrink-0 self-start text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gray-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function ReceiptIcon() {
  return (
    <svg
      className="h-7 w-7"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 3.75h12v16.5l-2.25-1.5-2.25 1.5-2.25-1.5-2.25 1.5L6 18.75V3.75Z"
      />
      <path strokeLinecap="round" d="M9.75 8.25h4.5M9.75 12h4.5" />
    </svg>
  );
}
