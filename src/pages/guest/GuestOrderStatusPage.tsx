import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { guestApi, type GuestOrder } from "../../lib/guestSession";
import { GuestNav } from "../../components/GuestNav";
import { GuestOrderCard } from "../../components/GuestOrderCard";
import { useGuestOrderStream } from "../../hooks/useGuestOrderStream";

/**
 * FALLBACK ONLY. The primary transport is the live stream
 * (`GET /events/stream?guestToken=…`, see useGuestOrderStream): the kitchen
 * pushes each status change and this screen patches it in place.
 *
 * This timer runs only while that stream is NOT connected — a browser without
 * EventSource, a network that eats streamed responses, or a stream that
 * dropped and has not come back yet. Five seconds is short enough that the
 * degraded path is still usable at the counter.
 */
const POLL_INTERVAL_MS = 5_000;

export function GuestOrderStatusPage() {
  const { ids } = useParams();
  const [orders, setOrders] = useState<GuestOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const orderIds = (ids ?? "").split(",").filter(Boolean);
  const idKey = orderIds.join(",");

  // Kept in a ref so the polling effect doesn't restart when the data changes.
  const allCollectedRef = useRef(false);
  allCollectedRef.current = orders.length > 0 && orders.every((o) => o.status === "DELIVERED");

  const load = useCallback(
    async (isBackground: boolean) => {
      if (!idKey) return;
      if (!isBackground) setLoading(true);
      try {
        const fetched = await Promise.all(idKey.split(",").map((id) => guestApi.getOrder(id)));
        setOrders(fetched);
        setLastSyncedAt(new Date());
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load your order");
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [idKey]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  /**
   * Live push. An ORDER_UPDATE on this stream is, by construction, about one of
   * this guest session's own orders — the backend addresses the frame to the
   * session's namespaced subject id and to nothing else. The id check below is
   * therefore a screen filter (this route shows a subset of the session's
   * orders), not a security boundary.
   */
  const streamHandlers = useMemo(
    () => ({
      onStatus: (delta: { orderId: string; status: string; deliveredAt?: string | null }) => {
        setOrders((current) => {
          if (!current.some((o) => o.id === delta.orderId)) return current;
          return current.map((o) =>
            o.id === delta.orderId
              ? { ...o, status: delta.status as GuestOrder["status"] }
              : o
          );
        });
        setLastSyncedAt(new Date());
      },
      onResync: () => void load(true),
    }),
    [load]
  );

  const { connected } = useGuestOrderStream(streamHandlers);

  useEffect(() => {
    // Only while the stream is down. When it is up, the kitchen pushes.
    if (!idKey || connected) return;
    const timer = setInterval(() => {
      // Stop hammering the API once everything has been handed over.
      if (!allCollectedRef.current && document.visibilityState === "visible") load(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [idKey, load, connected]);

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <GuestNav title="Your order" backTo="/g" />

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
            <p className="text-gray-400 font-medium animate-pulse">Loading your order...</p>
          </div>
        ) : (
          orders.map((order) => <GuestOrderCard key={order.id} order={order} showQr />)
        )}

        {orders.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  connected ? "bg-emerald-500" : "bg-gray-300"
                }`}
                aria-hidden="true"
              />
              {connected
                ? "Live — updates as the kitchen works"
                : lastSyncedAt
                ? `Updated ${lastSyncedAt.toLocaleTimeString()}`
                : "Waiting for updates..."}
            </p>
            <Link to="/g" className="text-sm font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-4">
              Order more
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
