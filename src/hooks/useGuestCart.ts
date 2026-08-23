import { useCallback, useSyncExternalStore } from "react";
import { clampQty, safeStock, type MenuSnapshot } from "../context/CartContext";
import type { Kitchen } from "../types/admin";

const CART_KEY = "klh_guest_cart";

export interface GuestCartLine {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  stockQty: number;
  kitchen?: Kitchen;
}

/**
 * The walk-up guest cart lives in sessionStorage rather than the student
 * CartContext: a guest is never logged in, and keeping the two carts separate
 * means a staff member scanning the counter QR can never inherit or clobber a
 * student's cart in the same browser.
 */
let cache: GuestCartLine[] = readStorage();
const subscribers = new Set<() => void>();

/**
 * sessionStorage is client-controlled and survives reloads, so every field is
 * re-validated on the way in. Without this a hand-edited entry (qty: -9999) is
 * rendered, totalled, and posted to the public guest order endpoint verbatim.
 */
function sanitize(value: unknown): GuestCartLine | null {
  if (typeof value !== "object" || value === null) return null;
  const line = value as Partial<GuestCartLine>;
  if (typeof line.menuItemId !== "string" || !line.menuItemId) return null;
  if (typeof line.name !== "string") return null;
  if (!Number.isFinite(line.price) || (line.price as number) < 0) return null;

  const stockQty = safeStock(line.stockQty);
  if (stockQty === 0) return null;

  return {
    menuItemId: line.menuItemId,
    name: line.name,
    price: line.price as number,
    qty: clampQty(line.qty as number, stockQty),
    stockQty,
    kitchen: line.kitchen,
  };
}

function readStorage(): GuestCartLine[] {
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitize).filter((line): line is GuestCartLine => line !== null);
  } catch {
    return [];
  }
}

function write(next: GuestCartLine[]) {
  cache = next;
  try {
    sessionStorage.setItem(CART_KEY, JSON.stringify(next));
  } catch {
    // Private-mode storage failures must not break ordering — the in-memory cache still works.
  }
  subscribers.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

const getSnapshot = () => cache;

export function useGuestCart() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const addItem = useCallback((line: GuestCartLine) => {
    const stockQty = safeStock(line.stockQty);
    if (stockQty === 0) return;

    const existing = cache.find((i) => i.menuItemId === line.menuItemId);
    write(
      existing
        ? cache.map((i) =>
            i.menuItemId === line.menuItemId
              ? {
                  ...i,
                  name: line.name,
                  price: line.price,
                  kitchen: line.kitchen ?? i.kitchen,
                  stockQty,
                  qty: clampQty(i.qty + line.qty, stockQty),
                }
              : i
          )
        : [...cache, { ...line, stockQty, qty: clampQty(line.qty, stockQty) }]
    );
  }, []);

  const updateQty = useCallback((menuItemId: string, qty: number) => {
    write(cache.map((i) => (i.menuItemId === menuItemId ? { ...i, qty: clampQty(qty, i.stockQty) } : i)));
  }, []);

  /** Guests get no SSE stream, so the menu fetch is the only chance to re-check stock. */
  const syncStock = useCallback((fresh: Map<string, MenuSnapshot>) => {
    const next: GuestCartLine[] = [];
    let changed = false;
    for (const line of cache) {
      const update = fresh.get(line.menuItemId);
      if (!update) {
        next.push(line);
        continue;
      }
      const stockQty = safeStock(update.stockQty);
      if (stockQty === 0) {
        changed = true;
        continue;
      }
      const qty = clampQty(line.qty, stockQty);
      if (qty !== line.qty || stockQty !== line.stockQty || update.price !== line.price || update.name !== line.name) {
        changed = true;
        next.push({ ...line, qty, stockQty, price: update.price, name: update.name });
      } else {
        next.push(line);
      }
    }
    if (changed) write(next);
  }, []);

  const removeItem = useCallback((menuItemId: string) => {
    write(cache.filter((i) => i.menuItemId !== menuItemId));
  }, []);

  const clear = useCallback(() => write([]), []);

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const count = items.reduce((sum, i) => sum + i.qty, 0);

  return { items, addItem, updateQty, removeItem, syncStock, clear, total, count };
}
