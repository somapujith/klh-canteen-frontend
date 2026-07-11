import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useCart } from "../../context/CartContext";
import { Navbar } from "../../components/Navbar";
import { SkeletonCard } from "../../components/LoadingState";

interface MenuItem {
  id: string;
  name: string;
  imageUrl: string;
  price: string;
  stockQty: number;
}

interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

export function StudentMenuPage() {
  const { items: cartItems, addItem, total } = useCart();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ categories: Category[] }>("/menu")
      .then((data) => {
        setCategories(data.categories);
        setActiveTab(data.categories[0]?.id ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const activeCategory = categories.find((c) => c.id === activeTab);

  return (
    <div className="min-h-screen bg-surface-muted pb-24 fade-in">
      <Navbar title="Menu" />
      
      {/* Menu Categories */}
      <div className="px-4 pt-5 pb-2 flex gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] sticky top-[60px] sm:top-[68px] bg-surface-muted/90 backdrop-blur-md z-30">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4 mt-2">
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
          activeCategory?.items.map((item) => (
            <div key={item.id} className="bg-surface rounded-2xl flat-shadow hover:flat-shadow-hover transition-all duration-300 overflow-hidden flex flex-col group">
              <div className="relative overflow-hidden">
                <img src={item.imageUrl} alt={item.name} className="h-32 w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                {item.stockQty === 0 && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
                    <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">SOLD OUT</span>
                  </div>
                )}
              </div>
              <div className="p-3.5 flex-1 flex flex-col gap-1.5">
                <h3 className="font-semibold text-gray-800 text-sm leading-tight line-clamp-2">{item.name}</h3>
                <div className="flex items-center justify-between mt-auto">
                  <p className="text-brand-600 font-bold">₹{item.price}</p>
                  <p className={`text-xs font-medium ${item.stockQty < 5 && item.stockQty > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                    {item.stockQty > 0 ? `${item.stockQty} left` : ''}
                  </p>
                </div>
                <button
                  disabled={item.stockQty === 0}
                  onClick={() =>
                    addItem({ menuItemId: item.id, name: item.name, price: Number(item.price), qty: 1, stockQty: item.stockQty })
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
          ))
        )}
      </div>

      {/* Floating Cart Summary */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 glass-panel rounded-2xl shadow-xl p-4 flex items-center justify-between z-50 fade-in border border-gray-200/50">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">Your Order</p>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-gray-900 text-lg">₹{total.toFixed(2)}</span>
              <span className="text-sm font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md">{cartItems.length} item(s)</span>
            </div>
          </div>
          <button
            onClick={() => navigate("/student/checkout")}
            className="rounded-xl bg-brand-600 text-white px-5 py-2.5 font-semibold hover-scale shadow-md shadow-brand-500/20 focus:outline-none focus:ring-2 focus:ring-brand-500/50 flex items-center gap-2"
          >
            Checkout
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
