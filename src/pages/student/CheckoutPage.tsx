import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useToast } from "../../context/ToastContext";
import { Navbar } from "../../components/Navbar";
import { orderErrorMessage } from "../../lib/collectionWindows";

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

  async function handlePay() {
    setPlacing(true);
    setError(null);
    try {
      const orders = await apiClient.post<OrderResponse[]>(
        "/orders",
        { items: items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty })) },
        token ?? undefined
      );
      clear();
      showToast("Order placed successfully!", "success");
      navigate(`/student/order/${orders.map((o) => o.id).join(",")}`, { replace: true });
    } catch (err) {
      setError(orderErrorMessage(err, "Payment failed"));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-muted">
      <Navbar title="Checkout" />
      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {items.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <p className="text-gray-500">Your cart is empty.</p>
            <button
              onClick={() => navigate("/student")}
              className="rounded-xl bg-brand-600 text-white px-5 py-2.5 font-semibold hover:bg-brand-700 transition"
            >
              Browse the menu
            </button>
          </div>
        )}
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
