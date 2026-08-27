import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ActiveOrdersBanner } from "./ActiveOrdersBanner";

/**
 * Presentational only: StudentMenuPage owns the fetch and the single
 * page-level useSSE subscription (merged with MENU_UPDATE, mirroring
 * AdminDashboardPage's one-connection-per-page convention) and hands this
 * component whatever the current order list is. See StudentMenuPage.test.tsx
 * for the fetch/SSE-driven behaviour.
 */
function renderBanner(orders: any[] | null) {
  return render(
    <MemoryRouter>
      <ActiveOrdersBanner orders={orders} />
    </MemoryRouter>,
  );
}

const pendingOrder = {
  id: "order-1",
  status: "PENDING",
  orderNumber: 1234,
  kitchen: "SNACKS",
  items: [{ quantity: 2, menuItem: { name: "Samosa" } }],
};

const cookedOrder = {
  id: "order-2",
  status: "COOKED",
  orderNumber: 1235,
  kitchen: "MEALS",
  items: [{ quantity: 1, menuItem: { name: "Thali" } }],
};

const deliveredOrder = {
  id: "order-3",
  status: "DELIVERED",
  orderNumber: 1236,
  kitchen: "SNACKS",
  items: [{ quantity: 1, menuItem: { name: "Tea" } }],
};

const cancelledOrder = {
  id: "order-4",
  status: "CANCELLED",
  orderNumber: 1237,
  kitchen: "SNACKS",
  items: [{ quantity: 1, menuItem: { name: "Coffee" } }],
};

it("shows a card for each active order and hides delivered/cancelled ones", () => {
  renderBanner([pendingOrder, cookedOrder, deliveredOrder, cancelledOrder]);

  expect(screen.getByText(/1234/)).toBeInTheDocument();
  expect(screen.getByText(/1235/)).toBeInTheDocument();
  expect(screen.queryByText(/1236/)).not.toBeInTheDocument();
  expect(screen.queryByText(/1237/)).not.toBeInTheDocument();
});

it("shows a clean empty state, not a list, when there are no active orders", () => {
  renderBanner([]);

  // Not just present, but the *only* thing rendered — proves this is a single
  // calm message rather than a list-style empty row like OrderHistoryPage's
  // "No orders yet." (which sits inside a row of the same list it's empty of).
  expect(screen.getByText(/no active orders/i)).toBeInTheDocument();
  expect(screen.queryAllByRole("link")).toHaveLength(0);
});

it("shows the empty state when every order on file is already terminal", () => {
  renderBanner([deliveredOrder, cancelledOrder]);

  expect(screen.getByText(/no active orders/i)).toBeInTheDocument();
});

it("treats an unrecognised future status as not active, rather than defaulting to shown", () => {
  // Allow-list, not a deny-list: a status this frontend has never heard of
  // (e.g. a REFUNDED added by a later backend release) must not render as an
  // in-flight order forever just because it isn't DELIVERED/CANCELLED.
  renderBanner([{ ...pendingOrder, status: "REFUNDED" }]);

  expect(screen.getByText(/no active orders/i)).toBeInTheDocument();
});

it("links each active order card to its token page", () => {
  renderBanner([pendingOrder]);

  const link = screen.getByRole("link", { name: /1234/ });
  expect(link).toHaveAttribute("href", "/student/order/order-1");
});

/**
 * `null` means "haven't loaded yet," distinct from `[]` meaning "loaded, and
 * there are none." Collapsing the two used to make the banner assert "No
 * active orders right now" — a false claim — for the entire duration of the
 * initial /orders/my fetch, before flipping to the real cards.
 */
it("shows nothing (not the empty-state claim) while orders haven't loaded yet", () => {
  renderBanner(null);

  expect(screen.queryByText(/no active orders/i)).not.toBeInTheDocument();
});

it("caps visible cards and links to the full order history instead of pushing the menu off-screen", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({
    ...pendingOrder,
    id: `order-${i}`,
    orderNumber: 1000 + i,
  }));

  renderBanner(many);

  const cardLinks = screen.getAllByRole("link", { name: /#\d+/ });
  expect(cardLinks.length).toBeLessThanOrEqual(3);
  expect(screen.getByRole("link", { name: /view all/i })).toHaveAttribute("href", "/student/orders");
});

it("gives PENDING, PREPARING, and COOKED visually distinct status pills", () => {
  renderBanner([
    { ...pendingOrder, id: "o-1", orderNumber: 1, status: "PENDING" },
    { ...pendingOrder, id: "o-2", orderNumber: 2, status: "PREPARING" },
    { ...pendingOrder, id: "o-3", orderNumber: 3, status: "COOKED" },
  ]);

  const pendingPill = screen.getByText("PENDING");
  const preparingPill = screen.getByText("PREPARING");
  const cookedPill = screen.getByText("COOKED");

  const classesOf = (el: Element) => el.className;
  expect(classesOf(pendingPill)).not.toBe(classesOf(preparingPill));
  expect(classesOf(preparingPill)).not.toBe(classesOf(cookedPill));
  expect(classesOf(pendingPill)).not.toBe(classesOf(cookedPill));
});
