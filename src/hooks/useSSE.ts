import { useEffect, useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";

/**
 * Realtime layer for the v:2 event protocol.
 *
 * The backend now ships DATA-CARRYING events: every payload has `v: 2` and a
 * `deltas` array describing exactly what changed. Consumers patch local state
 * from those deltas instead of refetching whole collections — with ~120 live
 * orders on the board, refetching on every ping was the app's worst scaling bug.
 *
 * A full refetch is still the fallback, and the hook decides when it is needed:
 *   - SYNC_REQUIRED control event
 *   - a FULL_REFRESH delta (the backend's own "I can't describe this" signal)
 *   - any event missing `v: 2` (older backend, or an event we don't understand)
 *   - reconnecting after a dropped stream, where events may have been missed
 */

export type ResyncReason = "SYNC_REQUIRED" | "FULL_REFRESH" | "LEGACY_EVENT" | "RECONNECT";

/** Absolute stock level for one menu item. Never a diff. */
export interface StockDelta {
  kind: "STOCK";
  menuItemId: string;
  stockQty: number;
  isAvailable: boolean;
  kitchen: string;
}

/** Board-tile projection of a newly placed order. Has no line items — fetch detail on demand. */
export interface OrderCreatedDelta {
  kind: "ORDER_CREATED";
  orderId: string;
  order: {
    id: string;
    orderNumber: number;
    status: string;
    kitchen: string;
    totalAmount: string;
    itemCount: number;
    createdAt: string;
    studentId: string | null;
    studentName: string | null;
    rollNumber: string | null;
    guestName: string | null;
    collectionAt: string | null;
    seenByAdmin: boolean;
  };
}

export interface OrderStatusDelta {
  kind: "ORDER_STATUS";
  orderId: string;
  status: string;
  previousStatus?: string;
  orderNumber?: number;
  kitchen?: string;
  deliveredAt?: string | null;
}

export interface OrderSeenDelta {
  kind: "ORDER_SEEN";
  orderId: string;
  seenByAdmin: boolean;
  lockedByAdminId?: string | null;
}

/** A student asked to be told when a sold-out item is back. Admin-facing;
 *  `count` is the item's whole outstanding total, not an increment. */
export interface StockRequestDelta {
  kind: "STOCK_REQUEST";
  menuItemId: string;
  menuItemName: string;
  count: number;
  requestedAt: string;
}

export type SSEDelta =
  | StockDelta
  | OrderCreatedDelta
  | OrderStatusDelta
  | OrderSeenDelta
  | StockRequestDelta
  | { kind: string; [key: string]: unknown };

export interface SSEEventMeta {
  /** The event name, e.g. "ORDER_BOARD_UPDATE". */
  type: string;
  timestamp?: number;
  kitchen?: string;
  /** The whole parsed payload, for anything the typed deltas don't cover. */
  raw: Record<string, unknown>;
}

export interface UseSSEOptions {
  /** Called once per delta on a v:2 event. Patch local state here. */
  onDelta?: (delta: SSEDelta, meta: SSEEventMeta) => void;
  /** Called when local state can't be trusted and the consumer should refetch. */
  onResync?: (reason: ResyncReason) => void;
}

const CONTROL_EVENTS = ["HELLO", "SYNC_REQUIRED"];

/** False on the handful of browsers/webviews with no EventSource at all. */
export const SSE_SUPPORTED = typeof EventSource !== "undefined";

export interface UseSSEResult {
  error: Error | null;
  connected: boolean;
  /** False when this runtime has no EventSource — consumers must poll instead. */
  supported: boolean;
}

/**
 * The stream itself, independent of who is holding the credential.
 *
 * `streamUrl` already carries the caller's credential, because the two callers
 * carry different ones: a logged-in user passes `?token=<jwt>` and a walk-up
 * guest passes `?guestToken=<session>`. Everything downstream of the URL — the
 * v:2 delta handling, the resync rules, the reconnect semantics — is identical
 * for both, so it lives here once rather than being copied into a second hook
 * that would then drift.
 *
 * Passing `null` means "no credential yet"; no connection is opened and
 * `connected` stays false, which is what makes the caller's polling fallback
 * take over.
 */
function useEventStream(streamUrl: string | null, eventTypeKey: string, options: UseSSEOptions): UseSSEResult {
  const [error, setError] = useState<Error | null>(null);
  const [connected, setConnected] = useState(false);

  // Options are rebuilt on every render; keep them in a ref so the stream is
  // only torn down when the token or the subscribed event list actually changes.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (!streamUrl) return;
    if (!SSE_SUPPORTED) {
      setError(new Error("EventSource is not supported in this browser"));
      return;
    }

    const types = eventTypeKey ? eventTypeKey.split(",") : [];
    const eventSource = new EventSource(streamUrl);
    // A HELLO on a *reconnect* means we may have missed events while offline.
    let hasConnectedBefore = false;

    const resync = (reason: ResyncReason) => optionsRef.current.onResync?.(reason);

    eventSource.onopen = () => {
      setError(null);
      setConnected(true);
    };

    eventSource.onerror = (err) => {
      setConnected(false);
      // EventSource fires onerror on every routine reconnect too. Only surface a
      // real failure — otherwise a normal idle-timeout looks like a broken app.
      if (eventSource.readyState === EventSource.CLOSED) {
        console.error("SSE connection closed:", err);
        setError(new Error("SSE connection error"));
      }
    };

    const listeners: { type: string; listener: (e: MessageEvent) => void }[] = [];

    const subscribe = (type: string, listener: (e: MessageEvent) => void) => {
      eventSource.addEventListener(type, listener);
      listeners.push({ type, listener });
    };

    const parse = (event: MessageEvent): Record<string, unknown> | null => {
      try {
        return JSON.parse(event.data) as Record<string, unknown>;
      } catch (e) {
        console.error("Failed to parse SSE data", e);
        return null;
      }
    };

    subscribe("HELLO", (event) => {
      setConnected(true);
      const data = parse(event);
      // `resumed: true` means the backend replayed the gap for us — nothing missed.
      if (hasConnectedBefore && data?.resumed !== true) resync("RECONNECT");
      hasConnectedBefore = true;
    });

    subscribe("SYNC_REQUIRED", () => resync("SYNC_REQUIRED"));

    types
      .filter((type) => !CONTROL_EVENTS.includes(type))
      .forEach((type) => {
        subscribe(type, (event) => {
          const data = parse(event);
          if (!data) return;

          const deltas = data.deltas;
          if (data.v !== 2 || !Array.isArray(deltas)) {
            // v1 payload (or a v2 event with no delta list) — we can't patch, so refetch.
            resync("LEGACY_EVENT");
            return;
          }

          const meta: SSEEventMeta = {
            type,
            timestamp: typeof data.timestamp === "number" ? data.timestamp : undefined,
            kitchen: typeof data.kitchen === "string" ? data.kitchen : undefined,
            raw: data,
          };

          for (const delta of deltas as SSEDelta[]) {
            if (delta?.kind === "FULL_REFRESH") {
              resync("FULL_REFRESH");
              continue;
            }
            optionsRef.current.onDelta?.(delta, meta);
          }
        });
      });

    return () => {
      listeners.forEach(({ type, listener }) => eventSource.removeEventListener(type, listener));
      eventSource.close();
      setConnected(false);
    };
  }, [streamUrl, eventTypeKey]);

  return { error, connected, supported: SSE_SUPPORTED };
}

/**
 * Realtime for a logged-in student or admin. Unchanged: same signature, same
 * `?token=` credential, same behaviour — it is now a thin wrapper over the
 * shared stream body above.
 */
export function useSSE(eventTypes: string[], options: UseSSEOptions): UseSSEResult {
  const { token } = useAuth();
  return useEventStream(
    token ? `${import.meta.env.VITE_API_URL}/events/stream?token=${token}` : null,
    eventTypes.join(","),
    options,
  );
}

/**
 * Realtime for a walk-up guest, who has no account and therefore no JWT.
 *
 * The credential is the signed guest session token, passed as `?guestToken=`
 * because `EventSource` cannot set request headers — the same reason the JWT
 * clients pass `?token=`. The backend verifies its HMAC and subscribes the
 * connection to exactly one subject: this session's own orders. A guest gets
 * ORDER_UPDATE for their own orders and MENU_UPDATE (the same public menu they
 * already fetch over GET /menu), and never any part of the kitchen board.
 */
export function useGuestSSE(
  guestToken: string | null,
  eventTypes: string[],
  options: UseSSEOptions,
): UseSSEResult {
  return useEventStream(
    guestToken
      ? `${import.meta.env.VITE_API_URL}/events/stream?guestToken=${encodeURIComponent(guestToken)}`
      : null,
    eventTypes.join(","),
    options,
  );
}
