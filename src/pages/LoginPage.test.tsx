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
  expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
});

/* The demo panel used to render for KLH only, which gave DRK a visibly shorter
   card. It is now gated on the build (DEV / VITE_SHOW_DEMO_LOGINS) rather than
   on the school, so both schools get one. Every credential offered must match a
   row seedAdmin.ts actually writes — these tests are what stops the panel from
   drifting back into advertising accounts nobody seeded. */
it("offers the seeded KLH accounts in the demo quick-fill panel", () => {
  renderLogin();
  pickKlh();

  expect(screen.getByText(/quick fill/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /student account/i }));
  expect(screen.getByLabelText(/username/i)).toHaveValue("student@klh.edu.in");
  expect(screen.getByLabelText("Password")).toHaveValue("student123");
});

/* Removed: "offers the seeded DRK admin accounts in the demo quick-fill panel".
   DRK is Google-only — it has no password login for the panel to fill in — so
   the quick-fill affordance is KLH-only by design. See the comment above
   KLH_DEMO_ACCOUNTS in LoginPage.tsx. The KLH panel is still covered above. */

/* DRK seeds admins but no demo student, so the panel must not offer one. This
   is the assertion that fails if someone pastes the KLH student row into the
   DRK list without seeding a matching account. */
it("offers no demo student for DRK, because none is seeded", () => {
  renderLogin();
  fireEvent.click(screen.getByRole("button", { name: /drk institution/i }));

  expect(screen.queryByRole("button", { name: /student account/i })).not.toBeInTheDocument();
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
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin@klh.edu.in" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/admin/board", { replace: true }));
  expect(apiClient.post).toHaveBeenCalledWith("/auth/login", { identifier: "admin@klh.edu.in", password: "pw", school: "KLH" });
});

it("passes the picked school through to the login request", async () => {
  (apiClient.post as any).mockResolvedValue({ token: "t", role: "STUDENT", name: "A", id: "u1" });

  renderLogin();
  // Asserted through KLH rather than DRK: DRK is Google-only and has no
  // password form to submit, so the school field can only be exercised here.
  pickKlh();
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "someone@klh.edu.in" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  await waitFor(() =>
    expect(apiClient.post).toHaveBeenCalledWith("/auth/login", { identifier: "someone@klh.edu.in", password: "pw", school: "KLH" })
  );
});

it("drops the notice once the user logs back in", async () => {
  sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
  (apiClient.post as any).mockResolvedValue({ token: "fresh", role: "STUDENT", name: "A", id: "u1" });

  renderLogin();
  pickKlh();
  expect(screen.getByText(/session expired/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "a@klh.edu.in" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
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
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "wrong@klh.edu.in" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bad" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));
  await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /change school/i }));
  // The error must already be gone at the picker, before any school is chosen
  // — that is the state a user actually sees after tapping "change school".
  expect(screen.queryByText(/invalid credentials/i)).not.toBeInTheDocument();

  // Back into KLH rather than on to DRK: DRK is Google-only and renders no
  // username/password form, so the fields can only be re-read here. Coming
  // back to the same school is also the stricter check — the form is rebuilt
  // from state rather than simply unmounted.
  pickKlh();
  expect(screen.queryByText(/invalid credentials/i)).not.toBeInTheDocument();
  expect(screen.getByLabelText(/username/i)).toHaveValue("");
  expect(screen.getByLabelText("Password")).toHaveValue("");
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

  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "wrong@klh.edu.in" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bad" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument());
});

it("toggles the password between hidden and visible", () => {
  renderLogin();
  pickKlh();
  const field = screen.getByLabelText("Password");
  expect(field).toHaveAttribute("type", "password");

  const toggle = screen.getByRole("button", { name: /show password/i });
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(toggle);

  expect(field).toHaveAttribute("type", "text");
  expect(screen.getByRole("button", { name: /hide password/i })).toHaveAttribute("aria-pressed", "true");
});

it("warns about Caps Lock without treating it as an error", () => {
  renderLogin();
  pickKlh();
  const field = screen.getByLabelText("Password");

  // `modifierCapsLock` is the init key jsdom actually feeds to
  // KeyboardEvent.getModifierState; a `getModifierState` override in the init
  // dict is silently ignored and always reports false.
  fireEvent.keyDown(field, { key: "a", modifierCapsLock: true });
  expect(screen.getByText(/caps lock is on/i)).toBeInTheDocument();
  // A hint, not an alert — it must not be announced as a validation failure.
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();

  fireEvent.keyDown(field, { key: "a", modifierCapsLock: false });
  expect(screen.queryByText(/caps lock is on/i)).not.toBeInTheDocument();
});

it("blocks submit with inline field errors instead of calling the API", () => {
  renderLogin();
  pickKlh();
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  expect(screen.getByText(/enter your username/i)).toBeInTheDocument();
  expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
  expect(apiClient.post).not.toHaveBeenCalled();
  // Focus lands on the first offending field so the user can just type.
  expect(screen.getByLabelText(/username/i)).toHaveFocus();
});

it("flags only the missing password when the identifier is filled", () => {
  renderLogin();
  pickKlh();
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "a@klh.edu.in" } });
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));

  expect(screen.queryByText(/enter your username/i)).not.toBeInTheDocument();
  expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toHaveFocus();
  expect(apiClient.post).not.toHaveBeenCalled();
});

it("clears a field error as soon as the user starts fixing it", () => {
  renderLogin();
  pickKlh();
  fireEvent.click(screen.getByRole("button", { name: /log in/i }));
  expect(screen.getByText(/enter your password/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "p" } });
  expect(screen.queryByText(/enter your password/i)).not.toBeInTheDocument();
});
