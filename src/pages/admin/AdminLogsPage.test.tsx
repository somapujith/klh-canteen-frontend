import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { AdminLogsPage } from "./AdminLogsPage";
import { apiClient } from "../../lib/apiClient";

vi.mock("../../lib/apiClient", () => ({
  apiClient: { get: vi.fn() },
  // AuthProvider registers its 401 handler on mount, so the mock must carry it.
  setUnauthorizedHandler: vi.fn(),
}));

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

/** A walk-up guest order: `student` is null, the name lives on `customer`. */
const guestOrder = {
  id: "o1",
  orderNumber: 42,
  status: "DELIVERED",
  seenByAdmin: true,
  totalAmount: "15.00",
  createdAt: "2026-08-24T10:00:00.000Z",
  collectionAt: null,
  student: null,
  customer: { type: "GUEST", id: null, name: "Ravi", rollNumber: null, phone: "9876543210" },
  items: [{ quantity: 1, priceAtOrder: "15.00", menuItem: { name: "Masala Chai" } }],
};

const studentOrder = {
  ...guestOrder,
  id: "o2",
  orderNumber: 43,
  status: "CANCELLED",
  customer: { type: "STUDENT", id: "u1", name: "Asha Rao", rollNumber: "2420090001", phone: null },
};

function renderPage() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <AdminLogsPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  get.mockReset();
  localStorage.setItem("klh_auth", JSON.stringify({ token: "t", role: "ADMIN", name: "Admin", id: "u9" }));
});

/**
 * The regression this page was written for: reading `order.student.name` threw
 * on any guest order, taking the whole history down. If the guarded `customer`
 * read is reverted, this render throws and the test fails.
 */
it("renders a walk-up guest order instead of crashing on a null student", async () => {
  get.mockResolvedValue({ data: [guestOrder], nextCursor: null, hasMore: false });

  renderPage();

  await waitFor(() => expect(screen.getByText("Ravi")).toBeInTheDocument());
  expect(screen.getByText(/9876543210/)).toBeInTheDocument();
  expect(screen.getByText("Guest")).toBeInTheDocument();
});

it("asks for delivered orders, not just live ones", async () => {
  get.mockResolvedValue({ data: [], nextCursor: null, hasMore: false });

  renderPage();

  // active=false is the only way the endpoint returns completed orders. Without
  // it a page titled "complete history" shows live work only.
  await waitFor(() => expect(get).toHaveBeenCalled());
  expect(get.mock.calls[0][0]).toContain("active=false");
  expect(get.mock.calls[0][0]).toContain("format=envelope");
  expect(get.mock.calls[0][0]).toContain("limit=");
});

it("labels each status distinctly rather than collapsing them to pending", async () => {
  get.mockResolvedValue({ data: [guestOrder, studentOrder], nextCursor: null, hasMore: false });

  renderPage();

  await waitFor(() => expect(screen.getByText("Delivered")).toBeInTheDocument());
  // CANCELLED used to fall through a PENDING/DELIVERED ternary and render as
  // outstanding work.
  expect(screen.getByText("Cancelled")).toBeInTheDocument();
});

it("appends the next page instead of replacing what is on screen", async () => {
  get.mockResolvedValueOnce({ data: [guestOrder], nextCursor: "c1", hasMore: true });
  get.mockResolvedValueOnce({ data: [studentOrder], nextCursor: null, hasMore: false });

  renderPage();

  await waitFor(() => expect(screen.getByText("Ravi")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /load older orders/i }));

  await waitFor(() => expect(screen.getByText("Asha Rao")).toBeInTheDocument());
  expect(screen.getByText("Ravi")).toBeInTheDocument();
  expect(get.mock.calls[1][0]).toContain("cursor=c1");
});

it("surfaces a failed load with a retry instead of an empty page", async () => {
  get.mockRejectedValueOnce(new Error("Network is down"));

  renderPage();

  await waitFor(() => expect(screen.getByText("Network is down")).toBeInTheDocument());

  get.mockResolvedValueOnce({ data: [guestOrder], nextCursor: null, hasMore: false });
  fireEvent.click(screen.getByRole("button", { name: /retry/i }));

  await waitFor(() => expect(screen.getByText("Ravi")).toBeInTheDocument());
});
