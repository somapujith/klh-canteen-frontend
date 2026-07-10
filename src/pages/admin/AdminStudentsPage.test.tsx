import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../../context/AuthContext";
import { AdminStudentsPage } from "./AdminStudentsPage";
import { apiClient } from "../../lib/apiClient";

vi.mock("../../lib/apiClient", () => ({
  apiClient: { post: vi.fn() },
}));

it("submits pasted CSV text and shows per-row results", async () => {
  (apiClient.post as any).mockResolvedValue({
    results: [{ row: 1, rollNumber: "23BCE001", status: "created" }],
  });

  render(
    <MemoryRouter>
      <AuthProvider>
        <AdminStudentsPage />
      </AuthProvider>
    </MemoryRouter>
  );

  fireEvent.change(screen.getByLabelText(/csv/i), {
    target: { value: "name,rollNumber,email,password\nAsha,23BCE001,asha@klh.edu.in,pass1234" },
  });
  fireEvent.click(screen.getByRole("button", { name: /upload/i }));

  await waitFor(() => expect(screen.getByText(/23BCE001/)).toBeInTheDocument());
  expect(screen.getByText(/created/i)).toBeInTheDocument();
});
