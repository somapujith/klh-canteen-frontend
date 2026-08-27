import { Link } from "react-router-dom";
import { formatOrderNumber } from "../../lib/orderNumber";

export interface ActiveOrder {
  id: string;
  status: string;
  orderNumber: number;
  kitchen: string;
  items: { quantity: number; menuItem: { name: string } }[];
}

/**
 * Kept here (not in the parent) so "what counts as active" has one
 * definition. An allow-list, not a deny-list of terminal statuses: a future
 * status the frontend doesn't know about (e.g. a REFUNDED added by a later
 * backend release) must default to "not active," not silently render as an
 * in-flight order forever.
 */
export const ACTIVE_ORDER_STATUSES = new Set(["PENDING", "PREPARING", "COOKED"]);

/** Only COOKED needs to grab attention — it's the one status that means "go collect it." */
const STATUS_PILL_CLASSES: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  PREPARING: "bg-amber-100 text-amber-700",
  COOKED: "bg-green-100 text-green-700",
};

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
 */
export function ActiveOrdersBanner({ orders }: { orders: ActiveOrder[] | null }) {
  if (orders === null) return null;

  const active = orders.filter((o) => ACTIVE_ORDER_STATUSES.has(o.status));

  if (active.length === 0) {
    return (
      <div className="bg-surface-muted rounded-xl p-4 text-center text-gray-500 text-sm">
        No active orders right now
      </div>
    );
  }

  const visible = active.slice(0, MAX_VISIBLE);
  const hiddenCount = active.length - visible.length;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">Active Orders</h2>
      {visible.map((order) => (
        <Link
          key={order.id}
          to={`/student/order/${order.id}`}
          className="block bg-surface rounded-2xl flat-shadow hover:flat-shadow-hover transition-all p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <div className="flex justify-between items-center">
            <div>
              <span className="font-semibold text-brand-900 mr-2">#{formatOrderNumber(order.orderNumber)}</span>
              <span className="text-xs text-gray-500 uppercase tracking-wide">{order.kitchen}</span>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_PILL_CLASSES[order.status]}`}>
              {order.status}
            </span>
          </div>
          <p className="text-sm mt-1 text-gray-700">
            {order.items.map((i) => `${i.menuItem.name} ×${i.quantity}`).join(", ")}
          </p>
        </Link>
      ))}
      {hiddenCount > 0 && (
        <Link
          to="/student/orders"
          className="block text-center text-sm font-medium text-brand-600 hover:text-brand-700 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-lg"
        >
          View all ({hiddenCount} more)
        </Link>
      )}
    </div>
  );
}
