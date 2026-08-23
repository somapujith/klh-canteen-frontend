import { useState } from "react";
import {
  DEFAULT_EXPORT_DAYS,
  MAX_EXPORT_DAYS,
  downloadOrdersCsv,
  isoDateDaysAgo,
  todayIsoDate,
  windowLengthDays,
  type OrderExportStatus,
} from "../../lib/adminExports";
import { adminErrorMessage, errorCode } from "../../lib/adminUsers";
import type { Kitchen } from "../../types/admin";

interface Props {
  token: string | null;
}

/**
 * Streams GET /superadmin/exports/orders.csv into a browser download.
 * The window is validated locally first so an obviously-too-wide range never
 * costs a round trip, but DATE_RANGE_TOO_WIDE from the server is still surfaced.
 */
export function OrdersCsvExport({ token }: Props) {
  const [from, setFrom] = useState(() => isoDateDaysAgo(DEFAULT_EXPORT_DAYS - 1));
  const [to, setTo] = useState(todayIsoDate);
  const [kitchen, setKitchen] = useState<Kitchen | "">("");
  const [status, setStatus] = useState<OrderExportStatus | "">("");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const days = windowLengthDays(from, to);
  const invertedRange = days <= 0;
  const tooWide = days > MAX_EXPORT_DAYS;
  const blocked = invertedRange || tooWide || !from || !to;

  async function handleDownload() {
    if (!token || blocked) return;
    setDownloading(true);
    setError(null);
    setDone(null);
    try {
      const result = await downloadOrdersCsv({ from, to, kitchen, status }, token);
      setDone(
        result.rowCount === null
          ? `Downloaded ${result.filename}.`
          : `Downloaded ${result.filename} — ${result.rowCount} order${result.rowCount === 1 ? "" : "s"}.`
      );
    } catch (err) {
      setError(
        errorCode(err) === "DATE_RANGE_TOO_WIDE"
          ? `That window is longer than ${MAX_EXPORT_DAYS} days. Export consecutive shorter periods instead.`
          : adminErrorMessage(err, "Export failed. Please try again.")
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Export orders (CSV)</h2>
        <p className="text-sm text-gray-500 mt-1">
          One row per order with customer, items, and totals. Windows are capped at {MAX_EXPORT_DAYS} days.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold text-gray-500 mb-1">From</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-500 mb-1">To</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-500 mb-1">Kitchen</span>
          <select
            value={kitchen}
            onChange={(e) => setKitchen(e.target.value as Kitchen | "")}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All kitchens</option>
            <option value="SNACKS">Snacks</option>
            <option value="MEALS">Meals</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-500 mb-1">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderExportStatus | "")}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="DELIVERED">Delivered</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          onClick={handleDownload}
          disabled={downloading || blocked || !token}
          className="rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          {downloading ? "Preparing…" : "Download CSV"}
        </button>
        <p className={`text-sm ${tooWide || invertedRange ? "text-red-700" : "text-gray-500"}`}>
          {invertedRange
            ? "The end date must be on or after the start date."
            : tooWide
              ? `${days} days selected — ${MAX_EXPORT_DAYS} is the maximum.`
              : `${days} day${days === 1 ? "" : "s"} selected.`}
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">{error}</div>}
      {done && <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-sm text-green-800">{done}</div>}
    </div>
  );
}
