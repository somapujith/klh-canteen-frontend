import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, render, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth, SESSION_EXPIRED_KEY } from "./AuthContext";
import { apiClient, setUnauthorizedHandler } from "../lib/apiClient";

vi.mock("../lib/apiClient", () => ({
  apiClient: { post: vi.fn() },
  setUnauthorizedHandler: vi.fn(),
}));

/** Minimal unsigned JWT — only the `exp` claim is ever read client-side. */
function jwtExpiringAt(epochSeconds: number): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", exp: epochSeconds })}.sig`;
}

function storeAuth(token: string) {
  localStorage.setItem("klh_auth", JSON.stringify({ token, role: "ADMIN", name: "Admin", id: "u1" }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AuthContext", () => {
  it("logs in, stores token+role, and persists to localStorage", async () => {
    (apiClient.post as any).mockResolvedValue({ token: "abc123", role: "STUDENT", name: "Asha" });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.login("asha@klh.edu.in", "pass1234");
    });

    await waitFor(() => expect(result.current.token).toBe("abc123"));
    expect(result.current.role).toBe("STUDENT");
    expect(JSON.parse(localStorage.getItem("klh_auth")!).token).toBe("abc123");
  });

  it("never renders even one frame as logged-in with an expired token", () => {
    // The timer effect would also clear it, but a frame later — long enough for
    // ProtectedRoute to admit the user and for the page to fire a request that
    // can only 401. This pins the synchronous load-time guard specifically.
    storeAuth(jwtExpiringAt(Math.floor(Date.now() / 1000) - 60));

    const rendered: (string | null)[] = [];
    function Probe() {
      rendered.push(useAuth().token);
      return null;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.every((t) => t === null)).toBe(true);
    expect(localStorage.getItem("klh_auth")).toBeNull();
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBe("1");
  });

  it("restores a stored token that is still valid", () => {
    const token = jwtExpiringAt(Math.floor(Date.now() / 1000) + 3600);
    storeAuth(token);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(result.current.token).toBe(token);
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull();
  });

  it("restores an opaque non-JWT token whole, rather than locking the user out", () => {
    storeAuth("not-a-jwt");

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(result.current.token).toBe("not-a-jwt");
    expect(result.current.role).toBe("ADMIN");
    expect(result.current.name).toBe("Admin");
    expect(result.current.userId).toBe("u1");
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull();
  });

  it("restores a decodable token that carries no numeric exp", () => {
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    storeAuth(`${b64({ alg: "HS256" })}.${b64({ sub: "u1" })}.sig`);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    // No exp means the server is the only authority on lifetime. Refusing the
    // token here would lock out a user the backend still considers valid.
    expect(result.current.token).not.toBeNull();
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull();
  });

  it("ignores a corrupted localStorage entry instead of crashing the app", () => {
    localStorage.setItem("klh_auth", "{not json");

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(result.current.token).toBeNull();
  });

  it("clamps the expiry timer instead of letting setTimeout overflow and fire instantly", () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    // ~100 years out: msLeft far exceeds setTimeout's 2^31-1 ms ceiling.
    storeAuth(jwtExpiringAt(Math.floor(Date.now() / 1000) + 100 * 365 * 24 * 3600));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    const delays = setTimeoutSpy.mock.calls.map((c) => c[1] as number);
    expect(delays.some((d) => d === 2 ** 31 - 1)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.token).not.toBeNull();
  });

  it("cancels a pending expiry timer on logout, so it cannot fire on a later session", async () => {
    vi.useFakeTimers();
    storeAuth(jwtExpiringAt(Math.floor(Date.now() / 1000) + 30));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    act(() => {
      result.current.logout();
    });
    // The old token's exp passes while logged out.
    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    // A fresh login must not be torn down by the previous session's timer.
    (apiClient.post as any).mockResolvedValue({
      token: jwtExpiringAt(Math.floor(Date.now() / 1000) + 3600),
      role: "ADMIN",
      name: "Admin",
      id: "u1",
    });
    await act(async () => {
      await result.current.login("admin@klh.edu.in", "x");
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current.token).not.toBeNull();
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull();
  });

  // NOTE: this proves only that AuthProvider registers a handler that tears the
  // session down. That a real 401 actually REACHES it is a cross-module contract
  // and cannot be shown here, because this file mocks apiClient wholesale —
  // see sessionExpiry.integration.test.tsx, which mocks nothing but fetch.
  it("registers a 401 handler that ends the session when invoked", async () => {
    storeAuth(jwtExpiringAt(Math.floor(Date.now() / 1000) + 3600));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.token).not.toBeNull();

    // Whatever AuthProvider registered IS the app's 401 path — invoke it.
    const registered = (setUnauthorizedHandler as any).mock.calls.at(-1)[0];
    act(() => registered());

    await waitFor(() => expect(result.current.token).toBeNull());
    expect(localStorage.getItem("klh_auth")).toBeNull();
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBe("1");
  });

  it("ends the session on its own when the token's exp passes mid-session", async () => {
    vi.useFakeTimers();
    storeAuth(jwtExpiringAt(Math.floor(Date.now() / 1000) + 30));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.token).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(result.current.token).toBeNull();
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBe("1");
  });

  it("clears the expired flag on a successful login", async () => {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
    (apiClient.post as any).mockResolvedValue({ token: "fresh", role: "ADMIN", name: "Admin", id: "u1" });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => {
      await result.current.login("admin@klh.edu.in", "x");
    });

    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull();
  });

  it("clears state and localStorage on logout", async () => {
    (apiClient.post as any).mockResolvedValue({ token: "abc123", role: "ADMIN", name: "Admin" });
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.login("admin@klh.edu.in", "x");
    });
    act(() => {
      result.current.logout();
    });

    expect(result.current.token).toBeNull();
    expect(localStorage.getItem("klh_auth")).toBeNull();
  });
});
