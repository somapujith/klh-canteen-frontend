import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { ensureGuestSession } from "../../lib/guestSession";
import type { MenuCategory } from "../../lib/menu";
import { GuestNav } from "../../components/GuestNav";
import { SkeletonCard } from "../../components/LoadingState";
import { useGuestCart } from "../../hooks/useGuestCart";
import { CartBar } from "../../components/CartBar";

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

  return (
    <div className="min-h-screen bg-surface-muted pb-28 sm:pb-32 fade-in">
      {/* Marked inert while the cart sheet is open so nothing behind the backdrop
          stays focusable — WCAG 2.4.11 (focus not obscured). */}
      <div inert={cartOpen}>
      <GuestNav title="Order at the counter" />

      <div className="px-4 pt-5">
        <div className="rounded-2xl bg-surface flat-shadow border border-gray-100 p-4 flex items-start justify-between gap-4">
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

      {error && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button onClick={load} className="underline font-medium shrink-0">
            Retry
          </button>
        </div>
      )}

      <div className="mx-auto w-full max-w-[100rem] px-4 pt-4 pb-2 flex gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 w-24 bg-gray-200 rounded-full animate-pulse shrink-0" />
            ))
          : categories.map((cat) => (
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
            ))}
      </div>

      <div className="mx-auto w-full max-w-[100rem] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 p-4 mt-2">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : activeCategory?.items.length === 0 ? (
          <div className="col-span-full py-12 text-center">
            <p className="text-gray-500 font-medium">No items found in this category.</p>
          </div>
        ) : (
          activeCategory?.items.map((item) => {
            const inCart = cartItems.find((line) => line.menuItemId === item.id)?.qty ?? 0;
            const soldOut = item.stockQty === 0;
            return (
              <div
                key={item.id}
                className="bg-surface rounded-2xl flat-shadow hover:flat-shadow-hover transition-all duration-300 overflow-hidden flex flex-col group"
              >
                <div className="relative overflow-hidden">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    className={`aspect-[4/3] w-full object-cover transition-transform duration-500 ${
                      soldOut ? "opacity-50 grayscale" : "group-hover:scale-105"
                    }`}
                  />
                  {soldOut && (
                    <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center">
                      <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                        SOLD OUT
                      </span>
                    </div>
                  )}
                  {inCart > 0 && !soldOut && (
                    <span className="absolute top-2 right-2 bg-brand-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                      {inCart} in cart
                    </span>
                  )}
                </div>
                <div className="p-3.5 flex-1 flex flex-col gap-1.5">
                  <h3 className="font-semibold text-gray-800 text-sm leading-tight line-clamp-2">{item.name}</h3>
                  <div className="flex items-center justify-between mt-auto">
                    <p className="text-brand-600 font-bold">₹{item.price}</p>
                    <p
                      className={`text-xs font-medium ${
                        item.stockQty < 5 && item.stockQty > 0 ? "text-orange-500" : "text-gray-500"
                      }`}
                    >
                      {item.stockQty > 0 ? `${item.stockQty} left` : ""}
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
                    Add
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
        onCheckout={() => navigate("/g/checkout")}
        onExpandedChange={setCartOpen}
        checkoutLabel="Review"
      />

    </div>
  );
}
