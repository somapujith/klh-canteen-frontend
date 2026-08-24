import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { ToastProvider } from "../../context/ToastContext";
import { OrderTokenPage } from "./OrderTokenPage";
import { apiClient } from "../../lib/apiClient";
import type { UseSSEOptions } from "../../hooks/useSSE";

vi.mock("../../lib/apiClient", () => ({
  apiClient: { get: vi.fn() },
  setUnauthorizedHandler: vi.fn(),
}));

/**
 * The stream itself is stubbed, not the page's reaction to it.
 *
 * jsdom has no EventSource, so the transport cannot run here — but the thing
 * worth protecting is what the page does when a status delta arrives, and that
 * is this component's own code. The mock captures the real options object the
 * page passes to useSSE and hands the delta back through it, exactly as the
 * hook would. The event names and the delta shape are the ones the backend
 * actually emits (sseService.emitOrderStatusChanged -> ORDER_UPDATE carrying an
 * ORDER_STATUS delta), so a change to either side breaks this test.
 */
let captured: { types: string[]; options: UseSSEOptions } | null = null;
vi.mock("../../hooks/useSSE", () => ({
  useSSE: (types: string[], options: UseSSEOptions) => {
    captured = { types, options };
    return { error: null, connected: true, supported: true };
  },
  SSE_SUPPORTED: true,
}));

beforeEach(() => {
  // Call counts are assertions here ("the delta moved the screen without a
  // refetch"), so they must not carry over between tests.
  (apiClient.get as any).mockClear();
  captured = null;
});

function renderTokenPage() {
  return render(
    <MemoryRouter initialEntries={["/student/order/order-1"]}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/student/order/:id" element={<OrderTokenPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const pendingOrder = {
  id: "order-1",
  status: "PENDING",
  totalAmount: "40.00",
  orderNumber: 1234,
  kitchen: "SNACKS",
  items: [{ quantity: 2, menuItem: { name: "Samosa" } }],
};

it("flips the token to Ready to collect when the kitchen marks it cooked", async () => {
  captured = null;
  (apiClient.get as any).mockResolvedValue(pendingOrder);

  renderTokenPage();

  await waitFor(() => expect(screen.getByTestId("order-status")).toHaveTextContent(/placed/i));

  // The page must be listening for the owner-scoped event, not the kitchen one.
  expect(captured!.types).toContain("ORDER_UPDATE");

  act(() => {
    captured!.options.onDelta!(
      { kind: "ORDER_STATUS", orderId: "order-1", status: "COOKED" },
      { type: "ORDER_UPDATE", raw: {} },
    );
  });

  // No refetch: the delta alone must move the screen.
  expect(screen.getByTestId("order-status")).toHaveTextContent(/ready to collect/i);
  expect((apiClient.get as any).mock.calls.length).toBe(1);
});

it("ignores a delta for somebody else's order", async () => {
  captured = null;
  (apiClient.get as any).mockResolvedValue(pendingOrder);

  renderTokenPage();
  await waitFor(() => expect(screen.getByTestId("order-status")).toHaveTextContent(/placed/i));

  act(() => {
    captured!.options.onDelta!(
      { kind: "ORDER_STATUS", orderId: "someone-elses-order", status: "COOKED" },
      { type: "ORDER_UPDATE", raw: {} },
    );
  });

  expect(screen.getByTestId("order-status")).toHaveTextContent(/placed/i);

  // Then prove the page was listening at all. Without this the test passes
  // just as happily when the delta handler does nothing whatsoever, which is
  // the failure mode it is supposed to rule out.
  act(() => {
    captured!.options.onDelta!(
      { kind: "ORDER_STATUS", orderId: "order-1", status: "COOKED" },
      { type: "ORDER_UPDATE", raw: {} },
    );
  });
  expect(screen.getByTestId("order-status")).toHaveTextContent(/ready to collect/i);
});

it("refetches when the stream says local state can no longer be trusted", async () => {
  captured = null;
  (apiClient.get as any).mockResolvedValue(pendingOrder);

  renderTokenPage();
  await waitFor(() => expect(screen.getByTestId("order-status")).toHaveTextContent(/placed/i));
  expect((apiClient.get as any).mock.calls.length).toBe(1);

  (apiClient.get as any).mockResolvedValue({ ...pendingOrder, status: "DELIVERED" });
  act(() => {
    captured!.options.onResync!("SYNC_REQUIRED");
  });

  await waitFor(() => expect(screen.getByTestId("order-status")).toHaveTextContent(/collected/i));
  expect((apiClient.get as any).mock.calls.length).toBe(2);
});
