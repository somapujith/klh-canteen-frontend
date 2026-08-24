import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { Navbar } from "../../components/Navbar";
import { formatOrderNumber } from "../../lib/orderNumber";

interface OrderDetail {
  id: string;
  status: string;
  totalAmount: string;
  qrDataUrl?: string;
  token: string;
  orderNumber: number;
  kitchen: string;
  items: { quantity: number; menuItem: { name: string } }[];
}

export function OrderQrPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [orders, setOrders] = useState<OrderDetail[]>([]);

  useEffect(() => {
    if (!id) return;
    const ids = id.split(",");
    Promise.all(
      ids.map(orderId => apiClient.get<OrderDetail>(`/orders/${orderId}`, token ?? undefined))
    ).then(setOrders).catch(console.error);
  }, [id, token]);

  if (orders.length === 0) return <div className="p-8 text-center text-gray-500">Loading order...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar title="Your Order" />
      <div className="max-w-sm mx-auto p-4 text-center space-y-6">
        {orders.map(order => (
          <div key={order.id} className="space-y-4 bg-gray-100 p-4 rounded-3xl">
            <h2 className="text-lg font-bold text-gray-900 tracking-wide uppercase">{order.kitchen} TOKEN</h2>
            <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
              <p className="text-sm text-gray-500">Show this QR at the {order.kitchen.toLowerCase()} counter</p>
              {order.qrDataUrl && <img src={order.qrDataUrl} alt={`${order.kitchen} QR code`} className="mx-auto rounded-xl" />}
              <p className="text-2xl font-bold text-brand-900 tracking-wider">#{formatOrderNumber(order.orderNumber)}</p>
              <span
                className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                  order.status === "DELIVERED" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {order.status}
              </span>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-4 text-left">
              {order.items.map((line, idx) => (
                <div key={idx} className="flex justify-between py-1 text-sm">
                  <span>{line.menuItem.name} × {line.quantity}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 mt-2 border-t font-semibold">
                <span>Total</span>
                <span>₹{order.totalAmount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
