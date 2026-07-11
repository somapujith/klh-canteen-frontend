import { useEffect, useState, type FormEvent } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";
import { useSSE } from "../../hooks/useSSE";

interface MenuItem {
  id: string;
  name: string;
  imageUrl: string;
  price: string;
  stockQty: number;
  categoryId: string;
  isAvailable: boolean;
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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  function loadMenu() {
    apiClient.get<{ categories: Category[] }>("/menu").then((data) => setCategories(data.categories));
  }

  useEffect(loadMenu, []);

  useSSE(["MENU_UPDATE"], (event) => {
    if (event.type === "MENU_UPDATE") {
      loadMenu();
    }
  });

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

  async function handleUpdateCategory(e: FormEvent, categoryId: string) {
    e.preventDefault();
    if (!editingCategoryName.trim()) return;
    await apiClient.patch(`/admin/categories/${categoryId}`, { name: editingCategoryName }, token ?? undefined);
    setEditingCategoryId(null);
    loadMenu();
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!confirm("Are you sure you want to delete this category? Ensure all items in it are deleted first.")) return;
    try {
      await apiClient.delete(`/admin/categories/${categoryId}`, token ?? undefined);
      loadMenu();
    } catch (err: any) {
      alert("Failed to delete category. Make sure it contains no menu items.");
    }
  }

  async function handleUpdateItem(e: FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    await apiClient.patch(
      `/admin/menu-items/${editingItem.id}`,
      { 
        name: editingItem.name, 
        imageUrl: editingItem.imageUrl, 
        price: editingItem.price, 
        stockQty: Number(editingItem.stockQty), 
        categoryId: editingItem.categoryId 
      },
      token ?? undefined
    );
    setEditingItem(null);
    loadMenu();
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm("Are you sure you want to delete this menu item?")) return;
    await apiClient.delete(`/admin/menu-items/${itemId}`, token ?? undefined);
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

  async function handleAvailabilityChange(itemId: string, isAvailable: boolean) {
    await apiClient.patch(`/admin/menu-items/${itemId}`, { isAvailable }, token ?? undefined);
    loadMenu();
  }

  async function handleBulkUpdate(categoryId: string, data: { isAvailable?: boolean; stockQty?: number }) {
    if (!confirm("Are you sure you want to apply this bulk action?")) return;
    await apiClient.patch(`/admin/categories/${categoryId}/bulk-items`, data, token ?? undefined);
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
            <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
              {editingCategoryId === cat.id ? (
                <form 
                  onSubmit={(e) => handleUpdateCategory(e, cat.id)} 
                  className="flex flex-1 items-center gap-2 mr-4"
                >
                  <input
                    autoFocus
                    value={editingCategoryName}
                    onChange={(e) => setEditingCategoryName(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm font-semibold text-brand-900"
                  />
                  <button type="submit" className="text-xs bg-brand-50 text-brand-600 hover:bg-brand-100 px-3 py-1.5 rounded-lg font-medium transition-colors">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingCategoryId(null)} className="text-xs bg-gray-50 text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-lg font-medium transition-colors">
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-brand-900">{cat.name}</h2>
                  <button 
                    onClick={() => {
                      setEditingCategoryId(cat.id);
                      setEditingCategoryName(cat.name);
                    }}
                    className="text-xs text-gray-400 hover:text-brand-600 transition-colors"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleBulkUpdate(cat.id, { isAvailable: false })}
                  className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  Disable All
                </button>
                <button
                  onClick={() => handleBulkUpdate(cat.id, { isAvailable: true })}
                  className="text-xs bg-green-50 text-green-600 hover:bg-green-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  Enable All
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {cat.items.map((item) => (
                <div key={item.id} className={`flex flex-col sm:flex-row flex-wrap sm:flex-nowrap items-start sm:items-center gap-3 border-b border-gray-100 pb-3 ${!item.isAvailable || item.stockQty === 0 ? 'opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all' : ''}`}>
                  {editingItem?.id === item.id ? (
                    <form onSubmit={handleUpdateItem} className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <input
                        value={editingItem.name}
                        onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                        placeholder="Item name"
                        required
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        value={editingItem.imageUrl}
                        onChange={(e) => setEditingItem({ ...editingItem, imageUrl: e.target.value })}
                        placeholder="Image URL"
                        required
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <select
                        value={editingItem.categoryId}
                        onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
                        required
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2 col-span-1 sm:col-span-2 lg:col-span-1">
                        <button type="submit" className="flex-1 bg-brand-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-brand-700">Save</button>
                        <button type="button" onClick={() => setEditingItem(null)} className="flex-1 bg-white border border-gray-300 text-gray-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <img src={item.imageUrl} alt={item.name} className="h-12 w-12 rounded-lg object-cover shrink-0" />
                      <div className="flex-1 min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium block">{item.name}</span>
                          <button 
                            onClick={() => setEditingItem(item)}
                            className="text-xs text-gray-400 hover:text-brand-600 transition-colors"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                        {item.isAvailable && item.stockQty > 0 ? (
                          <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-md uppercase tracking-wider mt-1 inline-block">Visible to Students</span>
                        ) : (
                          <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-md uppercase tracking-wider mt-1 inline-block">Hidden from Students</span>
                        )}
                      </div>
                      <div className="flex items-end gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                        <div className="flex-1 sm:w-24 flex flex-col gap-1">
                          <span className="text-xs text-gray-500 font-medium px-1">Price (₹)</span>
                          <input
                            defaultValue={item.price}
                            onBlur={(e) => {
                              if (e.target.value !== item.price) {
                                handlePriceChange(item.id, e.target.value);
                              }
                            }}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div className="flex-1 sm:w-24 flex flex-col gap-1">
                          <span className="text-xs text-gray-500 font-medium px-1">Stock</span>
                          <input
                            type="number"
                            defaultValue={item.stockQty}
                            onBlur={(e) => {
                              if (Number(e.target.value) !== item.stockQty) {
                                handleStockChange(item.id, Number(e.target.value));
                              }
                            }}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer mb-2 ml-1">
                          <input
                            type="checkbox"
                            checked={item.isAvailable}
                            onChange={(e) => handleAvailabilityChange(item.id, e.target.checked)}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-600"
                          />
                          <span className="text-xs font-medium text-gray-700">Active</span>
                        </label>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
