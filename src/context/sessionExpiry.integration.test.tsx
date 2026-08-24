import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth, SESSION_EXPIRED_KEY } from "./AuthContext";
import { apiClient } from "../lib/apiClient";
import { downloadOrdersCsv } from "../lib/adminExports";

/**
 * The contract AuthContext.test.tsx cannot prove, because it mocks apiClient
 * wholesale: that a real 401 travelling through the real apiClient actually
 * reaches a real AuthProvider and ends the session. Only `fetch` is faked here.
 */

const originalFetch = globalThis.fetch;

function jwtExpiringAt(epochSeconds: number): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", exp: epochSeconds })}.sig`;
}

const liveToken = () => jwtExpiringAt(Math.floor(Date.now() / 1000) + 3600);

function mountWithSession(token: string) {
  localStorage.setItem("klh_auth", JSON.stringify({ token, role: "ADMIN", name: "Admin", id: "u1" }));
  const seen: { token: string | null } = { token: null };
  function Probe() {
    seen.token = useAuth().token;
    return null;
  }
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  return seen;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("session expiry, end to end through the real apiClient", () => {
  it("ends a live session when a credentialed request comes back 401", async () => {
    const token = liveToken();
    const seen = mountWithSession(token);
    expect(seen.token).toBe(token);

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: { message: "Unauthorized" } }) } as Response)
    ) as any;

    await act(async () => {
      await apiClient.get("/admin/orders", token).catch(() => undefined);
    });

    await waitFor(() => expect(seen.token).toBeNull());
    expect(localStorage.getItem("klh_auth")).toBeNull();
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBe("1");
  });

  it("ends the session when the CSV export 401s, even though it bypasses apiClient.request", async () => {
    const token = liveToken();
    const seen = mountWithSession(token);
    expect(seen.token).toBe(token);

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: { message: "Unauthorized" } }) } as Response)
    ) as any;

    await act(async () => {
      await downloadOrdersCsv({ from: "2026-08-01", to: "2026-08-02" } as any, token).catch(() => undefined);
    });

    await waitFor(() => expect(seen.token).toBeNull());
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBe("1");
  });

  it("leaves a live session alone when an uncredentialed login attempt 401s", async () => {
    const token = liveToken();
    const seen = mountWithSession(token);

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: { message: "Invalid credentials" } }) } as Response)
    ) as any;

    await act(async () => {
      await apiClient.post("/auth/login", { identifier: "x", password: "y" }).catch(() => undefined);
    });

    expect(seen.token).toBe(token);
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull();
  });

  it("leaves a logged-in admin alone when a guest-session request 401s on the same device", async () => {
    const token = liveToken();
    const seen = mountWithSession(token);

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: { message: "Guest session expired" } }) } as Response)
    ) as any;

    await act(async () => {
      await apiClient
        .request("GET", "/guest/orders", { headers: { "X-Guest-Session": "gs_123" } })
        .catch(() => undefined);
    });

    expect(seen.token).toBe(token);
    expect(sessionStorage.getItem(SESSION_EXPIRED_KEY)).toBeNull();
  });
});
