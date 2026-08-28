import { SearchInput } from "../SearchInput";
import type { MenuCategory, MenuItemSummary } from "../../lib/menu";

/**
 * The menu's discovery bar: one search field plus a hide-sold-out toggle.
 *
 * It is deliberately a controlled, state-free component. Both the student menu
 * and the guest counter menu own their own query/filter state (they differ in
 * what else that state has to coordinate with — SSE on one side, a manual retry
 * path on the other), so this owns only the chrome and the layout.
 *
 * The search field itself is SearchInput, unmodified: its clear animation is
 * tuned against CSS variables in index.css and has its own tests.
 */
export interface MenuFiltersProps {
  query: string;
  onQueryChange: (query: string) => void;
  hideSoldOut: boolean;
  onHideSoldOutChange: (hide: boolean) => void;
  /**
   * Shown beside the toggle as "N sold out". Omit (or pass 0) and the count is
   * hidden — a menu with nothing sold out should not advertise the fact.
   */
  soldOutCount?: number;
  /** Result count, rendered only while a query or filter is actually narrowing things. */
  resultCount?: number;
  placeholder?: string;
  className?: string;
}

/**
 * Case-insensitive substring match on the item name.
 *
 * Lives here rather than in each page so the student and guest menus cannot
 * drift into two different definitions of "matches". MenuItemSummary carries no
 * veg/non-veg or tag field, so name is genuinely all there is to search.
 */
export function matchesQuery(item: MenuItemSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return item.name.toLowerCase().includes(q);
}

/** A category's items after search + sold-out filtering, in the original order. */
export function filterItems(
  items: MenuItemSummary[],
  query: string,
  hideSoldOut: boolean
): MenuItemSummary[] {
  return items.filter((item) => (hideSoldOut ? item.stockQty > 0 : true) && matchesQuery(item, query));
}

/**
 * Every matching item across the whole menu, tagged with the category it came
 * from. A student searching "samosa" should not have to guess which tab it
 * lives under, so search deliberately ignores the active category — the caller
 * renders `categoryName` on the card so the crossing is visible rather than
 * silent.
 */
export interface MenuSearchHit {
  item: MenuItemSummary;
  category: MenuCategory;
}

export function searchAllCategories(
  categories: MenuCategory[],
  query: string,
  hideSoldOut: boolean
): MenuSearchHit[] {
  return categories.flatMap((category) =>
    filterItems(category.items, query, hideSoldOut).map((item) => ({ item, category }))
  );
}

export function MenuFilters({
  query,
  onQueryChange,
  hideSoldOut,
  onHideSoldOutChange,
  soldOutCount = 0,
  resultCount,
  placeholder = "Search the menu",
  className = "",
}: MenuFiltersProps) {
  const narrowing = query.trim().length > 0 || hideSoldOut;

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <SearchInput
        value={query}
        onChange={onQueryChange}
        placeholder={placeholder}
        label="Search the menu"
        inputMode="search"
        className="w-full sm:w-72 sm:flex-none"
      />

      {/* A real checkbox, visually hidden rather than replaced: it keeps the
          label association, the space/enter behaviour and the focus order that
          a div-with-onClick throws away. */}
      <label
        className={`group inline-flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors duration-150 focus-within:ring-2 focus-within:ring-brand-500/40 ${
          hideSoldOut
            ? "border-brand-300 bg-brand-50 text-brand-700"
            : "border-border bg-surface text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`}
      >
        <input
          type="checkbox"
          checked={hideSoldOut}
          onChange={(e) => onHideSoldOutChange(e.target.checked)}
          className="sr-only"
        />
        <span
          aria-hidden="true"
          className={`grid h-4 w-4 place-items-center rounded border transition-colors duration-150 ${
            hideSoldOut ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-surface"
          }`}
        >
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-3 w-3 ${hideSoldOut ? "opacity-100" : "opacity-0"}`}>
            <path d="M2.5 6.5 5 9l4.5-5.5" />
          </svg>
        </span>
        Hide sold out
        {soldOutCount > 0 && (
          <span className="text-xs font-normal text-gray-400 group-hover:text-gray-500">{soldOutCount}</span>
        )}
      </label>

      {narrowing && resultCount !== undefined && (
        <p className="text-sm text-gray-500" role="status" aria-live="polite">
          {resultCount === 1 ? "1 item" : `${resultCount} items`}
        </p>
      )}
    </div>
  );
}
