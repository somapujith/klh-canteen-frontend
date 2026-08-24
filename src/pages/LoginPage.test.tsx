import { it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, SESSION_EXPIRED_KEY } from "../context/AuthContext";
import { LoginPage } from "./LoginPage";
import { apiClient } from "../lib/apiClient";

vi.mock("../lib/apiClient", () => ({
  apiClient: { post: vi.fn() },
  // AuthProvider registers its 401 handler on mount, so the mock must carry it.
  setUnauthorizedHandler: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

it("tells the user their session expired", () => {
  sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");

  renderLogin();

  expect(screen.getByText(/session expired/i)).toBeInTheDocument();
});

it("still shows the notice under StrictMode, where a mutating read would swallow it", () => {
  sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");

  render(
    <StrictMode>
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>
  );

  expect(screen.getByText(/session expired/i)).toBeInTheDocument();
});

it("drops the notice once the user logs back in", async () => {
  sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
  (apiClient.post as any).mockResolvedValue({ token: "fresh", role: "STUDENT", name: "A", id: "u1" });

  renderLogin();
  expect(screen.getByText(/session expired/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/email or roll number/i), { target: { value: "a@klh.edu.in" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  await waitFor(() => expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull());
});

it("shows no session notice on an ordinary first visit", () => {
  renderLogin();
  expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument();
});

it("submits credentials and shows an error on failed login", async () => {
  (apiClient.post as any).mockRejectedValue(new Error("Invalid credentials"));

  render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );

  fireEvent.change(screen.getByLabelText(/email or roll number/i), { target: { value: "wrong@klh.edu.in" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "bad" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument());
});
