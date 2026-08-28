/**
 * The single source of truth for how an order status is *presented*.
 *
 * Four screens used to each carry their own status map — ActiveOrdersBanner,
 * OrderHistoryPage, GuestOrderCard and OrderTokenPage — and they had already
 * drifted apart: the banner showed the raw wire value "COOKED", the token page
 * showed "Ready to collect", and the guest card showed "Prepared". Same order,
 * three different words, depending on which screen the customer happened to be
 * looking at. Presentation lives here so that cannot happen again.
 *
 * Wire values are deliberately not shown to users. "COOKED" is how the database
 * spells it; it is not what someone standing at a counter is listening for.
 */

/** The statuses this frontend release knows how to render. */
export type OrderStatus = "PENDING" | "PREPARING" | "COOKED" | "DELIVERED" | "CANCELLED";

/**
 * Semantic grouping, kept separate from the pill classes so a caller can branch
 * on *meaning* without pattern-matching on Tailwind strings.
 *
 *   neutral   — accepted, nothing is happening yet
 *   progress  — the kitchen is actively working on it
 *   ready     — the one state that asks the reader to get up and move
 *   done      — terminal, successful
 *   cancelled — terminal, unsuccessful
 */
export type OrderTone = "neutral" | "progress" | "ready" | "done" | "cancelled";

export interface StatusPresentation {
  /** Human-facing label. Never the raw wire value, except in the unknown-status fallback. */
  label: string;
  /** Tailwind classes for a badge/pill. Background + text only — no layout, no size. */
  pillClass: string;
  /**
   * 0-based index into ORDER_TIMELINE, for progress bars and steppers.
   * CANCELLED is -1: it is not a point on the happy path, it is a departure
   * from it, so `step >= 0` is the test for "is this on the timeline at all".
   */
  step: number;
  tone: OrderTone;
}

/**
 * The happy path, in order. A timeline renders these four and nothing else;
 * CANCELLED is rendered as a replacement for the timeline, not a step in it.
 */
export const ORDER_TIMELINE: OrderStatus[] = ["PENDING", "PREPARING", "COOKED", "DELIVERED"];

/**
 * COOKED is the only status given a colour that competes for attention. The
 * others are deliberately quiet — if every state shouts, the one state that
 * actually requires the customer to do something stops standing out.
 */
export const ORDER_STATUS: Record<OrderStatus, StatusPresentation> = {
  PENDING: {
    label: "Placed",
    pillClass: "bg-gray-100 text-gray-600",
    step: 0,
    tone: "neutral",
  },
  PREPARING: {
    label: "Being made",
    pillClass: "bg-warning-100 text-warning-700",
    step: 1,
    tone: "progress",
  },
  COOKED: {
    label: "Ready to collect",
    pillClass: "bg-success-100 text-success-700",
    step: 2,
    tone: "ready",
  },
  DELIVERED: {
    label: "Collected",
    pillClass: "bg-gray-100 text-gray-500",
    step: 3,
    tone: "done",
  },
  CANCELLED: {
    label: "Cancelled",
    pillClass: "bg-danger-100 text-danger-700",
    step: -1,
    tone: "cancelled",
  },
};

/** Tone -> pill classes, for callers that have a tone but no status (see ui/Badge). */
export const TONE_PILL_CLASSES: Record<OrderTone, string> = {
  neutral: "bg-gray-100 text-gray-600",
  progress: "bg-warning-100 text-warning-700",
  ready: "bg-success-100 text-success-700",
  done: "bg-gray-100 text-gray-500",
  cancelled: "bg-danger-100 text-danger-700",
};

/**
 * Statuses that mean "this order is still in flight".
 *
 * An allow-list, not a deny-list of terminal statuses — the same reasoning
 * ActiveOrdersBanner records for ACTIVE_ORDER_STATUSES: a status a later
 * backend release adds (a REFUNDED, say) must default to "not active" rather
 * than sitting in the customer's active list forever because this build had
 * never heard of it. Adding a status to the wire must never silently change
 * what an older frontend considers in-progress.
 */
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set<OrderStatus>([
  "PENDING",
  "PREPARING",
  "COOKED",
]);

export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

/** Narrowing guard for callers holding a raw `string` off the wire. */
export function isKnownStatus(status: string): status is OrderStatus {
  return Object.hasOwn(ORDER_STATUS, status);
}

/**
 * Look up presentation for a status that came off the wire as a bare `string`.
 *
 * Tolerant by design, and this is the whole point of the function: the backend
 * can ship a status this build has never seen, and the correct response is a
 * plain grey pill showing the raw value — not a crash, and not the blank pill
 * the old `STATUS_PILL_CLASSES[order.status]` lookup produced (it returned
 * `undefined`, which Tailwind rendered as an unstyled, invisible badge).
 *
 * The unknown case is the one place the raw wire value reaches the user. That
 * is the least-bad option: showing "REFUNDED" is honest and debuggable, whereas
 * inventing a friendly label for a status whose meaning we do not know would be
 * a guess presented as fact.
 *
 * The fallback is `neutral` with `step: -1` — off the timeline, exactly like
 * CANCELLED — so a progress bar shows no completed steps rather than guessing.
 */
export function statusPresentation(status: string): StatusPresentation {
  if (isKnownStatus(status)) return ORDER_STATUS[status];
  return {
    label: status,
    pillClass: TONE_PILL_CLASSES.neutral,
    step: -1,
    tone: "neutral",
  };
}

/** Convenience for the common "just give me the words" case. */
export function statusLabel(status: string): string {
  return statusPresentation(status).label;
}
