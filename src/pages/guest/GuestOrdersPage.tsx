import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { guestApi, type GuestOrder } from "../../lib/guestSession";
import { GuestNav } from "../../components/GuestNav";
import { GuestOrderCard } from "../../components/GuestOrderCard";
import { useGuestOrderStream } from "../../hooks/useGuestOrderStream";

/**
 * FALLBACK ONLY — see the note in GuestOrderStatusPage. The live stream is the
 * primary transport; this timer runs only while it is disconnected.
 */
const POLL_INTERVAL_MS = 8_000;

/** Everything ordered under the current guest session — cleared when the tab closes. */
export function GuestOrdersPage() {
  const [orders, setOrders] = useState<GuestOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read by the stream handler, which must not close over a stale render.
  const ordersRef = useRef<GuestOrder[]>([]);
  ordersRef.current = orders;

  const load = useCallback(async (isBackground: boolean) => {
    if (!isBackground) setLoading(true);
    try {
      setOrders(await guestApi.listOrders());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your orders");
    } finally {
      if (!isBackground) setLoading(false);
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
          current.map((o) =>
            o.id === delta.orderId ? { ...o, status: delta.status as GuestOrder["status"] } : o
          )
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

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <GuestNav title="My orders" backTo="/g" />

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-center justify-between gap-4">
            <span>{error}</span>
            <button onClick={() => load(false)} className="underline font-medium shrink-0">
              Retry
            </button>
          </div>
        )}

        {loading && orders.length === 0 ? (
          <div className="bg-surface rounded-2xl flat-shadow border border-gray-100 p-10 text-center">
            <p className="text-gray-400 font-medium animate-pulse">Loading your orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-surface rounded-2xl flat-shadow border border-gray-100 p-10 text-center space-y-4">
            <p className="text-gray-500 font-medium">You haven't ordered anything yet.</p>
            <Link
              to="/g"
              className="inline-block rounded-xl bg-brand-600 text-white px-5 py-2.5 font-semibold hover:bg-brand-700 transition"
            >
              Browse the menu
            </Link>
          </div>
        ) : (
          orders.map((order) => (
            <Link key={order.id} to={`/g/order/${order.id}`} className="block hover-scale">
              <GuestOrderCard order={order} />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
