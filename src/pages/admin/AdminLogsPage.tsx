import { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";

interface Order {
  id: string;
  orderNumber: number;
  status: "PENDING" | "DELIVERED";
  totalAmount: string;
  createdAt: string;
  student: {
    name: string;
    rollNumber: string;
  };
  items: {
    menuItem: { name: string };
    quantity: number;
    priceAtOrder: string;
  }[];
}

export function AdminLogsPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<Order[]>("/admin/orders", token ?? undefined)
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <AdminNav />
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order Logs</h1>
          <p className="text-gray-500 mt-1">Complete history of all canteen orders.</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500 animate-pulse">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <p className="text-gray-500">No orders found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4 justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-bold text-lg text-gray-900">#{order.orderNumber}</span>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-md tracking-wider ${
                        order.status === "DELIVERED" ? "bg-gray-100 text-gray-600" : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mb-3">
                    <span className="font-medium text-gray-700">{order.student.name}</span> ({order.student.rollNumber})
                    <span className="mx-2">•</span>
                    {new Date(order.createdAt).toLocaleString()}
                  </div>
                  <div className="space-y-1">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="text-sm text-gray-700">
                        {item.quantity}x {item.menuItem.name} <span className="text-gray-400 ml-1">(₹{item.priceAtOrder})</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col sm:items-end justify-between border-t sm:border-t-0 sm:border-l border-gray-100 pt-3 sm:pt-0 sm:pl-4">
                  <div className="text-sm text-gray-500 font-medium">Total</div>
                  <div className="text-2xl font-bold text-brand-600">₹{order.totalAmount}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
