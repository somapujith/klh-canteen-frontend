import { useState, type DragEvent, type FormEvent } from "react";
import type { Category, MenuItem } from "../../../types/admin";
import { itemStatus, type MenuDensity } from "../../../lib/menuAdmin";
import { MenuItemRow } from "./MenuItemRow";

interface Props {
  category: Category;
  density: MenuDensity;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /**
   * Reordering. `index`/`total` drive the keyboard controls; native drag and
   * drop is not reachable from a keyboard, so a drag handle on its own would
   * make ordering a mouse-only feature.
   */
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  /** Suppressed while a search or filter is narrowing the list — see the note on the handle. */
  reorderable: boolean;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
  onBulk: (isAvailable: boolean) => void;
  onAddItem: () => void;
  onPatchItem: (itemId: string, patch: Partial<MenuItem>) => Promise<boolean>;
  onEditItem: (item: MenuItem) => void;
  onDeleteItem: (item: MenuItem) => void;
  /** menuItemId -> how many students are waiting for it to come back. */
  stockRequests: Map<string, number>;
  /** The item whose notification is in flight, if any. */
  notifyingItemId: string | null;
  onNotifyRestock: (menuItemId: string) => void;
}

export function CategorySection({
  category,
  density,
  collapsed,
  onToggleCollapsed,
  index,
  total,
  onMove,
  reorderable,
  onRename,
  onDelete,
  onBulk,
  onAddItem,
  onPatchItem,
  onEditItem,
  onDeleteItem,
  stockRequests,
  notifyingItemId,
  onNotifyRestock,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const [dragOver, setDragOver] = useState(false);

  function handleDragStart(e: DragEvent<HTMLElement>) {
    e.dataTransfer.effectAllowed = "move";
    // Some browsers refuse to start a drag without payload, and the index is
    // all the drop target needs.
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(e: DragEvent<HTMLElement>) {
    if (!reorderable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDrop(e: DragEvent<HTMLElement>) {
    if (!reorderable) return;
    e.preventDefault();
    setDragOver(false);
    const from = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isInteger(from)) onMove(from, index);
  }

  const itemCount = category.items.length;

  const hiddenCount = category.items.filter((item) => itemStatus(item) === "HIDDEN").length;

  async function submitRename(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (!next || next === category.name) {
      setRenaming(false);
      return;
    }
    if (await onRename(next)) setRenaming(false);
  }

  return (
    <section
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`overflow-hidden rounded-2xl bg-surface flat-shadow transition-shadow ${
        dragOver ? "ring-2 ring-brand-500" : ""
      }`}
    >
      {/* Column on phones: with the title and the four actions on one row, the
          truncating <h2> was allowed to shrink to zero and the category name
          vanished behind "Hide all". */}
      <header className="flex flex-col gap-1.5 border-b border-gray-100 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
        {renaming ? (
          <form onSubmit={submitRename} className="flex flex-1 items-center gap-2">
            <input
              autoFocus
              value={draft}
              aria-label={`Rename ${category.name}`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
              className="h-10 min-w-0 flex-1 rounded-xl bg-surface px-3 text-sm font-bold text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              className="h-10 rounded-xl bg-brand-600 px-3.5 text-sm font-bold text-white hover:bg-brand-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="h-10 rounded-xl px-3 text-sm font-semibold text-gray-600 hover:bg-surface-hover"
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {/* Reordering is disabled while a search or filter is active: the
                  visible list is a subset, so "move to position 2" would mean
                  a different thing than the admin can see. */}
              {reorderable && (
                <span
                  draggable
                  onDragStart={handleDragStart}
                  aria-hidden="true"
                  title="Drag to reorder"
                  className="hidden shrink-0 cursor-grab px-1 text-gray-300 hover:text-gray-500 active:cursor-grabbing sm:block"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M7 4a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2zm-6 5a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z" />
                  </svg>
                </span>
              )}

              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-expanded={!collapsed}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 pr-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <svg
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                <h2 className="truncate text-sm font-bold uppercase tracking-[0.14em] text-gray-900">
                  {category.name}
                </h2>
                <span className="shrink-0 text-xs font-medium text-gray-400">
                  {itemCount === 1 ? "1 item" : `${itemCount} items`}
                  {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
                </span>
              </button>
            </div>

            <div className="-mx-1 flex items-center gap-1 sm:mx-0">
              {reorderable && total > 1 && (
                <>
                  <SecondaryButton
                    onClick={() => onMove(index, index - 1)}
                    disabled={index === 0}
                    label={`Move ${category.name} up`}
                  >
                    ↑
                  </SecondaryButton>
                  <SecondaryButton
                    onClick={() => onMove(index, index + 1)}
                    disabled={index === total - 1}
                    label={`Move ${category.name} down`}
                  >
                    ↓
                  </SecondaryButton>
                  <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
                </>
              )}
              {itemCount > 0 && (
                <>
                  <SecondaryButton onClick={() => onBulk(false)}>Hide all</SecondaryButton>
                  <SecondaryButton onClick={() => onBulk(true)}>Show all</SecondaryButton>
                  <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
                </>
              )}
              <SecondaryButton
                onClick={() => {
                  setDraft(category.name);
                  setRenaming(true);
                }}
              >
                Rename
              </SecondaryButton>
              <SecondaryButton onClick={onDelete} tone="danger">
                Delete
              </SecondaryButton>
            </div>
          </>
        )}
      </header>

      {collapsed ? null : itemCount === 0 ? (
        <div className="px-4 py-7 text-center">
          <p className="text-sm font-medium text-gray-500">Nothing in this category yet.</p>
          <button
            type="button"
            onClick={onAddItem}
            className="mt-2.5 h-10 rounded-xl bg-surface-muted px-4 text-sm font-bold text-brand-700 hover:bg-surface-hover"
          >
            Add the first item
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {category.items.map((item) => (
            <MenuItemRow
              key={item.id}
              item={item}
              density={density}
              onPatch={(patch) => onPatchItem(item.id, patch)}
              onEdit={() => onEditItem(item)}
              onDelete={() => onDeleteItem(item)}
              requestCount={stockRequests.get(item.id) ?? 0}
              notifying={notifyingItemId === item.id}
              onNotifyRestock={() => onNotifyRestock(item.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SecondaryButton({
  children,
  onClick,
  tone = "default",
  disabled = false,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  /** Accessible name, for controls whose visible content is a bare glyph. */
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`h-9 rounded-lg px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-30 ${
        tone === "danger"
          ? "text-gray-500 hover:bg-red-50 hover:text-red-600"
          : "text-gray-500 hover:bg-surface-hover hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}
