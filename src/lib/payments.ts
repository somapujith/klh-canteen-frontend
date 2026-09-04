import { apiClient, ApiClientError } from "./apiClient";

/**
 * UPI payment client (SafeUPI, hosted checkout).
 *
 * Pairs with backend routes/payments.ts. The flow: place the order as normal
 * (written, holding stock, hidden from the kitchen), open a payment for it,
 * send the student to SafeUPI's hosted page, and confirm on their return.
 *
 * The backend is the only thing that decides whether a payment succeeded.
 * Landing back on the redirect URL proves the student came back — not that
 * they paid — so the completion page always asks the server, which in turn
 * confirms against SafeUPI's own Status API before releasing anything.
 */

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";

export interface PaymentSession {
  paymentId: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  expiresAt: string;
  /**
   * SafeUPI's hosted checkout page. Under the hosted flow this IS the payment
   * UI — the student is sent here and comes back to the redirect URL.
   */
  paymentUrl: string;
  /**
   * Returned only for selected SafeUPI businesses, so usually null. Never
   * depend on it; the hosted page renders its own QR regardless.
   */
  qrCode: string | null;
  /**
   * Drives SafeUPI's Embedded JS Checkout modal (see src/lib/safeUpiCheckout.ts).
   * `null` when SafeUPI doesn't return one for this business — callers fall
   * back to `paymentUrl`'s full-page redirect.
   */
  checkout: { token: string; sdkUrl: string; expiresAt: string } | null;
  orderIds: string[];
}

export interface PaymentState {
  id: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  expiresAt: string | null;
  paidAt: string | null;
  upiTxnId: string | null;
  payerVpa: string | null;
  failureReason: string | null;
  qrCode?: string | null;
}

/** Credentials for either caller: a signed-in student or a walk-up guest. */
export interface PaymentAuth {
  token?: string;
  guestSession?: string;
}

function authHeaders(auth: PaymentAuth): Record<string, string> {
  return auth.guestSession ? { "X-Guest-Session": auth.guestSession } : {};
}

/**
 * Opens a payment for orders already placed.
 *
 * The amount is not passed: the backend sums it from the order rows, so the
 * client cannot influence what is charged.
 */
export async function startPayment(
  orderIds: string[],
  auth: PaymentAuth,
): Promise<PaymentSession> {
  return apiClient.request<PaymentSession>("POST", "/payments/checkout", {
    body: { orderIds },
    token: auth.token,
    headers: authHeaders(auth),
  });
}

export async function getPaymentState(
  paymentId: string,
  auth: PaymentAuth,
  signal?: AbortSignal,
): Promise<PaymentState> {
  return apiClient.request<PaymentState>("GET", `/payments/${paymentId}`, {
    token: auth.token,
    headers: authHeaders(auth),
    signal,
  });
}

/** How often to ask the backend whether the money arrived. Two seconds feels
 *  immediate on the completion page without spending the status endpoint's
 *  rate limit before the window closes. */
const POLL_INTERVAL_MS = 2000;

/** Consecutive network failures tolerated before giving up. A dropped request
 *  mid-payment is common on campus wifi and must not be reported as a failed
 *  payment — the money may well have gone through. */
const MAX_CONSECUTIVE_ERRORS = 5;

export interface PollOptions {
  signal?: AbortSignal;
  /** Called on every state change, for progress UI. */
  onUpdate?: (state: PaymentState) => void;
}

/**
 * Polls until the payment reaches a terminal state, or the caller aborts.
 *
 * Resolves with whatever terminal state was reached — including FAILED and
 * EXPIRED, which are outcomes rather than errors and are for the caller to
 * present. It rejects only when the outcome is genuinely unknown: the poll was
 * aborted, or the network stayed down long enough that we cannot say what
 * happened. An unknown outcome must never be rendered as "payment failed",
 * because the student may have paid.
 */
export async function pollPaymentUntilSettled(
  paymentId: string,
  auth: PaymentAuth,
  options: PollOptions = {},
): Promise<PaymentState> {
  const { signal, onUpdate } = options;
  let consecutiveErrors = 0;
  let lastStatus: PaymentStatus | null = null;

  for (;;) {
    if (signal?.aborted) throw new DOMException("Payment polling aborted", "AbortError");

    try {
      const state = await getPaymentState(paymentId, auth, signal);
      consecutiveErrors = 0;

      if (state.status !== lastStatus) {
        lastStatus = state.status;
        onUpdate?.(state);
      }
      if (state.status !== "PENDING") return state;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;

      // A 404 means this payment is not ours or never existed; retrying will
      // not change that, and the session has nothing left to wait for.
      if (err instanceof ApiClientError && err.status === 404) throw err;

      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        throw new Error(
          "Lost contact with the server while confirming your payment. Check your order history before paying again.",
        );
      }
    }

    await delay(POLL_INTERVAL_MS, signal);
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Seconds left before the payment window closes, floored at zero.
 *
 * Derived from the server's `expiresAt` rather than counted down from when the
 * component mounted: a phone that sleeps — which is exactly what happens while
 * the student is away on SafeUPI's page — stops firing timers, and a countdown
 * keeping its own tally would come back claiming time that had already passed.
 */
export function secondsRemaining(expiresAt: string | null, now: number = Date.now()): number {
  if (!expiresAt) return 0;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - now) / 1000));
}

/** Where the orders a payment covers are remembered across the redirect. */
const PENDING_ORDERS_KEY = "klh.pendingPaymentOrders";

/**
 * Remembers which orders a payment covers, so the completion page can send the
 * student straight to their tokens after a full navigation away and back.
 *
 * sessionStorage rather than a URL parameter: order ids are not secrets, but
 * they have no business in a URL that SafeUPI, its logs and the browser's
 * history all get to see. Kept here rather than in the completion page so the
 * checkouts do not eagerly import a lazily-loaded route and defeat its
 * code-splitting.
 */
export function rememberPendingOrders(orderIds: string[]): void {
  try {
    sessionStorage.setItem(PENDING_ORDERS_KEY, JSON.stringify(orderIds));
  } catch {
    // Private window with storage disabled. The tokens are still reachable
    // from order history, so this is a convenience, not a requirement.
  }
}

export function readPendingOrders(): string[] {
  try {
    const raw = sessionStorage.getItem(PENDING_ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function clearPendingOrders(): void {
  try {
    sessionStorage.removeItem(PENDING_ORDERS_KEY);
  } catch {
    /* nothing to clear */
  }
}
