import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { Navbar } from "../../components/Navbar";

interface OrderDetail {
  id: string;
  status: string;
  totalAmount: string;
  qrDataUrl?: string;
  token: string;
  orderNumber: number;
  items: { quantity: number; menuItem: { name: string } }[];
}

export function OrderQrPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    apiClient.get<OrderDetail>(`/orders/${id}`, token ?? undefined).then(setOrder);
  }, [id, token]);

  if (!order) return <div className="p-8 text-center text-gray-500">Loading order...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar title="Your Order" />
      <div className="max-w-sm mx-auto p-6 text-center space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <p className="text-sm text-gray-500">Show this QR at the counter</p>
          {order.qrDataUrl && <img src={order.qrDataUrl} alt="Order QR code" className="mx-auto rounded-xl" />}
          <p className="text-2xl font-bold text-brand-900 tracking-wider">#{order.orderNumber}</p>
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
    </div>
  );
}
