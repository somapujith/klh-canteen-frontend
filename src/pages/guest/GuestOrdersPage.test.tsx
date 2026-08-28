import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GuestOrdersPage } from "./GuestOrdersPage";
import { guestApi, type GuestOrder } from "../../lib/guestSession";
import type { UseGuestOrderStreamOptions } from "../../hooks/useGuestOrderStream";

vi.mock("../../lib/guestSession", () => ({
  guestApi: { listOrders: vi.fn() },
}));

/**
 * Reassigned on every call, same as OrderTokenPage.test.tsx — the hook fires
 * once per render, not once per connection, so counting calls would just count
 * renders. `connected: true` keeps the fallback poll switched off.
 */
let captured: UseGuestOrderStreamOptions | null = null;
vi.mock("../../hooks/useGuestOrderStream", () => ({
  useGuestOrderStream: (options: UseGuestOrderStreamOptions) => {
    captured = options;
    return { connected: true, supported: true, error: null };
  },
}));

const NOW = new Date();
const iso = (offsetDays: number) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - offsetDays, 12, 30).toISOString();

function order(overrides: Partial<GuestOrder> & Pick<GuestOrder, "id">): GuestOrder {
  return {
    orderNumber: 42,
    status: "PENDING",
    kitchen: "SNACKS",
    totalAmount: "40.00",
    createdAt: iso(0),
    collectionAt: null,
    guestName: null,
    guestPhone: null,
    items: [
      { id: "l1", quantity: 2, priceAtOrder: "20", menuItem: { id: "i1", name: "Samosa", imageUrl: null } },
    ],
    ...overrides,
  } as GuestOrder;
}

beforeEach(() => {
  captured = null;
  (guestApi.listOrders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <GuestOrdersPage />
    </MemoryRouter>
  );
}

it("shows a skeleton before the first fetch lands, not a false 'no orders' claim", async () => {
  let resolve!: (value: GuestOrder[]) => void;
  (guestApi.listOrders as ReturnType<typeof vi.fn>).mockReturnValue(
    new Promise<GuestOrder[]>((r) => {
      resolve = r;
    })
  );
  renderPage();

  expect(screen.getByText("Loading your orders…")).toBeInTheDocument();
  expect(screen.queryByText(/haven't ordered anything/)).not.toBeInTheDocument();

  resolve([]);
  expect(await screen.findByText("You haven't ordered anything yet")).toBeInTheDocument();
});

it("shows the human status label, never the wire value", async () => {
  (guestApi.listOrders as ReturnType<typeof vi.fn>).mockResolvedValue([
    order({ id: "o1", status: "COOKED" }),
  ]);
  renderPage();

  expect(await screen.findByText("Ready to collect")).toBeInTheDocument();
  expect(screen.queryByText("COOKED")).not.toBeInTheDocument();
});

it("groups rows by day", async () => {
  (guestApi.listOrders as ReturnType<typeof vi.fn>).mockResolvedValue([
    order({ id: "o1", orderNumber: 7, createdAt: iso(0) }),
    order({ id: "o2", orderNumber: 8, createdAt: iso(1) }),
  ]);
  renderPage();

  expect(await screen.findByText("Today")).toBeInTheDocument();
  expect(screen.getByText("Yesterday")).toBeInTheDocument();
});

it("filters to active and completed orders", async () => {
  (guestApi.listOrders as ReturnType<typeof vi.fn>).mockResolvedValue([
    order({ id: "o1", orderNumber: 7, status: "PENDING" }),
    order({ id: "o2", orderNumber: 8, status: "DELIVERED" }),
  ]);
  renderPage();
  await screen.findByText("Placed");

  fireEvent.click(screen.getByRole("tab", { name: "Completed" }));
  await waitFor(() => expect(screen.queryByText("Placed")).not.toBeInTheDocument());
  expect(screen.getByText("Collected")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Active" }));
  await waitFor(() => expect(screen.queryByText("Collected")).not.toBeInTheDocument());
  expect(screen.getByText("Placed")).toBeInTheDocument();
});

it("gives the empty state a route back to the menu", async () => {
  renderPage();
  expect(await screen.findByText("You haven't ordered anything yet")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Browse the menu" })).toHaveAttribute("href", "/g");
});

it("patches a known order in place from the stream rather than refetching", async () => {
  (guestApi.listOrders as ReturnType<typeof vi.fn>).mockResolvedValue([
    order({ id: "o1", status: "PENDING" }),
  ]);
  renderPage();
  await screen.findByText("Placed");
  expect(guestApi.listOrders).toHaveBeenCalledTimes(1);

  captured?.onStatus({ kind: "ORDER_STATUS", orderId: "o1", status: "COOKED" } as never);

  expect(await screen.findByText("Ready to collect")).toBeInTheDocument();
  expect(guestApi.listOrders).toHaveBeenCalledTimes(1);
});

it("refetches when the stream reports an order this list has never seen", async () => {
  (guestApi.listOrders as ReturnType<typeof vi.fn>).mockResolvedValue([order({ id: "o1" })]);
  renderPage();
  await screen.findByText("Placed");

  captured?.onStatus({ kind: "ORDER_STATUS", orderId: "unknown", status: "COOKED" } as never);

  await waitFor(() => expect(guestApi.listOrders).toHaveBeenCalledTimes(2));
});

it("recovers from a failed load instead of stranding the page on its skeleton", async () => {
  (guestApi.listOrders as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("offline"));
  renderPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("offline");
  expect(screen.queryByText("Loading your orders…")).not.toBeInTheDocument();

  (guestApi.listOrders as ReturnType<typeof vi.fn>).mockResolvedValue([order({ id: "o1" })]);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  expect(await screen.findByText("Placed")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
