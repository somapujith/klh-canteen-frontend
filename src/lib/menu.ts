import type { Kitchen } from "../types/admin";
import type { StockDelta } from "../hooks/useSSE";

const API_URL = import.meta.env.VITE_API_URL as string;

export interface MenuItemSummary {
  id: string;
  name: string;
  /** Legacy pasted link. See `MenuItem` in types/admin.ts. */
  imageUrl: string | null;
  /** Content address of an uploaded image, or null if none has been uploaded. */
  imageHash?: string | null;
  price: string;
  stockQty: number;
  isAvailable?: boolean;
  categoryId?: string;
  /** Free text like "500g" or "6 pcs". Only present when the admin has made it visible. */
  servingInfo?: string | null;
}

/** The two image fields every menu-item-shaped object carries, and nothing else. */
export interface MenuImageRef {
  imageUrl: string | null;
  imageHash?: string | null;
}

/**
 * The one place that decides what an item's `<img src>` should be.
 *
 * Order matters and is not arbitrary:
 *   1. `imageHash` — bytes we hold in our own database, served from
 *      `/menu/items/:id/image/:hash`. Content-addressed, so it is immutable and
 *      cacheable forever, and it cannot rot the way a third-party link does.
 *      This is the whole reason uploads exist.
 *   2. `imageUrl` — a link an admin pasted before uploads existed. Kept working
 *      rather than blanked, but nothing writes it any more.
 *   3. `null` — the caller draws its placeholder tile.
 *
 * A stale hash 404s, and that is fine: the item object carries the current hash,
 * so the next render after any refetch or SSE menu push self-heals.
 */
export function menuImageSrc(item: MenuImageRef, itemId: string): string | null {
  if (item.imageHash) {
    return `${API_URL}/menu/items/${encodeURIComponent(itemId)}/image/${encodeURIComponent(item.imageHash)}`;
  }
  if (item.imageUrl) return item.imageUrl;
  return null;
}

export interface MenuCategory {
  id: string;
  name: string;
  kitchen?: Kitchen;
  sortOrder?: number;
  items: MenuItemSummary[];
}

/**
 * Apply a STOCK delta to a menu tree. `stockQty` is an ABSOLUTE level from the
 * backend, never a diff, so this is a straight overwrite of the matching item.
 * Returns the original array untouched when the item isn't on screen, so React
 * can skip the re-render.
 */
export function applyStockDelta<T extends MenuCategory>(categories: T[], delta: StockDelta): T[] {
  let changed = false;

  const next = categories.map((category) => {
    const index = category.items.findIndex((item) => item.id === delta.menuItemId);
    if (index === -1) return category;

    const item = category.items[index];
    if (item.stockQty === delta.stockQty && item.isAvailable === delta.isAvailable) return category;

    changed = true;
    const items = [...category.items];
    items[index] = { ...item, stockQty: delta.stockQty, isAvailable: delta.isAvailable };
    return { ...category, items };
  });

  return changed ? next : categories;
}
