import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GuestOrderStatusPage } from "./GuestOrderStatusPage";
import { guestApi, type GuestOrder } from "../../lib/guestSession";
import type { UseGuestOrderStreamOptions } from "../../hooks/useGuestOrderStream";

vi.mock("../../lib/guestSession", () => ({
  guestApi: { getOrder: vi.fn() },
}));

let captured: UseGuestOrderStreamOptions | null = null;
vi.mock("../../hooks/useGuestOrderStream", () => ({
  useGuestOrderStream: (options: UseGuestOrderStreamOptions) => {
    captured = options;
    return { connected: true, supported: true, error: null };
  },
}));

function order(overrides: Partial<GuestOrder> & Pick<GuestOrder, "id">): GuestOrder {
  return {
    orderNumber: 42,
    status: "PENDING",
    kitchen: "SNACKS",
    totalAmount: "40.00",
    createdAt: new Date().toISOString(),
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
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderPage(ids: string) {
  return render(
    <MemoryRouter initialEntries={[`/g/order/${ids}`]}>
      <Routes>
        <Route path="/g/order/:ids" element={<GuestOrderStatusPage />} />
      </Routes>
    </MemoryRouter>
  );
}

it("renders the same four-step timeline the student token page does", async () => {
  (guestApi.getOrder as ReturnType<typeof vi.fn>).mockResolvedValue(order({ id: "o1", status: "PREPARING" }));
  renderPage("o1");

  const rail = await screen.findByRole("list", { name: "Order progress" });
  expect(rail).toBeInTheDocument();
  // The four shared words, in order — not the guest card's old private
  // three-step "Placed / Prepared / Collected".
  expect(
    Array.from(rail.querySelectorAll("li")).map((li) => li.textContent)
  ).toEqual(["Placed", "Being made", "Ready to collect", "Collected"]);

  // And the step the order is actually on is the marked one.
  const current = rail.querySelector('li[aria-current="step"]');
  expect(current).toHaveTextContent("Being made");
});

it("shows the human label, never the wire value", async () => {
  (guestApi.getOrder as ReturnType<typeof vi.fn>).mockResolvedValue(order({ id: "o1", status: "COOKED" }));
  renderPage("o1");

  // Twice by design: the status badge, and the timeline step it corresponds to.
  // Both come from lib/orderStatus, which is the point — they cannot disagree.
  await waitFor(() => expect(screen.getAllByText("Ready to collect")).toHaveLength(2));
  expect(screen.queryByText("COOKED")).not.toBeInTheDocument();
});

it("advances the timeline from a pushed status without refetching", async () => {
  (guestApi.getOrder as ReturnType<typeof vi.fn>).mockResolvedValue(order({ id: "o1", status: "PENDING" }));
  renderPage("o1");
  await screen.findByRole("list", { name: "Order progress" });
  expect(guestApi.getOrder).toHaveBeenCalledTimes(1);

  captured?.onStatus({ kind: "ORDER_STATUS", orderId: "o1", status: "COOKED" } as never);

  await waitFor(() => {
    const current = screen
      .getByRole("list", { name: "Order progress" })
      .querySelector('li[aria-current="step"]');
    expect(current).toHaveTextContent("Ready to collect");
  });
  expect(guestApi.getOrder).toHaveBeenCalledTimes(1);
});

it("renders one ticket per id when the cart was split across counters", async () => {
  (guestApi.getOrder as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
    Promise.resolve(order({ id, orderNumber: id === "o1" ? 7 : 8, kitchen: id === "o1" ? "SNACKS" : "MEALS" }))
  );
  renderPage("o1,o2");

  await waitFor(() => expect(screen.getAllByRole("list", { name: "Order progress" })).toHaveLength(2));
  // Twice each: the visible band, and the sr-only line that spaces the digits
  // out so a screen reader reads "four two" rather than "forty-two".
  expect(screen.getAllByText(/SNACKS token/)).toHaveLength(2);
  expect(screen.getAllByText(/MEALS token/)).toHaveLength(2);
});

it("offers a way out when the order cannot be found, instead of loading forever", async () => {
  (guestApi.getOrder as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("session ended"));
  renderPage("o1");

  expect(await screen.findByRole("alert")).toHaveTextContent("session ended");
  expect(screen.getByText("We could not find that order")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Browse the menu" })).toHaveAttribute("href", "/g");
});
