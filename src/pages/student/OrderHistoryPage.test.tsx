import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { ToastProvider } from "../../context/ToastContext";
import { OrderHistoryPage } from "./OrderHistoryPage";
import { apiClient } from "../../lib/apiClient";
import type { UseSSEOptions } from "../../hooks/useSSE";

vi.mock("../../lib/apiClient", () => ({
  apiClient: { get: vi.fn() },
  setUnauthorizedHandler: vi.fn(),
}));

/**
 * Same approach as OrderTokenPage.test.tsx: jsdom has no EventSource, so the
 * transport is stubbed, but the page's own reaction to a delta is not — the
 * mock captures the real options object and hands the delta back through it.
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
  (apiClient.get as any).mockClear();
  captured = null;
});

function renderHistory() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <OrderHistoryPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const isoAt = (dayOffset: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const order = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "order-1",
  status: "PENDING",
  totalAmount: "40.00",
  orderNumber: 1234,
  createdAt: isoAt(0, 12),
  items: [{ quantity: 2, menuItem: { name: "Samosa" } }],
  ...over,
});

/**
 * The bug this guards: `orders` started as `[]`, which is indistinguishable
 * from "loaded, and there are none," so the page asserted "No orders yet" for
 * the entire duration of the first fetch — telling a student with a history
 * that they had never ordered. `null` until the fetch resolves fixes it.
 */
it("does not claim the history is empty while the first fetch is still in flight", async () => {
  let resolve!: (v: unknown) => void;
  (apiClient.get as any).mockReturnValue(new Promise((r) => { resolve = r; }));

  renderHistory();

  expect(screen.queryByText(/no orders yet/i)).not.toBeInTheDocument();
  // Named explicitly: ToastProvider also renders a role="status" live region,
  // so a bare getByRole("status") matches two nodes and proves nothing.
  expect(screen.getByText(/loading your orders/i)).toBeInTheDocument();

  await act(async () => {
    resolve([order()]);
  });

  await waitFor(() => expect(screen.getByText(/1234/)).toBeInTheDocument());
  expect(screen.queryByText(/loading your orders/i)).not.toBeInTheDocument();
});

it("shows an empty state with a way back to the menu once the fetch confirms there are none", async () => {
  (apiClient.get as any).mockResolvedValue([]);

  renderHistory();

  await waitFor(() => expect(screen.getByText(/no orders yet/i)).toBeInTheDocument());
  expect(screen.getByRole("link", { name: /browse the menu/i })).toHaveAttribute("href", "/student");
});

it("groups orders under Today and Yesterday rather than raw timestamps", async () => {
  (apiClient.get as any).mockResolvedValue([
    order({ id: "a", orderNumber: 1, createdAt: isoAt(0, 12) }),
    order({ id: "b", orderNumber: 2, createdAt: isoAt(1, 12) }),
  ]);

  renderHistory();

  await waitFor(() => expect(screen.getByText("Today")).toBeInTheDocument());
  expect(screen.getByText("Yesterday")).toBeInTheDocument();
});

it("shows human status labels, never the wire spelling", async () => {
  (apiClient.get as any).mockResolvedValue([order({ status: "COOKED" })]);

  renderHistory();

  await waitFor(() => expect(screen.getByText("Ready to collect")).toBeInTheDocument());
  expect(screen.queryByText("COOKED")).not.toBeInTheDocument();
});

/**
 * Regression: the old two-colour ternary and the banner's STATUS_PILL_CLASSES
 * map both returned `undefined` for CANCELLED, which Tailwind rendered as an
 * unstyled, invisible badge. This page renders terminal statuses, so it is
 * where that bug was actually reachable.
 */
it("paints a real pill for CANCELLED instead of an invisible one", async () => {
  (apiClient.get as any).mockResolvedValue([order({ status: "CANCELLED" })]);

  renderHistory();

  const pill = await screen.findByText("Cancelled");
  expect(pill.className).toMatch(/bg-\S+/);
});

it("filters to active orders, and back to all", async () => {
  (apiClient.get as any).mockResolvedValue([
    order({ id: "a", orderNumber: 1111, status: "PREPARING" }),
    order({ id: "b", orderNumber: 2222, status: "DELIVERED" }),
  ]);

  renderHistory();

  await waitFor(() => expect(screen.getByText(/1111/)).toBeInTheDocument());
  expect(screen.getByText(/2222/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Active" }));
  expect(screen.getByText(/1111/)).toBeInTheDocument();
  expect(screen.queryByText(/2222/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Completed" }));
  expect(screen.queryByText(/1111/)).not.toBeInTheDocument();
  expect(screen.getByText(/2222/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "All" }));
  expect(screen.getByText(/1111/)).toBeInTheDocument();
  expect(screen.getByText(/2222/)).toBeInTheDocument();
});

/** The whole point of the SSE handler: the row moves without a second fetch. */
it("patches a row from a status delta rather than refetching the list", async () => {
  (apiClient.get as any).mockResolvedValue([order({ status: "PENDING" })]);

  renderHistory();
  await waitFor(() => expect(screen.getByText("Placed")).toBeInTheDocument());
  expect((apiClient.get as any).mock.calls.length).toBe(1);

  act(() => {
    captured!.options.onDelta!(
      { kind: "ORDER_STATUS", orderId: "order-1", status: "COOKED" },
      { type: "ORDER_UPDATE", raw: {} },
    );
  });

  expect(screen.getByText("Ready to collect")).toBeInTheDocument();
  expect((apiClient.get as any).mock.calls.length).toBe(1);
});

it("refetches when the stream says local state can no longer be trusted", async () => {
  (apiClient.get as any).mockResolvedValue([order({ status: "PENDING" })]);

  renderHistory();
  await waitFor(() => expect(screen.getByText("Placed")).toBeInTheDocument());

  (apiClient.get as any).mockResolvedValue([order({ status: "DELIVERED" })]);
  await act(async () => {
    captured!.options.onResync!("SYNC_REQUIRED");
  });

  await waitFor(() => expect(screen.getByText("Collected")).toBeInTheDocument());
  expect((apiClient.get as any).mock.calls.length).toBe(2);
});
