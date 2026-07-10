import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import { apiClient } from "../lib/apiClient";

vi.mock("../lib/apiClient", () => ({
  apiClient: { post: vi.fn() },
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
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
