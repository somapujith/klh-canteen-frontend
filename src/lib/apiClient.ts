const API_URL = import.meta.env.VITE_API_URL as string;

export class ApiClientError extends Error {
  status: number;
  /** Machine-readable error code from the backend envelope, e.g. "COLLECTION_WINDOW_FULL". */
  code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Called when the backend rejects a request that DID carry a user credential —
 * i.e. the session is dead, not the password wrong. Registered by AuthProvider
 * so a expired token clears the session instead of leaving the UI to retry a
 * dead token forever.
 */
type UnauthorizedHandler = (failedToken?: string) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/**
 * For credentialed calls that cannot go through `request` — currently only the
 * CSV export, which needs the raw Response to read a blob and a
 * Content-Disposition header. Without this, that one route could 401 and leave
 * the user sitting in a dead session.
 */
export function notifyUnauthorized(failedToken?: string): void {
  unauthorizedHandler?.(failedToken);
}

export interface RequestOptions {
  body?: unknown;
  token?: string;
  /** Extra headers, e.g. { "X-Guest-Session": token } for the walk-up guest flow. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, token, headers, signal } = options;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!res.ok) {
    // A 401 on a request that carried a JWT means the session is over. A 401
    // with no token is a failed login attempt and must NOT log anyone out, and
    // a 401 on a guest request carries its credential in `headers`, not
    // `token`, so it stays out of this branch too — a guest whose session
    // lapses must not bounce the logged-in admin on the same device.
    if (res.status === 401 && token) {
      // Pass the token that failed. A request begun under a previous session can
      // land after someone else has logged in on the same device, and tearing
      // down THAT session would be wrong — the receiver compares before acting.
      unauthorizedHandler?.(token);
    }

    let message = `Request failed with status ${res.status}`;
    let code: string | null = null;
    try {
      const data = await res.json();
      message = data?.error?.message ?? message;
      code = data?.error?.code ?? null;
    } catch {
      // response wasn't JSON — keep default message
    }
    throw new ApiClientError(res.status, message, code);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, token?: string) => request<T>("GET", path, { token }),
  post: <T>(path: string, body: unknown, token?: string) => request<T>("POST", path, { body, token }),
  patch: <T>(path: string, body: unknown, token?: string) => request<T>("PATCH", path, { body, token }),
  delete: <T>(path: string, token?: string) => request<T>("DELETE", path, { token }),
  /** Escape hatch for calls that need custom headers or an abort signal. */
  request,
};
