import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";
import { formatOrderNumber } from "../../lib/orderNumber";
import {
  customerDetail,
  customerLabel,
  isCancelled,
  statusStyle,
  type AdminOrderBase,
  type OrdersEnvelope,
} from "../../lib/adminOrders";

/**
 * The order history.
 *
 * Three things this page used to get wrong, all of them worth naming because
 * they are easy to reintroduce:
 *
 *  1. It read `order.student.name`. That field is NULL on every walk-up guest
 *     order, so one guest order in the history threw the whole page into the
 *     ErrorBoundary. It reads `customer` now, like the board.
 *  2. It fetched `/admin/orders` with no limit and rendered every result. The
 *     endpoint is cursor-paginated; this now walks it a page at a time.
 *  3. It fetched without `active=false`, which is the ONLY way to ask the
 *     endpoint for delivered orders — so a page titled "complete history" was
 *     showing live work only and never a single completed order.
 */

interface LogOrder extends AdminOrderBase {
  items: { quantity: number; priceAtOrder: string; menuItem: { name: string } }[];
}

const PAGE_SIZE = 25;

/** `active=false` is what opens the history up to delivered and cancelled orders. */
function ordersUrl(cursor: string | null): string {
  const params = new URLSearchParams({
    format: "envelope",
    active: "false",
    limit: String(PAGE_SIZE),
  });
  if (cursor) params.set("cursor", cursor);
  return `/admin/orders?${params.toString()}`;
}

export function AdminLogsPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<LogOrder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFirstPage = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    apiClient
      .get<OrdersEnvelope<LogOrder>>(ordersUrl(null), token)
      .then((page) => {
        setOrders(page.data);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load orders"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(fetchFirstPage, [fetchFirstPage]);

  function loadMore() {
    if (!token || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    apiClient
      .get<OrdersEnvelope<LogOrder>>(ordersUrl(nextCursor), token)
      .then((page) => {
        // Append. A cursor walk must never discard the pages already on screen.
        setOrders((prev) => [...prev, ...page.data]);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load more orders"))
      .finally(() => setLoadingMore(false));
  }

  return (
    <div className="min-h-screen bg-surface-muted pb-12">
      <AdminNav />
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order Logs</h1>
          <p className="text-gray-500 mt-1">Complete history of all canteen orders, newest first.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-center justify-between gap-4">
            <span>{error}</span>
            <button onClick={fetchFirstPage} className="underline font-medium shrink-0">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-36 rounded-2xl bg-gray-200 animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-surface rounded-2xl p-12 text-center flat-shadow border border-gray-100">
            <p className="text-gray-500">No orders found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const badge = statusStyle(order.status);
              const cancelled = isCancelled(order.status);
              const detail = customerDetail(order.customer);
              return (
                <div
                  key={order.id}
                  className={`bg-surface rounded-2xl p-4 sm:p-5 flat-shadow border border-gray-100 flex flex-col sm:flex-row gap-4 justify-between ${
                    cancelled ? "opacity-70" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-lg text-gray-900">
                        #{formatOrderNumber(order.orderNumber)}
                      </span>
                      <span className={`text-xs font-bold px-2 py-1 rounded-md tracking-wider uppercase ${badge.className}`}>
                        {badge.label}
                      </span>
                      {order.customer.type === "GUEST" && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 uppercase tracking-wide">
                          Guest
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mb-3">
                      <span className="font-medium text-gray-700">{customerLabel(order.customer)}</span>
                      {detail && <span> ({detail})</span>}
                      <span className="mx-2">•</span>
                      {new Date(order.createdAt).toLocaleString()}
                    </div>
                    <div className="space-y-1">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="text-sm text-gray-700">
                          {item.quantity}x {item.menuItem.name}{" "}
                          <span className="text-gray-400 ml-1">(₹{item.priceAtOrder})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col sm:items-end justify-between border-t sm:border-t-0 sm:border-l border-gray-100 pt-3 sm:pt-0 sm:pl-4">
                    <div className="text-sm text-gray-500 font-medium">Total</div>
                    <div className={`text-2xl font-bold ${cancelled ? "text-gray-400 line-through" : "text-brand-600"}`}>
                      ₹{order.totalAmount}
                    </div>
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full rounded-2xl bg-surface border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-surface-hover disabled:opacity-50 transition flat-shadow"
              >
                {loadingMore ? "Loading…" : "Load older orders"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
