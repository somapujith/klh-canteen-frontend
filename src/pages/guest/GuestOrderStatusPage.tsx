import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { guestApi, type GuestOrder } from "../../lib/guestSession";
import { GuestNav } from "../../components/GuestNav";
import { GuestOrderCard } from "../../components/GuestOrderCard";
import { SkeletonLine } from "../../components/LoadingState";
import { Button, EmptyState } from "../../components/ui";
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

      <div className="mx-auto max-w-lg space-y-4 p-4">
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 rounded-2xl border border-danger-100 bg-danger-50 p-4 text-sm text-danger-700"
          >
            <div>
              <p className="font-semibold">Could not load your order</p>
              <p className="mt-0.5 leading-relaxed">{error}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => load(false)} className="shrink-0">
              Retry
            </Button>
          </div>
        )}

        {loading && orders.length === 0 ? (
          <StatusSkeleton />
        ) : orders.length === 0 ? (
          /* Loaded, and there is nothing here: a bad id in the URL, or a session
             that ended in another tab. The old screen sat on "Loading your
             order…" forever in this case. */
          <div className="rounded-2xl bg-surface flat-shadow">
            <EmptyState
              icon={<TicketIcon />}
              title="We could not find that order"
              description="Guest orders live in this browser tab only. If you reopened the page, the session may have ended."
              action={
                <Link
                  to="/g"
                  className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  Browse the menu
                </Link>
              }
            />
          </div>
        ) : (
          orders.map((order) => <GuestOrderCard key={order.id} order={order} />)
        )}

        {orders.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  connected ? "bg-success-600" : "bg-gray-300"
                }`}
                aria-hidden="true"
              />
              {connected
                ? "Live — updates as the kitchen works"
                : lastSyncedAt
                ? `Updated ${lastSyncedAt.toLocaleTimeString()}`
                : "Waiting for updates..."}
            </p>
            <Link
              to="/g"
              className="text-sm font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800"
            >
              Order more
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Shaped like the real ticket — token band, hero number, four-step rail, item
 * list — so the card lands where the skeleton was instead of shunting the page
 * on arrival. Pure CSS pulse, no timers.
 */
function StatusSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface flat-shadow" role="status" aria-live="polite">
      <span className="sr-only">Loading your order…</span>
      <div aria-hidden="true">
        <div className="border-b border-border bg-surface-muted px-5 pb-5 pt-4">
          <SkeletonLine className="h-3 w-28" />
          <div className="mt-3 h-14 w-40 animate-pulse rounded-xl bg-gray-200 sm:h-16" />
          <SkeletonLine className="mt-3 h-3.5 w-56" />
        </div>
        <div className="space-y-5 p-5">
          <SkeletonLine className="h-3.5 w-44" />
          <SkeletonLine className="h-8 w-full" />
          <div className="space-y-2 rounded-xl bg-surface-muted p-3">
            <SkeletonLine className="h-3.5 w-3/5" />
            <SkeletonLine className="h-3.5 w-2/5" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TicketIcon() {
  return (
    <svg className="h-7 w-7" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 8.25V6.5h16v1.75a2.25 2.25 0 000 4.5V17.5H4v-4.75a2.25 2.25 0 000-4.5Z"
      />
      <path strokeLinecap="round" strokeDasharray="1.5 2.5" d="M12 7.5v9" />
    </svg>
  );
}
