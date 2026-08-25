import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../../lib/apiClient";
import { adminErrorMessage } from "../../../lib/adminUsers";
import { isValidPrice } from "../../../lib/menuAdmin";
import type { Category, MenuItem } from "../../../types/admin";

interface FormState {
  name: string;
  imageUrl: string;
  price: string;
  stockQty: string;
  categoryId: string;
}

interface Props {
  /** `null` creates a new item; a MenuItem edits that item. */
  editing: MenuItem | null;
  categories: Category[];
  /** Preselected section when adding from inside a category. */
  defaultCategoryId?: string;
  token: string | null;
  onSaved: () => void;
  onClose: () => void;
}

/**
 * Creating and editing an item both live here, behind a button, rather than in
 * a form permanently parked above the menu. The page's daily job is adjusting
 * stock and visibility; adding an item is a weekly one, and it was taking the
 * whole first screen.
 */
export function MenuItemFormModal({ editing, categories, defaultCategoryId, token, onSaved, onClose }: Props) {
  const [form, setForm] = useState<FormState>(() => ({
    name: editing?.name ?? "",
    imageUrl: editing?.imageUrl ?? "",
    price: editing?.price ?? "",
    stockQty: editing ? String(editing.stockQty) : "",
    categoryId: editing?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidPrice(form.price)) {
      setError("Enter a price like 20 or 20.50.");
      return;
    }

    setSaving(true);
    setError(null);
    const body = {
      name: form.name.trim(),
      imageUrl: form.imageUrl.trim(),
      price: form.price.trim(),
      stockQty: Number(form.stockQty || 0),
      categoryId: form.categoryId,
    };

    try {
      if (editing) {
        await apiClient.patch(`/admin/menu-items/${editing.id}`, body, token ?? undefined);
      } else {
        await apiClient.post("/admin/menu-items", body, token ?? undefined);
      }
      onSaved();
    } catch (err) {
      setError(adminErrorMessage(err, "Could not save this item"));
    } finally {
      setSaving(false);
    }
  }

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={saving ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-item-modal-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="menu-item-modal-title" className="text-lg font-bold text-gray-900">
          {editing ? "Edit item" : "Add item"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <Field label="Item name">
            <input
              required
              autoFocus
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Image URL" hint="Paste a link to a square photo.">
            <div className="flex items-center gap-2.5">
              <input
                required
                type="url"
                value={form.imageUrl}
                onChange={(e) => {
                  set({ imageUrl: e.target.value });
                  setImageBroken(false);
                }}
                className={INPUT_CLASS}
              />
              {/* Live preview, because a wrong URL is otherwise only discovered
                  by a student looking at a broken tile. */}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-muted ring-1 ring-gray-200">
                {form.imageUrl && !imageBroken ? (
                  <img
                    src={form.imageUrl}
                    alt=""
                    onError={() => setImageBroken(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[0.6rem] font-bold uppercase text-gray-400">
                    {imageBroken ? "bad" : "—"}
                  </span>
                )}
              </span>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹)">
              <input
                required
                inputMode="decimal"
                placeholder="20.00"
                value={form.price}
                onChange={(e) => set({ price: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Stock">
              <input
                required
                type="number"
                min={0}
                value={form.stockQty}
                onChange={(e) => set({ stockQty: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
          </div>

          <Field label="Category">
            <select
              required
              value={form.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="h-11 flex-1 rounded-xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : editing ? "Save changes" : "Add item"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-11 rounded-xl px-4 text-sm font-bold text-gray-700 ring-1 ring-gray-300 hover:bg-surface-hover"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

const INPUT_CLASS =
  "h-11 w-full rounded-xl bg-surface px-3 text-sm font-medium text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-brand-500";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-gray-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}
