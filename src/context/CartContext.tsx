import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { Kitchen } from "../types/admin";

export interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  stockQty: number;
  /** Which kitchen fulfils this line. */
  kitchen?: Kitchen;
}

/** The freshest known state of a menu item, as the menu pages see it. */
export interface MenuSnapshot {
  price: number;
  name: string;
  stockQty: number;
}

interface CartContextValue {
  items: CartLine[];
  addItem: (line: CartLine) => void;
  removeItem: (menuItemId: string) => void;
  updateQty: (menuItemId: string, qty: number) => void;
  /** Reconciles cart lines against the live menu: prices, names, and stock ceilings. */
  syncStock: (fresh: Map<string, MenuSnapshot>) => void;
  clear: () => void;
  total: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

/** A malformed or missing stock figure must never read as "unlimited". */
export function safeStock(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : 0;
}

export function clampQty(qty: number, stockQty: number): number {
  // Both arguments are guarded, not just `qty`: every caller today pre-sanitizes
  // the ceiling through safeStock(), and a future one that forgets would otherwise
  // push NaN straight into a cart line.
  const ceiling = Math.max(1, safeStock(stockQty));
  if (!Number.isFinite(qty)) return 1;
  return Math.min(Math.max(1, Math.floor(qty)), ceiling);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);

  const addItem = useCallback((line: CartLine) => {
    const stockQty = safeStock(line.stockQty);
    if (stockQty === 0) return;

    setItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === line.menuItemId);
      if (!existing) {
        return [...prev, { ...line, stockQty, qty: clampQty(line.qty, stockQty) }];
      }
      // The caller passes the freshest copy of the item, so take price and name from
      // it too — quoting a price the server will not honour is worse than a number
      // changing in the cart.
      return prev.map((i) =>
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
      );
    });
  }, []);

  const removeItem = useCallback((menuItemId: string) => {
    setItems((prev) => prev.filter((i) => i.menuItemId !== menuItemId));
  }, []);

  const updateQty = useCallback((menuItemId: string, qty: number) => {
    setItems((prev) =>
      prev.map((i) => (i.menuItemId === menuItemId ? { ...i, qty: clampQty(qty, i.stockQty) } : i))
    );
  }, []);

  // Stock arrives over SSE while the cart sits open. Without this a line keeps the
  // ceiling it was added with, and "+" overshoots a stock level that has since
  // dropped — the order then fails at payment, after the student has committed.
  const syncStock = useCallback((fresh: Map<string, MenuSnapshot>) => {
    setItems((prev) => {
      let changed = false;
      const next: CartLine[] = [];
      for (const line of prev) {
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
        if (
          qty !== line.qty ||
          stockQty !== line.stockQty ||
          update.price !== line.price ||
          update.name !== line.name
        ) {
          changed = true;
          next.push({ ...line, qty, stockQty, price: update.price, name: update.name });
        } else {
          next.push(line);
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.qty, 0), [items]);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, syncStock, clear, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
