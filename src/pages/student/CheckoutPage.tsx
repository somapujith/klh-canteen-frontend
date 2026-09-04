import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { useCart, type CartLine } from "../../context/CartContext";
import { useToast } from "../../context/ToastContext";
import { Navbar } from "../../components/Navbar";
import { Button, EmptyState, Stepper } from "../../components/ui";
import { orderErrorMessage } from "../../lib/collectionWindows";
import { isPaymentsEnabled } from "../../lib/appConfig";
import { rememberPendingOrders, startPayment } from "../../lib/payments";
import { loadSafeUpiSdk } from "../../lib/safeUpiCheckout";
import type { Kitchen } from "../../types/admin";

interface OrderResponse {
  id: string;
}

/** Counter names as a student reads them on the wall, not the enum spelling. */
const KITCHEN_LABEL: Record<Kitchen, string> = {
  SNACKS: "Snacks counter",
  MEALS: "Meals counter",
};

function CartIcon() {
  return (
    <svg className="w-7 h-7" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M4 5h4l6 14h6M20 5h-6l-2 4.667"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 9v3.5m0 3.5h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
      />
    </svg>
  );
}

/**
 * One receipt line.
 *
 * The tile is a letterform, not a photo: `CartLine` carries no `imageUrl` /
 * `imageHash`, so handing MenuCardImage a cart line would render its
 * "no picture" placeholder on every row — an identical column of grey squares
 * that costs vertical space and communicates nothing. A letter at least tells
 * two lines apart at a glance. Restore the real thumbnail by widening CartLine
 * to carry the image ref the menu already has; this component is ready for it.
 */
function LineRow({
  line,
  index,
  onUpdateQty,
  onRemove,
  listRef,
  fallbackFocusRef,
}: {
  line: CartLine;
  index: number;
  onUpdateQty: (menuItemId: string, qty: number) => void;
  onRemove: (menuItemId: string) => void;
  listRef: React.RefObject<HTMLUListElement | null>;
  fallbackFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  /**
   * Removing a line unmounts the button that has focus, and focus falls back to
   * <body>. Hand it to a live neighbour instead — same pattern, and the same
   * reason, as CartBar.handleDecrease.
   */
  function handleRemove() {
    // Query the wrappers, then take each one's first button: Stepper owns its
    // own markup and does not forward stray data-* attributes onto the control,
    // so marking the wrapper is the only hook available. Grabbing the wrapper
    // itself would be useless — focus() on a <div> is a no-op.
    const wraps = listRef.current?.querySelectorAll<HTMLElement>("[data-checkout-step]");
    const neighbourWrap = wraps?.[index + 1] ?? wraps?.[index - 1];
    const neighbour = neighbourWrap?.querySelector("button");
    onRemove(line.menuItemId);
    if (neighbour) neighbour.focus();
    else fallbackFocusRef.current?.focus();
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-muted text-sm font-semibold text-gray-500"
      >
        {line.name.charAt(0).toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-snug text-gray-900">{line.name}</p>
        <p className="mt-0.5 text-xs text-gray-500 tabular-nums">₹{line.price.toFixed(2)} each</p>
      </div>

      {/* data-checkout-step marks the control the neighbour-focus lookup walks. */}
      <div data-checkout-step>
        <Stepper
          qty={line.qty}
          max={line.stockQty}
          itemName={line.name}
          onChange={(next) => onUpdateQty(line.menuItemId, next)}
          onRemove={handleRemove}
        />
      </div>

      <span className="w-16 shrink-0 text-right text-sm font-semibold text-gray-900 tabular-nums">
        ₹{(line.price * line.qty).toFixed(2)}
      </span>
    </li>
  );
}

export function CheckoutPage() {
  const { token } = useAuth();
  const { items, updateQty, removeItem, total, clear } = useCart();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const payRef = useRef<HTMLButtonElement>(null);

  const [paymentsOn, setPaymentsOn] = useState<boolean | null>(null);

  // Asked once on mount so the pay button's label is correct before it is
  // pressed, rather than the flow changing shape underneath the student.
  useEffect(() => {
    let cancelled = false;
    isPaymentsEnabled().then((on) => {
      if (!cancelled) setPaymentsOn(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const itemCount = useMemo(() => items.reduce((sum, line) => sum + line.qty, 0), [items]);

  /**
   * The backend splits a cart into one order per kitchen, which is why handlePay
   * receives an ARRAY of orders and joins their ids. A student who ordered
   * "one dosa and one samosa" and lands on a token page showing two tokens
   * should have been told that before paying, not after.
   */
  const kitchens = useMemo(() => {
    const seen = new Set<Kitchen>();
    for (const line of items) if (line.kitchen) seen.add(line.kitchen);
    return [...seen];
  }, [items]);

  /**
   * Places the order, then sends the student to SafeUPI to pay.
   *
   * Two steps rather than one, and in this order on purpose: the order is
   * written and its stock reserved BEFORE any money is involved, so a student
   * can never be charged for food that sold out while they were paying.
   *
   * The cart is deliberately NOT cleared before leaving. If the student
   * abandons SafeUPI's page or the payment fails, they come back to a checkout
   * exactly as they left it, with something to retry. Only a confirmed payment
   * clears it — and that happens on the completion page, after the server has
   * verified the money with SafeUPI.
   */
  async function handlePay() {
    setPlacing(true);
    setError(null);
    try {
      const orders = await apiClient.post<OrderResponse[]>(
        "/orders",
        { items: items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty })) },
        token ?? undefined
      );
      const orderIds = orders.map((o) => o.id);

      // Payments off: the order stands on its own, exactly as before.
      if (!paymentsOn) {
        clear();
        showToast("Order placed successfully!", "success");
        navigate(`/student/order/${orderIds.join(",")}`, { replace: true });
        return;
      }

      const session = await startPayment(orderIds, { token: token ?? undefined });

      // Remembered before navigating away, because this component is about to
      // be torn down by a full page load and its state goes with it.
      rememberPendingOrders(orderIds);

      const completeUrl = `${window.location.origin}/payment/complete?payment=${session.paymentId}`;

      if (session.checkout) {
        try {
          await loadSafeUpiSdk(session.checkout.sdkUrl);
          window.SafeUPI!.open({
            token: session.checkout.token,
            returnUrl: completeUrl,
            // SafeUPI's docs: onClose fires after onSuccess/onFailure/onCancel
            // too, so it is the one place that always runs no matter how the
            // modal exits — including a bare manual close with no other
            // callback. Navigating to the completion page here (rather than
            // trusting any callback payload) is what keeps the backend's own
            // Status API check the only source of truth for fulfillment.
            onClose: () => navigate(completeUrl),
          });
          return;
        } catch {
          // SDK failed to load (network hiccup, ad blocker) — fall through to
          // the hosted-page redirect below.
        }
      }

      // A real navigation, not a router push: SafeUPI's page is another origin.
      // `replace` keeps the checkout out of history, so the browser Back button
      // from SafeUPI does not land on a stale cart that has already been ordered.
      window.location.replace(session.paymentUrl);
    } catch (err) {
      // A checkout that failed after the orders were written leaves them
      // awaiting payment; the backend releases them, so the cart is still good.
      setError(orderErrorMessage(err, "Could not start your payment"));
      setPlacing(false);
    }
    // No `finally`: on the success path this component is being replaced by a
    // page load, and clearing `placing` there would flash the button back to
    // its resting state while the browser is already navigating.
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-surface-muted">
        <Navbar title="Checkout" backTo="/student" />
        <div className="mx-auto max-w-lg p-4">
          <div className="rounded-2xl bg-surface flat-shadow">
            <EmptyState
              icon={<CartIcon />}
              title="Your cart is empty"
              description="Add something from the menu and it will show up here."
              action={<Button onClick={() => navigate("/student")}>Browse the menu</Button>}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <Navbar title="Checkout" backTo="/student" />

      <div className="mx-auto max-w-lg space-y-3 p-4">
        <section aria-labelledby="checkout-items" className="overflow-hidden rounded-2xl bg-surface flat-shadow">
          <h2
            id="checkout-items"
            className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500"
          >
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </h2>
          <ul ref={listRef} className="divide-y divide-border">
            {items.map((line, index) => (
              <LineRow
                key={line.menuItemId}
                line={line}
                index={index}
                onUpdateQty={updateQty}
                onRemove={removeItem}
                listRef={listRef}
                fallbackFocusRef={payRef}
              />
            ))}
          </ul>
        </section>

        <section aria-labelledby="checkout-summary" className="rounded-2xl bg-surface flat-shadow">
          <h2 id="checkout-summary" className="sr-only">
            Order summary
          </h2>

          <dl className="space-y-2 px-4 py-4 text-sm">
            <div className="flex justify-between text-gray-600">
              <dt>Items</dt>
              <dd className="tabular-nums">{itemCount}</dd>
            </div>
            <div className="flex justify-between text-gray-600">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">₹{total.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-gray-900">
              <dt>Total</dt>
              <dd className="tabular-nums">₹{total.toFixed(2)}</dd>
            </div>
          </dl>

          {/* Collection facts, stated before the pay button rather than only as a
              post-failure error. Both are true of the request this page actually
              sends: it omits `collectionAt`, so the order is for the current
              15-minute slot ("as soon as possible"), and the backend splits by
              kitchen. No slot picker is offered because nothing here books one —
              lib/collectionWindows exposes copy and formatting, not a chooser. */}
          <div className="space-y-2 border-t border-border px-4 py-3 text-xs leading-relaxed text-gray-600">
            <p className="flex items-start gap-2">
              <ClockIcon />
              <span>Collect from the counter once your token turns ready. Orders are prepared for the current slot.</span>
            </p>
            {kitchens.length > 1 && (
              <p className="flex items-start gap-2">
                <SplitIcon />
                <span>
                  Your cart spans two counters, so this becomes{" "}
                  <span className="font-semibold text-gray-800">{kitchens.length} separate orders</span> — one for the{" "}
                  {kitchens.map((k) => KITCHEN_LABEL[k].replace(" counter", "")).join(" and ")} counter. You will get a
                  token for each.
                </span>
              </p>
            )}
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
          >
            <AlertIcon />
            <div>
              <p className="font-semibold">Payment failed</p>
              <p className="mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Sticky, not fixed. CheckoutPage has no CartBar, so the pay bar can live
          in the page flow and needs no row in the index.css overlay stacking
          table. `z-30` keeps it above the scrolled card edges within its own
          stacking context only. */}
      <div className="sticky bottom-0 z-30 border-t border-border bg-surface/95 px-4 pb-safe pt-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-gray-500">Total</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums">₹{total.toFixed(2)}</p>
          </div>
          <Button
            ref={payRef}
            onClick={handlePay}
            loading={placing}
            size="lg"
            className="flex-1"
          >
            {placing ? "Processing" : paymentsOn ? "Pay by UPI" : "Place order"}
          </Button>
        </div>
      </div>
    </div>
  );
}
