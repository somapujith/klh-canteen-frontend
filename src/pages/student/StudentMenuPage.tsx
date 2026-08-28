import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useCart } from "../../context/CartContext";
import { Navbar } from "../../components/Navbar";
import { SkeletonCard } from "../../components/LoadingState";
import { CartBar } from "../../components/CartBar";
import { MenuCardImage } from "../../components/MenuCardImage";
import { ActiveOrdersBanner, ACTIVE_ORDER_STATUSES, type ActiveOrder } from "../../components/student/ActiveOrdersBanner";
import { MenuFilters, filterItems, searchAllCategories, type MenuSearchHit } from "../../components/menu/MenuFilters";
import { Button, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useSSE, type OrderStatusDelta, type StockDelta } from "../../hooks/useSSE";
import { applyStockDelta, type MenuCategory, type MenuItemSummary } from "../../lib/menu";

/** Below this, the stock line switches from quiet grey to a warning tone. */
const LOW_STOCK_AT = 5;

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
 * The stock line under the price.
 *
 * It used to render an empty string at zero, so the one state a student most
 * needs to read — "you cannot have this" — was the only one with no words on
 * it. Three explicit states now, each carrying its own text rather than relying
 * on the greyed image to imply it.
 */
function StockLine({ stockQty }: { stockQty: number }) {
  if (stockQty <= 0) {
    return <p className="text-xs font-semibold text-danger-600">Sold out</p>;
  }
  if (stockQty < LOW_STOCK_AT) {
    return <p className="text-xs font-semibold text-warning-700">Only {stockQty} left</p>;
  }
  return <p className="text-xs font-medium text-gray-500">{stockQty} left</p>;
}

interface MenuItemCardProps {
  item: MenuItemSummary;
  inCart: number;
  /** Set only on search results, where the hit may come from an inactive tab. */
  categoryName?: string;
  onAdd: () => void;
}

function MenuItemCard({ item, inCart, categoryName, onAdd }: MenuItemCardProps) {
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

export function StudentMenuPage() {
  const { items: cartItems, addItem, updateQty, removeItem, syncStock, total } = useCart();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cartOpen, setCartOpen] = useState(false);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [hideSoldOut, setHideSoldOut] = useState(false);
  // null = not loaded yet, distinct from [] (loaded, genuinely none).
  const [orders, setOrders] = useState<ActiveOrder[] | null>(null);

  // Guards against a stale response landing after a newer request for the
  // same resource — e.g. onResync firing fetchOrders() again before the
  // mount-time call has resolved. Last-request-wins instead of last-to-land.
  const menuRequestIdRef = useRef(0);
  const ordersRequestIdRef = useRef(0);

  const fetchMenu = useCallback(() => {
    const requestId = ++menuRequestIdRef.current;
    return apiClient
      .get<{ categories: MenuCategory[] }>("/menu")
      .then((data) => {
        if (requestId !== menuRequestIdRef.current) return;
        setCategories(data.categories);
        setActiveTab((current) => current ?? data.categories[0]?.id ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fetchOrders = useCallback(() => {
    const requestId = ++ordersRequestIdRef.current;
    return apiClient
      .get<ActiveOrder[]>("/orders/my", token ?? undefined)
      .then((data) => {
        if (requestId === ordersRequestIdRef.current) setOrders(data);
      })
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    fetchMenu();
    fetchOrders();
  }, [fetchMenu, fetchOrders]);

  // One connection for the whole page (mirrors AdminDashboardPage's
  // one-EventSource-per-page convention) rather than a second useSSE call
  // just for the active-orders banner.
  useSSE(["MENU_UPDATE", "ORDER_UPDATE"], {
    onDelta: (delta) => {
      switch (delta.kind) {
        case "STOCK":
          setCategories((prev) => applyStockDelta(prev, delta as StockDelta));
          break;
        case "ORDER_STATUS": {
          const { orderId, status } = delta as OrderStatusDelta;
          if (!orderId || typeof status !== "string") break;
          setOrders((prev) => {
            if (prev === null) return prev; // mount fetch hasn't landed yet; it'll bring the current state
            return ACTIVE_ORDER_STATUSES.has(status)
              ? prev.map((o) => (o.id === orderId ? { ...o, status } : o))
              : prev.filter((o) => o.id !== orderId);
          });
          break;
        }
        // Anything else (ITEM_UPSERT, ITEM_REMOVED, an event we don't
        // recognise) is a menu concern, not an order one — refetching
        // /orders/my here would mean every menu edit re-runs every
        // connected student's full order history for no reason.
        default:
          fetchMenu();
      }
    },
    onResync: () => {
      fetchMenu();
      fetchOrders();
    },
  });

  const activeCategory = categories.find((c) => c.id === activeTab);
  const searching = query.trim().length > 0;

  /**
   * Search spans the whole menu, not the active tab. A student typing "samosa"
   * has told us what they want; making them find the right category first is
   * asking them to answer a question they came here to avoid.
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

  const menuSnapshot = useMemo(
    () =>
      new Map(
        categories.flatMap((cat) =>
          cat.items.map((item) => [item.id, { price: Number(item.price), name: item.name, stockQty: item.stockQty }] as const)
        )
      ),
    [categories]
  );

  // SSE keeps `categories` current; the cart has to follow it, or a line keeps a
  // stock ceiling and a price that the kitchen has already moved past.
  useEffect(() => {
    if (menuSnapshot.size > 0) syncStock(menuSnapshot);
  }, [menuSnapshot, syncStock]);

  const cartCount = cartItems.reduce((sum, line) => sum + line.qty, 0);
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
   * The rail scrolls horizontally, so after a reload the active chip can sit
   * off-screen to the right with nothing indicating it is selected. Pull it
   * back into view whenever the selection or the category list changes.
   */
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeTab) return;
    const chip = railRef.current?.querySelector<HTMLElement>(`[data-cat-id="${CSS.escape(activeTab)}"]`);
    // Feature-detected, not assumed: scrollIntoView is absent in jsdom and in
    // some older WebViews, and an unguarded call here throws inside an effect,
    // which React escalates into a blank page. A rail that fails to scroll is
    // a cosmetic loss; a menu that fails to render is not.
    if (typeof chip?.scrollIntoView !== "function") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    chip.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      // `nearest` on the block axis so pulling a chip sideways never also
      // yanks the page vertically out from under the sticky rail.
      block: "nearest",
      inline: "center",
    });
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
      <Navbar
        title="Menu"
        cartCount={cartCount}
        onCartClick={cartCount > 0 ? () => navigate("/student/checkout") : undefined}
      />

      <div className="mx-auto w-full max-w-[100rem] px-4 pt-4">
        <ActiveOrdersBanner orders={orders} />
      </div>

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

      {/* Menu Categories */}
      <div
        ref={railRef}
        className={`mx-auto w-full max-w-[100rem] px-4 pt-5 pb-2 flex gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sticky top-[60px] sm:top-[68px] bg-surface-muted/90 backdrop-blur-md z-30 transition-opacity duration-200 ${
          // Search already crosses every category, so the tabs no longer steer
          // anything. Dimmed rather than removed: taking the rail out would
          // reflow the whole grid on each keystroke.
          searching ? "opacity-50" : ""
        }`}
      >
        {loading ? (
          // Category Skeletons
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 w-24 bg-gray-200 rounded-full animate-pulse shrink-0"></div>
          ))
        ) : (
          categories.map((cat) => (
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
          ))
        )}
      </div>

      {/* Menu Items Grid */}
      <div className="mx-auto w-full max-w-[100rem] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 p-4 mt-2">
        {loading ? (
          // Skeletons for items
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
        onCheckout={() => navigate("/student/checkout")}
        onExpandedChange={setCartOpen}
      />

    </div>
  );
}
