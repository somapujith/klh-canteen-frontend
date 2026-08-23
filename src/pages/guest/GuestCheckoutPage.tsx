import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { guestApi } from "../../lib/guestSession";
import { orderErrorMessage } from "../../lib/collectionWindows";
import { GuestNav } from "../../components/GuestNav";
import { useGuestCart } from "../../hooks/useGuestCart";
import { useToast } from "../../context/ToastContext";

export function GuestCheckoutPage() {
  const { items, updateQty, removeItem, total, clear } = useGuestCart();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setPlacing(true);
    setError(null);
    try {
      const orders = await guestApi.placeOrder({
        items: items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty })),
        ...(guestName.trim() ? { guestName: guestName.trim() } : {}),
        ...(guestPhone.trim() ? { guestPhone: guestPhone.trim() } : {}),
      });
      clear();
      showToast("Order placed! Show your token at the counter.", "success");
      navigate(`/g/order/${orders.map((o) => o.id).join(",")}`, { replace: true });
    } catch (err) {
      setError(orderErrorMessage(err, "Could not place your order"));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <GuestNav title="Checkout" backTo="/g" />

      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {items.length === 0 ? (
          <div className="bg-surface rounded-2xl flat-shadow border border-gray-100 p-10 text-center space-y-4">
            <p className="text-gray-500 font-medium">Your cart is empty.</p>
            <button
              onClick={() => navigate("/g")}
              className="rounded-xl bg-brand-600 text-white px-5 py-2.5 font-semibold hover:bg-brand-700 transition"
            >
              Browse the menu
            </button>
          </div>
        ) : (
          <>
            {items.map((line) => (
              <div
                key={line.menuItemId}
                className="bg-surface rounded-2xl flat-shadow p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0"
              >
                <div>
                  <p className="font-medium">{line.name}</p>
                  <p className="text-sm text-gray-500">₹{line.price} each</p>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <input
                    type="number"
                    aria-label={`Quantity for ${line.name}`}
                    min={1}
                    max={line.stockQty}
                    value={line.qty}
                    onChange={(e) =>
                      updateQty(line.menuItemId, Math.min(line.stockQty, Math.max(1, Number(e.target.value))))
                    }
                    className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-center"
                  />
                  <button onClick={() => removeItem(line.menuItemId)} className="text-red-600 text-sm">
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <div className="bg-surface rounded-2xl flat-shadow border border-gray-100 p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold text-gray-800">Who is this for?</h2>
                <span className="text-xs font-medium text-gray-400">Optional</span>
              </div>
              <p className="text-sm text-gray-500 -mt-1">
                A name helps the counter call your order out. We never create an account.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</span>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    maxLength={60}
                    placeholder="e.g. Ravi"
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    maxLength={20}
                    placeholder="e.g. 9876543210"
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  />
                </label>
              </div>
            </div>

            <div className="bg-surface rounded-2xl flat-shadow p-4 space-y-3">
              <div className="flex justify-between font-semibold text-brand-900">
                <span>Total</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
              <button
                onClick={handlePay}
                disabled={placing}
                className="w-full rounded-xl bg-brand-600 text-white py-2.5 font-medium hover:bg-brand-700 disabled:opacity-50 transition"
              >
                {placing ? "Processing..." : "Pay Now (mock)"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
