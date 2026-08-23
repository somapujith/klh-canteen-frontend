import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useToast } from "../../context/ToastContext";
import { Navbar } from "../../components/Navbar";
import { CollectionWindowPicker } from "../../components/CollectionWindowPicker";
import { isCollectionWindowError, orderErrorMessage, type CollectionWindow } from "../../lib/collectionWindows";
import { kitchensInCart } from "../../lib/menu";
import type { Kitchen } from "../../types/admin";

interface OrderResponse {
  id: string;
}

export function CheckoutPage() {
  const { token } = useAuth();
  const { items, updateQty, removeItem, total, clear } = useCart();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectionAt, setCollectionAt] = useState<string | null>(null);
  const [windowRefresh, setWindowRefresh] = useState(0);

  // Cart lines carry the kitchen of the category they were added from. If that
  // hint is ever missing we show no slots rather than offering windows from a
  // kitchen the order won't go to — the order still goes through as ASAP.
  const kitchenKey = kitchensInCart(items).join(",");

  const fetchWindows = useCallback(
    (kitchen: Kitchen) =>
      apiClient.get<CollectionWindow[]>(`/orders/collection-windows?kitchen=${kitchen}`, token ?? undefined),
    [token]
  );

  const pickerKitchens = useMemo(
    () => (kitchenKey ? (kitchenKey.split(",") as Kitchen[]) : []),
    [kitchenKey]
  );

  async function handlePay() {
    setPlacing(true);
    setError(null);
    try {
      const orders = await apiClient.post<OrderResponse[]>(
        "/orders",
        {
          items: items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty })),
          ...(collectionAt ? { collectionAt } : {}),
        },
        token ?? undefined
      );
      clear();
      showToast("Order placed successfully!", "success");
      navigate(`/student/order/${orders.map((o) => o.id).join(",")}`, { replace: true });
    } catch (err) {
      setError(orderErrorMessage(err, "Payment failed"));
      // A rejected slot means our capacity view is stale — pull fresh numbers.
      if (isCollectionWindowError(err)) {
        setCollectionAt(null);
        setWindowRefresh((n) => n + 1);
      }
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <Navbar title="Checkout" />
      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {items.length === 0 && <p className="text-center text-gray-500 py-12">Your cart is empty.</p>}
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
                min={1}
                max={line.stockQty}
                value={line.qty}
                onChange={(e) => updateQty(line.menuItemId, Math.max(1, Number(e.target.value)))}
                className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-center"
              />
              <button onClick={() => removeItem(line.menuItemId)} className="text-red-600 text-sm">
                Remove
              </button>
            </div>
          </div>
        ))}

        {items.length > 0 && (
          <>
            <CollectionWindowPicker
              kitchens={pickerKitchens}
              fetchWindows={fetchWindows}
              value={collectionAt}
              onChange={setCollectionAt}
              disabled={placing}
              refreshKey={windowRefresh}
            />

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
