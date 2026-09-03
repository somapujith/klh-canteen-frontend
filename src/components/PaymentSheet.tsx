import { useCallback, useEffect, useRef, useState } from "react";
import {
  canUseUpiIntent,
  pollPaymentUntilSettled,
  secondsRemaining,
  type PaymentAuth,
  type PaymentSession,
  type PaymentState,
} from "../lib/payments";
import { Button } from "./ui";

/**
 * The pay-by-UPI step.
 *
 * Shown after the orders are placed and holding stock, while the student
 * actually pays. It is a modal dialog rather than a page because there is
 * exactly one thing to do here and leaving mid-payment is the one action that
 * needs to be deliberate: the orders exist and the food is reserved, so
 * wandering off silently strands both until the window lapses.
 *
 * The component never decides the outcome itself. Returning from a UPI app
 * proves nothing — the student may have cancelled at the last screen, or paid
 * and had the callback dropped — so only the backend's polled status settles
 * it. That is also why there is no "I have paid" button: it would be a lie
 * dressed as a control.
 */

export interface PaymentSheetProps {
  session: PaymentSession;
  auth: PaymentAuth;
  /** The webhook confirmed the money. Orders are now live for the kitchen. */
  onPaid: (state: PaymentState) => void;
  /** Failed, expired, or abandoned — the orders have been released. */
  onFailed: (state: PaymentState | null, reason: string) => void;
  /** Student chose to walk away. The orders stay until the window lapses. */
  onDismiss: () => void;
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-8 w-8" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-8 w-8" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 9v3.5m0 3.5h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
      />
    </svg>
  );
}

/** mm:ss, because a bare "97 seconds left" is harder to read at a glance. */
function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Apps offered as one-tap handoffs, in the order students here actually use
 *  them. Keyed to the gateway's `upi_intent` field names. */
const UPI_APPS: { key: string; label: string }[] = [
  { key: "gpay_link", label: "Google Pay" },
  { key: "phonepe_link", label: "PhonePe" },
  { key: "paytm_link", label: "Paytm" },
  { key: "bhim_link", label: "BHIM" },
];

type Phase = "waiting" | "paid" | "failed";

export function PaymentSheet({ session, auth, onPaid, onFailed, onDismiss }: PaymentSheetProps) {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [remaining, setRemaining] = useState(() => secondsRemaining(session.expiresAt));
  const [finalState, setFinalState] = useState<PaymentState | null>(null);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const showIntent = canUseUpiIntent();

  /**
   * Recomputed from the server's `expiresAt` on every tick rather than
   * decremented, because a phone that sleeps — which is exactly what happens
   * when the student switches to their UPI app — stops firing timers. A
   * self-decrementing counter would come back still claiming a minute left on
   * a QR that had already lapsed.
   */
  useEffect(() => {
    if (phase !== "waiting") return;
    const tick = () => setRemaining(secondsRemaining(session.expiresAt));
    tick();
    const timer = setInterval(tick, 1000);
    // A backgrounded tab throttles intervals hard, so resync on return too.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [session.expiresAt, phase]);

  // Poll until the backend settles it. The abort controller is what stops the
  // poll when the sheet unmounts, so a dismissed payment does not keep asking.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    pollPaymentUntilSettled(session.paymentId, auth, { signal: controller.signal })
      .then((state) => {
        if (cancelled) return;
        setFinalState(state);
        if (state.status === "SUCCESS") {
          setPhase("paid");
          onPaid(state);
        } else {
          setPhase("failed");
          onFailed(state, describeFailure(state));
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // An abort is our own teardown, not a failure to report.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPhase("failed");
        onFailed(null, err instanceof Error ? err.message : "Could not confirm your payment.");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [session.paymentId, auth, onPaid, onFailed]);

  // Focus moves into the dialog on open so a keyboard or screen-reader user
  // starts inside it rather than behind it.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const requestExit = useCallback(() => {
    // Leaving a live payment is the one destructive action here, so it asks.
    // Once settled there is nothing to lose and it just closes.
    if (phase === "waiting") setConfirmingExit(true);
    else onDismiss();
  }, [phase, onDismiss]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") requestExit();
      if (event.key !== "Tab" || !panelRef.current) return;
      // Focus trap: the page behind is inert to a pointer but not to Tab, and
      // tabbing out of a payment dialog into a hidden checkout form is the
      // kind of thing that only ever surprises people.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [requestExit]);

  const expired = remaining <= 0 && phase === "waiting";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-gray-900/50 backdrop-blur-[2px] sm:items-center"
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        className="sheet-up w-full max-w-md rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="payment-title" className="text-sm font-semibold text-gray-900">
            {phase === "paid" ? "Payment received" : phase === "failed" ? "Payment not completed" : "Pay by UPI"}
          </h2>
          <button
            ref={closeRef}
            onClick={requestExit}
            aria-label="Close payment"
            className="grid h-11 w-11 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <svg className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {phase === "waiting" && (
          <div className="px-4 py-4">
            <div className="flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-wider text-gray-500">Amount</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">₹{session.amount}</p>
            </div>

            <div
              className={`mt-2 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold tabular-nums ${
                expired
                  ? "bg-danger-50 text-danger-700"
                  : remaining <= 30
                    ? "bg-danger-50 text-danger-700"
                    : "bg-surface-muted text-gray-600"
              }`}
              // Announced on a 30s cadence rather than every tick, so a screen
              // reader is not reading a stopwatch aloud.
              aria-live={remaining <= 30 && remaining % 10 === 0 ? "polite" : "off"}
            >
              <ClockIcon />
              {expired ? "This QR code has expired" : `Expires in ${formatCountdown(remaining)}`}
            </div>

            {!expired && (
              <>
                <div className="mt-4 flex justify-center">
                  {/* The gateway returns the QR as a data: URI, so there is no
                      network fetch here and nothing to fail after the sheet is
                      already open. */}
                  <img
                    src={session.qrCode}
                    alt={`UPI QR code to pay ₹${session.amount}`}
                    className="h-56 w-56 rounded-xl border border-border bg-white p-2"
                  />
                </div>

                <p className="mt-3 text-center text-xs leading-relaxed text-gray-600">
                  {showIntent
                    ? "Tap your UPI app below, or scan this code from another phone."
                    : "Scan with any UPI app — Google Pay, PhonePe, Paytm or BHIM."}
                </p>

                {showIntent && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {UPI_APPS.filter((app) => session.upiIntent[app.key]).map((app) => (
                      <a
                        key={app.key}
                        href={session.upiIntent[app.key]}
                        className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      >
                        {app.label}
                      </a>
                    ))}
                  </div>
                )}

                {/* Not a progress bar: we genuinely do not know how long the
                    student will take. It says what is happening and nothing more. */}
                <p className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />
                  Waiting for payment confirmation…
                </p>
                <p className="mt-1 text-center text-[11px] leading-relaxed text-gray-400">
                  Keep this open. Your order is confirmed automatically once the payment reaches us.
                </p>
              </>
            )}

            {expired && (
              <div className="mt-4 space-y-3">
                <p className="text-center text-sm leading-relaxed text-gray-600">
                  The payment window closed and your items have been released. Nothing was charged.
                </p>
                <Button onClick={onDismiss} fullWidth>
                  Back to cart
                </Button>
              </div>
            )}
          </div>
        )}

        {phase === "paid" && (
          <div className="px-4 py-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-50 text-success-600">
              <CheckIcon />
            </div>
            <p className="mt-3 text-base font-semibold text-gray-900">₹{session.amount} paid</p>
            {finalState?.upiTxnId && (
              <p className="mt-1 text-xs text-gray-500">UPI reference {finalState.upiTxnId}</p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Your order is with the kitchen. Your token is on the next screen.
            </p>
          </div>
        )}

        {phase === "failed" && (
          <div className="px-4 py-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-50 text-danger-600">
              <AlertIcon />
            </div>
            <p className="mt-3 text-base font-semibold text-gray-900">Payment not completed</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {finalState ? describeFailure(finalState) : "We could not confirm your payment."}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              Your items have been released and nothing was charged. If money did leave your
              account it will be returned by your bank.
            </p>
            <Button onClick={onDismiss} fullWidth className="mt-4">
              Back to cart
            </Button>
          </div>
        )}
      </div>

      {confirmingExit && (
        <div
          className="absolute inset-0 z-[61] flex items-center justify-center bg-gray-900/40 p-4"
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="abandon-title"
            className="w-full max-w-xs rounded-2xl bg-surface p-4 shadow-2xl"
          >
            <h3 id="abandon-title" className="text-sm font-semibold text-gray-900">
              Leave without paying?
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
              Your items are being held. If you leave, the order is cancelled and the food goes
              back on sale.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmingExit(false)} className="flex-1">
                Keep paying
              </Button>
              <Button variant="danger" onClick={onDismiss} className="flex-1">
                Leave
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Turns a terminal payment state into something worth reading. The gateway's
 *  own `failureReason` is operator language, so it is only used as a fallback. */
function describeFailure(state: PaymentState): string {
  if (state.status === "EXPIRED") {
    return "The payment window closed before the payment arrived.";
  }
  if (state.failureReason?.includes("amount mismatch")) {
    return "The amount paid did not match the order total, so the payment was refused.";
  }
  return "The payment was declined or cancelled.";
}
