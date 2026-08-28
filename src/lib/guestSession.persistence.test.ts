import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

/**
 * The guest ticket must survive a closed tab.
 *
 * A guest holds exactly one key to their orders: the session token. It is not
 * backed by an account, so if the browser drops it, the order is unreachable
 * — still cooking, still real, but invisible to the person waiting for it.
 * That is what sessionStorage did: tab-scoped, wiped on close. These tests pin
 * the storage behaviour so it cannot silently regress back.
 */

const TOKEN_KEY = "klh_guest_session";

const postMock = vi.fn();
vi.mock("./apiClient", () => ({
  apiClient: {
    post: (...args: unknown[]) => postMock(...args),
    request: vi.fn(),
  },
  ApiClientError: class extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));

/** A token far enough from expiry to clear the refresh margin. */
function storedValue(token = "tok-abc") {
  return JSON.stringify({
    token,
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  });
}

async function freshModule() {
  // The module memoises an in-flight mint, so each test needs its own copy.
  vi.resetModules();
  return import("./guestSession");
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  postMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("guest session persistence", () => {
  it("writes a minted token to localStorage, so it outlives the tab", async () => {
    postMock.mockResolvedValue({
      sessionToken: "tok-new",
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      expiresInSeconds: 14_400,
      header: "X-Guest-Session",
    });

    const { ensureGuestSession } = await freshModule();
    await expect(ensureGuestSession()).resolves.toBe("tok-new");

    expect(localStorage.getItem(TOKEN_KEY)).toBeTruthy();
    // The regression itself: a token written only here dies with the tab.
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("recovers an existing token without minting a second session", async () => {
    localStorage.setItem(TOKEN_KEY, storedValue("tok-existing"));

    const { ensureGuestSession } = await freshModule();
    await expect(ensureGuestSession()).resolves.toBe("tok-existing");

    // The whole point: a returning guest keeps their ticket instead of being
    // handed a fresh, empty session.
    expect(postMock).not.toHaveBeenCalled();
  });

  it("migrates a guest who is mid-visit on the old sessionStorage token", async () => {
    // Someone who was already waiting on an order when this shipped. Their
    // token must keep working, or the deploy loses their in-flight order.
    sessionStorage.setItem(TOKEN_KEY, storedValue("tok-legacy"));

    const { ensureGuestSession } = await freshModule();
    await expect(ensureGuestSession()).resolves.toBe("tok-legacy");
    expect(postMock).not.toHaveBeenCalled();
  });

  it("clears both stores, leaving no stale token to be picked back up", async () => {
    localStorage.setItem(TOKEN_KEY, storedValue());
    sessionStorage.setItem(TOKEN_KEY, storedValue("tok-legacy"));

    const { clearGuestSession } = await freshModule();
    clearGuestSession();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("mints a new session once the stored one has expired", async () => {
    localStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({ token: "tok-stale", expiresAt: new Date(Date.now() - 1000).toISOString() })
    );
    postMock.mockResolvedValue({
      sessionToken: "tok-fresh",
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      expiresInSeconds: 14_400,
      header: "X-Guest-Session",
    });

    const { ensureGuestSession } = await freshModule();
    await expect(ensureGuestSession()).resolves.toBe("tok-fresh");
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("still orders when storage throws (private mode, blocked site data)", async () => {
    // Safari private mode and blocked-site-data settings make these THROW
    // rather than return null. An uncaught throw here would take the whole
    // ordering page down instead of merely degrading it.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    postMock.mockResolvedValue({
      sessionToken: "tok-nostorage",
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      expiresInSeconds: 14_400,
      header: "X-Guest-Session",
    });

    const { ensureGuestSession } = await freshModule();
    await expect(ensureGuestSession()).resolves.toBe("tok-nostorage");
  });
});
