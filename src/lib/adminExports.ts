import { ApiClientError, notifyUnauthorized } from "./apiClient";
import type { Kitchen } from "../types/admin";

const API_URL = import.meta.env.VITE_API_URL as string;

/** Server-enforced ceiling on the export window (400 DATE_RANGE_TOO_WIDE past this). */
export const MAX_EXPORT_DAYS = 92;
/** What the server falls back to when no window is given. */
export const DEFAULT_EXPORT_DAYS = 30;

export type OrderExportStatus = "PENDING" | "DELIVERED";

export interface OrderExportFilters {
  /** `YYYY-MM-DD`, as produced by <input type="date">. */
  from: string;
  to: string;
  kitchen?: Kitchen | "";
  status?: OrderExportStatus | "";
}

export interface OrderExportResult {
  filename: string;
  rowCount: number | null;
}

/** `YYYY-MM-DD` for today, in the operator's own timezone. */
export function todayIsoDate(): string {
  return isoDate(new Date());
}

export function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoDate(d);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Inclusive length of a `YYYY-MM-DD` range, so 1 Jan → 1 Jan is one day.
 * Used to warn before the round trip; the server still has the final word.
 */
export function windowLengthDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

/**
 * The endpoint validates `from`/`to` as full ISO datetimes — a bare `YYYY-MM-DD`
 * is rejected with VALIDATION_ERROR, not DATE_RANGE_TOO_WIDE, so widen the day
 * to its full span here rather than passing the picker value straight through.
 */
export function exportQuery(filters: OrderExportFilters): string {
  const params = new URLSearchParams();
  params.set("from", `${filters.from}T00:00:00.000Z`);
  params.set("to", `${filters.to}T23:59:59.999Z`);
  if (filters.kitchen) params.set("kitchen", filters.kitchen);
  if (filters.status) params.set("status", filters.status);
  return params.toString();
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * The CSV route needs a Bearer token, so a plain <a href> 401s. Fetch it with the
 * auth header, then hand the blob to a synthetic anchor so the browser treats it
 * as a real download.
 */
export async function downloadOrdersCsv(filters: OrderExportFilters, token: string): Promise<OrderExportResult> {
  const res = await fetch(`${API_URL}/superadmin/exports/orders.csv?${exportQuery(filters)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    // This call always carries a token, so a 401 can only mean the session is
    // over. It bypasses apiClient.request, so it has to say so itself.
    if (res.status === 401) notifyUnauthorized();

    let message = `Export failed with status ${res.status}`;
    let code: string | null = null;
    try {
      const data = await res.json();
      message = data?.error?.message ?? message;
      code = data?.error?.code ?? null;
    } catch {
      // error body wasn't JSON — keep the status-based message
    }
    throw new ApiClientError(res.status, message, code);
  }

  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get("Content-Disposition")) ?? `orders_${filters.from}_to_${filters.to}.csv`;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick: revoking synchronously can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

  const rawCount = res.headers.get("X-Row-Count");
  const rowCount = rawCount === null ? null : Number(rawCount);
  return { filename, rowCount: rowCount !== null && Number.isFinite(rowCount) ? rowCount : null };
}
