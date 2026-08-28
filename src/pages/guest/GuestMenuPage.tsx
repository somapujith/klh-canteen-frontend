import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { ensureGuestSession } from "../../lib/guestSession";
import type { MenuCategory, MenuItemSummary } from "../../lib/menu";
import { GuestNav } from "../../components/GuestNav";
import { SkeletonCard } from "../../components/LoadingState";
import { MenuFilters, filterItems, searchAllCategories, type MenuSearchHit } from "../../components/menu/MenuFilters";
import { MenuItemCard } from "../../components/menu/MenuItemCard";
import { Button, EmptyState } from "../../components/ui";
import { useGuestCart } from "../../hooks/useGuestCart";
import { CartBar } from "../../components/CartBar";

function SearchOffIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="m16.5 16.5 4 4M8 14l6-6" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

/**
 * Public, unauthenticated menu reached by scanning the printed QR at the counter.
 * Mints a guest session on load so every later /guest/* call has a token ready.
 */
export function GuestMenuPage() {
  const { items: cartItems, addItem, updateQty, removeItem, syncStock, total } = useGuestCart();
  const navigate = useNavigate();
  const [cartOpen, setCartOpen] = useState(false);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hideSoldOut, setHideSoldOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Start the session and the menu together — neither depends on the other.
      const [, menu] = await Promise.all([
        ensureGuestSession(),
        apiClient.get<{ categories: MenuCategory[] }>("/menu"),
      ]);
      setCategories(menu.categories);
      // No SSE on the counter flow — this fetch is the only stock reconciliation a
      // guest cart (restored from sessionStorage) ever gets.
      syncStock(
        new Map(
          menu.categories.flatMap((cat) =>
            cat.items.map(
              (item) => [item.id, { price: Number(item.price), name: item.name, stockQty: item.stockQty }] as const
            )
          )
        )
      );
      setActiveTab((current) => current ?? menu.categories[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the menu");
    } finally {
      setLoading(false);
    }
  }, [syncStock]);

  useEffect(() => {
    load();
  }, [load]);

  const activeCategory = categories.find((c) => c.id === activeTab);
  const searching = query.trim().length > 0;

  /**
   * Search spans the whole menu, not the active tab. Someone at the counter who
   * has typed "samosa" has told us what they want; making them find the right
   * category first is asking them to answer a question they came here to avoid.
   */
  const searchHits = useMemo<MenuSearchHit[]>(
    () => (searching ? searchAllCategories(categories, query, hideSoldOut) : []),
    [categories, query, hideSoldOut, searching]
  );

  const browseItems = useMemo(
    () => (activeCategory ? filterItems(activeCategory.items, "", hideSoldOut) : []),
    [activeCategory, hideSoldOut]
  );

  const soldOutCount = useMemo(
    () =>
      searching
        ? categories.reduce((n, c) => n + c.items.filter((i) => i.stockQty === 0).length, 0)
        : (activeCategory?.items.filter((i) => i.stockQty === 0).length ?? 0),
    [categories, activeCategory, searching]
  );

  const qtyInCart = useCallback(
    (id: string) => cartItems.find((line) => line.menuItemId === id)?.qty ?? 0,
    [cartItems]
  );

  const handleAdd = useCallback(
    (item: MenuItemSummary, category: MenuCategory | undefined) =>
      addItem({
        menuItemId: item.id,
        name: item.name,
        price: Number(item.price),
        qty: 1,
        stockQty: item.stockQty,
        kitchen: category?.kitchen,
      }),
    [addItem]
  );

  /**
   * The rail scrolls horizontally, so the active chip can sit off-screen to the
   * right with nothing indicating it is selected. Pull it back into view
   * whenever the selection or the category list changes.
   */
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeTab) return;
    const chip = railRef.current?.querySelector<HTMLElement>(`[data-cat-id="${CSS.escape(activeTab)}"]`);
    // Feature-detected, not assumed: scrollIntoView is absent in jsdom and in
    // some older WebViews, and an unguarded call here throws inside an effect,
    // which React escalates into a blank page.
    if (typeof chip?.scrollIntoView !== "function") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    chip.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest", inline: "center" });
  }, [activeTab, categories]);

  const clearSearch = useCallback(() => {
    setQuery("");
    setHideSoldOut(false);
  }, []);

  const noResults = searching ? searchHits.length === 0 : browseItems.length === 0;
  // Distinguishes "this category is bare" from "your search/filter emptied it".
  const emptiedByFilters = noResults && (searching || hideSoldOut);

  return (
    <div className="min-h-screen bg-surface-muted pb-28 sm:pb-32 fade-in">
      {/* Marked inert while the cart sheet is open so nothing behind the backdrop
          stays focusable — WCAG 2.4.11 (focus not obscured). */}
      <div inert={cartOpen}>
      <GuestNav title="Order at the counter" />

      <div className="mx-auto w-full max-w-[100rem] px-4 pt-5">
        <div className="rounded-2xl bg-surface flat-shadow border border-border p-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-black text-gray-900 tracking-tight">No account needed</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Pick your items, pay at the counter, and track your token right here.
            </p>
          </div>
          <Link
            to="/g/orders"
            className="shrink-0 text-sm font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-4"
          >
            My orders
          </Link>
        </div>
      </div>

      {/* Manual retry, deliberately: the counter flow has no SSE and therefore no
          onResync to recover on its own. This button is the only way back. */}
      {error && (
        <div
          role="alert"
          className="mx-auto w-full max-w-[100rem] mt-4 px-4"
        >
          <div className="rounded-2xl border border-danger-100 bg-danger-50 p-4 text-sm text-danger-700 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Could not load the menu</p>
              <p className="mt-0.5 leading-relaxed">{error}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={load} className="shrink-0">
              Retry
            </Button>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-[100rem] px-4 pt-4">
        <MenuFilters
          query={query}
          onQueryChange={setQuery}
          hideSoldOut={hideSoldOut}
          onHideSoldOutChange={setHideSoldOut}
          soldOutCount={soldOutCount}
          resultCount={searching ? searchHits.length : browseItems.length}
          placeholder="Search all items"
        />
      </div>

      <div
        ref={railRef}
        className={`mx-auto w-full max-w-[100rem] px-4 pt-5 pb-2 flex gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] transition-opacity duration-200 ${
          // Search already crosses every category, so the tabs no longer steer
          // anything. Dimmed rather than removed: taking the rail out would
          // reflow the whole grid on each keystroke.
          searching ? "opacity-50" : ""
        }`}
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 w-24 bg-gray-200 rounded-full animate-pulse shrink-0" />
            ))
          : categories.map((cat) => (
              <button
                key={cat.id}
                data-cat-id={cat.id}
                aria-current={!searching && activeTab === cat.id ? "true" : undefined}
                onClick={() => {
                  setActiveTab(cat.id);
                  setQuery("");
                }}
                className={`whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 hover-scale ${
                  activeTab === cat.id
                    ? "bg-brand-600 text-white shadow-md shadow-brand-500/20 ring-2 ring-brand-500 ring-offset-2 ring-offset-surface-muted"
                    : "bg-surface text-gray-600 border border-transparent hover:bg-gray-100 hover:text-gray-900 flat-shadow"
                }`}
              >
                {cat.name}
              </button>
            ))}
      </div>

      <div className="mx-auto w-full max-w-[100rem] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 p-4 mt-2">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : emptiedByFilters ? (
          <div className="col-span-full">
            <EmptyState
              icon={<SearchOffIcon />}
              title={searching ? `No items match "${query.trim()}"` : "Everything here is sold out"}
              description={
                searching
                  ? "We searched every category, not just this one. Try a shorter word."
                  : "Turn off the sold-out filter to see what was here."
              }
              action={
                <Button variant="secondary" size="sm" onClick={clearSearch}>
                  Clear search
                </Button>
              }
            />
          </div>
        ) : noResults ? (
          <div className="col-span-full">
            <EmptyState icon={<ListIcon />} title="No items found in this category." />
          </div>
        ) : searching ? (
          searchHits.map(({ item, category }) => (
            <MenuItemCard
              key={`${category.id}:${item.id}`}
              item={item}
              inCart={qtyInCart(item.id)}
              categoryName={category.name}
              onAdd={() => handleAdd(item, category)}
            />
          ))
        ) : (
          browseItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              inCart={qtyInCart(item.id)}
              onAdd={() => handleAdd(item, activeCategory)}
            />
          ))
        )}
      </div>

      </div>

      <CartBar
        lines={cartItems}
        total={total}
        onUpdateQty={updateQty}
        onRemove={removeItem}
        onCheckout={() => navigate("/g/checkout")}
        onExpandedChange={setCartOpen}
        checkoutLabel="Review"
      />

    </div>
  );
}
