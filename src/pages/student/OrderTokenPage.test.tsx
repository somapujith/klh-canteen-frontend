import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
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

/**
 * jsdom ships no matchMedia, and TokenReel reads it whenever the number is
 * shown, to honour prefers-reduced-motion.
 *
 * This used to be declared inside the one test that clicked "Show token",
 * because that was the only place the digits appeared. A collected ticket now
 * shows its number without a click — the reveal control is gone by then — so
 * any test whose order is DELIVERED mounts the reel too, and the stub has to
 * cover the whole file.
 */
beforeEach(() => {
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

/**
 * The number starts blurred and reveals on demand. It used to be a one-way
 * door: `revealed` was set true by "Show token" and never set back, so a
 * student who had shown their number at the counter had no way to cover it
 * again short of reloading the page.
 */
it("hides the token again after it has been revealed", async () => {
  captured = null;
  (apiClient.get as any).mockResolvedValue(pendingOrder);

  renderTokenPage();

  const show = await screen.findByRole("button", { name: /show token/i });
  // Nothing to hide while it is already hidden.
  expect(screen.queryByRole("button", { name: /hide token/i })).not.toBeInTheDocument();

  fireEvent.click(show);

  expect(screen.getByRole("button", { name: /hide token/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /show token/i })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /hide token/i }));

  // Back to the starting state, and re-revealable.
  expect(screen.getByRole("button", { name: /show token/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /hide token/i })).not.toBeInTheDocument();
});

/**
 * Collection is the point of the whole screen, and the moment the ticket has
 * to change character: green, no reveal control, and a header that stops
 * asking the student to do anything.
 *
 * The green itself is what counter staff read across a queue — a handed-over
 * order must not look like a waiting one when the same screen is presented a
 * second time.
 */
it("turns the ticket green and drops the reveal control once collected", async () => {
  captured = null;
  (apiClient.get as any).mockResolvedValue(pendingOrder);

  renderTokenPage();

  // While it is still waiting, the number is hidden behind the reveal.
  expect(await screen.findByRole("button", { name: /show token/i })).toBeInTheDocument();

  act(() => {
    captured!.options.onDelta!(
      { kind: "ORDER_STATUS", orderId: "order-1", status: "DELIVERED" },
      { type: "ORDER_UPDATE", raw: {} },
    );
  });

  await waitFor(() => expect(screen.getByTestId("order-status")).toHaveTextContent(/collected/i));

  // Neither control survives collection: there is nothing left to protect, and
  // offering to reveal again invites the second showing this guards against.
  expect(screen.queryByRole("button", { name: /show token/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /hide token/i })).not.toBeInTheDocument();

  // The number is readable without a click, rather than stranded behind a
  // reveal button that no longer exists.
  expect(screen.getByText(/token number 1 2 3 4/i)).toBeInTheDocument();
});
