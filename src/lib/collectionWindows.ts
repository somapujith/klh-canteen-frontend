import { ApiClientError } from "./apiClient";
import type { Kitchen } from "../types/admin";

/** One pre-booking slot as returned by GET /orders/collection-windows and /guest/collection-windows. */
export interface CollectionWindow {
  startAt: string;
  kitchen: Kitchen;
  capacity: number;
  bookedCount: number;
  remaining: number;
  isFull: boolean;
}

/**
 * Backend error codes for pre-booking, mapped to copy a hungry student can act on.
 * The raw server message is used as the fallback for anything unmapped.
 */
const COLLECTION_ERROR_COPY: Record<string, string> = {
  COLLECTION_WINDOW_FULL: "That collection slot just filled up. Pick another time and try again.",
  COLLECTION_WINDOW_PAST: "That collection time has already passed. Pick a later slot.",
  COLLECTION_WINDOW_TOO_FAR: "You can only pre-book up to a week ahead. Pick an earlier slot.",
  COLLECTION_WINDOW_INVALID: "That collection time isn't a valid slot. Pick one from the list.",
};

/** True when the failure was caused by the chosen collection window, so the picker should refresh. */
export function isCollectionWindowError(err: unknown): boolean {
  return err instanceof ApiClientError && !!err.code && err.code.startsWith("COLLECTION_WINDOW_");
}

/** Readable message for any order-placement failure, with friendly copy for pre-booking codes. */
export function orderErrorMessage(err: unknown, fallback = "Could not place your order"): string {
  if (err instanceof ApiClientError) {
    if (err.code && COLLECTION_ERROR_COPY[err.code]) return COLLECTION_ERROR_COPY[err.code];
    return err.message || fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

/**
 * "12:45 PM" for today, "Tue 12:45 PM" otherwise.
 * hour12 is forced: a bare "1:15" on a 24-hour locale is ambiguous to a student
 * deciding between lunch and the middle of the night.
 */
export function formatWindowTime(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? time : `${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

/**
 * Collapse per-kitchen window lists into the slots that work for the whole cart.
 * An order spanning both kitchens splits server-side but shares one collectionAt,
 * so only slots offered by every kitchen involved are bookable.
 */
export function intersectWindows(perKitchen: CollectionWindow[][]): CollectionWindow[] {
  if (perKitchen.length === 0) return [];
  const [first, ...rest] = perKitchen;

  return first
    .filter((win) => rest.every((list) => list.some((other) => other.startAt === win.startAt)))
    .map((win) => {
      const matches = [win, ...rest.map((list) => list.find((o) => o.startAt === win.startAt)!)];
      return {
        ...win,
        remaining: Math.min(...matches.map((m) => m.remaining)),
        isFull: matches.some((m) => m.isFull),
      };
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
