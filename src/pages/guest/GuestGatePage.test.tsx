import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GuestGatePage } from "./GuestGatePage";
import { signInGuestWithGoogle, hasUsableGuestSession } from "../../lib/guestSession";

/**
 * This is the security-relevant surface the gate exists for: does the
 * counter route actually stay closed until a Google identity is present, and
 * does it actually open once one is? Everything Google-button-specific is
 * covered where GoogleSignInButton itself lives; this file is about the gate
 * decision, not the widget.
 */

vi.mock("../../lib/guestSession", () => ({
  signInGuestWithGoogle: vi.fn(),
  hasUsableGuestSession: vi.fn(),
}));

// GoogleSignInButton talks to a real Google script via useEffect; stub it so
// these tests exercise the gate's own logic rather than a network call.
vi.mock("../../components/GoogleSignInButton", () => ({
  GoogleSignInButton: ({ onCredential }: { onCredential: (t: string) => void }) => (
    <button onClick={() => onCredential("fake-id-token")}>Sign in with Google</button>
  ),
}));

function renderGate() {
  return render(
    <MemoryRouter initialEntries={["/g"]}>
      <Routes>
        <Route element={<GuestGatePage />}>
          <Route path="/g" element={<div>Menu content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GuestGatePage", () => {
  it("blocks the route and shows no username/password field when nobody is signed in", () => {
    vi.mocked(hasUsableGuestSession).mockReturnValue(false);
    renderGate();

    expect(screen.queryByText("Menu content")).not.toBeInTheDocument();
    expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
    // The whole point of the requirement: this screen must never grow a
    // typed-credential path back in.
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/roll number/i)).not.toBeInTheDocument();
  });

  it("renders the route once a usable session already exists (returning guest)", () => {
    // A guest who signed in earlier and is still within the session TTL must
    // not be asked again on every navigation between /g/* routes.
    vi.mocked(hasUsableGuestSession).mockReturnValue(true);
    renderGate();

    expect(screen.getByText("Menu content")).toBeInTheDocument();
    expect(screen.queryByText(/sign in with google/i)).not.toBeInTheDocument();
  });

  it("opens the route after a successful Google sign-in", async () => {
    vi.mocked(hasUsableGuestSession).mockReturnValue(false);
    vi.mocked(signInGuestWithGoogle).mockResolvedValue({ email: "230003@klh.edu.in", name: "Test" });
    renderGate();

    screen.getByText(/sign in with google/i).click();

    await waitFor(() => expect(screen.getByText("Menu content")).toBeInTheDocument());
    expect(signInGuestWithGoogle).toHaveBeenCalledWith("fake-id-token");
  });

  it("stays closed and shows the server's message when sign-in is rejected", async () => {
    vi.mocked(hasUsableGuestSession).mockReturnValue(false);
    vi.mocked(signInGuestWithGoogle).mockRejectedValue(new Error("Invalid Google sign-in."));
    renderGate();

    screen.getByText(/sign in with google/i).click();

    await waitFor(() => expect(screen.getByText("Invalid Google sign-in.")).toBeInTheDocument());
    expect(screen.queryByText("Menu content")).not.toBeInTheDocument();
  });
});
