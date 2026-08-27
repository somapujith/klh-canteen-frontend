import { it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigateSpy,
}));
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

/** Every test starts at the school-select step; most need the KLH form beyond it. */
function pickKlh() {
  fireEvent.click(screen.getByRole("button", { name: /klh university/i }));
}

it("shows the school picker before any login form", () => {
  renderLogin();

  expect(screen.getByRole("button", { name: /klh university/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /drk institution/i })).toBeInTheDocument();
  expect(screen.queryByLabelText(/email or roll number/i)).not.toBeInTheDocument();
});

it("shows the KLH demo quick-fill buttons only after KLH is picked, never for DRK", () => {
  renderLogin();
  fireEvent.click(screen.getByRole("button", { name: /drk institution/i }));
  expect(screen.queryByText(/quick fill/i)).not.toBeInTheDocument();
});

it("tells the user their session expired", () => {
  sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");

  renderLogin();
  pickKlh();

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
  pickKlh();

  expect(screen.getByText(/session expired/i)).toBeInTheDocument();
});

it("lands an admin on the order board rather than the dashboard", async () => {
  (apiClient.post as any).mockResolvedValue({ token: "t", role: "ADMIN", name: "A", id: "u1" });

  renderLogin();
  pickKlh();
  fireEvent.change(screen.getByLabelText(/email or roll number/i), { target: { value: "admin@klh.edu.in" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/admin/board", { replace: true }));
  expect(apiClient.post).toHaveBeenCalledWith("/auth/login", { identifier: "admin@klh.edu.in", password: "pw", school: "KLH" });
});

it("passes the picked school through to the login request", async () => {
  (apiClient.post as any).mockResolvedValue({ token: "t", role: "STUDENT", name: "A", id: "u1" });

  renderLogin();
  fireEvent.click(screen.getByRole("button", { name: /drk institution/i }));
  fireEvent.change(screen.getByLabelText(/email or roll number/i), { target: { value: "someone@drk.edu.in" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  await waitFor(() =>
    expect(apiClient.post).toHaveBeenCalledWith("/auth/login", { identifier: "someone@drk.edu.in", password: "pw", school: "DRK" })
  );
});

it("drops the notice once the user logs back in", async () => {
  sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
  (apiClient.post as any).mockResolvedValue({ token: "fresh", role: "STUDENT", name: "A", id: "u1" });

  renderLogin();
  pickKlh();
  expect(screen.getByText(/session expired/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/email or roll number/i), { target: { value: "a@klh.edu.in" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  await waitFor(() => expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull());
});

it("shows no session notice on an ordinary first visit", () => {
  renderLogin();
  pickKlh();
  expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument();
});

it("clears the stale error and credentials when switching schools", async () => {
  (apiClient.post as any).mockRejectedValue(new Error("Invalid credentials"));

  renderLogin();
  pickKlh();
  fireEvent.change(screen.getByLabelText(/email or roll number/i), { target: { value: "wrong@klh.edu.in" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "bad" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));
  await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /change school/i }));
  fireEvent.click(screen.getByRole("button", { name: /drk institution/i }));

  expect(screen.queryByText(/invalid credentials/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/email or roll number/i)).toHaveValue("");
  expect(screen.getByLabelText(/password/i)).toHaveValue("");
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
  pickKlh();

  fireEvent.change(screen.getByLabelText(/email or roll number/i), { target: { value: "wrong@klh.edu.in" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "bad" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument());
});
