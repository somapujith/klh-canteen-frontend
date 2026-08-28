import { MenuCardImage } from "../MenuCardImage";
import type { MenuItemSummary } from "../../lib/menu";

/** Below this, the stock line switches from quiet grey to a warning tone. */
export const LOW_STOCK_AT = 5;

/**
 * The stock line under the price.
 *
 * Both menus used to render an empty string at zero, so the one state a
 * customer most needs to read — "you cannot have this" — was the only one with
 * no words on it, and the greyed image was left to imply it. Three explicit
 * states now, each carrying its own text.
 */
export function StockLine({ stockQty }: { stockQty: number }) {
  if (stockQty <= 0) {
    return <p className="text-xs font-semibold text-danger-600">Sold out</p>;
  }
  if (stockQty < LOW_STOCK_AT) {
    return <p className="text-xs font-semibold text-warning-700">Only {stockQty} left</p>;
  }
  return <p className="text-xs font-medium text-gray-500">{stockQty} left</p>;
}

export interface MenuItemCardProps {
  item: MenuItemSummary;
  inCart: number;
  /** Set only on search results, where the hit may come from an inactive tab. */
  categoryName?: string;
  onAdd: () => void;
}

/**
 * One menu tile, shared by the student menu and the walk-up guest menu.
 *
 * Shared deliberately: the two pages diverge in how they fetch (the student
 * page runs SSE, the counter flow is fetch-and-retry by design) but a menu item
 * must look and behave identically in both, or the same dish reads as two
 * different products. Keep it presentational — every page-specific concern
 * (cart wiring, kitchen, session) stays with the caller.
 */
export function MenuItemCard({ item, inCart, categoryName, onAdd }: MenuItemCardProps) {
  const soldOut = item.stockQty === 0;
  const atCeiling = inCart >= item.stockQty;

  return (
    <div
      className={`bg-surface rounded-2xl flat-shadow overflow-hidden flex flex-col group ${
        // A sold-out card is not actionable, so it does not get the affordances
        // of one: no lift, no image zoom, nothing that invites a click.
        soldOut ? "opacity-75" : "transition-all duration-300 hover:flat-shadow-hover"
      }`}
    >
      <div className="relative overflow-hidden">
        <MenuCardImage
          item={item}
          className={`aspect-[4/3] w-full object-cover ${
            soldOut ? "opacity-50 grayscale" : "transition-transform duration-500 group-hover:scale-105"
          }`}
        />
        {inCart > 0 && !soldOut && (
          <span
            key={inCart}
            className="count-pop absolute top-2 right-2 bg-brand-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm"
          >
            {inCart} in cart
          </span>
        )}
        {soldOut && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center">
            <span className="bg-danger-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
              SOLD OUT
            </span>
          </div>
        )}
      </div>
      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        {/* Only search results carry this. It is what makes a cross-category hit
            legible instead of looking like the active tab grew an extra item. */}
        {categoryName && (
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{categoryName}</p>
        )}
        <h3 className="font-semibold text-gray-800 text-sm leading-tight line-clamp-2">{item.name}</h3>
        <div className="flex items-center justify-between gap-2 mt-auto">
          <p className="text-brand-600 font-bold">₹{item.price}</p>
          <StockLine stockQty={item.stockQty} />
        </div>
        <button
          disabled={soldOut || atCeiling}
          onClick={onAdd}
          className="mt-2 w-full rounded-xl bg-gray-100 text-brand-700 font-medium text-sm py-2 hover:bg-brand-50 hover:text-brand-800 transition-colors disabled:opacity-50 disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30 flex justify-center items-center gap-1 active:scale-95"
        >
          {!soldOut && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          )}
          {soldOut ? "Unavailable" : atCeiling ? "All in cart" : inCart > 0 ? "Add another" : "Add"}
        </button>
      </div>
    </div>
  );
}
