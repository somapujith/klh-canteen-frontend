import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useCart } from "../../context/CartContext";
import { Navbar } from "../../components/Navbar";
import { SkeletonCard } from "../../components/LoadingState";
import { CartBar } from "../../components/CartBar";
import { MenuCardImage } from "../../components/MenuCardImage";
import { ActiveOrdersBanner, ACTIVE_ORDER_STATUSES, type ActiveOrder } from "../../components/student/ActiveOrdersBanner";
import { useAuth } from "../../context/AuthContext";
import { useSSE, type OrderStatusDelta, type StockDelta } from "../../hooks/useSSE";
import { applyStockDelta, type MenuCategory } from "../../lib/menu";

export function StudentMenuPage() {
  const { items: cartItems, addItem, updateQty, removeItem, syncStock, total } = useCart();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cartOpen, setCartOpen] = useState(false);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

      {/* Menu Categories */}
      <div className="mx-auto w-full max-w-[100rem] px-4 pt-5 pb-2 flex gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sticky top-[60px] sm:top-[68px] bg-surface-muted/90 backdrop-blur-md z-30">
        {loading ? (
          // Category Skeletons
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 w-24 bg-gray-200 rounded-full animate-pulse shrink-0"></div>
          ))
        ) : (
          categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
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
        ) : activeCategory?.items.length === 0 ? (
          <div className="col-span-full py-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No items found in this category.</p>
          </div>
        ) : (
          activeCategory?.items.map((item) => {
            const inCart = cartItems.find((line) => line.menuItemId === item.id)?.qty ?? 0;
            const soldOut = item.stockQty === 0;
            return (
            <div key={item.id} className="bg-surface rounded-2xl flat-shadow hover:flat-shadow-hover transition-all duration-300 overflow-hidden flex flex-col group">
              <div className="relative overflow-hidden">
                <MenuCardImage
                  item={item}
                  className={`aspect-[4/3] w-full object-cover transition-transform duration-500 ${soldOut ? 'opacity-50 grayscale' : 'group-hover:scale-105'}`}
                />
                {inCart > 0 && !soldOut && (
                  <span className="absolute top-2 right-2 bg-brand-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                    {inCart} in cart
                  </span>
                )}
                {soldOut && (
                  <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center">
                    <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">SOLD OUT</span>
                  </div>
                )}
              </div>
              <div className="p-3.5 flex-1 flex flex-col gap-1.5">
                <h3 className="font-semibold text-gray-800 text-sm leading-tight line-clamp-2">{item.name}</h3>
                <div className="flex items-center justify-between mt-auto">
                  <p className="text-brand-600 font-bold">₹{item.price}</p>
                  <p className={`text-xs font-medium ${item.stockQty < 5 && item.stockQty > 0 ? 'text-orange-500' : 'text-gray-500'}`}>
                    {item.stockQty > 0 ? `${item.stockQty} left` : ''}
                  </p>
                </div>
                <button
                  disabled={soldOut || inCart >= item.stockQty}
                  onClick={() =>
                    addItem({
                      menuItemId: item.id,
                      name: item.name,
                      price: Number(item.price),
                      qty: 1,
                      stockQty: item.stockQty,
                      kitchen: activeCategory?.kitchen,
                    })
                  }
                  className="mt-2 w-full rounded-xl bg-gray-100 text-brand-700 font-medium text-sm py-2 hover:bg-brand-50 hover:text-brand-800 transition-colors disabled:opacity-50 disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500/30 flex justify-center items-center gap-1 active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  {inCart > 0 ? "Add another" : "Add"}
                </button>
              </div>
            </div>
            );
          })
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
