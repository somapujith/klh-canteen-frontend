import { useCallback, useEffect, useState } from "react";
import { apiClient, ApiClientError } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";
import { useSSE } from "../../hooks/useSSE";

type OrderStatus = "PENDING" | "PREPARING" | "COOKED" | "DELIVERED";

interface BoardOrder {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  seenByAdmin: boolean;
  totalAmount: string;
  items: { quantity: number; menuItem: { name: string } }[];
  student: { name: string; rollNumber: string | null };
}

interface SelectedOrder extends BoardOrder {
  isLockedByOther?: boolean;
}

const STATUS_STEPS: { target: Exclude<OrderStatus, "PENDING">; label: string }[] = [
  { target: "PREPARING", label: "Order Preparing" },
  { target: "COOKED", label: "Order Cooked" },
  { target: "DELIVERED", label: "Collect it" },
];

const STATUS_ORDER: OrderStatus[] = ["PENDING", "PREPARING", "COOKED", "DELIVERED"];

function displayNumber(orderNumber: number): string {
  return String(orderNumber % 1000).padStart(3, "0");
}

export function AdminOrderBoardPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<SelectedOrder | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectLoading, setSelectLoading] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchOrders = useCallback(() => {
    return apiClient
      .get<BoardOrder[]>("/admin/orders?active=true", token ?? undefined)
      .then((data) => {
        setOrders(data);
        setListError(null);
      })
      .catch((err) => {
        setListError(err instanceof Error ? err.message : "Failed to load orders");
      });
  }, [token]);

  useEffect(() => {
    setLoading(true);
    fetchOrders().finally(() => setLoading(false));
  }, [fetchOrders]);

  useSSE(["ORDER_BOARD_UPDATE"], () => {
    fetchOrders();
  });

  async function handleSelectOrder(orderId: string) {
    setSelectedId(orderId);
    setSelectError(null);
    setSelectLoading(true);

    // Optimistically flip the box to green immediately, don't wait for refetch.
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, seenByAdmin: true } : o)));

    try {
      const order = await apiClient.get<SelectedOrder>(`/admin/orders/${orderId}`, token ?? undefined);
      setSelectedOrder(order);
    } catch (err) {
      setSelectError(err instanceof Error ? err.message : "Failed to load order");
    } finally {
      setSelectLoading(false);
    }
  }

  async function handleStatusChange(target: Exclude<OrderStatus, "PENDING">) {
    if (!selectedOrder) return;
    setUpdatingStatus(true);
    setSelectError(null);
    try {
      const updated = await apiClient.patch<SelectedOrder>(
        `/admin/orders/${selectedOrder.id}/status`,
        { status: target },
        token ?? undefined
      );

      if (target === "DELIVERED") {
        setOrders((prev) => prev.filter((o) => o.id !== selectedOrder.id));
        setSelectedOrder(null);
        setSelectedId(null);
      } else {
        setSelectedOrder(updated);
        setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: updated.status } : o)));
      }
    } catch (err) {
      setSelectError(
        err instanceof ApiClientError && err.status === 409
          ? "Order status changed elsewhere. Refreshing."
          : err instanceof Error
          ? err.message
          : "Failed to update status"
      );
      fetchOrders();
    } finally {
      setUpdatingStatus(false);
    }
  }

  const currentIndex = selectedOrder ? STATUS_ORDER.indexOf(selectedOrder.status) : -1;

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <AdminNav />

      <div className="max-w-6xl mx-auto p-4 sm:p-6 mt-4">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Kitchen Order Board</h1>
          <p className="text-gray-500 mt-1">Tap an order to view details and move it through the kitchen.</p>
        </div>

        {listError && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 mb-6 flex items-center justify-between">
            <span>{listError}</span>
            <button onClick={() => fetchOrders()} className="underline font-medium shrink-0 ml-4">
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left half: order grid */}
          <div>
            {loading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div key={idx} className="aspect-square rounded-3xl bg-gray-200 animate-pulse" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="bg-surface rounded-3xl p-12 text-center flat-shadow border border-gray-100">
                <p className="text-gray-500 font-medium">No active orders right now.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                {orders.map((order) => {
                  const isSelected = order.id === selectedId;
                  return (
                    <button
                      key={order.id}
                      onClick={() => handleSelectOrder(order.id)}
                      className={`aspect-square rounded-3xl flat-shadow hover-scale flex items-center justify-center transition-all font-black text-2xl sm:text-3xl ${
                        order.seenByAdmin
                          ? "bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                          : "bg-amber-400 text-amber-950 hover:bg-amber-300"
                      } ${isSelected ? "ring-4 ring-offset-2 ring-brand-500" : ""}`}
                    >
                      {displayNumber(order.orderNumber)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right half: selected order detail */}
          <div className="bg-surface rounded-3xl flat-shadow border border-gray-100 p-6 sm:p-8 min-h-[420px] flex flex-col">
            {!selectedOrder && !selectLoading && (
              <div className="flex-1 flex items-center justify-center text-center">
                <p className="text-gray-400 font-medium">Select an order to view its details.</p>
              </div>
            )}

            {selectLoading && !selectedOrder && (
              <div className="flex-1 flex items-center justify-center text-center">
                <p className="text-gray-400 font-medium animate-pulse">Loading order...</p>
              </div>
            )}

            {selectError && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 mb-4">{selectError}</div>
            )}

            {selectedOrder && (
              <div className="flex-1 flex flex-col gap-6">
                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black text-gray-900">#{displayNumber(selectedOrder.orderNumber)}</h2>
                    <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">{selectedOrder.status}</span>
                  </div>
                  <p className="text-gray-500 font-medium mt-1">
                    {selectedOrder.student.name}
                    {selectedOrder.student.rollNumber && (
                      <span className="text-gray-400"> · {selectedOrder.student.rollNumber}</span>
                    )}
                  </p>
                </div>

                {selectedOrder.isLockedByOther && (
                  <div className="bg-red-50 text-red-800 p-4 rounded-2xl font-bold text-center border-2 border-red-200">
                    Being handled by another admin
                  </div>
                )}

                <ul className="space-y-2 rounded-2xl bg-surface-muted p-4">
                  {selectedOrder.items.map((line, idx) => (
                    <li key={idx} className="flex items-center justify-between text-sm font-medium text-gray-700">
                      <span>{line.menuItem.name}</span>
                      <span className="text-gray-500">× {line.quantity}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col gap-3 mt-auto">
                  {STATUS_STEPS.map((step, idx) => {
                    const targetIndex = idx + 1;
                    const isCompleted = targetIndex <= currentIndex;
                    const isEnabled = targetIndex === currentIndex + 1;

                    return (
                      <button
                        key={step.target}
                        onClick={() => handleStatusChange(step.target)}
                        disabled={!isEnabled || updatingStatus}
                        className={`w-full py-6 rounded-2xl text-xl font-black transition-all flex items-center justify-center gap-3 ${
                          isCompleted
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                            : isEnabled
                            ? "bg-brand-600 hover:bg-brand-700 text-white flat-shadow hover-scale disabled:opacity-60"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        {isCompleted && <span aria-hidden="true">✓</span>}
                        {step.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
