import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { Kitchen } from "../types/admin";

export interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  stockQty: number;
  /** Which kitchen fulfils this line. Drives which collection windows are offered. */
  kitchen?: Kitchen;
}

interface CartContextValue {
  items: CartLine[];
  addItem: (line: CartLine) => void;
  removeItem: (menuItemId: string) => void;
  updateQty: (menuItemId: string, qty: number) => void;
  clear: () => void;
  total: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);

  const addItem = useCallback((line: CartLine) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === line.menuItemId);
      if (existing) {
        return prev.map((i) => (i.menuItemId === line.menuItemId ? { ...i, qty: i.qty + line.qty } : i));
      }
      return [...prev, line];
    });
  }, []);

  const removeItem = useCallback((menuItemId: string) => {
    setItems((prev) => prev.filter((i) => i.menuItemId !== menuItemId));
  }, []);

  const updateQty = useCallback((menuItemId: string, qty: number) => {
    setItems((prev) => prev.map((i) => (i.menuItemId === menuItemId ? { ...i, qty } : i)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.qty, 0), [items]);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, clear, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
