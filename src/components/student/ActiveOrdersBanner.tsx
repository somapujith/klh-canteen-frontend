import { Link } from "react-router-dom";
import { formatOrderNumber } from "../../lib/orderNumber";
import { Badge } from "../ui";
import { ACTIVE_STATUSES, statusPresentation } from "../../lib/orderStatus";

export interface ActiveOrder {
  id: string;
  status: string;
  orderNumber: number;
  kitchen: string;
  items: { quantity: number; menuItem: { name: string } }[];
}

/**
 * Re-exported from lib/orderStatus so "what counts as active" has one
 * definition app-wide, rather than this file and the history page each keeping
 * their own copy. The name is kept because StudentMenuPage imports it from
 * here.
 *
 * Still an allow-list, not a deny-list of terminal statuses: a future status
 * the frontend doesn't know about (e.g. a REFUNDED added by a later backend
 * release) must default to "not active," not silently render as an in-flight
 * order forever. That reasoning now lives beside the set in lib/orderStatus.ts.
 */
export const ACTIVE_ORDER_STATUSES = ACTIVE_STATUSES;

const MAX_VISIBLE = 3;

/**
 * Presentational: StudentMenuPage owns the fetch and the single page-level
 * useSSE subscription (merged with MENU_UPDATE — see StudentMenuPage.tsx),
 * mirroring AdminDashboardPage's one-EventSource-per-page convention rather
 * than opening a second connection just for this banner.
 *
 * `orders` is `null` until the first fetch resolves, distinct from `[]`
 * (loaded, genuinely none) — collapsing the two used to render "No active
 * orders right now" as a false claim for the whole loading window.
 *
 * With nothing active this renders a single quiet line, not a full EmptyState
 * block. It sits above the food on the menu page, and the menu *is* the
 * browse-the-menu affordance an EmptyState would offer — a 12-line "you have no
 * orders, go browse the menu" card pushing the actual menu below the fold would
 * be the emptiest possible use of the most valuable space on the screen. The
 * line still carries a real link (to history), so it is no longer the inert
 * grey dead end it replaced. Returning `null` was the other candidate; the line
 * wins because the banner's absence is indistinguishable from it not having
 * loaded, and this states plainly that nothing is waiting for you.
 */
export function ActiveOrdersBanner({ orders }: { orders: ActiveOrder[] | null }) {
  if (orders === null) return null;

  const active = orders.filter((o) => ACTIVE_ORDER_STATUSES.has(o.status));

  if (active.length === 0) {
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-gray-500">
        No active orders.
        <Link
          to="/student/orders"
          className="rounded font-semibold text-brand-700 underline underline-offset-4 transition-colors hover:text-brand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          See past orders
        </Link>
      </p>
    );
  }

  const visible = active.slice(0, MAX_VISIBLE);
  const hiddenCount = active.length - visible.length;

  return (
    <div className="space-y-2.5">
      <h2 className="text-sm font-semibold text-gray-700">Active Orders</h2>
      {visible.map((order) => {
        const { label, pillClass } = statusPresentation(order.status);
        return (
          <Link
            key={order.id}
            to={`/student/order/${order.id}`}
            className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-semibold tabular-nums text-brand-900">
                  #{formatOrderNumber(order.orderNumber)}
                </span>
                <span className="ml-2 text-xs uppercase tracking-wide text-gray-500">{order.kitchen}</span>
              </div>
              <Badge className={pillClass}>{label}</Badge>
            </div>
            <p className="mt-1.5 truncate text-sm text-gray-600">
              {order.items.map((i) => `${i.menuItem.name} ×${i.quantity}`).join(", ")}
            </p>
          </Link>
        );
      })}
      {hiddenCount > 0 && (
        <Link
          to="/student/orders"
          className="flex min-h-11 items-center justify-center rounded-lg text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          View all ({hiddenCount} more)
        </Link>
      )}
    </div>
  );
}
