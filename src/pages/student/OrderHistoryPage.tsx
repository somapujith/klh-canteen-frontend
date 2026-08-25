import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { Navbar } from "../../components/Navbar";
import { useSSE, type OrderStatusDelta } from "../../hooks/useSSE";
import { formatOrderNumber } from "../../lib/orderNumber";

interface OrderSummary {
  id: string;
  status: string;
  totalAmount: string;
  orderNumber: number;
  createdAt: string;
  items: { quantity: number; menuItem: { name: string } }[];
}

export function OrderHistoryPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);

  const fetchOrders = useCallback(() => {
    return apiClient.get<OrderSummary[]>("/orders/my", token ?? undefined).then(setOrders);
  }, [token]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Status changes arrive fully described, so patch the row instead of refetching the list.
  useSSE(["ORDER_UPDATE"], {
    onDelta: (delta) => {
      if (delta.kind === "ORDER_STATUS") {
        const { orderId, status } = delta as OrderStatusDelta;
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
      } else {
        fetchOrders();
      }
    },
    onResync: () => fetchOrders(),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar title="Order History" backTo="/student" />
      <div className="max-w-lg mx-auto p-4 space-y-3">
        {orders.length === 0 && <p className="text-center text-gray-500 py-12">No orders yet.</p>}
        {orders.map((order) => (
          <Link
            key={order.id}
            to={`/student/order/${order.id}`}
            className="block bg-white rounded-2xl shadow-sm p-4 hover:shadow-md transition"
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="font-semibold text-brand-900 mr-2">#{formatOrderNumber(order.orderNumber)}</span>
                <span className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleString()}</span>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  order.status === "DELIVERED" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {order.status}
              </span>
            </div>
            <p className="text-sm mt-1 text-gray-700">
              {order.items.map((i) => `${i.menuItem.name} ×${i.quantity}`).join(", ")}
            </p>
            <p className="font-semibold text-brand-900 mt-1">₹{order.totalAmount}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
