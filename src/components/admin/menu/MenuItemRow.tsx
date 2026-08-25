import { useEffect, useRef, useState } from "react";
import type { MenuItem } from "../../../types/admin";
import {
  isValidPrice,
  itemStatus,
  STATUS_LABEL,
  type ItemStatus,
  type MenuDensity,
} from "../../../lib/menuAdmin";

/**
 * How long a stock stepper waits after the last tap before it commits. Long
 * enough that tapping + five times is one request rather than five, short
 * enough that an admin who taps once and looks away still gets it saved.
 */
const STOCK_COMMIT_MS = 600;

const STATUS_STYLE: Record<ItemStatus, { dot: string; text: string; chip: string }> = {
  LIVE: { dot: "bg-emerald-500", text: "text-emerald-700", chip: "bg-emerald-50 ring-emerald-200" },
  LOW: { dot: "bg-amber-500", text: "text-amber-800", chip: "bg-amber-50 ring-amber-200" },
  SOLD_OUT: { dot: "bg-red-500", text: "text-red-700", chip: "bg-red-50 ring-red-200" },
  HIDDEN: { dot: "bg-gray-400", text: "text-gray-600", chip: "bg-gray-100 ring-gray-200" },
};

interface Props {
  item: MenuItem;
  density: MenuDensity;
  /** Resolves true when the change stuck. A false result means the caller has
   *  already rolled the item back, so local drafts must be dropped. */
  onPatch: (patch: Partial<MenuItem>) => Promise<boolean>;
  onEdit: () => void;
  onDelete: () => void;
}

export function MenuItemRow({ item, density, onPatch, onEdit, onDelete }: Props) {
  const status = itemStatus(item);
  const style = STATUS_STYLE[status];
  const compact = density === "compact";

  /**
   * Menu images are pasted URLs in v1 — there is no upload pipeline and nothing
   * validates that the address still resolves. A dead link used to render as
   * the browser's broken-image glyph, which reads as "this item is broken"
   * rather than "this picture is missing". Once a URL has failed we stop
   * asking for it and draw a neutral placeholder instead.
   */
  const [imageFailed, setImageFailed] = useState(false);

  // A corrected URL deserves another attempt; without this the placeholder
  // would persist for the rest of the session after any single failure.
  useEffect(() => {
    setImageFailed(false);
  }, [item.imageUrl]);

  // Both fields follow the server until the admin touches them. `null` means
  // "no local edit in flight" — which is also what an SSE stock push needs, so
  // a delta from the kitchen never overwrites a number being typed.
  const [stockDraft, setStockDraft] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState<string | null>(null);
  const [priceInvalid, setPriceInvalid] = useState(false);
  const timer = useRef<number | null>(null);

  const stock = stockDraft ?? item.stockQty;
  const price = priceDraft ?? item.price;

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function queueStock(next: number) {
    const clamped = Math.max(0, Math.min(9999, next));
    setStockDraft(clamped);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void onPatch({ stockQty: clamped }).finally(() => setStockDraft(null));
    }, STOCK_COMMIT_MS);
  }

  function commitPrice() {
    if (priceDraft === null) return;
    const next = priceDraft.trim();
    if (next === item.price) {
      setPriceDraft(null);
      setPriceInvalid(false);
      return;
    }
    if (!isValidPrice(next)) {
      setPriceInvalid(true);
      return;
    }
    setPriceInvalid(false);
    void onPatch({ price: next }).finally(() => setPriceDraft(null));
  }

  return (
    <li
      className={`flex flex-col gap-3 px-3 sm:flex-row sm:items-center sm:gap-4 ${
        compact ? "py-1.5" : "py-3"
      } ${status === "HIDDEN" ? "bg-surface-muted/60" : ""}`}
    >
      {/* Identity */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {item.imageUrl && !imageFailed ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className={`${compact ? "h-8 w-8" : "h-12 w-12"} shrink-0 rounded-xl object-cover ring-1 ring-gray-200 ${
              status === "HIDDEN" ? "opacity-50" : ""
            }`}
          />
        ) : (
          <span
            aria-hidden="true"
            className={`${
              compact ? "h-8 w-8" : "h-12 w-12"
            } flex shrink-0 items-center justify-center rounded-xl bg-surface-muted text-gray-400 ring-1 ring-gray-200 ${
              status === "HIDDEN" ? "opacity-50" : ""
            }`}
          >
            <svg className={compact ? "h-4 w-4" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
          {/* Compact trades the chip for a bare dot beside the name: the status
              still reads at a glance, without the line of text that is what
              actually makes the row tall. */}
          {compact ? (
            <span className="mt-0.5 flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
              <span className={`text-[0.7rem] font-semibold ${style.text}`}>{STATUS_LABEL[status]}</span>
            </span>
          ) : (
            <span
              className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ring-1 ${style.chip} ${style.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
              {STATUS_LABEL[status]}
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="flex items-center gap-3 sm:gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-gray-400">Price</span>
          <span
            className={`flex h-11 w-28 items-center rounded-xl bg-surface pl-2.5 ring-1 transition-shadow focus-within:ring-2 ${
              priceInvalid ? "ring-2 ring-red-500" : "ring-gray-200 focus-within:ring-brand-500"
            }`}
          >
            <span aria-hidden="true" className="text-sm font-semibold text-gray-400">
              ₹
            </span>
            <input
              value={price}
              inputMode="decimal"
              aria-label={`Price of ${item.name} in rupees`}
              aria-invalid={priceInvalid}
              onChange={(e) => {
                setPriceDraft(e.target.value);
                setPriceInvalid(false);
              }}
              onBlur={commitPrice}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setPriceDraft(null);
                  setPriceInvalid(false);
                }
              }}
              className="h-full w-full bg-transparent px-1.5 text-sm font-semibold tabular-nums text-gray-900 outline-none"
            />
          </span>
        </label>

        {/* Stock — a stepper, because the common edit is "one less" or "ten more",
            and typing into a bare number field to do that is four interactions. */}
        <div className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-gray-400">Stock</span>
          <div className="flex h-11 items-center rounded-xl bg-surface ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-brand-500">
            <button
              type="button"
              onClick={() => queueStock(stock - 1)}
              disabled={stock <= 0}
              aria-label={`Decrease stock of ${item.name}`}
              className="flex h-11 w-10 items-center justify-center rounded-l-xl text-lg font-bold text-gray-500 transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-gray-300"
            >
              −
            </button>
            <input
              value={stock}
              inputMode="numeric"
              aria-label={`Stock of ${item.name}`}
              onChange={(e) => {
                const parsed = Number(e.target.value.replace(/\D/g, ""));
                queueStock(Number.isFinite(parsed) ? parsed : 0);
              }}
              className="h-full w-12 bg-transparent text-center text-sm font-bold tabular-nums text-gray-900 outline-none"
            />
            <button
              type="button"
              onClick={() => queueStock(stock + 1)}
              aria-label={`Increase stock of ${item.name}`}
              className="flex h-11 w-10 items-center justify-center rounded-r-xl text-lg font-bold text-gray-500 transition-colors hover:bg-surface-hover"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Visibility + row actions */}
      <div className="flex items-center justify-between gap-1 sm:justify-end">
        {/* On a phone the switch sits alone on its own row, where a bare toggle
            with nothing beside it reads as an unfinished control. */}
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 sm:hidden" aria-hidden="true">
            {item.isAvailable ? "Visible to students" : "Hidden from students"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={item.isAvailable}
            aria-label={`${item.isAvailable ? "Hide" : "Show"} ${item.name} on the student menu`}
            onClick={() => void onPatch({ isAvailable: !item.isAvailable })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              item.isAvailable ? "bg-emerald-500" : "bg-gray-300"
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
                item.isAvailable ? "left-[1.375rem]" : "left-0.5"
              }`}
            />
          </button>
        </span>

        <div className="flex items-center">
          <IconButton label={`Edit ${item.name}`} onClick={onEdit}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
            />
          </IconButton>
          <IconButton label={`Delete ${item.name}`} tone="danger" onClick={onDelete}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
            />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

function IconButton({
  label,
  onClick,
  children,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        tone === "danger" ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-surface-hover hover:text-brand-700"
      }`}
    >
      <svg className="h-[1.15rem] w-[1.15rem]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
