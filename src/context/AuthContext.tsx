import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { apiClient } from "../lib/apiClient";

type Role = "STUDENT" | "ADMIN";

interface StoredAuth {
  token: string;
  role: Role;
  name: string;
}

interface AuthContextValue {
  token: string | null;
  role: Role | null;
  name: string | null;
  login: (identifier: string, password: string) => Promise<void>;
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
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }, []);

  const value: AuthContextValue = {
    token: auth?.token ?? null,
    role: auth?.role ?? null,
    name: auth?.name ?? null,
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
