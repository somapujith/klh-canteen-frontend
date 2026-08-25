import type { Category, MenuItem } from "../types/admin";

/**
 * At or below this many portions an item is worth an admin's attention: it is
 * still sellable, so nothing is broken yet, but it is close enough to running
 * out that restocking it is a decision rather than a surprise.
 */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * The single derived answer to "what is this item doing right now".
 *
 * The old page encoded this three separate ways — a green/red badge, a dimmed
 * row, and an "Active" checkbox — which let them contradict each other: an item
 * with stock 0 and isAvailable true rendered as "Hidden from students" next to
 * a ticked Active box. Availability and stock are different facts, so they get
 * different names here and one status derived from both.
 */
export type ItemStatus = "LIVE" | "LOW" | "SOLD_OUT" | "HIDDEN";

export function itemStatus(item: Pick<MenuItem, "isAvailable" | "stockQty">): ItemStatus {
  // Switched off wins: students cannot see it whatever the stock says.
  if (!item.isAvailable) return "HIDDEN";
  if (item.stockQty <= 0) return "SOLD_OUT";
  if (item.stockQty <= LOW_STOCK_THRESHOLD) return "LOW";
  return "LIVE";
}

/** What a student would see for this item, in one phrase. */
export const STATUS_LABEL: Record<ItemStatus, string> = {
  LIVE: "Live",
  LOW: "Low stock",
  SOLD_OUT: "Sold out",
  HIDDEN: "Hidden",
};

export type MenuFilter = "ALL" | "LOW" | "SOLD_OUT" | "HIDDEN";

export interface MenuCounts {
  items: number;
  live: number;
  low: number;
  soldOut: number;
  hidden: number;
}

export function countItems(categories: Category[]): MenuCounts {
  const counts: MenuCounts = { items: 0, live: 0, low: 0, soldOut: 0, hidden: 0 };

  for (const category of categories) {
    for (const item of category.items) {
      counts.items += 1;
      switch (itemStatus(item)) {
        case "LIVE":
          counts.live += 1;
          break;
        case "LOW":
          counts.low += 1;
          break;
        case "SOLD_OUT":
          counts.soldOut += 1;
          break;
        case "HIDDEN":
          counts.hidden += 1;
          break;
      }
    }
  }

  return counts;
}

function matchesFilter(item: MenuItem, filter: MenuFilter): boolean {
  if (filter === "ALL") return true;
  const status = itemStatus(item);
  if (filter === "LOW") return status === "LOW";
  if (filter === "SOLD_OUT") return status === "SOLD_OUT";
  return status === "HIDDEN";
}

function matchesQuery(item: MenuItem, query: string): boolean {
  if (!query) return true;
  return item.name.toLowerCase().includes(query);
}

/**
 * Narrows the menu tree to what the toolbar is asking for.
 *
 * A category whose name matches the query keeps all of its items — searching
 * "beverages" should show the section, not empty it. Categories that survive
 * with no items are dropped, EXCEPT when nothing is being filtered at all, so
 * an empty category is still visible (and fixable) on the unfiltered page.
 */
export function filterMenu(categories: Category[], rawQuery: string, filter: MenuFilter): Category[] {
  const query = rawQuery.trim().toLowerCase();
  const unfiltered = !query && filter === "ALL";
  if (unfiltered) return categories;

  const result: Category[] = [];

  for (const category of categories) {
    const categoryMatches = query !== "" && category.name.toLowerCase().includes(query);
    const items = category.items.filter(
      (item) => matchesFilter(item, filter) && (categoryMatches || matchesQuery(item, query))
    );
    if (items.length > 0) result.push({ ...category, items });
  }

  return result;
}

export function findItem(categories: Category[], itemId: string): MenuItem | null {
  for (const category of categories) {
    const item = category.items.find((candidate) => candidate.id === itemId);
    if (item) return item;
  }
  return null;
}

/** Replaces one item in the tree without touching anything else. */
export function patchItemIn(categories: Category[], itemId: string, patch: Partial<MenuItem>): Category[] {
  return categories.map((category) => {
    const index = category.items.findIndex((item) => item.id === itemId);
    if (index === -1) return category;

    const items = [...category.items];
    items[index] = { ...items[index], ...patch };
    return { ...category, items };
  });
}

/**
 * A price the backend will accept: rupees, optionally two paise. Rejected here
 * rather than round-tripped, so a typo never costs a refetch to find out.
 */
export function isValidPrice(value: string): boolean {
  return /^\d{1,6}(\.\d{1,2})?$/.test(value.trim());
}

/** Money in, money out — normalised to the two-decimal shape the API returns. */
export function normalisePrice(value: string): string {
  return Number(value.trim()).toFixed(2);
}

// ---------------------------------------------------------------------------
// Per-admin view preferences
// ---------------------------------------------------------------------------

/**
 * Row height. `compact` drops the thumbnail to 32px and tightens the padding,
 * which is what a stock check over forty items actually wants; `comfortable`
 * keeps the readable default for editing.
 */
export type MenuDensity = "comfortable" | "compact";

export interface MenuPrefs {
  density: MenuDensity;
  /** Ids of the categories the admin has collapsed. Absent id means expanded. */
  collapsed: string[];
}

const DEFAULT_PREFS: MenuPrefs = { density: "comfortable", collapsed: [] };

/**
 * Keyed by user id: two admins sharing a counter machine should not inherit
 * each other's collapsed sections. Falls back to a shared key when the id is
 * unknown, which is better than dropping the preference entirely.
 */
function prefsKey(userId: string | null): string {
  return `klh_menu_prefs:${userId ?? "anon"}`;
}

/** Never throws: a corrupt or unavailable store degrades to the defaults. */
export function loadMenuPrefs(userId: string | null): MenuPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(userId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<MenuPrefs> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFS;
    return {
      density: parsed.density === "compact" ? "compact" : "comfortable",
      collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed.filter((id) => typeof id === "string") : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Best effort. A full or blocked localStorage costs a preference, not a page. */
export function saveMenuPrefs(userId: string | null, prefs: MenuPrefs): void {
  try {
    localStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
  } catch {
    // Private mode / quota exceeded. The session keeps working in memory.
  }
}

// ---------------------------------------------------------------------------
// Category ordering
// ---------------------------------------------------------------------------

/** One category's new position, as the PATCH body the API expects. */
export interface SortOrderPatch {
  id: string;
  sortOrder: number;
}

/**
 * Moves the category at `from` to index `to`, then renumbers every category
 * from 0.
 *
 * Renumbering all of them rather than only the pair that moved is deliberate:
 * seeded categories can share a sortOrder (the API defaults it to 0), and
 * swapping two values inside a set of duplicates produces an order that looks
 * random on the next load. A dense 0..n-1 sequence cannot.
 *
 * Returns the reordered list and only the patches whose value actually
 * changed, so a move at the end of a long list is not fifty requests.
 */
export function reorderCategories(
  categories: Category[],
  from: number,
  to: number
): { categories: Category[]; patches: SortOrderPatch[] } {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= categories.length ||
    to >= categories.length
  ) {
    return { categories, patches: [] };
  }

  const next = [...categories];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  const patches: SortOrderPatch[] = [];
  const renumbered = next.map((category, index) => {
    if (category.sortOrder !== index) patches.push({ id: category.id, sortOrder: index });
    return category.sortOrder === index ? category : { ...category, sortOrder: index };
  });

  return { categories: renumbered, patches };
}
