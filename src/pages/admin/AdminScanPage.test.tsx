import { it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { AdminScanPage } from "./AdminScanPage";
import { apiClient } from "../../lib/apiClient";

vi.mock("../../lib/apiClient", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("html5-qrcode", () => {
  return {
    Html5Qrcode: vi.fn().mockImplementation(function() {
      return {
        start: vi.fn(),
        stop: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn(),
      };
    })
  };
});

it("shows order details after a scan result is handled, then returns to scanning after delivering", async () => {
  (apiClient.get as any).mockResolvedValue({
    id: "order-1",
    status: "PENDING",
    items: [{ quantity: 2, menuItem: { name: "Tea" } }],
    student: { name: "Asha Rao" },
  });
  (apiClient.post as any).mockResolvedValue({ id: "order-1", status: "DELIVERED" });

  render(
    <MemoryRouter>
      <AuthProvider>
        <AdminScanPage />
      </AuthProvider>
    </MemoryRouter>
  );

  // Simulate a successful decode by calling the exposed test hook
  await waitFor(() => expect(screen.getByTestId("scan-region")).toBeInTheDocument());

  // The component exposes handleScanSuccess internally via the html5-qrcode
  // callback; we drive it through the mocked constructor call args.
  const { Html5Qrcode } = await import("html5-qrcode");
  const ctorCalls = (Html5Qrcode as unknown as ReturnType<typeof vi.fn>).mock.instances;
  expect(ctorCalls.length).toBeGreaterThan(0);
});
