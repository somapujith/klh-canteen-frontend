import { useCallback, useEffect, useRef, useState } from "react";
import { USERS_PAGE_SIZE, adminErrorMessage, errorCode, fetchUsers, type ActiveFilter } from "../lib/adminUsers";
import type { AdminUser, Role } from "../types/admin";

const SEARCH_DEBOUNCE_MS = 300;

export interface AdminUsersState {
  users: AdminUser[];
  /** Total matching the current filters server-side, not the number loaded. */
  total: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  roleFilter: Role | "ALL";
  setRoleFilter: (value: Role | "ALL") => void;
  activeFilter: ActiveFilter;
  setActiveFilter: (value: ActiveFilter) => void;
  loadMore: () => void;
  refresh: () => void;
  /** Reflect a completed (de)activation without discarding already-loaded pages. */
  applyActivation: (ids: string[], isActive: boolean, tokensValidFrom: string | null) => void;
  removeUser: (id: string) => void;
}

/**
 * Cursor pagination + server-side search for GET /superadmin/users.
 *
 * Every filter change starts a fresh cursor walk. In-flight requests are tagged
 * with a request id so a slow first page can never overwrite a newer one, and
 * `loadMore` discards its result if the filters moved underneath it.
 */
export function useAdminUsers(token: string | null): AdminUsersState {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!token) {
      setUsers([]);
      setTotal(0);
      setHasMore(false);
      setCursor(null);
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchUsers(
      { search: debouncedSearch, role: roleFilter, active: activeFilter, limit: USERS_PAGE_SIZE },
      token,
      controller.signal
    )
      .then((page) => {
        if (id !== requestId.current) return;
        setUsers(page.data);
        setTotal(page.total);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((err) => {
        if (controller.signal.aborted || id !== requestId.current) return;
        setError(adminErrorMessage(err, "Failed to load users"));
        setUsers([]);
        setTotal(0);
        setCursor(null);
        setHasMore(false);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });

    return () => controller.abort();
  }, [token, debouncedSearch, roleFilter, activeFilter, reloadNonce]);

  const refresh = useCallback(() => setReloadNonce((n) => n + 1), []);

  const loadMore = useCallback(() => {
    if (!token || !cursor || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);

    fetchUsers({ search: debouncedSearch, role: roleFilter, active: activeFilter, limit: USERS_PAGE_SIZE, cursor }, token)
      .then((page) => {
        if (id !== requestId.current) return;
        setUsers((prev) => {
          const seen = new Set(prev.map((u) => u.id));
          return [...prev, ...page.data.filter((u) => !seen.has(u.id))];
        });
        setTotal(page.total);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        setError(adminErrorMessage(err, "Failed to load more users"));
        // A rejected cursor can never recover by retrying — restart the walk.
        if (errorCode(err) === "INVALID_CURSOR") refresh();
      })
      .finally(() => {
        if (id === requestId.current) setLoadingMore(false);
      });
  }, [token, cursor, loadingMore, debouncedSearch, roleFilter, activeFilter, refresh]);

  const applyActivation = useCallback(
    (ids: string[], isActive: boolean, tokensValidFrom: string | null) => {
      if (ids.length === 0) return;
      // While filtering by status the changed rows no longer match — refetch instead
      // of leaving rows on screen that the filter would now exclude.
      if (activeFilter !== "all") {
        refresh();
        return;
      }
      const changed = new Set(ids);
      setUsers((prev) => prev.map((u) => (changed.has(u.id) ? { ...u, isActive, tokensValidFrom } : u)));
    },
    [activeFilter, refresh]
  );

  const removeUser = useCallback((id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
  }, []);

  return {
    users,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    search,
    setSearch,
    roleFilter,
    setRoleFilter,
    activeFilter,
    setActiveFilter,
    loadMore,
    refresh,
    applyActivation,
    removeUser,
  };
}
