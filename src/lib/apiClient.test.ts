import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient, setUnauthorizedHandler } from "./apiClient";

const originalFetch = globalThis.fetch;

function respond(status: number, body: unknown = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setUnauthorizedHandler(null);
});

describe("apiClient 401 handling", () => {
  it("notifies the unauthorized handler when a credentialed request is rejected", async () => {
    globalThis.fetch = vi.fn(() => respond(401, { error: { message: "Unauthorized" } })) as any;
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(apiClient.get("/admin/orders", "expired-token")).rejects.toMatchObject({ status: 401 });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does NOT notify on a 401 from an uncredentialed request, so a bad login never logs anyone out", async () => {
    globalThis.fetch = vi.fn(() => respond(401, { error: { message: "Invalid credentials" } })) as any;
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(apiClient.post("/auth/login", { identifier: "a", password: "b" })).rejects.toMatchObject({
      status: 401,
    });

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("does NOT notify on a guest-session 401, which is a different credential entirely", async () => {
    globalThis.fetch = vi.fn(() => respond(401, { error: { message: "Guest session expired" } })) as any;
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(
      apiClient.request("GET", "/guest/orders", { headers: { "X-Guest-Session": "gs_123" } })
    ).rejects.toMatchObject({ status: 401 });

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("leaves non-401 failures alone", async () => {
    globalThis.fetch = vi.fn(() => respond(409, { error: { message: "Conflict", code: "INVALID_TRANSITION" } })) as any;
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(apiClient.patch("/admin/orders/1/status", { status: "COOKED" }, "good-token")).rejects.toMatchObject({
      status: 409,
      code: "INVALID_TRANSITION",
    });

    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
