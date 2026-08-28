import { apiClient, ApiClientError } from "./apiClient";
import type { Kitchen } from "../types/admin";

const TOKEN_KEY = "klh_guest_session";
const GUEST_HEADER = "X-Guest-Session";
/** Remembered alongside the token so the counter UI can show which account is
 *  signed in, and so a returning guest is not asked to sign in again. */
const IDENTITY_KEY = "klh_guest_identity";
/** Refresh a little early so a session can't expire mid-checkout. */
const REFRESH_MARGIN_MS = 60_000;

interface GuestSessionResponse {
  sessionToken: string;
  expiresAt: string;
  expiresInSeconds: number;
  header: string;
}

interface StoredGuestSession {
  token: string;
  expiresAt: string;
}

export interface GuestOrderLine {
  id: string;
  quantity: number;
  priceAtOrder: string;
  /**
   * Both image fields, mirroring `MenuItem` — an order line is a snapshot of a
   * menu item and must be resolvable through `menuImageSrc(line.menuItem,
   * line.menuItem.id)` like any other. Nothing renders it today (GuestOrderCard
   * lists names and quantities only), so the fields exist to keep the shape
   * honest rather than to feed a call site.
   */
  menuItem: { id: string; name: string; imageUrl: string | null; imageHash?: string | null };
}

export interface GuestOrder {
  id: string;
  orderNumber: number;
  status: "PENDING" | "PREPARING" | "COOKED" | "DELIVERED";
  kitchen: Kitchen;
  totalAmount: string;
  createdAt: string;
  collectionAt: string | null;
  guestName: string | null;
  guestPhone: string | null;
  items: GuestOrderLine[];
}

/**
 * localStorage, NOT sessionStorage — this is what keeps a guest's ticket
 * alive.
 *
 * sessionStorage is scoped to one tab and is wiped when that tab closes, so a
 * guest who closed the tab, reopened the site, or opened it in a second tab
 * got a brand-new session and their pending order vanished from "my orders"
 * — the order still existed and was still cooking, but the only key that
 * could read it back was gone. localStorage survives tab close and is shared
 * across tabs of the same origin, so the ticket is recoverable for as long as
 * the server-side token is valid (GUEST_SESSION_TTL_SECONDS, 4h — long enough
 * to cover a visit, short enough that an unattended phone isn't carrying a
 * live token for days).
 *
 * Both stores are read: any guest who is mid-visit right now still has their
 * token in the old location, and reading it once migrates them across without
 * losing the order they are currently waiting on.
 */
function readStored(): StoredGuestSession | null {
  const raw = safeGet(localStorage) ?? safeGet(sessionStorage);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredGuestSession;
    if (!parsed?.token || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Storage access throws rather than returning null in a locked-down browser
 * (Safari private mode, third-party-cookie blocking in an iframe, or a user
 * who has disabled site data), and an uncaught throw here would take down the
 * whole ordering page. Failing soft means the guest silently falls back to a
 * fresh in-memory session per page load — degraded, but still able to order.
 */
function safeGet(store: Storage): string | null {
  try {
    return store.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function safeSet(store: Storage, value: string): void {
  try {
    store.setItem(TOKEN_KEY, value);
  } catch {
    /* Storage unavailable or full — see safeGet. */
  }
}

function safeRemove(store: Storage): void {
  try {
    store.removeItem(TOKEN_KEY);
  } catch {
    /* Storage unavailable — see safeGet. */
  }
}

function isUsable(session: StoredGuestSession | null): session is StoredGuestSession {
  if (!session) return false;
  return new Date(session.expiresAt).getTime() - REFRESH_MARGIN_MS > Date.now();
}

export function clearGuestSession(): void {
  // Both stores: a guest mid-migration may still hold the old sessionStorage
  // copy, and clearing only one would leave a stale token that readStored()
  // would happily pick back up.
  safeRemove(localStorage);
  safeRemove(sessionStorage);
  try {
    localStorage.removeItem(IDENTITY_KEY);
  } catch {
    /* Storage unavailable — see safeGet. */
  }
}

/** Dedupes concurrent mints so a page mounting several fetches only creates one session. */
let pendingMint: Promise<string> | null = null;

/**
 * Returns a usable guest session token, minting a new one via POST /guest/session when needed.
 * The token lives in localStorage (see readStored) so closing the tab, reopening
 * the site, or opening a second tab all keep the same order history.
 */
export function ensureGuestSession(forceNew = false): Promise<string> {
  if (!forceNew) {
    const stored = readStored();
    if (isUsable(stored)) return Promise.resolve(stored.token);
  }

  if (!pendingMint) {
    pendingMint = apiClient
      .post<GuestSessionResponse>("/guest/session", {})
      .then((res) => {
        safeSet(
          localStorage,
          JSON.stringify({ token: res.sessionToken, expiresAt: res.expiresAt } satisfies StoredGuestSession)
        );
        // A stale copy in the old location would outlive this one and get
        // picked up by readStored() on a later visit.
        safeRemove(sessionStorage);
        return res.sessionToken;
      })
      .finally(() => {
        pendingMint = null;
      });
  }

  return pendingMint;
}

interface GoogleGuestSessionResponse extends GuestSessionResponse {
  email: string;
  name: string | null;
}

export interface GuestIdentity {
  email: string;
  name: string | null;
}

export function readGuestIdentity(): GuestIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestIdentity;
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * A remembered identity plus a session token that is still unexpired.
 *
 * Just checking `readGuestIdentity()` is not enough to skip the counter gate:
 * the identity label and the session token are two separate values with two
 * separate lifetimes, and a guest can return after the 4h session TTL has
 * lapsed while the identity label (which never expires) is still sitting in
 * storage. Letting them straight through on that stale label would only defer
 * the failure to the first `/guest/*` call, which is a worse place to
 * discover it than the gate.
 */
export function hasUsableGuestSession(): boolean {
  return readGuestIdentity() !== null && isUsable(readStored());
}

/**
 * Exchanges a Google ID token for a guest session whose id is stable for this
 * Google account.
 *
 * This is still a GUEST session — no account, no privileges, same endpoints.
 * The only thing it buys is durability: the server derives the session id from
 * the Google subject, so signing in on a new device or after clearing site
 * data recovers the SAME tickets instead of starting empty.
 *
 * The returned token replaces whatever anonymous session was in storage. Any
 * orders placed anonymously before signing in stay under the old session id
 * and are not migrated — see the note in the guest orders page.
 */
export async function signInGuestWithGoogle(idToken: string): Promise<GuestIdentity> {
  const res = await apiClient.post<GoogleGuestSessionResponse>("/guest/session/google", { idToken });
  safeSet(
    localStorage,
    JSON.stringify({ token: res.sessionToken, expiresAt: res.expiresAt } satisfies StoredGuestSession)
  );
  safeRemove(sessionStorage);
  const identity: GuestIdentity = { email: res.email, name: res.name };
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    /* Storage unavailable — the session still works, just without the label. */
  }
  return identity;
}

function isSessionRejection(err: unknown): boolean {
  return (
    err instanceof ApiClientError &&
    err.status === 401 &&
    (err.code === "INVALID_GUEST_SESSION" || err.code === "NO_GUEST_SESSION")
  );
}

/**
 * Calls a /guest/* endpoint with the X-Guest-Session header, minting a fresh
 * session and retrying once if the server rejects the current one.
 */
async function guestRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await ensureGuestSession();
  try {
    return await apiClient.request<T>(method, path, { body, headers: { [GUEST_HEADER]: token } });
  } catch (err) {
    if (!isSessionRejection(err)) throw err;
    const fresh = await ensureGuestSession(true);
    return apiClient.request<T>(method, path, { body, headers: { [GUEST_HEADER]: fresh } });
  }
}

export interface PlaceGuestOrderInput {
  guestName?: string;
  guestPhone?: string;
  items: { menuItemId: string; qty: number }[];
}

export const guestApi = {
  listOrders: () => guestRequest<GuestOrder[]>("GET", "/guest/orders"),
  getOrder: (id: string) => guestRequest<GuestOrder>("GET", `/guest/orders/${id}`),
  /** Returns one order per kitchen involved, mirroring POST /orders for students. */
  placeOrder: (input: PlaceGuestOrderInput) => guestRequest<GuestOrder[]>("POST", "/guest/orders", input),
};
