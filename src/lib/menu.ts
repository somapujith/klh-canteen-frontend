import type { Kitchen } from "../types/admin";
import type { StockDelta } from "../hooks/useSSE";

export interface MenuItemSummary {
  id: string;
  name: string;
  imageUrl: string;
  price: string;
  stockQty: number;
  isAvailable?: boolean;
  categoryId?: string;
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

/** Distinct kitchens involved in a set of cart lines, for the collection-window picker. */
export function kitchensInCart(lines: { kitchen?: Kitchen }[]): Kitchen[] {
  const seen = new Set<Kitchen>();
  for (const line of lines) {
    if (line.kitchen) seen.add(line.kitchen);
  }
  return [...seen];
}
