import { useCallback, useSyncExternalStore } from "react";
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

function readStorage(): GuestCartLine[] {
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as GuestCartLine[]) : [];
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
    const existing = cache.find((i) => i.menuItemId === line.menuItemId);
    write(
      existing
        ? cache.map((i) =>
            i.menuItemId === line.menuItemId
              ? { ...i, qty: Math.min(i.qty + line.qty, line.stockQty), stockQty: line.stockQty }
              : i
          )
        : [...cache, line]
    );
  }, []);

  const updateQty = useCallback((menuItemId: string, qty: number) => {
    write(cache.map((i) => (i.menuItemId === menuItemId ? { ...i, qty } : i)));
  }, []);

  const removeItem = useCallback((menuItemId: string) => {
    write(cache.filter((i) => i.menuItemId !== menuItemId));
  }, []);

  const clear = useCallback(() => write([]), []);

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const count = items.reduce((sum, i) => sum + i.qty, 0);

  return { items, addItem, updateQty, removeItem, clear, total, count };
}
