import { apiClient, ApiClientError } from "./apiClient";

/**
 * UPI payment client.
 *
 * Pairs with backend routes/payments.ts. The flow is: place the order as
 * normal (it is written and holding stock, but hidden from the kitchen), open
 * a payment for it, show the QR, then poll until the backend says the money
 * arrived. The backend is the only thing that decides whether a payment
 * succeeded — nothing here may conclude it from the UPI app's behaviour, since
 * a student returning to the tab proves nothing about whether they paid.
 */

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED";

export interface PaymentSession {
  paymentId: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  expiresAt: string;
  /** data:image/png;base64,... — render directly in an <img src>. */
  qrCode: string;
  /** upi://pay?... — the same payload the QR encodes, for a tap-to-pay link. */
  upiString: string;
  /** Per-app deep links (bhim_link, phonepe_link, paytm_link, gpay_link). */
  upiIntent: Record<string, string>;
  merchantUpiId: string | null;
  merchantName: string | null;
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
  qrCode?: string;
  upiString?: string;
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

/** How often to ask the backend whether the money arrived. Two seconds is
 *  frequent enough to feel immediate inside a two-minute window without
 *  spending the status endpoint's rate limit before the window closes. */
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
 * Seconds left before the QR stops being scannable, floored at zero.
 *
 * Derived from the server's `expiresAt` rather than counted down from when the
 * component mounted: a backgrounded phone stops firing timers, and a countdown
 * that kept its own tally would show time remaining on a QR that had already
 * lapsed.
 */
export function secondsRemaining(expiresAt: string | null, now: number = Date.now()): number {
  if (!expiresAt) return 0;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - now) / 1000));
}

/**
 * Whether this device can hand off to a UPI app directly.
 *
 * A phone can open `upi://` and pay in one tap; a desktop browser cannot, and
 * must show the QR to be scanned by a phone instead. Checked by pointer
 * capability rather than by user-agent sniffing.
 */
export function canUseUpiIntent(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}
