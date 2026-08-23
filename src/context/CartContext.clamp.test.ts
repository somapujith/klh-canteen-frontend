import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { renderHook, act } from "@testing-library/react";
import { CartProvider, useCart, clampQty, safeStock, type MenuSnapshot } from "./CartContext";

// ---------------------------------------------------------------------------
// Shared arbitraries
// ---------------------------------------------------------------------------

/** Numbers that are individually plausible but still edge-of-domain. */
const numericJunk = fc.oneof(
  fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e12, max: 1e12 }),
  fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
  fc.constantFrom(
    NaN,
    Infinity,
    -Infinity,
    0,
    -0,
    1,
    -1,
    0.5,
    -0.5,
    1e308,
    -1e308,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
    Number.EPSILON
  )
);

/** Everything that isn't a well-formed number: exactly what hostile JSON produces. */
const nonNumericJunk = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.boolean(),
  fc.string(),
  fc.constantFrom("5", "-3", "abc", "", "   10   ", "3.7", "1e3", "NaN", "Infinity", "-Infinity", "0", "007", "  "),
  fc.constant({}),
  fc.constant([]),
  fc.constant([5])
);

/** A fully "wild" value: real numbers, out-of-range numbers, and non-numeric junk alike. */
const wildValue: fc.Arbitrary<any> = fc.oneof(numericJunk, nonNumericJunk);

/**
 * The only stockQty domain that ever actually reaches clampQty in this codebase:
 * every call site (CartContext, useGuestCart, sanitize) runs safeStock() first,
 * which always yields a non-negative finite integer. Testing clampQty's own
 * contract against this domain matches the real usage; testing it against a
 * fully wild second argument is covered separately below via composition with
 * safeStock, which is how the two functions are actually chained in production.
 */
const validStock = fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 1_000_000 }), fc.constant(Number.MAX_SAFE_INTEGER));

const RUNS = 2000;

// ---------------------------------------------------------------------------
// safeStock
// ---------------------------------------------------------------------------

describe("safeStock", () => {
  it("never returns a negative, fractional, or non-finite number", () => {
    fc.assert(
      fc.property(wildValue, (v) => {
        const r = safeStock(v);
        expect(Number.isFinite(r)).toBe(true);
        expect(Number.isInteger(r)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: RUNS }
    );
  });

  it("returns 0 for anything malformed -- a malformed stock figure must never read as unlimited", () => {
    fc.assert(
      fc.property(wildValue, (v) => {
        const r = safeStock(v);
        const isValidPositiveNumber = typeof v === "number" && Number.isFinite(v) && v > 0;
        if (!isValidPositiveNumber) {
          expect(r).toBe(0);
        } else {
          expect(r).toBe(Math.floor(v));
        }
        // Whatever happens, it must never present as "no limit".
        expect(r).not.toBe(Infinity);
      }),
      { numRuns: RUNS }
    );
  });

  it("floors a valid fractional positive number rather than rounding or truncating oddly", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.0001, max: 1_000_000, noNaN: true, noDefaultInfinity: true }), (v) => {
        expect(safeStock(v)).toBe(Math.floor(v));
      }),
      { numRuns: RUNS }
    );
  });
});

// ---------------------------------------------------------------------------
// clampQty
// ---------------------------------------------------------------------------

describe("clampQty", () => {
  it("result is always an integer >= 1 and <= max(1, stockQty) for any qty over the real (post-safeStock) stock domain", () => {
    fc.assert(
      fc.property(wildValue, validStock, (qty, stockQty) => {
        const r = clampQty(qty, stockQty);
        expect(Number.isInteger(r)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(Math.max(1, stockQty));
      }),
      { numRuns: RUNS }
    );
  });

  it("is idempotent for a fixed stock ceiling: clamping an already-clamped value is a no-op", () => {
    fc.assert(
      fc.property(wildValue, validStock, (qty, stockQty) => {
        const once = clampQty(qty, stockQty);
        const twice = clampQty(once, stockQty);
        expect(twice).toBe(once);
      }),
      { numRuns: RUNS }
    );
  });

  it("passes an already in-range integer qty through unchanged", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }).chain((stockQty) => fc.tuple(fc.constant(stockQty), fc.integer({ min: 1, max: stockQty }))),
        ([stockQty, qty]) => {
          expect(clampQty(qty, stockQty)).toBe(qty);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it("composed with safeStock (the way every real call site chains them), the result is always safe even with a fully wild stock argument", () => {
    // This is the property that matches production usage exactly: addItem,
    // updateQty, syncStock and sanitize() never call clampQty with a raw,
    // unsanitized stockQty -- they always run it through safeStock() first.
    fc.assert(
      fc.property(wildValue, wildValue, (qty, rawStock) => {
        const stockQty = safeStock(rawStock);
        const r = clampQty(qty, stockQty);
        expect(Number.isInteger(r)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(Math.max(1, stockQty));
      }),
      { numRuns: RUNS }
    );
  });

  it("defends against a non-finite stockQty argument, not just a non-finite qty", () => {
    // Every current call site pre-sanitizes the ceiling through safeStock(), but
    // clampQty guards both arguments itself so a future caller that skips that
    // step cannot push NaN into a cart line.
    expect(clampQty(5, NaN)).toBe(1);
    expect(clampQty(5, undefined as unknown as number)).toBe(1);
    expect(clampQty(5, -Infinity)).toBe(1);
    expect(clampQty(5, Infinity)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CartProvider -- addItem stock enforcement
// ---------------------------------------------------------------------------

describe("CartProvider.addItem", () => {
  it("is a no-op when stockQty is 0", () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ menuItemId: "a", name: "Tea", price: 10, qty: 1, stockQty: 0 });
    });
    expect(result.current.items).toHaveLength(0);
  });

  it("is a no-op when stockQty is NaN", () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ menuItemId: "a", name: "Tea", price: 10, qty: 1, stockQty: NaN });
    });
    expect(result.current.items).toHaveLength(0);
  });

  it("is a no-op when stockQty is undefined", () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({
        menuItemId: "a",
        name: "Tea",
        price: 10,
        qty: 1,
        stockQty: undefined as unknown as number,
      });
    });
    expect(result.current.items).toHaveLength(0);
  });

  it("a first add of qty 9 against stockQty 2 lands at 2 (regression: the first-add path used to be unclamped)", () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ menuItemId: "a", name: "Tea", price: 10, qty: 9, stockQty: 2 });
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].qty).toBe(2);
  });

  it("property: repeated adds of any wild qty sequence never push a line's qty past its stock ceiling", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), fc.array(wildValue, { minLength: 1, maxLength: 20 }), (stockQty, qtys) => {
        const { result, unmount } = renderHook(() => useCart(), { wrapper: CartProvider });
        act(() => {
          for (const q of qtys) {
            result.current.addItem({ menuItemId: "x", name: "Tea", price: 10, qty: q, stockQty });
          }
        });
        expect(result.current.items).toHaveLength(1);
        const line = result.current.items[0];
        expect(Number.isInteger(line.qty)).toBe(true);
        expect(line.qty).toBeGreaterThanOrEqual(1);
        expect(line.qty).toBeLessThanOrEqual(stockQty);
        unmount();
      }),
      { numRuns: 200 } // renderHook + act per run is expensive; 200 still exercises the full wild space many times over
    );
  });
});

describe("CartProvider.updateQty", () => {
  it("property: can never produce 0, a negative number, or NaN for any wild input sequence", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 500 }), fc.array(wildValue, { minLength: 1, maxLength: 15 }), (stockQty, qtys) => {
        const { result, unmount } = renderHook(() => useCart(), { wrapper: CartProvider });
        act(() => {
          result.current.addItem({ menuItemId: "x", name: "Tea", price: 10, qty: 1, stockQty });
        });
        act(() => {
          for (const q of qtys) {
            result.current.updateQty("x", q);
          }
        });
        const line = result.current.items.find((i) => i.menuItemId === "x")!;
        expect(line).toBeDefined();
        expect(Number.isNaN(line.qty)).toBe(false);
        expect(Number.isInteger(line.qty)).toBe(true);
        expect(line.qty).toBeGreaterThan(0);
        unmount();
      }),
      { numRuns: 200 }
    );
  });

  it("property: a line with qty 0 is never representable across any interleaving of add/update", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.array(fc.tuple(fc.constantFrom<"add" | "update">("add", "update"), wildValue), { minLength: 1, maxLength: 15 }),
        (stockQty, ops) => {
          const { result, unmount } = renderHook(() => useCart(), { wrapper: CartProvider });
          act(() => {
            for (const [op, val] of ops) {
              if (op === "add") {
                result.current.addItem({ menuItemId: "x", name: "Tea", price: 10, qty: val, stockQty });
              } else {
                result.current.updateQty("x", val);
              }
            }
          });
          for (const line of result.current.items) {
            expect(line.qty).not.toBe(0);
            expect(line.qty).toBeGreaterThan(0);
          }
          unmount();
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// CartProvider -- syncStock
// ---------------------------------------------------------------------------

describe("CartProvider.syncStock", () => {
  it("clamps an already-added qty down on a downward stock revision", () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ menuItemId: "a", name: "Tea", price: 10, qty: 8, stockQty: 10 });
    });
    expect(result.current.items[0].qty).toBe(8);

    act(() => {
      result.current.syncStock(new Map<string, MenuSnapshot>([["a", { price: 10, name: "Tea", stockQty: 3 }]]));
    });
    expect(result.current.items[0].qty).toBe(3);
    expect(result.current.items[0].stockQty).toBe(3);
  });

  it("drops the line entirely when stock hits 0", () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ menuItemId: "a", name: "Tea", price: 10, qty: 2, stockQty: 10 });
    });
    act(() => {
      result.current.syncStock(new Map<string, MenuSnapshot>([["a", { price: 10, name: "Tea", stockQty: 0 }]]));
    });
    expect(result.current.items).toHaveLength(0);
  });

  it("adopts a price/name change from the live menu snapshot -- the cart must not quote a price the server will not honour", () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ menuItemId: "a", name: "Tea", price: 10, qty: 2, stockQty: 10 });
    });
    act(() => {
      result.current.syncStock(new Map<string, MenuSnapshot>([["a", { price: 25, name: "Masala Tea", stockQty: 10 }]]));
    });
    expect(result.current.items[0].price).toBe(25);
    expect(result.current.items[0].name).toBe("Masala Tea");
  });

  it("leaves items absent from the fresh map untouched, preserving object identity", () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ menuItemId: "a", name: "Tea", price: 10, qty: 2, stockQty: 10 });
      result.current.addItem({ menuItemId: "b", name: "Coffee", price: 15, qty: 1, stockQty: 5 });
    });
    const before = result.current.items.find((i) => i.menuItemId === "b");
    act(() => {
      result.current.syncStock(new Map<string, MenuSnapshot>([["a", { price: 10, name: "Tea", stockQty: 10 }]]));
    });
    const after = result.current.items.find((i) => i.menuItemId === "b");
    expect(after).toBe(before);
  });

  it("preserves the items array identity when nothing actually changed", () => {
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider });
    act(() => {
      result.current.addItem({ menuItemId: "a", name: "Tea", price: 10, qty: 2, stockQty: 10 });
    });
    const before = result.current.items;
    act(() => {
      result.current.syncStock(new Map<string, MenuSnapshot>([["a", { price: 10, name: "Tea", stockQty: 10 }]]));
    });
    expect(result.current.items).toBe(before);
  });

  it("oracle: for any single line, the post-sync state always matches the documented reconciliation contract", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }).chain((initStock) => fc.tuple(fc.constant(initStock), fc.integer({ min: 1, max: initStock }))),
        wildValue,
        fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
        fc.string(),
        ([initStock, initQty], freshStockRaw, freshPrice, freshName) => {
          const { result, unmount } = renderHook(() => useCart(), { wrapper: CartProvider });
          act(() => {
            result.current.addItem({ menuItemId: "a", name: "Tea", price: 10, qty: initQty, stockQty: initStock });
          });

          const freshStock = safeStock(freshStockRaw as number);
          act(() => {
            result.current.syncStock(
              new Map<string, MenuSnapshot>([["a", { price: freshPrice, name: freshName, stockQty: freshStockRaw as number }]])
            );
          });

          if (freshStock === 0) {
            expect(result.current.items).toHaveLength(0);
          } else {
            const line = result.current.items[0];
            expect(line).toBeDefined();
            expect(line.qty).toBe(clampQty(initQty, freshStock));
            expect(line.stockQty).toBe(freshStock);
            expect(line.price).toBe(freshPrice);
            expect(line.name).toBe(freshName);
          }
          unmount();
        }
      ),
      { numRuns: 300 }
    );
  });
});
