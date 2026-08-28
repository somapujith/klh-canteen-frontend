import { ACTIVE_STATUSES } from "./orderStatus";

export interface ActiveOrder {
  id: string;
  status: string;
  orderNumber: number;
  kitchen: string;
  items: { quantity: number; menuItem: { name: string } }[];
}

/**
 * Re-exported from orderStatus so "what counts as active" has one definition
 * app-wide, rather than this file and the history page each keeping their own
 * copy.
 *
 * Still an allow-list, not a deny-list of terminal statuses: a future status
 * the frontend doesn't know about (e.g. a REFUNDED added by a later backend
 * release) must default to "not active," not silently render as an in-flight
 * order forever. That reasoning lives beside the set in orderStatus.ts.
 */
export const ACTIVE_ORDER_STATUSES = ACTIVE_STATUSES;
