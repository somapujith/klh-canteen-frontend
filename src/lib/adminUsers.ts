import { apiClient, ApiClientError } from "./apiClient";
import type {
  ActivationResult,
  ActivationSkip,
  AdminUser,
  Cohort,
  CohortPreview,
  CohortPromoteResult,
  Paginated,
  Role,
} from "../types/admin";

/** `active` query values accepted by GET /superadmin/users. */
export type ActiveFilter = "true" | "false" | "all";

/** The list endpoint caps `limit` at 200; 50 keeps each page fast on a 600-student roster. */
export const USERS_PAGE_SIZE = 50;

export interface UserQuery {
  search?: string;
  role?: Role | "ALL";
  active?: ActiveFilter;
  limit?: number;
  cursor?: string | null;
}

/**
 * Always requests `format=envelope`. The bare-array default carries its metadata
 * in response headers, which `apiClient` does not surface — and reading only the
 * array is exactly the bug that silently truncated this page to 50 accounts.
 */
export function usersPath(query: UserQuery): string {
  const params = new URLSearchParams({ format: "envelope" });
  params.set("limit", String(query.limit ?? USERS_PAGE_SIZE));
  if (query.search) params.set("search", query.search);
  if (query.role && query.role !== "ALL") params.set("role", query.role);
  if (query.active) params.set("active", query.active);
  if (query.cursor) params.set("cursor", query.cursor);
  return `/superadmin/users?${params.toString()}`;
}

export function fetchUsers(query: UserQuery, token: string, signal?: AbortSignal): Promise<Paginated<AdminUser>> {
  return apiClient.request<Paginated<AdminUser>>("GET", usersPath(query), { token, signal });
}

/**
 * Soft (de)activation — order history is preserved either way.
 * `force` only exists on the single-account endpoints and is the only way past
 * the four protected accounts.
 */
export function setUserActive(id: string, active: boolean, token: string, force = false): Promise<ActivationResult> {
  const action = active ? "reactivate" : "deactivate";
  return apiClient.post<ActivationResult>(`/superadmin/users/${id}/${action}`, force ? { force: true } : {}, token);
}

export function setUsersActive(userIds: string[], active: boolean, token: string): Promise<ActivationResult> {
  const action = active ? "reactivate" : "deactivate";
  return apiClient.post<ActivationResult>(`/superadmin/users/bulk/${action}`, { userIds }, token);
}

export function fetchCohorts(token: string): Promise<Cohort[]> {
  return apiClient.get<Cohort[]>("/superadmin/cohorts", token);
}

export function previewCohort(prefix: string, token: string): Promise<CohortPreview> {
  return apiClient.post<CohortPreview>("/superadmin/cohorts/preview", { prefix }, token);
}

/**
 * The only call that actually deactivates a cohort. All three guards are required
 * by the server: `dryRun:false`, `confirm` equal to the prefix, and `expectedCount`
 * equal to the `wouldDeactivate` of the preview the operator just read. Callers must
 * pass the count through from a preview — never recompute it.
 */
export function promoteCohort(prefix: string, expectedCount: number, token: string): Promise<CohortPromoteResult> {
  return apiClient.post<CohortPromoteResult>(
    "/superadmin/cohorts/promote",
    { prefix, dryRun: false, confirm: prefix, expectedCount },
    token
  );
}

/**
 * Codes whose server message is too terse for an operator. Everything else keeps
 * the server's own wording, which already carries the useful specifics
 * (order counts for USER_HAS_ORDERS, old-vs-new counts for COHORT_CHANGED).
 */
const CODE_COPY: Record<string, string> = {
  INVALID_CURSOR: "The user list changed while you were paging through it. Reload to start from the top.",
  VALIDATION_ERROR: "The server rejected those values. Check the filters and try again.",
};

export function errorCode(err: unknown): string | null {
  return err instanceof ApiClientError ? err.code : null;
}

export function adminErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) {
    const code = err.code;
    if (code && CODE_COPY[code]) return CODE_COPY[code];
    return err.message || fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

const SKIP_COPY: Record<string, string> = {
  protected_account: "Protected account — deactivate it individually with force if you really mean it",
  self: "This is the account you are signed in with",
  not_found: "No such account — it may have just been deleted",
};

export function skipReasonCopy(reason: string): string {
  return SKIP_COPY[reason] ?? reason;
}

export function skipLabel(skip: ActivationSkip): string {
  return skip.email ?? skip.id ?? "Unknown account";
}
