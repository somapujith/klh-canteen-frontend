import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiClient } from "../../lib/apiClient";
import { adminErrorMessage } from "../../lib/adminUsers";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { AdminNav } from "../../components/AdminNav";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { CategorySection } from "../../components/admin/menu/CategorySection";
import { MenuItemFormModal } from "../../components/admin/menu/MenuItemFormModal";
import { MenuToolbar } from "../../components/admin/menu/MenuToolbar";
import { useSSE, type StockDelta } from "../../hooks/useSSE";
import type { Category, MenuItem } from "../../types/admin";
import { applyStockDelta } from "../../lib/menu";
import {
  countItems,
  filterMenu,
  findItem,
  loadMenuPrefs,
  patchItemIn,
  reorderCategories,
  saveMenuPrefs,
  type MenuDensity,
  type MenuFilter,
} from "../../lib/menuAdmin";

/** What the confirm dialog is currently asking about. */
type Pending =
  | { kind: "deleteItem"; item: MenuItem }
  | { kind: "deleteCategory"; category: Category }
  | { kind: "bulk"; category: Category; isAvailable: boolean };

export function AdminMenuPage() {
  const { token, userId } = useAuth();
  const { showToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MenuFilter>("ALL");

  const [itemModal, setItemModal] = useState<{ editing: MenuItem | null; categoryId?: string } | null>(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMenu = useCallback(async () => {
    try {
      // admin=true is load-bearing twice over: it keeps switched-off items in
      // the response (without it, hiding an item removed it from the only page
      // that could un-hide it), and it returns the physical stockQty rather
      // than the customer-facing "still buyable" figure, which is the number an
      // admin restocks against.
      const data = await apiClient.get<{ categories: Category[] }>("/menu?admin=true");
      setCategories(data.categories);
      setLoadError(null);
    } catch (err) {
      setLoadError(adminErrorMessage(err, "Could not load the menu"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  // STOCK deltas carry an absolute level — patch the row rather than refetching the whole menu.
  useSSE(["MENU_UPDATE"], {
    onDelta: (delta) => {
      if (delta.kind === "STOCK") {
        setCategories((prev) => applyStockDelta(prev, delta as StockDelta));
      } else {
        void loadMenu();
      }
    },
    onResync: () => void loadMenu(),
  });

  /**
   * Inline edits apply locally first and only roll back if the server refuses.
   * The old page PATCHed and then refetched the entire menu for every stock
   * nudge, so a one-portion correction cost a full round trip before the number
   * on screen moved at all.
   */
  const patchItem = useCallback(
    async (itemId: string, patch: Partial<MenuItem>): Promise<boolean> => {
      const before = findItem(categories, itemId);
      setCategories((prev) => patchItemIn(prev, itemId, patch));

      try {
        await apiClient.patch(`/admin/menu-items/${itemId}`, patch, token ?? undefined);
        return true;
      } catch (err) {
        if (before) {
          // Restore only the fields this call touched: a realtime stock push
          // may have landed in the meantime and must not be undone with them.
          const revert = Object.fromEntries(
            Object.keys(patch).map((key) => [key, before[key as keyof MenuItem]])
          ) as Partial<MenuItem>;
          setCategories((prev) => patchItemIn(prev, itemId, revert));
        }
        showToast(adminErrorMessage(err, "Could not save that change"), "error");
        return false;
      }
    },
    [categories, showToast, token]
  );

  const renameCategory = useCallback(
    async (categoryId: string, name: string): Promise<boolean> => {
      try {
        await apiClient.patch(`/admin/categories/${categoryId}`, { name }, token ?? undefined);
        setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, name } : c)));
        showToast("Category renamed", "success");
        return true;
      } catch (err) {
        showToast(adminErrorMessage(err, "Could not rename this category"), "error");
        return false;
      }
    },
    [showToast, token]
  );

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    const name = new FormData(e.currentTarget as HTMLFormElement).get("name");
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return;

    setBusy(true);
    try {
      await apiClient.post(
        "/admin/categories",
        { name: trimmed, sortOrder: categories.length },
        token ?? undefined
      );
      setCategoryModal(false);
      showToast(`Added ${trimmed}`, "success");
      await loadMenu();
    } catch (err) {
      showToast(adminErrorMessage(err, "Could not add this category"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function runPending() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "deleteItem") {
        await apiClient.delete(`/admin/menu-items/${pending.item.id}`, token ?? undefined);
        showToast(`Deleted ${pending.item.name}`, "success");
      } else if (pending.kind === "deleteCategory") {
        await apiClient.delete(`/admin/categories/${pending.category.id}`, token ?? undefined);
        showToast(`Deleted ${pending.category.name}`, "success");
      } else {
        await apiClient.patch(
          `/admin/categories/${pending.category.id}/bulk-items`,
          { isAvailable: pending.isAvailable },
          token ?? undefined
        );
        showToast(
          `${pending.isAvailable ? "Showing" : "Hid"} every item in ${pending.category.name}`,
          "success"
        );
      }
      setPending(null);
      await loadMenu();
    } catch (err) {
      // The real reason, not a generic "make sure it contains no menu items" —
      // the backend already says which constraint refused.
      showToast(adminErrorMessage(err, "That action did not go through"), "error");
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => countItems(categories), [categories]);
  const visible = useMemo(() => filterMenu(categories, query, filter), [categories, query, filter]);
  const isFiltering = query.trim() !== "" || filter !== "ALL";

  // View preferences are restored once, from the signed-in admin's own slot, so
  // two people sharing a counter machine do not inherit each other's layout.
  const [density, setDensity] = useState<MenuDensity>("comfortable");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    const prefs = loadMenuPrefs(userId);
    setDensity(prefs.density);
    setCollapsed(new Set(prefs.collapsed));
    setPrefsReady(true);
  }, [userId]);

  useEffect(() => {
    // Guarded on prefsReady: without it the initial defaults would be written
    // back over the stored preferences before the load effect had run.
    if (!prefsReady) return;
    saveMenuPrefs(userId, { density, collapsed: [...collapsed] });
  }, [prefsReady, userId, density, collapsed]);

  function toggleCollapsed(categoryId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  // "All" means every category currently on screen, not every category that
  // exists — the button should act on what the admin can see.
  const allCollapsed = visible.length > 0 && visible.every((category) => collapsed.has(category.id));

  function toggleAllCollapsed() {
    setCollapsed((prev) => {
      if (allCollapsed) {
        const next = new Set(prev);
        visible.forEach((category) => next.delete(category.id));
        return next;
      }
      return new Set([...prev, ...visible.map((category) => category.id)]);
    });
  }

  /**
   * Reorders locally first, then persists each changed position.
   *
   * The optimistic move is what makes dragging feel immediate; the refetch on
   * failure is what stops a rejected write leaving the screen claiming an order
   * the server does not have.
   */
  async function moveCategory(from: number, to: number) {
    const { categories: reordered, patches } = reorderCategories(categories, from, to);
    if (patches.length === 0) return;

    const previous = categories;
    setCategories(reordered);

    try {
      await Promise.all(
        patches.map((patch) =>
          apiClient.patch(`/admin/categories/${patch.id}`, { sortOrder: patch.sortOrder }, token ?? undefined)
        )
      );
    } catch (err) {
      setCategories(previous);
      showToast(adminErrorMessage(err, "Could not save the new order"), "error");
    }
  }

  return (
    <div className="min-h-screen bg-surface-muted pb-16">
      <AdminNav />

      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <MenuToolbar
          counts={counts}
          categoryCount={categories.length}
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          onAddItem={() => setItemModal({ editing: null })}
          onAddCategory={() => setCategoryModal(true)}
          density={density}
          onDensityChange={setDensity}
          allCollapsed={allCollapsed}
          onToggleAllCollapsed={toggleAllCollapsed}
        />

        {loading ? (
          <MenuSkeleton />
        ) : loadError ? (
          <EmptyCard
            title="Could not load the menu"
            body={loadError}
            actionLabel="Try again"
            onAction={() => {
              setLoading(true);
              void loadMenu();
            }}
          />
        ) : categories.length === 0 ? (
          <EmptyCard
            title="No categories yet"
            body="Categories group what the counter sells — Snacks, Beverages, Meals. Create one to start adding items."
            actionLabel="New category"
            onAction={() => setCategoryModal(true)}
          />
        ) : visible.length === 0 ? (
          <EmptyCard
            title="Nothing matches"
            body="No items match that search and filter."
            actionLabel="Clear filters"
            onAction={() => {
              setQuery("");
              setFilter("ALL");
            }}
          />
        ) : (
          <div className="space-y-4">
            {isFiltering && (
              <p className="text-xs font-semibold text-gray-500">
                Showing {visible.reduce((sum, c) => sum + c.items.length, 0)} of {counts.items} items
              </p>
            )}
            {visible.map((category, index) => (
              <CategorySection
                key={category.id}
                category={category}
                density={density}
                collapsed={collapsed.has(category.id)}
                onToggleCollapsed={() => toggleCollapsed(category.id)}
                index={index}
                total={visible.length}
                onMove={moveCategory}
                reorderable={!isFiltering}
                onRename={(name) => renameCategory(category.id, name)}
                onDelete={() => setPending({ kind: "deleteCategory", category })}
                onBulk={(isAvailable) => setPending({ kind: "bulk", category, isAvailable })}
                onAddItem={() => setItemModal({ editing: null, categoryId: category.id })}
                onPatchItem={patchItem}
                onEditItem={(item) => setItemModal({ editing: item })}
                onDeleteItem={(item) => setPending({ kind: "deleteItem", item })}
              />
            ))}
          </div>
        )}
      </div>

      {itemModal && (
        <MenuItemFormModal
          editing={itemModal.editing}
          categories={categories}
          defaultCategoryId={itemModal.categoryId}
          token={token}
          onClose={() => setItemModal(null)}
          onSaved={() => {
            const wasEditing = itemModal.editing !== null;
            setItemModal(null);
            showToast(wasEditing ? "Item updated" : "Item added", "success");
            void loadMenu();
          }}
        />
      )}

      {categoryModal && (
        <CategoryModal busy={busy} onSubmit={handleAddCategory} onClose={() => setCategoryModal(false)} />
      )}

      <ConfirmDialog
        open={pending !== null}
        title={confirmTitle(pending)}
        confirmLabel={confirmLabel(pending)}
        tone={pending?.kind === "bulk" ? "default" : "danger"}
        busy={busy}
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      >
        {confirmBody(pending)}
      </ConfirmDialog>
    </div>
  );
}

function confirmTitle(pending: Pending | null): string {
  if (!pending) return "";
  if (pending.kind === "deleteItem") return `Delete ${pending.item.name}?`;
  if (pending.kind === "deleteCategory") return `Delete ${pending.category.name}?`;
  return pending.isAvailable ? `Show all of ${pending.category.name}?` : `Hide all of ${pending.category.name}?`;
}

function confirmLabel(pending: Pending | null): string {
  if (!pending) return "Confirm";
  if (pending.kind === "bulk") return pending.isAvailable ? "Show all" : "Hide all";
  return "Delete";
}

function confirmBody(pending: Pending | null) {
  if (!pending) return null;

  if (pending.kind === "deleteItem") {
    return <p className="text-sm text-gray-600">This removes it from the menu for good. Past orders keep their record of it.</p>;
  }

  if (pending.kind === "deleteCategory") {
    const count = pending.category.items.length;
    return (
      <p className="text-sm text-gray-600">
        {count > 0
          ? `${pending.category.name} still holds ${count === 1 ? "1 item" : `${count} items`}. Delete or move them first — the server will refuse otherwise.`
          : "This category is empty, so nothing else is affected."}
      </p>
    );
  }

  const count = pending.category.items.length;
  return (
    <p className="text-sm text-gray-600">
      This changes {count === 1 ? "1 item" : `all ${count} items`} in {pending.category.name} at once.{" "}
      {pending.isAvailable
        ? "Anything with stock becomes visible to students immediately."
        : "Students stop seeing them immediately."}
    </p>
  );
}

function CategoryModal({
  busy,
  onSubmit,
  onClose,
}: {
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onClose}>
      <form
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-modal-title"
        className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="category-modal-title" className="text-lg font-bold text-gray-900">
          New category
        </h2>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-bold text-gray-500">Name</span>
          <input
            required
            autoFocus
            name="name"
            placeholder="Snacks"
            className="h-11 w-full rounded-xl bg-surface px-3 text-sm font-medium text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="h-11 flex-1 rounded-xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Adding…" : "Add category"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-11 rounded-xl px-4 text-sm font-bold text-gray-700 ring-1 ring-gray-300 hover:bg-surface-hover"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function EmptyCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-2xl bg-surface px-6 py-12 text-center flat-shadow">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-gray-500">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-5 h-11 rounded-xl bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Loading the menu…</span>
      {[0, 1].map((section) => (
        <div key={section} className="animate-pulse rounded-2xl bg-surface p-3 flat-shadow">
          <div className="h-4 w-32 rounded-full bg-gray-200" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-40 rounded-full bg-gray-200" />
                  <div className="h-3 w-20 rounded-full bg-gray-100" />
                </div>
                <div className="h-11 w-28 rounded-xl bg-gray-100" />
                <div className="h-11 w-32 rounded-xl bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
