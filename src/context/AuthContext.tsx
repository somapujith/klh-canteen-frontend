import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { apiClient } from "../lib/apiClient";

type Role = "STUDENT" | "ADMIN" | "SUPERADMIN";

interface StoredAuth {
  token: string;
  role: Role;
  name: string;
  id: string;
}

interface AuthContextValue {
  token: string | null;
  role: Role | null;
  name: string | null;
  userId: string | null;
  /** Resolves with the freshly authenticated session so callers can route on it
   * immediately — reading `role` off the context in the same tick returns the
   * pre-login value, because this component has not re-rendered yet. */
  login: (identifier: string, password: string) => Promise<StoredAuth>;
  logout: () => void;
}

const STORAGE_KEY = "klh_auth";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function loadStored(): StoredAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(loadStored);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await apiClient.post<StoredAuth>("/auth/login", { identifier, password });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    setAuth(result);
    return result;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }, []);

  const value: AuthContextValue = {
    token: auth?.token ?? null,
    role: auth?.role ?? null,
    name: auth?.name ?? null,
    userId: auth?.id ?? null,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
