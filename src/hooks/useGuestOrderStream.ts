import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureGuestSession } from "../lib/guestSession";
import { useGuestSSE, type OrderStatusDelta, type ResyncReason, type SSEDelta } from "./useSSE";

/**
 * Live order status for a walk-up guest.
 *
 * The counter is the one place in this app where the person waiting is
 * standing in front of the thing they are waiting for, and until now they were
 * the only user without a push: `/events/stream` took a JWT, a guest has no
 * account, and `EventSource` cannot send the `X-Guest-Session` header the rest
 * of the guest API uses. The stream now accepts that same signed session token
 * as `?guestToken=`, and this hook is what the guest screens consume.
 *
 * The hook reports `connected`. Callers keep their 5-second poll wired up and
 * run it ONLY while `connected` is false — so polling is the documented
 * fallback for a browser with no EventSource, a proxy that eats streams, or a
 * stream that dropped, rather than the default path.
 */
export interface UseGuestOrderStreamOptions {
  /** One of this session's orders changed status. Patch it in place. */
  onStatus: (delta: OrderStatusDelta) => void;
  /** Local state cannot be trusted — refetch from the REST API. */
  onResync: (reason: ResyncReason) => void;
}

export interface UseGuestOrderStreamResult {
  connected: boolean;
  supported: boolean;
  error: Error | null;
}

/**
 * Resolves the current guest session token for use in the stream URL.
 *
 * Always non-forcing. `ensureGuestSession()` returns the token already in
 * sessionStorage — the same one that placed the orders — and mints only when
 * there is none.
 *
 * It must never be asked to force a new session from here. A guest session IS
 * the guest's order history: minting a fresh one silently orphans every order
 * they have placed. Re-minting belongs to guestRequest(), which does it only
 * on an actual 401 from the REST API. `rereadKey` just re-reads storage, so if
 * guestRequest() has replaced an expired session since the last read, this
 * picks the new token up and the stream reconnects with it.
 */
function useGuestSessionToken(rereadKey: number): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureGuestSession()
      .then((value) => {
        if (!cancelled) setToken(value);
      })
      .catch(() => {
        // No session, no stream. The caller's polling fallback covers it, and
        // guestRequest() will mint one on its next call anyway.
        if (!cancelled) setToken(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rereadKey]);

  return token;
}

export function useGuestOrderStream(options: UseGuestOrderStreamOptions): UseGuestOrderStreamResult {
  const [rereadKey, setRereadKey] = useState(0);
  const token = useGuestSessionToken(rereadKey);

  // Callbacks are rebuilt every render; hold them in a ref so the identity of
  // the object handed to useGuestSSE stays stable and the stream is not torn
  // down and reopened on every parent render.
  const handlersRef = useRef(options);
  useEffect(() => {
    handlersRef.current = options;
  }, [options]);

  const onDelta = useCallback((delta: SSEDelta) => {
    if (delta?.kind === "ORDER_STATUS") handlersRef.current.onStatus(delta as OrderStatusDelta);
  }, []);

  const onResync = useCallback((reason: ResyncReason) => {
    handlersRef.current.onResync(reason);
  }, []);

  const sseOptions = useMemo(() => ({ onDelta, onResync }), [onDelta, onResync]);

  const { connected, error, supported } = useGuestSSE(token, ["ORDER_UPDATE"], sseOptions);

  /**
   * A guest session lasts four hours; a tablet left open at the counter will
   * outlive one, and EventSource closes for good on the resulting 401. When
   * that happens the polling fallback takes over, and its first 401 makes
   * guestRequest() mint a replacement session. Re-reading storage here picks
   * that replacement up and the stream comes back on the new token.
   *
   * If storage still holds the same token the URL is unchanged, so the stream
   * effect does not re-run — this cannot become a reconnect loop. And there is
   * nothing to re-read when the browser simply has no EventSource, so that
   * case stays on polling without touching the session at all.
   */
  useEffect(() => {
    if (!error || connected || !supported) return;
    setRereadKey((n) => n + 1);
  }, [error, connected, supported]);

  return { connected, supported, error };
}
