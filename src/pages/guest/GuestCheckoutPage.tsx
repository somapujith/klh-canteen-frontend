import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ensureGuestSession, guestApi } from "../../lib/guestSession";
import { orderErrorMessage } from "../../lib/collectionWindows";
import { GuestNav } from "../../components/GuestNav";
import { Button, EmptyState, Stepper } from "../../components/ui";
import { isPaymentsEnabled } from "../../lib/appConfig";
import { rememberPendingOrders, startPayment } from "../../lib/payments";
import { loadSafeUpiSdk } from "../../lib/safeUpiCheckout";
import { useGuestCart, type GuestCartLine } from "../../hooks/useGuestCart";
import { useToast } from "../../context/ToastContext";
import type { Kitchen } from "../../types/admin";

/** Counter names as a guest reads them on the wall, not the enum spelling. */
const KITCHEN_LABEL: Record<Kitchen, string> = {
  SNACKS: "Snacks",
  MEALS: "Meals",
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
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 5h4l6 14h6M20 5h-6l-2 4.667" />
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
 * One receipt line, matching the student checkout row exactly.
 *
 * The tile is a letterform, not a photo: `GuestCartLine` carries no `imageUrl` /
 * `imageHash` (the sessionStorage cart stores id/name/price/qty/stock/kitchen
 * and nothing else), so handing MenuCardImage a cart line would render its
 * "no picture" placeholder on every row — an identical column of grey squares
 * that costs vertical space and communicates nothing. Same reasoning, and the
 * same resolution, as the student CheckoutPage. Restore the real thumbnail by
 * widening GuestCartLine to carry the image ref the menu already has; this
 * component is ready for it.
 */
function LineRow({
  line,
  index,
  onUpdateQty,
  onRemove,
  listRef,
  fallbackFocusRef,
}: {
  line: GuestCartLine;
  index: number;
  onUpdateQty: (menuItemId: string, qty: number) => void;
  onRemove: (menuItemId: string) => void;
  listRef: React.RefObject<HTMLUListElement | null>;
  fallbackFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  /**
   * Removing a line unmounts the button that has focus, and focus falls back to
   * <body>. Hand it to a live neighbour instead — same pattern, and the same
   * reason, as CartBar.handleDecrease and the student CheckoutPage.
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

export function GuestCheckoutPage() {
  const { items, updateQty, removeItem, total, clear } = useGuestCart();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const payRef = useRef<HTMLButtonElement>(null);

  const [paymentsOn, setPaymentsOn] = useState<boolean | null>(null);

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
   * The backend splits a cart into one order per kitchen, which is why
   * placeOrder resolves to an ARRAY and this page joins their ids. A guest who
   * ordered "one dosa and one samosa" and lands on a status page showing two
   * tokens should have been told that before paying, not after.
   */
  const kitchens = useMemo(() => {
    const seen = new Set<Kitchen>();
    for (const line of items) if (line.kitchen) seen.add(line.kitchen);
    return [...seen];
  }, [items]);

  /**
   * Places the order, then sends the guest to SafeUPI to pay.
   *
   * Same shape and same reasoning as the student checkout: the order is written
   * and its stock reserved before any money is involved, and the cart survives
   * an abandoned or failed payment so there is something to retry.
   */
  async function handlePay() {
    setPlacing(true);
    setError(null);
    try {
      const orders = await guestApi.placeOrder({
        items: items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty })),
        ...(guestName.trim() ? { guestName: guestName.trim() } : {}),
        ...(guestPhone.trim() ? { guestPhone: guestPhone.trim() } : {}),
      });
      const orderIds = orders.map((o) => o.id);

      if (!paymentsOn) {
        clear();
        showToast("Order placed! Show your token at the counter.", "success");
        navigate(`/g/order/${orderIds.join(",")}`, { replace: true });
        return;
      }

      // The payment endpoints authenticate a guest by the same signed session
      // the order was placed under, so it is read here rather than assumed —
      // placeOrder has already ensured one exists.
      const sessionToken = await ensureGuestSession();
      const session = await startPayment(orderIds, { guestSession: sessionToken });

      rememberPendingOrders(orderIds);

      const completeUrl = `${window.location.origin}/payment/complete?payment=${session.paymentId}`;

      if (session.checkout) {
        try {
          await loadSafeUpiSdk(session.checkout.sdkUrl);
          window.SafeUPI!.open({
            token: session.checkout.token,
            returnUrl: completeUrl,
            // See CheckoutPage.tsx's handlePay for why onClose alone is the
            // right (and only) hook here.
            onClose: () => navigate(completeUrl),
          });
          return;
        } catch {
          // SDK failed to load — fall through to the hosted-page redirect.
        }
      }

      window.location.replace(session.paymentUrl);
    } catch (err) {
      setError(orderErrorMessage(err, "Could not start your payment"));
      setPlacing(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-surface-muted fade-in">
        <GuestNav title="Checkout" backTo="/g" />
        <div className="mx-auto max-w-lg p-4">
          <div className="rounded-2xl bg-surface flat-shadow">
            <EmptyState
              icon={<CartIcon />}
              title="Your cart is empty"
              description="Add something from the menu and it will show up here."
              action={<Button onClick={() => navigate("/g")}>Browse the menu</Button>}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted fade-in">
      <GuestNav title="Checkout" backTo="/g" />

      <div className="mx-auto max-w-lg space-y-3 p-4">
        <section aria-labelledby="guest-checkout-items" className="overflow-hidden rounded-2xl bg-surface flat-shadow">
          <h2
            id="guest-checkout-items"
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

        <section aria-labelledby="guest-details" className="rounded-2xl bg-surface flat-shadow">
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
            <h2 id="guest-details" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Who is this for?
            </h2>
            <span className="text-xs font-medium text-gray-400">Optional</span>
          </div>
          <div className="space-y-3 px-4 py-4">
            <p className="text-sm leading-relaxed text-gray-500">
              A name helps the counter call your order out. We never create an account.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Name</span>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  maxLength={60}
                  placeholder="e.g. Ravi"
                  className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Phone</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  maxLength={20}
                  placeholder="e.g. 9876543210"
                  className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </label>
            </div>
          </div>
        </section>

        <section aria-labelledby="guest-checkout-summary" className="rounded-2xl bg-surface flat-shadow">
          <h2 id="guest-checkout-summary" className="sr-only">
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
              15-minute slot, and the backend splits by kitchen. No slot picker is
              offered because nothing here books one. */}
          <div className="space-y-2 border-t border-border px-4 py-3 text-xs leading-relaxed text-gray-600">
            <p className="flex items-start gap-2">
              <ClockIcon />
              <span>Pay at the counter, then collect once your token turns ready.</span>
            </p>
            {kitchens.length > 1 && (
              <p className="flex items-start gap-2">
                <SplitIcon />
                <span>
                  Your cart spans two counters, so this becomes{" "}
                  <span className="font-semibold text-gray-800">{kitchens.length} separate orders</span> — one for the{" "}
                  {kitchens.map((k) => KITCHEN_LABEL[k]).join(" and ")} counter. You will get a token for each.
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
              <p className="font-semibold">Could not place your order</p>
              <p className="mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Sticky, not fixed. This page has no CartBar, so the pay bar can live in
          the page flow and needs no row in the index.css overlay stacking table.
          `z-30` keeps it above the scrolled card edges within its own stacking
          context only. */}
      <div className="sticky bottom-0 z-30 border-t border-border bg-surface/95 px-4 pb-safe pt-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-gray-500">Total</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums">₹{total.toFixed(2)}</p>
          </div>
          <Button ref={payRef} onClick={handlePay} loading={placing} size="lg" className="flex-1">
            {placing ? "Processing" : paymentsOn ? "Pay by UPI" : "Place order"}
          </Button>
        </div>
      </div>
    </div>
  );
}
