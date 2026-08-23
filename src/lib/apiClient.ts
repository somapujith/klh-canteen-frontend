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
