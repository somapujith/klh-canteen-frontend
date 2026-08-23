import { useCallback, useEffect, useState } from "react";
import type { Kitchen } from "../types/admin";
import { formatWindowTime, intersectWindows, type CollectionWindow } from "../lib/collectionWindows";

interface CollectionWindowPickerProps {
  /** Kitchens the cart touches. An order spanning both only offers slots both can serve. */
  kitchens: Kitchen[];
  /** Student and guest flows hit different endpoints, so the fetch is injected. */
  fetchWindows: (kitchen: Kitchen) => Promise<CollectionWindow[]>;
  /** ISO timestamp, or null for "as soon as possible". */
  value: string | null;
  onChange: (startAt: string | null) => void;
  disabled?: boolean;
  /** Bump to force a refetch — e.g. after a 409 tells us a slot just filled. */
  refreshKey?: number;
}

export function CollectionWindowPicker({
  kitchens,
  fetchWindows,
  value,
  onChange,
  disabled = false,
  refreshKey = 0,
}: CollectionWindowPickerProps) {
  const [windows, setWindows] = useState<CollectionWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const kitchenKey = [...kitchens].sort().join(",");

  const load = useCallback(async () => {
    if (!kitchenKey) {
      setWindows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const lists = await Promise.all((kitchenKey.split(",") as Kitchen[]).map(fetchWindows));
      setWindows(intersectWindows(lists));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load collection times");
    } finally {
      setLoading(false);
    }
    // fetchWindows is stable at every call site (module fn or useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitchenKey]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // A slot that filled up while the picker was open must not stay selected.
  useEffect(() => {
    if (value && windows.some((w) => w.startAt === value && w.isFull)) onChange(null);
  }, [windows, value, onChange]);

  const hasWindows = windows.length > 0;

  return (
    <div className="bg-surface rounded-2xl flat-shadow border border-gray-100 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-gray-800">Collection time</h2>
        <span className="text-xs font-medium text-gray-400">Optional</span>
      </div>

      {loading ? (
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 flex-1 rounded-xl bg-gray-200 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={load} className="underline font-medium shrink-0">
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(null)}
              aria-pressed={value === null}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium text-left transition-all disabled:opacity-50 ${
                value === null
                  ? "bg-brand-600 text-white shadow-md shadow-brand-500/20"
                  : "bg-surface-muted text-gray-700 hover:bg-gray-200"
              }`}
            >
              <span className="block leading-tight">As soon as possible</span>
              <span className={`block text-xs mt-0.5 ${value === null ? "text-white/80" : "text-gray-500"}`}>
                Default
              </span>
            </button>

            {windows.map((win) => {
              const isSelected = value === win.startAt;
              return (
                <button
                  key={win.startAt}
                  type="button"
                  disabled={disabled || win.isFull}
                  onClick={() => onChange(win.startAt)}
                  aria-pressed={isSelected}
                  className={`rounded-xl px-3 py-2.5 text-sm font-medium text-left transition-all ${
                    win.isFull
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : isSelected
                      ? "bg-brand-600 text-white shadow-md shadow-brand-500/20"
                      : "bg-surface-muted text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  }`}
                >
                  <span className="block leading-tight">{formatWindowTime(win.startAt)}</span>
                  <span
                    className={`block text-xs mt-0.5 ${
                      win.isFull
                        ? "text-gray-400"
                        : isSelected
                        ? "text-white/80"
                        : win.remaining <= 3
                        ? "text-orange-500"
                        : "text-gray-500"
                    }`}
                  >
                    {win.isFull ? "Full" : `${win.remaining} left`}
                  </span>
                </button>
              );
            })}
          </div>

          {!hasWindows && (
            <p className="text-sm text-gray-500">
              No pre-booking slots are open right now — your order will be prepared as soon as possible.
            </p>
          )}
        </>
      )}
    </div>
  );
}
