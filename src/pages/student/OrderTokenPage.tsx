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
  token: string;
  orderNumber: number;
  kitchen: string;
  items: { quantity: number; menuItem: { name: string } }[];
}

/**
 * Collection is by token number now — orders no longer carry a QR of their own
 * (the printed poster QR that walks guests to the menu is a separate thing and
 * is unaffected). The number is the only thing counter staff read off this
 * screen, so it is the page's single dominant element: everything else on the
 * ticket is deliberately quieter than it.
 */
export function OrderTokenPage() {
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

  if (orders.length === 0) return <TokenPageSkeleton />;

  const multiple = orders.length > 1;

  return (
    <div className="min-h-screen bg-surface-muted fade-in">
      <Navbar title="Your Token" />
      <div className="mx-auto w-full max-w-sm px-4 pb-16 pt-6 sm:max-w-md">
        <header className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {multiple ? `${orders.length} tokens for your order` : "Order placed"}
          </h1>
          <p className="mx-auto mt-1.5 max-w-[19rem] text-sm leading-relaxed text-gray-500">
            {multiple
              ? "Each counter has its own number. Quote the matching one when you collect."
              : "Quote the number below at the counter to collect."}
          </p>
        </header>

        <div className="mt-7 space-y-10">
          {orders.map((order, index) => (
            <OrderTicket key={order.id} order={order} index={index} total={orders.length} />
          ))}
        </div>
      </div>
    </div>
  );
}

function OrderTicket({ order, index, total }: { order: OrderDetail; index: number; total: number }) {
  const digits = formatOrderNumber(order.orderNumber);
  const kitchen = order.kitchen.toLowerCase();

  return (
    <article
      aria-label={total > 1 ? `Ticket ${index + 1} of ${total}, ${kitchen}` : `${kitchen} ticket`}
      className="relative rounded-3xl bg-surface flat-shadow flat-shadow-hover rise-in"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/* Kitchen band — names the counter this token is valid at. */}
      <div className="flex items-center justify-between gap-3 rounded-t-3xl bg-brand-700 px-5 py-3 text-white">
        <h2 className="truncate text-[0.7rem] font-bold uppercase tracking-[0.22em]">
          {order.kitchen} Token
        </h2>
        {total > 1 && (
          <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-[0.65rem] font-bold tabular-nums tracking-widest">
            {index + 1} / {total}
          </span>
        )}
      </div>

      {/* Hero — the number, at arm's-length size. */}
      <div className="px-5 pb-7 pt-6 text-center">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-gray-400">
          Token number
        </p>

        <div className="mt-1.5">
          {/* Spaced digits so screen readers say "zero zero four two" — the way a
              student would read it out — instead of "forty-two". */}
          <span className="sr-only">Token number {digits.split("").join(" ")}</span>
          <span aria-hidden="true" className="flex items-start justify-center text-brand-900">
            <span className="mt-2 text-2xl font-bold text-brand-300 sm:mt-3 sm:text-3xl">#</span>
            <span className="text-[4.75rem] font-black leading-none tracking-tight tabular-nums sm:text-8xl">
              {digits}
            </span>
          </span>
        </div>

        <div className="mt-5">
          <StatusPill status={order.status} />
        </div>

        <p className="mx-auto mt-4 max-w-[17rem] text-sm leading-relaxed text-gray-500">
          Show or read out this number at the{" "}
          <span className="font-semibold text-gray-700">{kitchen}</span> counter.
        </p>
      </div>

      {/* Perforation — the notches make each stacked ticket read as one object. */}
      <div aria-hidden="true" className="relative">
        <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-surface-muted" />
        <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-surface-muted" />
        <div className="mx-6 border-t-2 border-dashed border-gray-200" />
      </div>

      {/* Stub — secondary detail, recessed so it never competes with the number. */}
      <div className="rounded-b-3xl bg-surface-hover px-5 py-4">
        <h3 className="sr-only">Items in this order</h3>
        <ul className="divide-y divide-gray-200/70">
          {order.items.map((line, idx) => (
            <li key={idx} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="text-gray-700">{line.menuItem.name}</span>
              <span className="shrink-0 font-medium tabular-nums text-gray-500">×{line.quantity}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-3">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gray-500">
            Total
          </span>
          <span className="text-lg font-bold tabular-nums text-brand-900">₹{order.totalAmount}</span>
        </div>
      </div>
    </article>
  );
}

/** Status never relies on colour alone: icon + word carry it on their own. */
function StatusPill({ status }: { status: string }) {
  const delivered = status === "DELIVERED";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.12em] transition-colors ${
        delivered
          ? "border-green-300 bg-green-50 text-green-800"
          : "border-amber-300 bg-amber-50 text-amber-900"
      }`}
    >
      <svg className="h-3.5 w-3.5 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        {delivered ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        )}
      </svg>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function TokenPageSkeleton() {
  return (
    <div className="min-h-screen bg-surface-muted fade-in">
      <Navbar title="Your Token" />
      <div className="mx-auto w-full max-w-sm px-4 pb-16 pt-6 sm:max-w-md" role="status" aria-live="polite">
        <span className="sr-only">Loading your token…</span>
        <div aria-hidden="true" className="animate-pulse">
          <div className="mx-auto h-5 w-40 rounded-full bg-gray-200" />
          <div className="mx-auto mt-2.5 h-3.5 w-56 rounded-full bg-gray-200/80" />
          <div className="mt-7 rounded-3xl bg-surface flat-shadow">
            <div className="h-11 rounded-t-3xl bg-gray-200" />
            <div className="flex flex-col items-center px-5 pb-7 pt-6">
              <div className="h-3 w-28 rounded-full bg-gray-200" />
              <div className="mt-3 h-[4.75rem] w-52 rounded-2xl bg-gray-200" />
              <div className="mt-5 h-7 w-28 rounded-full bg-gray-200" />
            </div>
            <div className="mx-6 border-t-2 border-dashed border-gray-200" />
            <div className="space-y-2.5 rounded-b-3xl bg-surface-hover px-5 py-4">
              <div className="h-3.5 w-3/4 rounded-full bg-gray-200" />
              <div className="h-3.5 w-1/2 rounded-full bg-gray-200" />
              <div className="h-4 w-1/3 rounded-full bg-gray-200" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
