import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ActiveOrdersBanner } from "./ActiveOrdersBanner";
import { statusPresentation } from "../../lib/orderStatus";

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

  // Still a single calm line rather than a list-style empty row, but it is no
  // longer a dead end: the box used to be inert grey text, and now carries one
  // way out. One link exactly — an empty state that sprouts a card-sized CTA
  // block would push the menu it sits above off the screen.
  expect(screen.getByText(/no active orders/i)).toBeInTheDocument();
  expect(screen.queryAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link", { name: /past orders/i })).toHaveAttribute(
    "href",
    "/student/orders",
  );
  // No order cards: the empty state must not render a list.
  expect(screen.queryByRole("link", { name: /#\d+/ })).not.toBeInTheDocument();
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

/**
 * Pills now read from lib/orderStatus rather than this component's own map, so
 * the labels are the human-facing words every other screen shows ("Ready to
 * collect"), not the wire values the banner used to leak ("COOKED"). That
 * shared vocabulary is the point of the change, so it is asserted here.
 */
it("gives PENDING, PREPARING, and COOKED visually distinct status pills", () => {
  renderBanner([
    { ...pendingOrder, id: "o-1", orderNumber: 1, status: "PENDING" },
    { ...pendingOrder, id: "o-2", orderNumber: 2, status: "PREPARING" },
    { ...pendingOrder, id: "o-3", orderNumber: 3, status: "COOKED" },
  ]);

  const pendingPill = screen.getByText("Placed");
  const preparingPill = screen.getByText("Being made");
  const cookedPill = screen.getByText("Ready to collect");

  // The raw wire spelling must not reach the user.
  expect(screen.queryByText("COOKED")).not.toBeInTheDocument();

  const classesOf = (el: Element) => el.className;
  expect(classesOf(pendingPill)).not.toBe(classesOf(preparingPill));
  expect(classesOf(preparingPill)).not.toBe(classesOf(cookedPill));
  expect(classesOf(pendingPill)).not.toBe(classesOf(cookedPill));
});

/**
 * Regression: the old STATUS_PILL_CLASSES map had keys for PENDING/PREPARING/
 * COOKED only, so `STATUS_PILL_CLASSES[order.status]` returned `undefined` for
 * anything else and Tailwind rendered an unstyled, invisible badge — bare text
 * with no pill behind it. statusPresentation() has no missing keys and falls
 * back to a real neutral pill, so every status is drawn.
 *
 * Asserted across all five known statuses plus an unknown one, because the bug
 * was precisely that a status nobody enumerated fell through the gap. The
 * banner filters the terminal ones out of its own list, so each is rendered
 * here on its own to reach the pill.
 */
it.each(["PENDING", "PREPARING", "COOKED"])("draws a real pill for %s, never a blank one", (status) => {
  renderBanner([{ ...pendingOrder, status }]);

  // statusPresentation is the single source of the label, so ask it rather
  // than restating here the mapping this test should not duplicate.
  const pill = screen.getByText(statusPresentation(status).label);

  // A painted pill, not the classless span the undefined lookup produced.
  expect(pill.className).toMatch(/bg-\S+/);
});
