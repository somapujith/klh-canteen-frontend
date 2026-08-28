import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { jwtDecode } from "jwt-decode";
import { apiClient, setUnauthorizedHandler } from "../lib/apiClient";

type Role = "STUDENT" | "ADMIN" | "SUPERADMIN";
export type School = "KLH" | "DRK";

interface StoredAuth {
  token: string;
  role: Role;
  name: string;
  id: string;
  /** Absent on sessions stored before this field existed — treat as unknown
   *  rather than assuming KLH, so a stale session cannot unlock a
   *  school-scoped feature it was never entitled to. */
  school?: School;
}

interface AuthContextValue {
  token: string | null;
  role: Role | null;
  name: string | null;
  userId: string | null;
  /** Null on a session predating this field, or when logged out. */
  school: School | null;
  /** Resolves with the freshly authenticated session so callers can route on it
   * immediately — reading `role` off the context in the same tick returns the
   * pre-login value, because this component has not re-rendered yet. */
  login: (identifier: string, password: string, school: School) => Promise<StoredAuth>;
  /** DRK students only — exchanges a Google ID token for a session, same shape as login(). */
  loginWithGoogle: (idToken: string) => Promise<StoredAuth>;
  /** KLH students, phase 2 of the Google setup flow — see startGoogleKlhLogin
   *  below for phase 1. Writes the session same as login()/loginWithGoogle(). */
  completeGoogleKlhLogin: (setupToken: string, username: string, password: string) => Promise<StoredAuth>;
  logout: () => void;
}

const STORAGE_KEY = "klh_auth";

/**
 * Survives the full page reload that ProtectedRoute does on its way to /login,
 * which is why it lives in sessionStorage rather than React state. Cleared by
 * login and logout — NOT by the reader, because a reader that mutates cannot be
 * called from a render path without lying under StrictMode's double-invoke.
 */
export const SESSION_EXPIRED_KEY = "klh_session_expired";

/** setTimeout saturates past this and fires immediately, so long waits are split. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Storage throws rather than returning null when the browser forbids it — iOS
// Safari with cookies blocked, a partitioned third-party iframe, a full quota.
// AuthProvider sits above the ErrorBoundary, so an unguarded access there takes
// the whole app down to a white screen, not just the session.
function safeRead(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // A session that cannot be persisted still works for this tab.
  }
}

function safeDelete(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

/** Milliseconds since epoch at which this JWT stops being accepted, or null if it never says. */
function tokenExpiryMs(token: string): number | null {
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token);
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    // Not a JWT we can read. Let the server be the judge — the 401 handler is
    // the backstop.
    return null;
  }
}

/** `JSON.parse` yields anything, including null and bare numbers. Only a real session gets through. */
function isStoredAuth(value: unknown): value is StoredAuth {
  return typeof value === "object" && value !== null && typeof (value as StoredAuth).token === "string";
}

function loadStored(): StoredAuth | null {
  const raw = safeRead(localStorage, STORAGE_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  // `"null"` parses to null without throwing, and dereferencing that inside a
  // useState initializer crashes above the ErrorBoundary — a white screen that
  // survives every reload, because the poison entry is never cleared.
  if (!isStoredAuth(parsed)) {
    safeDelete(localStorage, STORAGE_KEY);
    return null;
  }

  // An expired token is not a session. Restoring one produced the failure this
  // guard exists for: the board mounted "logged in", every request 401'd, the
  // SSE stream refused to open, and the admin saw an empty screen with no
  // indication that the fix was to log in again.
  const expiry = tokenExpiryMs(parsed.token);
  if (expiry !== null && expiry <= Date.now()) {
    safeDelete(localStorage, STORAGE_KEY);
    safeWrite(sessionStorage, SESSION_EXPIRED_KEY, "1");
    return null;
  }

  return parsed;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(loadStored);
  // Bumped to re-arm the expiry timer when a wait had to be split.
  const [timerEpoch, setTimerEpoch] = useState(0);
  /**
   * Set when the server hands us a token that this device's clock already calls
   * expired — proof the clock is wrong, not the token. Without this the timer
   * expires the session in the same commit as the login, and the user is thrown
   * back to /login forever with no way to get in. Counter tablets are exactly
   * the population with mis-set clocks.
   */
  const [clockUntrusted, setClockUntrusted] = useState(false);

  const login = useCallback(async (identifier: string, password: string, school: School) => {
    const result = await apiClient.post<StoredAuth>("/auth/login", { identifier, password, school });
    safeWrite(localStorage, STORAGE_KEY, JSON.stringify(result));
    safeDelete(sessionStorage, SESSION_EXPIRED_KEY);

    const expiry = tokenExpiryMs(result.token);
    setClockUntrusted(expiry !== null && expiry <= Date.now());
    setAuth(result);
    return result;
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const result = await apiClient.post<StoredAuth>("/auth/login/google", { idToken });
    safeWrite(localStorage, STORAGE_KEY, JSON.stringify(result));
    safeDelete(sessionStorage, SESSION_EXPIRED_KEY);

    const expiry = tokenExpiryMs(result.token);
    setClockUntrusted(expiry !== null && expiry <= Date.now());
    setAuth(result);
    return result;
  }, []);

  const completeGoogleKlhLogin = useCallback(async (setupToken: string, username: string, password: string) => {
    const result = await apiClient.post<StoredAuth>("/auth/login/google/klh/complete", {
      setupToken,
      username,
      password,
    });
    safeWrite(localStorage, STORAGE_KEY, JSON.stringify(result));
    safeDelete(sessionStorage, SESSION_EXPIRED_KEY);

    const expiry = tokenExpiryMs(result.token);
    setClockUntrusted(expiry !== null && expiry <= Date.now());
    setAuth(result);
    return result;
  }, []);

  const logout = useCallback(() => {
    safeDelete(localStorage, STORAGE_KEY);
    safeDelete(sessionStorage, SESSION_EXPIRED_KEY);
    setClockUntrusted(false);
    setAuth(null);
  }, []);

  /**
   * Same teardown as logout, but flagged so the login screen can explain itself.
   *
   * `failedToken` is the credential that was actually rejected. A request begun
   * under an earlier session can settle after someone else has logged in on the
   * same device; without this comparison that stale 401 destroys the new user's
   * perfectly valid session and tells them it expired.
   */
  const expireSession = useCallback((failedToken?: string) => {
    setAuth((current) => {
      // Nothing to expire. Setting the flag here would tell someone who
      // deliberately logged out that their session expired.
      if (!current) return current;
      if (failedToken !== undefined && failedToken !== current.token) return current;

      safeDelete(localStorage, STORAGE_KEY);
      safeWrite(sessionStorage, SESSION_EXPIRED_KEY, "1");
      return null;
    });
    setClockUntrusted(false);
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
    if (!auth || clockUntrusted) return;
    const expiry = tokenExpiryMs(auth.token);
    if (expiry === null) return;

    const msLeft = expiry - Date.now();
    if (msLeft <= 0) {
      expireSession(auth.token);
      return;
    }

    // A wait longer than setTimeout can hold is split, not collapsed: firing
    // expireSession at the clamp boundary would end the session ~24 days early.
    const timer = setTimeout(() => {
      if (Date.now() >= expiry) expireSession(auth.token);
      else setTimerEpoch((n) => n + 1);
    }, Math.min(msLeft, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [auth, clockUntrusted, expireSession, timerEpoch]);

  // A backgrounded or suspended tab may not get its timer on time, so re-check
  // whenever the tab comes back to the foreground.
  useEffect(() => {
    if (!auth || clockUntrusted) return;
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      const expiry = tokenExpiryMs(auth.token);
      if (expiry !== null && Date.now() >= expiry) expireSession(auth.token);
    };
    document.addEventListener("visibilitychange", recheck);
    return () => document.removeEventListener("visibilitychange", recheck);
  }, [auth, clockUntrusted, expireSession]);

  // Logging out on a shared counter tablet must end the session in every tab,
  // not just the one the button was clicked in.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue === null) setAuth(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value: AuthContextValue = {
    token: auth?.token ?? null,
    role: auth?.role ?? null,
    name: auth?.name ?? null,
    userId: auth?.id ?? null,
    school: auth?.school ?? null,
    login,
    loginWithGoogle,
    completeGoogleKlhLogin,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
