import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { jwtDecode } from "jwt-decode";
import { apiClient, setUnauthorizedHandler } from "../lib/apiClient";

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

/**
 * Survives the full page reload that ProtectedRoute does on its way to /login,
 * which is why it lives in sessionStorage rather than React state. Read and
 * cleared by LoginPage so the user is told why they are looking at a login
 * form instead of the board they had open.
 */
export const SESSION_EXPIRED_KEY = "klh_session_expired";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Milliseconds since epoch at which this JWT stops being accepted, or null if it never says. */
function tokenExpiryMs(token: string): number | null {
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token);
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    // Not a JWT we can read. Let the server be the judge — the 401 handler
    // below is the backstop.
    return null;
  }
}

function loadStored(): StoredAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  let parsed: StoredAuth;
  try {
    parsed = JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }

  // An expired token is not a session. Restoring one produced the failure this
  // guard exists for: the board mounted "logged in", every request 401'd, the
  // SSE stream refused to open, and the admin saw an empty screen with no
  // indication that the fix was to log in again.
  const expiry = tokenExpiryMs(parsed.token);
  if (expiry !== null && expiry <= Date.now()) {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
    return null;
  }

  return parsed;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(loadStored);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await apiClient.post<StoredAuth>("/auth/login", { identifier, password });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    setAuth(result);
    return result;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    setAuth(null);
  }, []);

  /** Same teardown as logout, but flagged so the login screen can explain itself. */
  const expireSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
    setAuth(null);
  }, []);

  // Backstop for everything the clock cannot predict: a revoked token, a
  // rotated JWT secret, a clock that disagrees with the server's.
  useEffect(() => {
    setUnauthorizedHandler(expireSession);
    return () => setUnauthorizedHandler(null);
  }, [expireSession]);

  // Proactive expiry. Without this a session dies silently mid-shift and the
  // first symptom is a board that stops updating.
  useEffect(() => {
    if (!auth) return;
    const expiry = tokenExpiryMs(auth.token);
    if (expiry === null) return;

    const msLeft = expiry - Date.now();
    if (msLeft <= 0) {
      expireSession();
      return;
    }

    // setTimeout saturates past 2^31-1 ms and would fire immediately.
    const timer = setTimeout(expireSession, Math.min(msLeft, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [auth, expireSession]);

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
