import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { Navbar } from "../../components/Navbar";

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
  const { token } = useAuth();
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

  if (loading) return <div className="p-8 text-center text-gray-500">Loading menu...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Navbar title="Menu" />
      <div className="px-4 pt-2 text-right">
        <Link to="/student/orders" className="text-sm text-brand-700 underline">My Orders</Link>
      </div>

      <div className="px-4 pt-4 flex gap-2 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveTab(cat.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === cat.id ? "bg-brand-600 text-white" : "bg-white text-gray-700 border border-gray-200"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4">
        {activeCategory?.items.map((item) => (
          <div key={item.id} className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <img src={item.imageUrl} alt={item.name} className="h-28 w-full object-cover" />
            <div className="p-3 flex-1 flex flex-col gap-1">
              <h3 className="font-medium text-sm">{item.name}</h3>
              <p className="text-brand-700 font-semibold">₹{item.price}</p>
              <p className="text-xs text-gray-500">{item.stockQty} in stock</p>
              <button
                disabled={item.stockQty === 0}
                onClick={() =>
                  addItem({ menuItemId: item.id, name: item.name, price: Number(item.price), qty: 1, stockQty: item.stockQty })
                }
                className="mt-auto rounded-xl bg-brand-600 text-white text-sm py-1.5 disabled:opacity-40 hover:bg-brand-700 transition"
              >
                {item.stockQty === 0 ? "Out of stock" : "Add"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {cartItems.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white rounded-t-2xl shadow-[0_-2px_10px_rgba(0,0,0,0.08)] p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{cartItems.length} item(s)</p>
            <p className="font-semibold text-brand-900">₹{total.toFixed(2)}</p>
          </div>
          <button
            onClick={() => navigate("/student/checkout")}
            className="rounded-xl bg-brand-600 text-white px-6 py-2.5 font-medium hover:bg-brand-700 transition"
          >
            View Cart
          </button>
        </div>
      )}
    </div>
  );
}
