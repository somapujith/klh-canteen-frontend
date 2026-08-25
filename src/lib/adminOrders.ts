/**
 * The pieces of an admin order view that more than one screen needs.
 *
 * This module exists because the board and the log drifted: the board was
 * migrated to the `customer` projection when guest ordering landed, the log was
 * not, and `order.student.name` — null on every walk-up guest order — took the
 * whole log page down. Both screens now read the same types and the same
 * helpers, so the next projection change cannot land on one and miss the other.
 */

/** Every status the backend can return. Not every status the board can set. */
export const ORDER_STATUSES = ["PENDING", "PREPARING", "COOKED", "DELIVERED", "CANCELLED"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Orders come from either a student account or a walk-up guest, so admin views
 * read `customer`. The legacy `student` field still exists on the wire but is
 * NULL on guest orders — reading it directly is what crashed the log page.
 */
export interface OrderCustomer {
  type: "STUDENT" | "GUEST";
  id: string | null;
  name: string | null;
  rollNumber: string | null;
  phone: string | null;
}

/** What every admin list endpoint returns per order. */
export interface AdminOrderBase {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  seenByAdmin: boolean;
  totalAmount: string;
  createdAt: string;
  collectionAt: string | null;
  customer: OrderCustomer;
}

/** `?format=envelope` response shape. */
export interface OrdersEnvelope<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * A guest may decline to give a name, and a student row can be missing one, so
 * neither branch can assume a printable string is present.
 */
export function customerLabel(customer: OrderCustomer): string {
  return customer.name?.trim() || (customer.type === "GUEST" ? "Walk-up guest" : "Unknown student");
}

/** Name plus whatever identifier that kind of customer has. For log lines. */
export function customerDetail(customer: OrderCustomer): string | null {
  if (customer.type === "STUDENT") return customer.rollNumber;
  return customer.phone;
}

interface StatusStyle {
  label: string;
  /** Badge classes. */
  className: string;
}

/**
 * One entry per status, so a new status cannot silently inherit another's
 * styling. The log page previously typed status as `"PENDING" | "DELIVERED"`
 * and used a ternary, which rendered COOKED and CANCELLED as live work.
 */
const STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  PENDING: { label: "Pending", className: "bg-orange-100 text-orange-700" },
  PREPARING: { label: "Preparing", className: "bg-amber-100 text-amber-800" },
  COOKED: { label: "Cooked", className: "bg-emerald-100 text-emerald-700" },
  DELIVERED: { label: "Delivered", className: "bg-gray-100 text-gray-600" },
  CANCELLED: { label: "Cancelled", className: "bg-red-100 text-red-700" },
};

/** Falls back to a neutral badge rather than throwing on an unknown status. */
export function statusStyle(status: string): StatusStyle {
  return STATUS_STYLES[status as OrderStatus] ?? { label: status, className: "bg-gray-100 text-gray-600" };
}

/** A cancelled order is not outstanding work and must not read as such. */
export function isCancelled(status: string): boolean {
  return status === "CANCELLED";
}
