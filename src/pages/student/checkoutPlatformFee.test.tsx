import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CheckoutPage } from "./CheckoutPage";
import { CartProvider, useCart } from "../../context/CartContext";
import { AuthProvider } from "../../context/AuthContext";
import { ToastProvider } from "../../context/ToastContext";
import { resetAppConfigCache } from "../../lib/appConfig";
import { useEffect } from "react";

/**
 * The platform fee line on the student checkout.
 *
 * Renders the REAL CheckoutPage inside the REAL cart/auth/toast providers and
 * stubs exactly one thing — `fetch` — so what is under test is the page's own
 * arithmetic and its own conditional, not a re-description of them. Delete the
 * `platformFee > 0` guard and the "hidden at 0%" case below fails; change the
 * rounding and the ₹52.50 case fails.
 */

/** Seeds the cart once on mount, so the page renders its summary instead of its empty state. */
function SeedCart({ price, qty }: { price: number; qty: number }) {
  const { addItem, items } = useCart();
  useEffect(() => {
    if (items.length === 0) {
      addItem({ menuItemId: "m1", name: "Dosa", price, qty, stockQty: 50, kitchen: "MEALS" });
    }
  }, [addItem, items.length, price, qty]);
  return null;
}

function renderCheckout({ price = 100, qty = 1 }: { price?: number; qty?: number } = {}) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <CartProvider>
            <SeedCart price={price} qty={qty} />
            <CheckoutPage />
          </CartProvider>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

/** Only the /config call matters here; anything else is an unexpected request. */
function stubConfig(platformFeePercent: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/config")) {
        return new Response(JSON.stringify({ paymentsEnabled: true, platformFeePercent }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    })
  );
}

describe("CheckoutPage platform fee", () => {
  beforeEach(() => {
    resetAppConfigCache();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAppConfigCache();
  });

  it("hides the platform fee row entirely when the fee is 0%", async () => {
    stubConfig(0);
    renderCheckout({ price: 100, qty: 1 });

    // Wait for the config round trip to have settled before asserting an
    // absence — otherwise this passes for the wrong reason (nothing rendered yet).
    await waitFor(() => expect(screen.getByText("Subtotal")).toBeInTheDocument());
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    expect(screen.queryByText(/Platform fee/i)).not.toBeInTheDocument();
    // And the total is untouched: a 0% school sees exactly today's summary.
    expect(screen.getAllByText("₹100.00").length).toBeGreaterThan(0);
  });

  it("shows the fee row and a fee-inclusive total when a fee is set", async () => {
    stubConfig(5);
    renderCheckout({ price: 100, qty: 1 });

    await waitFor(() => expect(screen.getByText(/Platform fee \(5%\)/)).toBeInTheDocument());

    // 5% of 100 = 5.00, total 105.00 — and 105 appears TWICE: the summary's
    // Total row and the sticky pay bar. Both must move together.
    expect(screen.getByText("₹5.00")).toBeInTheDocument();
    expect(screen.getAllByText("₹105.00")).toHaveLength(2);
  });

  it("rounds the fee to paise the way the backend does", async () => {
    // 3.5% of 1499.99 = 52.49965 -> 52.50, matching Number(x.toFixed(2)).
    stubConfig(3.5);
    renderCheckout({ price: 1499.99, qty: 1 });

    await waitFor(() => expect(screen.getByText(/Platform fee/)).toBeInTheDocument());

    expect(screen.getByText("₹52.50")).toBeInTheDocument();
    expect(screen.getAllByText("₹1552.49")).toHaveLength(2);
  });
});
