import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import { renderHook } from "@testing-library/react";

const CART_KEY = "klh_guest_cart";

/**
 * useGuestCart hydrates a module-level `cache` exactly once, at import time
 * (`let cache = readStorage()`). To exercise different sessionStorage payloads
 * we must seed sessionStorage BEFORE the module is (re-)imported, and reset
 * the module registry between cases so each test gets a fresh hydration.
 */
async function freshGuestCart() {
  vi.resetModules();
  const mod = await import("./useGuestCart");
  return renderHook(() => mod.useGuestCart());
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Specific hostile payloads named in the spec
// ---------------------------------------------------------------------------

describe("useGuestCart sessionStorage hydration -- hostile payloads", () => {
  it("qty -9999 against a huge stock is clamped to 1, not passed through", async () => {
    sessionStorage.setItem(
      CART_KEY,
      JSON.stringify([{ menuItemId: "x", name: "Tea", price: 10, qty: -9999, stockQty: 999999 }])
    );
    const { result } = await freshGuestCart();
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].qty).toBe(1);
    expect(result.current.items[0].stockQty).toBe(999999);
    expect(result.current.total).toBe(10);
    expect(result.current.total).toBeGreaterThanOrEqual(0);
  });

  it("a non-numeric qty (\"NaN\" string, as real JSON cannot encode literal NaN) is sanitized to 1, not left non-finite", async () => {
    sessionStorage.setItem(CART_KEY, JSON.stringify([{ menuItemId: "y", name: "Coffee", price: 15, qty: "NaN", stockQty: 5 }]));
    const { result } = await freshGuestCart();
    expect(result.current.items).toHaveLength(1);
    expect(Number.isInteger(result.current.items[0].qty)).toBe(true);
    expect(result.current.items[0].qty).toBe(1);
  });

  it("qty as JSON null is sanitized to 1", async () => {
    sessionStorage.setItem(CART_KEY, JSON.stringify([{ menuItemId: "y2", name: "Coffee", price: 15, qty: null, stockQty: 5 }]));
    const { result } = await freshGuestCart();
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].qty).toBe(1);
  });

  it("a negative price drops the line entirely", async () => {
    sessionStorage.setItem(CART_KEY, JSON.stringify([{ menuItemId: "z", name: "Bad", price: -5, qty: 2, stockQty: 10 }]));
    const { result } = await freshGuestCart();
    expect(result.current.items).toHaveLength(0);
  });

  it("a line missing required fields (menuItemId / name / price) is dropped, not defaulted", async () => {
    sessionStorage.setItem(
      CART_KEY,
      JSON.stringify([{ menuItemId: "m1" }, { name: "NoId", price: 5, qty: 1, stockQty: 5 }, { menuItemId: "m2", name: "NoPrice", qty: 1, stockQty: 5 }])
    );
    const { result } = await freshGuestCart();
    expect(result.current.items).toHaveLength(0);
  });

  it("a malformed or missing stockQty drops the line -- never reads as unlimited", async () => {
    sessionStorage.setItem(
      CART_KEY,
      JSON.stringify([
        { menuItemId: "a", name: "Tea", price: 10, qty: 5 }, // stockQty missing entirely
        { menuItemId: "b", name: "Bad", price: 10, qty: 5, stockQty: "unlimited" },
        { menuItemId: "c", name: "Bad", price: 10, qty: 5, stockQty: -1 },
        { menuItemId: "d", name: "Bad", price: 10, qty: 5, stockQty: 0 },
      ])
    );
    const { result } = await freshGuestCart();
    expect(result.current.items).toHaveLength(0);
  });

  it("a top-level JSON object instead of an array yields an empty cart, not a crash", async () => {
    sessionStorage.setItem(CART_KEY, JSON.stringify({ menuItemId: "x", name: "Tea", price: 10, qty: 1, stockQty: 5 }));
    const { result } = await freshGuestCart();
    expect(result.current.items).toEqual([]);
  });

  it("an object masquerading as an array-like ({\"0\": {...}}) yields an empty cart", async () => {
    sessionStorage.setItem(CART_KEY, JSON.stringify({ "0": { menuItemId: "a", name: "Tea", price: 1, qty: 1, stockQty: 1 } }));
    const { result } = await freshGuestCart();
    expect(result.current.items).toEqual([]);
  });

  it("malformed (non-parseable) JSON yields an empty cart, not a thrown error", async () => {
    sessionStorage.setItem(CART_KEY, "{not valid json at all");
    const { result } = await freshGuestCart();
    expect(result.current.items).toEqual([]);
  });

  it("no stored key at all yields an empty cart", async () => {
    const { result } = await freshGuestCart();
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
  });

  it("a mix of one hostile and one well-formed line keeps only the well-formed, correctly clamped, line", async () => {
    sessionStorage.setItem(
      CART_KEY,
      JSON.stringify([
        { menuItemId: "bad", name: "Bad", price: -1, qty: 1, stockQty: 5 },
        { menuItemId: "good", name: "Good", price: 20, qty: 500, stockQty: 3 },
      ])
    );
    const { result } = await freshGuestCart();
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].menuItemId).toBe("good");
    expect(result.current.items[0].qty).toBe(3);
    expect(result.current.total).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Property: ANY sessionStorage payload hydrates to only well-formed lines
// ---------------------------------------------------------------------------

const numericJunk = fc.oneof(
  fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }),
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.constantFrom(NaN, Infinity, -Infinity, 0, -0, 1, -1, 0.5, -0.5)
);

const nonNumericJunk = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.boolean(),
  fc.string(),
  fc.constantFrom("5", "-3", "abc", "", "NaN", "Infinity", "-Infinity")
);

const wildValue: fc.Arbitrary<any> = fc.oneof(numericJunk, nonNumericJunk);

const hostileLine = fc.record(
  {
    menuItemId: fc.oneof(fc.string(), fc.constant(undefined), fc.integer(), fc.constant(null)),
    name: fc.oneof(fc.string(), fc.constant(undefined), fc.integer()),
    price: wildValue,
    qty: wildValue,
    stockQty: wildValue,
    kitchen: fc.oneof(fc.constantFrom("SNACKS", "MEALS"), fc.constant(undefined), fc.string()),
  },
  { requiredKeys: [] }
);

const hostilePayload = fc.oneof(
  fc.array(hostileLine, { maxLength: 6 }),
  fc.jsonValue(),
  fc.string() // raw garbage text, frequently not even valid JSON
);

describe("useGuestCart sessionStorage hydration -- property", () => {
  it("hydrates to only well-formed lines and a non-negative total for any sessionStorage payload, without crashing", async () => {
    await fc.assert(
      fc.asyncProperty(hostilePayload, async (payload) => {
        sessionStorage.clear();
        const raw = typeof payload === "string" ? payload : JSON.stringify(payload) ?? "null";
        sessionStorage.setItem(CART_KEY, raw);

        vi.resetModules();
        const mod = await import("./useGuestCart");
        const { result, unmount } = renderHook(() => mod.useGuestCart());

        for (const line of result.current.items) {
          expect(typeof line.menuItemId).toBe("string");
          expect(line.menuItemId.length).toBeGreaterThan(0);
          expect(typeof line.name).toBe("string");

          expect(Number.isFinite(line.price)).toBe(true);
          expect(line.price).toBeGreaterThanOrEqual(0);

          expect(Number.isInteger(line.stockQty)).toBe(true);
          expect(line.stockQty).toBeGreaterThanOrEqual(1);

          expect(Number.isInteger(line.qty)).toBe(true);
          expect(line.qty).toBeGreaterThanOrEqual(1);
          expect(line.qty).toBeLessThanOrEqual(line.stockQty);
        }

        expect(Number.isFinite(result.current.total)).toBe(true);
        expect(result.current.total).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(result.current.count)).toBe(true);
        expect(result.current.count).toBeGreaterThanOrEqual(0);

        unmount();
      }),
      { numRuns: 150 } // dynamic import + jsdom render per run is expensive; still covers the full hostile-input space widely
    );
  }, 30_000);
});
