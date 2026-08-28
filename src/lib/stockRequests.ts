import { apiClient } from "./apiClient";

/** One item's outstanding "tell me when it's back" demand. */
export interface StockRequestCount {
  menuItemId: string;
  menuItemName: string;
  kitchen: string;
  count: number;
  firstRequestedAt: string;
}

export interface NotifyResult {
  /** Requests cleared. The round ends whether or not everyone was reachable. */
  cleared: number;
  /** Students an actual Telegram message reached. */
  notified: number;
  /** Waiting students with no linked Telegram — nothing could be sent to them. */
  unreachable: number;
  menuItemName: string;
}

export async function fetchStockRequests(token: string | undefined): Promise<StockRequestCount[]> {
  const data = await apiClient.get<{ requests: StockRequestCount[] }>("/admin/stock-requests", token);
  return data.requests;
}

/** Tells everyone waiting that an item is back, and ends the round. */
export function notifyRestocked(menuItemId: string, token: string | undefined): Promise<NotifyResult> {
  return apiClient.post<NotifyResult>(`/admin/stock-requests/${menuItemId}/notify`, {}, token);
}

/** Student side: register interest in a sold-out item. Idempotent. */
export function requestStockItem(menuItemId: string, token: string | undefined): Promise<{ requested: boolean; count: number }> {
  return apiClient.post<{ requested: boolean; count: number }>(`/orders/stock-requests/${menuItemId}`, {}, token);
}

/**
 * How the admin should be told what a notify actually achieved.
 *
 * Unreachable students are named rather than folded into the total: "notified
 * 8" when three of them never linked Telegram would be a quiet lie, and the
 * admin may want to tell those three in person.
 */
export function notifySummary(result: NotifyResult): string {
  if (result.notified === 0 && result.unreachable > 0) {
    return `Nobody could be reached — ${result.unreachable === 1 ? "the student waiting has" : `all ${result.unreachable} students waiting have`} no Telegram linked`;
  }
  const sent = `Told ${result.notified === 1 ? "1 student" : `${result.notified} students`} that ${result.menuItemName} is back`;
  return result.unreachable > 0
    ? `${sent} — ${result.unreachable} more had no Telegram linked`
    : sent;
}
