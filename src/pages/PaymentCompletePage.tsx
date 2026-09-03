import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  clearPendingOrders,
  getPaymentState,
  pollPaymentUntilSettled,
  readPendingOrders,
  type PaymentAuth,
  type PaymentState,
} from "../lib/payments";
import { ensureGuestSession, hasUsableGuestSession } from "../lib/guestSession";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui";

/**
 * Where SafeUPI returns the student after its hosted payment page.
 *
 * Landing here proves the student came back. It does NOT prove they paid —
 * they may have cancelled on SafeUPI's last screen, or closed the app and
 * reopened the tab — so this page never reads an outcome from the URL. It asks
 * our backend, which in turn confirms against SafeUPI's Status API before
 * releasing anything. The URL is a signal to go and check, nothing more.
 *
 * It also has to work for someone arriving cold: a phone that switched apps
 * may reload this route from scratch, so everything needed is recovered from
 * the query string and stored session rather than from React state that did
 * not survive.
 */

function SpinnerIcon() {
  return (
    <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
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

type Phase = "checking" | "paid" | "failed" | "unknown";

export function PaymentCompletePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { token } = useAuth();

  const paymentId = params.get("payment");
  const [phase, setPhase] = useState<Phase>("checking");
  const [state, setState] = useState<PaymentState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const orderIdsRef = useRef<string[]>(readPendingOrders());

  /**
   * Credentials for the status call.
   *
   * A student carries a JWT; a walk-up guest carries their signed session,
   * which lives in localStorage precisely so a round trip through another site
   * cannot strand them. The guest token is resolved asynchronously below,
   * because ensureGuestSession() may have to mint one.
   */
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const isGuest = !token;

  useEffect(() => {
    if (token || !hasUsableGuestSession()) return;
    let cancelled = false;
    ensureGuestSession()
      .then((t) => !cancelled && setGuestToken(t))
      .catch(() => {
        /* handled by the no-credentials branch below */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const auth: PaymentAuth = token ? { token } : { guestSession: guestToken ?? undefined };

  const goToTokens = useCallback(() => {
    const ids = orderIdsRef.current;
    clearPendingOrders();
    if (ids.length > 0) {
      navigate(`${isGuest ? "/g/order" : "/student/order"}/${ids.join(",")}`, { replace: true });
    } else {
      // No remembered ids — storage was cleared, or this tab never placed the
      // order. History is the honest fallback: it lists the same orders.
      navigate(isGuest ? "/g/orders" : "/student/orders", { replace: true });
    }
  }, [isGuest, navigate]);

  useEffect(() => {
    if (!paymentId) {
      setPhase("unknown");
      setMessage("We could not tell which payment this was. Check your order history.");
      return;
    }
    // Still resolving a guest session — wait for the effect to re-run rather
    // than declaring the session dead on the first pass.
    if (!token && !guestToken) {
      if (hasUsableGuestSession()) return;
      setPhase("unknown");
      setMessage("Your session ended while you were paying. Sign in to see your order.");
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    // One immediate read first: the webhook usually lands while the student is
    // still on SafeUPI's page, so the common case is already settled and the
    // poll below never runs a second iteration.
    (async () => {
      try {
        const first = await getPaymentState(paymentId, auth, controller.signal);
        if (cancelled) return;
        setState(first);
        if (first.status !== "PENDING") {
          settle(first);
          return;
        }

        const settled = await pollPaymentUntilSettled(paymentId, auth, {
          signal: controller.signal,
          onUpdate: (next) => !cancelled && setState(next),
        });
        if (!cancelled) settle(settled);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Unknown, NOT failed. The money may well have gone through, and
        // telling a student their payment failed when it did not is the worst
        // thing this page could do.
        setPhase("unknown");
        setMessage(
          err instanceof Error
            ? err.message
            : "We could not confirm your payment. Check your order history before paying again.",
        );
      }
    })();

    function settle(final: PaymentState) {
      setState(final);
      if (final.status === "SUCCESS") {
        setPhase("paid");
        // Brief pause so the confirmation is seen rather than flashed past.
        setTimeout(() => !cancelled && goToTokens(), 1400);
      } else {
        setPhase("failed");
        clearPendingOrders();
      }
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
    // auth is derived per render; paymentId is what actually identifies the work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId, token, guestToken]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center flat-shadow">
        {phase === "checking" && (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-muted text-brand-600">
              <SpinnerIcon />
            </div>
            <h1 className="mt-4 text-base font-semibold text-gray-900">Confirming your payment</h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              This usually takes a few seconds. Please don't close this page.
            </p>
          </>
        )}

        {phase === "paid" && (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-50 text-success-600">
              <CheckIcon />
            </div>
            <h1 className="mt-4 text-base font-semibold text-gray-900">
              {state ? `₹${state.amount} paid` : "Payment received"}
            </h1>
            {state?.upiTxnId && (
              <p className="mt-1 text-xs text-gray-500">UPI reference {state.upiTxnId}</p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Your order is with the kitchen. Taking you to your token…
            </p>
          </>
        )}

        {phase === "failed" && (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-50 text-danger-600">
              <AlertIcon />
            </div>
            <h1 className="mt-4 text-base font-semibold text-gray-900">Payment not completed</h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {state?.status === "EXPIRED"
                ? "The payment window closed before the payment arrived."
                : "The payment was declined or cancelled."}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              Your items have been released and nothing was charged. If money did leave your
              account it will be returned by your bank.
            </p>
            <Button onClick={() => navigate(isGuest ? "/g" : "/student")} fullWidth className="mt-4">
              Back to the menu
            </Button>
          </>
        )}

        {phase === "unknown" && (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-muted text-gray-500">
              <AlertIcon />
            </div>
            <h1 className="mt-4 text-base font-semibold text-gray-900">
              We couldn't confirm your payment
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{message}</p>
            {/* Deliberately NOT offering "pay again" here: if the first payment
                did go through, a second one charges twice. History is where the
                truth is. */}
            <Button
              onClick={() => navigate(isGuest ? "/g/orders" : "/student/orders")}
              fullWidth
              className="mt-4"
            >
              See my orders
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
