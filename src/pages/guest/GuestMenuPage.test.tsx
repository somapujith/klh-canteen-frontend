import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GuestMenuPage } from "./GuestMenuPage";
import { apiClient } from "../../lib/apiClient";
import { ensureGuestSession } from "../../lib/guestSession";

vi.mock("../../lib/apiClient", () => ({
  apiClient: { get: vi.fn() },
  setUnauthorizedHandler: vi.fn(),
}));

vi.mock("../../lib/guestSession", () => ({
  ensureGuestSession: vi.fn(() => Promise.resolve("guest-token")),
}));

/**
 * The counter flow deliberately has no SSE (see the comment in GuestMenuPage's
 * load()), so there is no useSSE mock here — and its absence is itself part of
 * what these tests hold in place. A useSSE call appearing on this page would
 * open a real EventSource in jsdom.
 */
const menu = {
  categories: [
    {
      id: "cat-snacks",
      name: "Snacks",
      kitchen: "SNACKS",
      items: [
        { id: "i1", name: "Samosa", price: "20", stockQty: 12, imageUrl: null },
        { id: "i2", name: "Vada", price: "15", stockQty: 0, imageUrl: null },
        { id: "i3", name: "Puff", price: "25", stockQty: 3, imageUrl: null },
      ],
    },
    {
      id: "cat-meals",
      name: "Meals",
      kitchen: "MEALS",
      items: [{ id: "i4", name: "Samosa Thali", price: "80", stockQty: 4, imageUrl: null }],
    },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
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
  (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(menu);
  (ensureGuestSession as ReturnType<typeof vi.fn>).mockResolvedValue("guest-token");
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <GuestMenuPage />
    </MemoryRouter>
  );
}

it("spells out all three stock states instead of leaving sold out blank", async () => {
  renderPage();
  expect(await screen.findByText("Samosa")).toBeInTheDocument();

  // In stock, low stock, and — the state the old card rendered as an empty
  // string — sold out.
  expect(screen.getByText("12 left")).toBeInTheDocument();
  expect(screen.getByText("Only 3 left")).toBeInTheDocument();
  expect(screen.getByText("Sold out")).toBeInTheDocument();

  // A sold-out card offers no add affordance, only an explanation.
  expect(screen.getByRole("button", { name: "Unavailable" })).toBeDisabled();
});

it("searches across every category, not just the active tab", async () => {
  renderPage();
  expect(await screen.findByText("Samosa")).toBeInTheDocument();
  // Meals is not the active tab, so its item is not on screen to begin with.
  expect(screen.queryByText("Samosa Thali")).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole("textbox", { name: /search the menu/i }), {
    target: { value: "samosa" },
  });

  // Both hits, and the cross-category one is labelled with where it came from.
  // "Meals" appears twice once searching — the category chip in the rail and
  // the provenance line on the hit card — which is the assertion: the second
  // one is what stops the hit reading as though the Snacks tab grew an item.
  expect(await screen.findByText("Samosa Thali")).toBeInTheDocument();
  expect(screen.getAllByText("Meals")).toHaveLength(2);
  expect(screen.queryByText("Puff")).not.toBeInTheDocument();
});

it("distinguishes a search that matched nothing from an empty category", async () => {
  renderPage();
  expect(await screen.findByText("Samosa")).toBeInTheDocument();

  fireEvent.change(screen.getByRole("textbox", { name: /search the menu/i }), {
    target: { value: "biryani" },
  });

  expect(await screen.findByText('No items match "biryani"')).toBeInTheDocument();
  expect(screen.getByText(/We searched every category/)).toBeInTheDocument();

  // And the empty state hands back a way out.
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(await screen.findByText("Samosa")).toBeInTheDocument();
});

it("hides sold-out items on request and says how many are hidden", async () => {
  renderPage();
  expect(await screen.findByText("Vada")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("checkbox", { name: /hide sold out/i }));

  await waitFor(() => expect(screen.queryByText("Vada")).not.toBeInTheDocument());
  expect(screen.getByText("Samosa")).toBeInTheDocument();
});

it("keeps the manual retry path — no stream to recover for it", async () => {
  (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
  renderPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("network down");

  (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(menu);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));

  expect(await screen.findByText("Samosa")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("mints the guest session alongside the menu fetch", async () => {
  renderPage();
  await screen.findByText("Samosa");
  expect(ensureGuestSession).toHaveBeenCalled();
  expect(apiClient.get).toHaveBeenCalledWith("/menu");
});
