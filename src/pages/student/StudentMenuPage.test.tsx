import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { CartProvider } from "../../context/CartContext";
import { ToastProvider } from "../../context/ToastContext";
import { StudentMenuPage } from "./StudentMenuPage";
import { apiClient } from "../../lib/apiClient";
import type { UseSSEOptions } from "../../hooks/useSSE";

vi.mock("../../lib/apiClient", () => ({
  apiClient: { get: vi.fn() },
  setUnauthorizedHandler: vi.fn(),
}));

/**
 * One useSSE call for the whole page (MENU_UPDATE + ORDER_UPDATE combined) is
 * the thing under test here — see AdminDashboardPage.tsx for the established
 * one-connection-per-page convention this mirrors, rather than a second,
 * separate useSSE call (e.g. one hidden inside ActiveOrdersBanner) opening
 * its own EventSource just for order updates. Reassigned on every call, same
 * as OrderTokenPage.test.tsx — a hook fires once per render, not once per
 * connection, so counting calls would just count renders.
 */
let captured: { types: string[]; options: UseSSEOptions } | null = null;
vi.mock("../../hooks/useSSE", () => ({
  useSSE: (types: string[], options: UseSSEOptions) => {
    captured = { types, options };
    return { error: null, connected: true, supported: true };
  },
  SSE_SUPPORTED: true,
}));

const menu = { categories: [{ id: "cat-1", name: "Snacks", kitchen: "SNACKS", items: [] }] };

const pendingOrder = {
  id: "order-1",
  status: "PENDING",
  orderNumber: 1234,
  kitchen: "SNACKS",
  items: [{ quantity: 2, menuItem: { name: "Samosa" } }],
};

beforeEach(() => {
  captured = null;
  // CartBar reads matchMedia on mount to size itself; jsdom ships none.
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  (apiClient.get as any).mockImplementation((path: string) => {
    if (path === "/menu") return Promise.resolve(menu);
    if (path === "/orders/my") return Promise.resolve([pendingOrder]);
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <CartProvider>
            <StudentMenuPage />
          </CartProvider>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

it("opens one event stream for the whole page, covering both menu and order updates", async () => {
  renderPage();

  await waitFor(() => expect(screen.getByText(/1234/)).toBeInTheDocument());

  expect(captured!.types).toEqual(expect.arrayContaining(["MENU_UPDATE", "ORDER_UPDATE"]));
});

it("drops an order from the active-orders banner when its status delta turns terminal, without refetching", async () => {
  renderPage();

  await waitFor(() => expect(screen.getByText(/1234/)).toBeInTheDocument());
  const callsBefore = (apiClient.get as any).mock.calls.length;

  act(() => {
    captured!.options.onDelta!(
      { kind: "ORDER_STATUS", orderId: "order-1", status: "DELIVERED" },
      { type: "ORDER_UPDATE", raw: {} },
    );
  });

  expect(screen.queryByText(/1234/)).not.toBeInTheDocument();
  expect(screen.getByText(/no active orders/i)).toBeInTheDocument();
  expect((apiClient.get as any).mock.calls.length).toBe(callsBefore);
});

/**
 * Regression guard: an admin editing the menu (ITEM_UPSERT/ITEM_REMOVED,
 * whatever isn't STOCK) used to fall into `default:`, which after merging in
 * the order stream also refetched /orders/my — turning one admin menu edit
 * into a wasteful order-history reload for every connected student. Orders
 * only need a refetch on a real order-related signal.
 */
it("does not refetch orders on an unrelated menu delta", async () => {
  renderPage();

  await waitFor(() => expect(screen.getByText(/1234/)).toBeInTheDocument());
  const ordersCallsBefore = (apiClient.get as any).mock.calls.filter((c: any[]) => c[0] === "/orders/my").length;

  act(() => {
    captured!.options.onDelta!(
      { kind: "ITEM_UPSERT", menuItemId: "item-1", item: {} },
      { type: "MENU_UPDATE", raw: {} },
    );
  });

  await Promise.resolve();
  const ordersCallsAfter = (apiClient.get as any).mock.calls.filter((c: any[]) => c[0] === "/orders/my").length;
  expect(ordersCallsAfter).toBe(ordersCallsBefore);
});

it("does not crash and logs when /orders/my fails to load", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  (apiClient.get as any).mockImplementation((path: string) => {
    if (path === "/menu") return Promise.resolve(menu);
    if (path === "/orders/my") return Promise.reject(new Error("500"));
    return Promise.reject(new Error(`unexpected path ${path}`));
  });

  renderPage();

  await waitFor(() => expect(errorSpy).toHaveBeenCalled());
  errorSpy.mockRestore();
});
