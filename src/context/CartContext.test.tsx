import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { CartProvider, useCart } from "./CartContext";

it("adds items, updates quantity, computes total, and clears", () => {
  const { result } = renderHook(() => useCart(), { wrapper: CartProvider });

  act(() => {
    result.current.addItem({ menuItemId: "a", name: "Tea", price: 10, qty: 1, stockQty: 5 });
    result.current.addItem({ menuItemId: "b", name: "Samosa", price: 20, qty: 2, stockQty: 5 });
  });
  expect(result.current.items).toHaveLength(2);
  expect(result.current.total).toBe(50);

  act(() => {
    result.current.updateQty("a", 3);
  });
  expect(result.current.total).toBe(70);

  act(() => {
    result.current.removeItem("b");
  });
  expect(result.current.items).toHaveLength(1);

  act(() => {
    result.current.clear();
  });
  expect(result.current.items).toHaveLength(0);
});
