import { apiClient, ApiClientError } from "./apiClient";
import type { Kitchen } from "../types/admin";

const TOKEN_KEY = "klh_guest_session";
const GUEST_HEADER = "X-Guest-Session";
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

function readStored(): StoredGuestSession | null {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredGuestSession;
    if (!parsed?.token || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isUsable(session: StoredGuestSession | null): session is StoredGuestSession {
  if (!session) return false;
  return new Date(session.expiresAt).getTime() - REFRESH_MARGIN_MS > Date.now();
}

export function clearGuestSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Dedupes concurrent mints so a page mounting several fetches only creates one session. */
let pendingMint: Promise<string> | null = null;

/**
 * Returns a usable guest session token, minting a new one via POST /guest/session when needed.
 * The token lives in sessionStorage so a refresh at the counter keeps the same order history.
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
        sessionStorage.setItem(
          TOKEN_KEY,
          JSON.stringify({ token: res.sessionToken, expiresAt: res.expiresAt } satisfies StoredGuestSession)
        );
        return res.sessionToken;
      })
      .finally(() => {
        pendingMint = null;
      });
  }

  return pendingMint;
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
