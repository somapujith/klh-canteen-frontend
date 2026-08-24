import { useCallback, useEffect, useState } from "react";
import { apiClient, ApiClientError } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";
import { SearchInput } from "../../components/SearchInput";
import { useSSE, type OrderCreatedDelta, type OrderSeenDelta, type OrderStatusDelta } from "../../hooks/useSSE";
import { formatWindowTime } from "../../lib/collectionWindows";
import { formatOrderNumber } from "../../lib/orderNumber";

type OrderStatus = "PENDING" | "PREPARING" | "COOKED" | "DELIVERED";

/**
 * Orders now come from either a student account or a walk-up guest, so the board
 * reads `customer`. The legacy `student` field still exists but is NULL on guest
 * orders — reading it would crash the board the moment someone orders at the counter.
 */
interface OrderCustomer {
  type: "STUDENT" | "GUEST";
  id: string | null;
  name: string | null;
  rollNumber: string | null;
  phone: string | null;
}

interface BoardOrder {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  seenByAdmin: boolean;
  totalAmount: string;
  createdAt: string;
  collectionAt: string | null;
  customer: OrderCustomer;
}

interface SelectedOrder extends BoardOrder {
  items: { quantity: number; menuItem: { name: string } }[];
  isLockedByOther?: boolean;
}

interface OrdersEnvelope {
  data: BoardOrder[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_STEPS: { target: Exclude<OrderStatus, "PENDING">; label: string }[] = [
  { target: "COOKED", label: "Order Prepared" },
  { target: "DELIVERED", label: "Collected" },
];

const STATUS_ORDER: OrderStatus[] = ["PENDING", "COOKED", "DELIVERED"];

/**
 * PREPARING is retired from the flow, but orders placed before the change can
 * still be sitting in it. Treat them as pre-COOKED so the board can finish
 * them instead of stranding them with every button disabled.
 */
function statusIndex(status: OrderStatus): number {
  return status === "PREPARING" ? 0 : STATUS_ORDER.indexOf(status);
}

/** One screen of tiles. The board used to load every order ever placed. */
const PAGE_SIZE = 48;

function customerLabel(customer: OrderCustomer): string {
  return customer.name?.trim() || (customer.type === "GUEST" ? "Walk-up guest" : "Unknown student");
}

/** ORDER_CREATED deltas carry flat name fields; normalise them into the same shape as the REST payload. */
function boardOrderFromDelta(delta: OrderCreatedDelta): BoardOrder {
  const o = delta.order;
  const isGuest = o.studentId === null;
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status as OrderStatus,
    seenByAdmin: o.seenByAdmin,
    totalAmount: o.totalAmount,
    createdAt: o.createdAt,
    collectionAt: o.collectionAt,
    customer: {
      type: isGuest ? "GUEST" : "STUDENT",
      id: o.studentId,
      name: isGuest ? o.guestName : o.studentName,
      rollNumber: o.rollNumber,
      phone: null,
    },
  };
}

function CustomerChip({ customer }: { customer: OrderCustomer }) {
  const isGuest = customer.type === "GUEST";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
        isGuest ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"
      }`}
    >
      {isGuest ? "Guest" : "Student"}
    </span>
  );
}

export function AdminOrderBoardPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<BoardOrder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [tokenSearch, setTokenSearch] = useState("");

  const [selectedOrder, setSelectedOrder] = useState<SelectedOrder | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectLoading, setSelectLoading] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  /**
   * A backend that predates the envelope format (or a version-skewed deploy)
   * answers `?format=envelope` with a bare array instead of `{data, ...}` —
   * normalise both shapes here so a deploy mismatch degrades to "no
   * pagination" instead of crashing the board on `orders.length`.
   */
  function normalizeEnvelope(response: OrdersEnvelope | BoardOrder[]): OrdersEnvelope {
    if (Array.isArray(response)) {
      return { data: response, nextCursor: null, hasMore: false };
    }
    return { data: response.data ?? [], nextCursor: response.nextCursor ?? null, hasMore: response.hasMore ?? false };
  }

  /** Full refetch of the first page. The realtime fallback, not the steady state. */
  const fetchFirstPage = useCallback(() => {
    return apiClient
      .get<OrdersEnvelope | BoardOrder[]>(
        `/admin/orders?format=envelope&active=true&limit=${PAGE_SIZE}`,
        token ?? undefined
      )
      .then((response) => {
        const envelope = normalizeEnvelope(response);
        setOrders(envelope.data);
        setNextCursor(envelope.nextCursor);
        setHasMore(envelope.hasMore);
        setListError(null);
      })
      .catch((err) => {
        setListError(err instanceof Error ? err.message : "Failed to load orders");
      });
  }, [token]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await apiClient.get<OrdersEnvelope | BoardOrder[]>(
        `/admin/orders?format=envelope&active=true&limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
        token ?? undefined
      );
      const envelope = normalizeEnvelope(response);
      setOrders((prev) => {
        const seen = new Set(prev.map((o) => o.id));
        return [...prev, ...envelope.data.filter((o) => !seen.has(o.id))];
      });
      setNextCursor(envelope.nextCursor);
      setHasMore(envelope.hasMore);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load more orders");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchFirstPage().finally(() => setLoading(false));
  }, [fetchFirstPage]);

  function removeOrder(orderId: string) {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setSelectedId((current) => (current === orderId ? null : current));
    setSelectedOrder((current) => (current?.id === orderId ? null : current));
  }

  // Patch the board from event payloads. Refetching the whole list on every
  // ping was the single worst scaling problem in the app.
  useSSE(["ORDER_BOARD_UPDATE"], {
    onDelta: (delta) => {
      switch (delta.kind) {
        case "ORDER_CREATED": {
          const incoming = boardOrderFromDelta(delta as OrderCreatedDelta);
          setOrders((prev) => (prev.some((o) => o.id === incoming.id) ? prev : [incoming, ...prev]));
          break;
        }
        case "ORDER_STATUS": {
          const { orderId, status } = delta as OrderStatusDelta;
          // The board shows active orders only, so a delivered order leaves it.
          if (status === "DELIVERED") {
            removeOrder(orderId);
            break;
          }
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, status: status as OrderStatus } : o))
          );
          setSelectedOrder((current) =>
            current?.id === orderId ? { ...current, status: status as OrderStatus } : current
          );
          break;
        }
        case "ORDER_SEEN": {
          const { orderId, seenByAdmin } = delta as OrderSeenDelta;
          setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, seenByAdmin } : o)));
          break;
        }
        default:
          // An event kind this build doesn't know about — fall back to the truth.
          fetchFirstPage();
      }
    },
    onResync: () => fetchFirstPage(),
  });

  async function handleSelectOrder(orderId: string) {
    setSelectedId(orderId);
    setSelectError(null);
    setSelectLoading(true);

    // Optimistically flip the box to green immediately, don't wait for the event.
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
    const orderId = selectedOrder.id;
    setUpdatingStatus(true);
    setSelectError(null);
    try {
      const updated = await apiClient.patch<SelectedOrder>(
        `/admin/orders/${orderId}/status`,
        { status: target },
        token ?? undefined
      );

      if (target === "DELIVERED") {
        removeOrder(orderId);
      } else {
        // Merge rather than replace. The board renders `customer` and `items`, and
        // a response that ever omits them would otherwise blank the screen in the
        // middle of service — the one moment the kitchen cannot recover from.
        setSelectedOrder((current) =>
          current && current.id === orderId ? { ...current, ...updated, status: updated.status ?? target } : current
        );
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: updated.status ?? target } : o))
        );
      }
    } catch (err) {
      setSelectError(
        err instanceof ApiClientError && err.status === 409
          ? "Order status changed elsewhere. Refreshing."
          : err instanceof Error
          ? err.message
          : "Failed to update status"
      );
      fetchFirstPage();
    } finally {
      setUpdatingStatus(false);
    }
  }

  const currentIndex = selectedOrder ? statusIndex(selectedOrder.status) : -1;

  // Token search is a filter over what the board has already loaded. Digits
  // only, and matched against the padded form too so typing "0042" or "42"
  // both find token #0042.
  const searchDigits = tokenSearch.replace(/\D/g, "");
  const visibleOrders = searchDigits
    ? orders.filter(
        (o) =>
          String(o.orderNumber).includes(searchDigits) ||
          formatOrderNumber(o.orderNumber).includes(searchDigits)
      )
    : orders;

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <AdminNav />

      <div className="max-w-6xl mx-auto p-4 sm:p-6 mt-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Kitchen Order Board</h1>
            <p className="text-gray-500 mt-1">Tap an order to view details and move it through the kitchen.</p>
          </div>
          <div className="flex items-center gap-3">
            <SearchInput
              value={tokenSearch}
              onChange={setTokenSearch}
              inputMode="numeric"
              placeholder="Search token #"
              label="Search by token number"
              className="w-44 sm:w-52 rounded-2xl border border-gray-200 bg-surface pl-9 pr-9 py-2.5 text-sm font-semibold text-gray-800 focus-within:ring-2 focus-within:ring-brand-500"
              leadingIcon={
                <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 z-4 text-gray-400">
                  ⌕
                </span>
              }
            />
            {!loading && orders.length > 0 && (
              <p className="text-sm font-medium text-gray-400 whitespace-nowrap">
                {searchDigits
                  ? `${visibleOrders.length} match${visibleOrders.length === 1 ? "" : "es"}`
                  : `${orders.length} active${hasMore ? "+" : ""} order${orders.length === 1 ? "" : "s"}`}
              </p>
            )}
          </div>
        </div>

        {listError && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 mb-6 flex items-center justify-between">
            <span>{listError}</span>
            <button onClick={() => fetchFirstPage()} className="underline font-medium shrink-0 ml-4">
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left half: order grid */}
          <div className="space-y-4">
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
            ) : visibleOrders.length === 0 ? (
              <div className="bg-surface rounded-3xl p-12 text-center flat-shadow border border-gray-100 space-y-3">
                <p className="text-gray-500 font-medium">No loaded order matches token #{searchDigits}.</p>
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="rounded-2xl bg-surface-muted px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-surface-hover disabled:opacity-50 transition"
                  >
                    {loadingMore ? "Loading..." : "Load older orders and retry"}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                  {visibleOrders.map((order) => {
                    const isSelected = order.id === selectedId;
                    const isGuest = order.customer.type === "GUEST";
                    return (
                      <button
                        key={order.id}
                        onClick={() => handleSelectOrder(order.id)}
                        title={`${customerLabel(order.customer)} · ${isGuest ? "Guest" : "Student"}`}
                        className={`relative aspect-square rounded-3xl flat-shadow hover-scale flex items-center justify-center transition-all font-black text-2xl sm:text-3xl ${
                          order.seenByAdmin
                            ? "bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
                            : "bg-amber-400 text-amber-950 hover:bg-amber-300"
                        } ${isSelected ? "ring-4 ring-offset-2 ring-brand-500" : ""}`}
                      >
                        {formatOrderNumber(order.orderNumber)}
                        {isGuest && (
                          <span className="absolute top-1.5 right-1.5 rounded-full bg-violet-600 text-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                            Guest
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full rounded-2xl bg-surface border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-surface-hover disabled:opacity-50 transition flat-shadow"
                  >
                    {loadingMore ? "Loading..." : "Load older orders"}
                  </button>
                )}
              </>
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
                    <h2 className="text-2xl font-black text-gray-900">#{formatOrderNumber(selectedOrder.orderNumber)}</h2>
                    <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">{selectedOrder.status}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <CustomerChip customer={selectedOrder.customer} />
                    <span className="text-gray-700 font-medium">{customerLabel(selectedOrder.customer)}</span>
                    {selectedOrder.customer.type === "STUDENT" && selectedOrder.customer.rollNumber && (
                      <span className="text-gray-400 font-medium">· {selectedOrder.customer.rollNumber}</span>
                    )}
                    {selectedOrder.customer.type === "GUEST" && selectedOrder.customer.phone && (
                      <span className="text-gray-400 font-medium">· {selectedOrder.customer.phone}</span>
                    )}
                  </div>
                  {selectedOrder.collectionAt && (
                    <p className="mt-2 inline-block rounded-xl bg-surface-muted px-3 py-1.5 text-sm font-medium text-gray-700">
                      Pre-booked for {formatWindowTime(selectedOrder.collectionAt)}
                    </p>
                  )}
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
