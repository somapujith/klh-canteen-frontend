import { SearchInput } from "../../SearchInput";
import type { MenuCounts, MenuDensity, MenuFilter } from "../../../lib/menuAdmin";

interface Props {
  counts: MenuCounts;
  categoryCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  filter: MenuFilter;
  onFilterChange: (filter: MenuFilter) => void;
  onAddItem: () => void;
  onAddCategory: () => void;
  density: MenuDensity;
  onDensityChange: (density: MenuDensity) => void;
  allCollapsed: boolean;
  onToggleAllCollapsed: () => void;
}

/**
 * The page header and the two things an admin actually arrives wanting: find
 * one item, or see everything that needs attention. The filter chips are
 * counts first — "Sold out 2" is the whole reason to open this page after a
 * lunch rush, and it used to require scrolling every category to discover.
 */
export function MenuToolbar({
  counts,
  categoryCount,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  onAddItem,
  onAddCategory,
  density,
  onDensityChange,
  allCollapsed,
  onToggleAllCollapsed,
}: Props) {
  const compact = density === "compact";
  const chips: { key: MenuFilter; label: string; count: number; tone: string }[] = [
    { key: "ALL", label: "All items", count: counts.items, tone: "text-gray-700" },
    { key: "LOW", label: "Low stock", count: counts.low, tone: "text-amber-800" },
    { key: "SOLD_OUT", label: "Sold out", count: counts.soldOut, tone: "text-red-700" },
    { key: "HIDDEN", label: "Hidden", count: counts.hidden, tone: "text-gray-600" },
  ];

  return (
    // Sticky because this bar is the only way to find one item among forty, and
    // it is needed most precisely when the page has been scrolled. The negative
    // top margin and matching padding let the sticky background cover the gap
    // the page's own padding would otherwise leave above it.
    <div className="sticky top-0 z-20 -mx-4 -mt-4 space-y-3 border-b border-gray-100 bg-surface-muted/95 px-4 pb-3 pt-4 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Menu</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {categoryCount === 1 ? "1 category" : `${categoryCount} categories`} ·{" "}
            {counts.items === 1 ? "1 item" : `${counts.items} items`} · {counts.live} live
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddCategory}
            className="h-11 rounded-xl bg-surface px-3.5 text-sm font-bold text-gray-700 ring-1 ring-gray-200 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            New category
          </button>
          <button
            type="button"
            onClick={onAddItem}
            disabled={categoryCount === 0}
            title={categoryCount === 0 ? "Create a category first" : undefined}
            className="h-11 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Add item
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          value={query}
          onChange={onQueryChange}
          label="Search menu items"
          placeholder="Search items or categories…"
          inputMode="search"
          className="w-full lg:w-64 lg:shrink-0"
        />

        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter items">
            {chips.map((chip) => {
              const active = filter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onFilterChange(chip.key)}
                  className={`inline-flex h-9 items-center rounded-full px-3.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    active
                      ? "bg-gray-900 text-white"
                      : `bg-surface ring-1 ring-gray-200 hover:bg-surface-hover ${chip.tone}`
                  }`}
                >
                  {chip.label}
                  <span
                    className={`ml-1.5 min-w-5 rounded-full px-1 text-center tabular-nums ${
                      active ? "text-white/70" : "text-gray-400"
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* View controls sit apart from the filters: these change how the list
              is drawn, not which items are in it. The divider makes that split
              legible instead of reading as one undifferentiated row of pills. */}
          <div className="ml-auto hidden h-6 w-px bg-gray-200 lg:block" aria-hidden="true" />

          <div className="flex gap-1.5 max-lg:ml-auto" role="group" aria-label="View options">
            <button
              type="button"
              onClick={onToggleAllCollapsed}
              className="inline-flex h-9 items-center rounded-full bg-surface px-3.5 text-xs font-bold text-gray-600 ring-1 ring-gray-200 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
            <button
              type="button"
              aria-pressed={compact}
              onClick={() => onDensityChange(compact ? "comfortable" : "compact")}
              title={compact ? "Switch to comfortable rows" : "Switch to compact rows"}
              className={`inline-flex h-9 items-center rounded-full px-3.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                compact
                  ? "bg-gray-900 text-white"
                  : "bg-surface text-gray-600 ring-1 ring-gray-200 hover:bg-surface-hover"
              }`}
            >
              Compact
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
