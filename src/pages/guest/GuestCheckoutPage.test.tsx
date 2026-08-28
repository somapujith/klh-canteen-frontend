import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { guestApi } from "../../lib/guestSession";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("../../lib/guestSession", () => ({
  guestApi: { placeOrder: vi.fn() },
}));

const CART_KEY = "klh_guest_cart";

const samosa = { menuItemId: "i1", name: "Samosa", price: 20, qty: 2, stockQty: 10, kitchen: "SNACKS" };
const thali = { menuItemId: "i4", name: "Thali", price: 80, qty: 1, stockQty: 4, kitchen: "MEALS" };

/**
 * useGuestCart hydrates a module-level `cache` once, at import time, so the
 * cart has to be in sessionStorage BEFORE the page module is imported —
 * the same constraint (and the same workaround) useGuestCart.test.ts documents.
 *
 * ToastProvider is pulled from the same fresh registry as the page. A statically
 * imported provider would be a DIFFERENT ToastContext object after
 * resetModules(), so the page's useToast() would find no provider above it and
 * throw — a failure that looks like a missing wrapper but is really two copies
 * of one module.
 */
async function renderWithCart(lines: unknown[]) {
  sessionStorage.setItem(CART_KEY, JSON.stringify(lines));
  vi.resetModules();
  const [{ GuestCheckoutPage }, { ToastProvider }] = await Promise.all([
    import("./GuestCheckoutPage"),
    import("../../context/ToastContext"),
  ]);
  return render(
    <MemoryRouter>
      <ToastProvider>
        <GuestCheckoutPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  navigate.mockClear();
  (guestApi.placeOrder as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "o1" }]);
});

afterEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

it("renders a receipt with per-line subtotals and a stepper instead of a number input", async () => {
  await renderWithCart([samosa]);

  expect(screen.getByText("2 items")).toBeInTheDocument();
  expect(screen.getByText("₹20.00 each")).toBeInTheDocument();
  // ₹40.00 four times: the line subtotal the old page never showed at all,
  // then Subtotal and Total in the summary card, then the sticky pay bar.
  expect(screen.getAllByText("₹40.00")).toHaveLength(4);

  // The <input type="number"> is gone; the shared Stepper is in its place.
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Increase Samosa" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Decrease Samosa" })).toBeInTheDocument();
});

it("caps the stepper at the line's stock ceiling", async () => {
  await renderWithCart([{ ...samosa, qty: 4, stockQty: 4 }]);
  expect(screen.getByRole("button", { name: "Increase Samosa" })).toBeDisabled();
});

it("turns the last decrement into a remove, and moves focus to a live neighbour", async () => {
  await renderWithCart([samosa, thali]);

  // At qty 1 the minus becomes a remove.
  fireEvent.click(screen.getByRole("button", { name: "Remove Thali" }));

  await waitFor(() => expect(screen.queryByText("Thali")).not.toBeInTheDocument());
  // Focus must not fall to <body> when the focused button unmounts.
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Decrease Samosa");
});

it("warns before paying that a two-counter cart becomes two orders", async () => {
  await renderWithCart([samosa, thali]);
  expect(screen.getByText("2 separate orders")).toBeInTheDocument();
  expect(screen.getByText(/Snacks and Meals counter/)).toBeInTheDocument();
});

it("says nothing about splitting when the cart is one counter", async () => {
  await renderWithCart([samosa]);
  expect(screen.queryByText(/separate orders/)).not.toBeInTheDocument();
});

it("keeps the guest network contract: items plus optional name, trimmed", async () => {
  await renderWithCart([samosa]);

  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Ravi  " } });
  fireEvent.click(screen.getByRole("button", { name: /pay now/i }));

  await waitFor(() => expect(guestApi.placeOrder).toHaveBeenCalled());
  // Blank phone is omitted from the payload entirely rather than sent as "".
  expect(guestApi.placeOrder).toHaveBeenCalledWith({
    items: [{ menuItemId: "i1", qty: 2 }],
    guestName: "Ravi",
  });

  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/g/order/o1", { replace: true }));
});

it("joins the ids when the backend splits the cart across counters", async () => {
  (guestApi.placeOrder as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "o1" }, { id: "o2" }]);
  await renderWithCart([samosa, thali]);

  fireEvent.click(screen.getByRole("button", { name: /pay now/i }));

  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/g/order/o1,o2", { replace: true }));
});

it("presents a failure in an alert card and leaves the cart intact", async () => {
  (guestApi.placeOrder as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("counter closed"));
  await renderWithCart([samosa]);

  fireEvent.click(screen.getByRole("button", { name: /pay now/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent("counter closed");
  expect(screen.getByText("Samosa")).toBeInTheDocument();
  expect(navigate).not.toHaveBeenCalled();
});

it("offers a way out of an empty cart rather than a dead end", async () => {
  await renderWithCart([]);
  expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Browse the menu" }));
  expect(navigate).toHaveBeenCalledWith("/g");
});
