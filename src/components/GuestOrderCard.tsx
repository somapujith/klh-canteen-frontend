import type { GuestOrder } from "../lib/guestSession";
import { formatWindowTime } from "../lib/collectionWindows";

const STEPS: { status: GuestOrder["status"]; label: string }[] = [
  { status: "PENDING", label: "Placed" },
  { status: "PREPARING", label: "Preparing" },
  { status: "COOKED", label: "Ready" },
  { status: "DELIVERED", label: "Collected" },
];

const STATUS_COPY: Record<GuestOrder["status"], string> = {
  PENDING: "Sent to the kitchen",
  PREPARING: "Being made right now",
  COOKED: "Ready — collect it at the counter",
  DELIVERED: "Collected. Enjoy!",
};

export function GuestOrderCard({ order, showQr = false }: { order: GuestOrder; showQr?: boolean }) {
  const currentIndex = STEPS.findIndex((s) => s.status === order.status);
  const isReady = order.status === "COOKED";
  const isDone = order.status === "DELIVERED";

  return (
    <div className="bg-surface rounded-2xl flat-shadow border border-gray-100 overflow-hidden">
      <div
        className={`px-5 py-4 flex items-center justify-between gap-4 ${
          isReady ? "bg-emerald-50" : isDone ? "bg-surface-muted" : "bg-amber-50"
        }`}
      >
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{order.kitchen} token</p>
          <p className="text-3xl font-black text-gray-900 tracking-tight leading-tight">#{order.orderNumber}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
            isReady
              ? "bg-emerald-600 text-white"
              : isDone
              ? "bg-gray-200 text-gray-600"
              : "bg-amber-500 text-amber-950"
          }`}
        >
          {order.status}
        </span>
      </div>

      <div className="p-5 space-y-5">
        <p className="text-sm font-medium text-gray-600">{STATUS_COPY[order.status]}</p>

        <ol className="flex items-center gap-1" aria-label="Order progress">
          {STEPS.map((step, idx) => {
            const reached = idx <= currentIndex;
            return (
              <li key={step.status} className="flex-1 min-w-0">
                <div className={`h-1.5 rounded-full ${reached ? "bg-brand-600" : "bg-gray-200"}`} />
                <span
                  className={`mt-1.5 block text-[11px] font-medium truncate ${
                    reached ? "text-brand-700" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>

        {order.collectionAt && (
          <div className="rounded-xl bg-surface-muted px-3 py-2 text-sm font-medium text-gray-700">
            Pre-booked for {formatWindowTime(order.collectionAt)}
          </div>
        )}

        {showQr && order.qrDataUrl && (
          <div className="text-center space-y-2">
            <img
              src={order.qrDataUrl}
              alt={`QR code for ${order.kitchen} order ${order.orderNumber}`}
              className="mx-auto rounded-xl w-44 h-44"
            />
            <p className="text-xs text-gray-500">Show this at the {order.kitchen.toLowerCase()} counter</p>
          </div>
        )}

        <ul className="space-y-1.5 rounded-xl bg-surface-muted p-3">
          {order.items.map((line) => (
            <li key={line.id} className="flex items-center justify-between text-sm font-medium text-gray-700">
              <span className="truncate pr-3">{line.menuItem.name}</span>
              <span className="text-gray-500 shrink-0">× {line.quantity}</span>
            </li>
          ))}
          <li className="flex items-center justify-between pt-2 mt-1 border-t border-gray-200 font-semibold text-brand-900">
            <span>Total</span>
            <span>₹{order.totalAmount}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
