import { useEffect, useState, type FormEvent } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";

interface MenuItem {
  id: string;
  name: string;
  imageUrl: string;
  price: string;
  stockQty: number;
  categoryId: string;
}

interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

export function AdminMenuPage() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [form, setForm] = useState({ name: "", imageUrl: "", price: "", stockQty: "", categoryId: "" });

  function loadMenu() {
    apiClient.get<{ categories: Category[] }>("/menu").then((data) => setCategories(data.categories));
  }

  useEffect(loadMenu, []);

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    await apiClient.post("/admin/categories", { name: newCategoryName, sortOrder: categories.length }, token ?? undefined);
    setNewCategoryName("");
    loadMenu();
  }

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    await apiClient.post(
      "/admin/menu-items",
      { ...form, price: form.price, stockQty: Number(form.stockQty) },
      token ?? undefined
    );
    setForm({ name: "", imageUrl: "", price: "", stockQty: "", categoryId: "" });
    loadMenu();
  }

  async function handleStockChange(itemId: string, stockQty: number) {
    await apiClient.patch(`/admin/menu-items/${itemId}`, { stockQty }, token ?? undefined);
    loadMenu();
  }

  async function handlePriceChange(itemId: string, price: string) {
    await apiClient.patch(`/admin/menu-items/${itemId}`, { price }, token ?? undefined);
    loadMenu();
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <AdminNav />

      <div className="max-w-3xl mx-auto p-4 space-y-6">
        <form onSubmit={handleAddCategory} className="bg-white rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row gap-3">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category name"
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2"
          />
          <button className="rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700">
            Add Category
          </button>
        </form>

        <form onSubmit={handleAddItem} className="bg-white rounded-2xl shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Item name"
            required
            className="rounded-xl border border-gray-300 px-3 py-2"
          />
          <input
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="Image URL"
            required
            className="rounded-xl border border-gray-300 px-3 py-2"
          />
          <input
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="Price e.g. 20.00"
            required
            className="rounded-xl border border-gray-300 px-3 py-2"
          />
          <input
            value={form.stockQty}
            onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
            placeholder="Stock quantity"
            type="number"
            required
            className="rounded-xl border border-gray-300 px-3 py-2"
          />
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            required
            className="col-span-2 rounded-xl border border-gray-300 px-3 py-2"
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="col-span-2 rounded-xl bg-brand-600 text-white py-2 text-sm font-medium hover:bg-brand-700">
            Add Item
          </button>
        </form>

        {categories.map((cat) => (
          <div key={cat.id} className="bg-white rounded-2xl shadow-sm p-4">
            <h2 className="font-semibold text-brand-900 mb-3">{cat.name}</h2>
            <div className="space-y-2">
              {cat.items.map((item) => (
                <div key={item.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 border-b border-gray-100 pb-2">
                  <img src={item.imageUrl} alt={item.name} className="h-12 w-12 rounded-lg object-cover shrink-0" />
                  <span className="flex-1 text-sm min-w-[120px]">{item.name}</span>
                  <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                    <div className="flex-1 sm:w-24 flex items-center gap-2">
                      <span className="text-xs text-gray-500 sm:hidden">Price</span>
                      <input
                        defaultValue={item.price}
                        onBlur={(e) => handlePriceChange(item.id, e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex-1 sm:w-24 flex items-center gap-2">
                      <span className="text-xs text-gray-500 sm:hidden">Stock</span>
                      <input
                        type="number"
                        defaultValue={item.stockQty}
                        onBlur={(e) => handleStockChange(item.id, Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
