import { useCallback, useMemo, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { adminErrorMessage, setUserActive, setUsersActive, type ActiveFilter } from "../../lib/adminUsers";
import { useAdminUsers } from "../../hooks/useAdminUsers";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";
import { BulkAddStudents } from "../../components/BulkAddStudents";
import { SearchInput } from "../../components/SearchInput";
import { UserFormModal } from "../../components/admin/UserFormModal";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { ActivationResultPanel } from "../../components/admin/ActivationResultPanel";
import { UsersTable } from "../../components/admin/UsersTable";
import type { ActivationResult, AdminUser, Role } from "../../types/admin";

type PendingAction =
  | { kind: "deactivate"; users: AdminUser[] }
  | { kind: "reactivate"; users: AdminUser[] }
  | { kind: "force"; user: AdminUser }
  | { kind: "delete"; user: AdminUser };

export function AdminUsersPage() {
  const { token, userId } = useAuth();
  const list = useAdminUsers(token);
  const {
    users,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    search,
    roleFilter,
    activeFilter,
    loadMore,
    refresh,
    applyActivation,
    removeUser,
  } = list;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionResult, setActionResult] = useState<ActivationResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Selection only ever refers to rows currently loaded; changing a filter drops it.
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const setSearch = (value: string) => {
    clearSelection();
    list.setSearch(value);
  };
  const setRoleFilter = (value: Role | "ALL") => {
    clearSelection();
    list.setRoleFilter(value);
  };
  const setActiveFilter = (value: ActiveFilter) => {
    clearSelection();
    list.setActiveFilter(value);
  };

  const selectedUsers = useMemo(() => users.filter((u) => selectedIds.has(u.id)), [users, selectedIds]);

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllLoaded() {
    setSelectedIds((prev) => (prev.size === users.length ? new Set() : new Set(users.map((u) => u.id))));
  }

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    setShowForm(true);
  }

  /**
   * Reflects the server's own accounting: only ids the server says it changed are
   * patched locally. Anything ambiguous falls back to a refetch rather than
   * showing a state the server never confirmed.
   */
  function absorbResult(result: ActivationResult, requestedIds: string[], active: boolean) {
    setActionResult(result);
    const changedIds = result.changedUsers?.map((u) => u.id);
    if (changedIds) applyActivation(changedIds, active, result.tokensValidFrom);
    else if (result.changed === requestedIds.length) applyActivation(requestedIds, active, result.tokensValidFrom);
    else refresh();
  }

  async function runActivation(targets: AdminUser[], active: boolean, force = false) {
    if (!token || targets.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const ids = targets.map((u) => u.id);
      const result =
        ids.length === 1
          ? await setUserActive(ids[0], active, token, force)
          : await setUsersActive(ids, active, token);
      absorbResult(result, ids, active);
      clearSelection();
    } catch (err) {
      setActionError(adminErrorMessage(err, active ? "Failed to reactivate" : "Failed to deactivate"));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function runDelete(user: AdminUser) {
    if (!token) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiClient.delete(`/superadmin/users/${user.id}`, token);
      removeUser(user.id);
      setPending(null);
    } catch (err) {
      // 409 USER_HAS_ORDERS carries the count and tells the operator to deactivate instead.
      setActionError(adminErrorMessage(err, "Failed to delete user"));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  function confirmPending() {
    if (!pending) return;
    if (pending.kind === "delete") void runDelete(pending.user);
    else if (pending.kind === "force") void runActivation([pending.user], false, true);
    else void runActivation(pending.users, pending.kind === "reactivate");
  }

  /** A single deactivate that changed nothing because the account is protected. */
  const protectedBlock =
    actionResult &&
    !actionResult.active &&
    actionResult.changed === 0 &&
    actionResult.requested === 1 &&
    actionResult.skipped?.[0]?.reason === "protected_account"
      ? actionResult.skipped[0]
      : null;
  const protectedUser = protectedBlock ? users.find((u) => u.id === protectedBlock.id) ?? null : null;

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <AdminNav />

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            <p className="text-gray-500 mt-1">Manage admin, superadmin, and student accounts.</p>
          </div>
          <button
            onClick={openCreate}
            className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            + Add User
          </button>
        </div>

        <BulkAddStudents token={token} onImported={refresh} />

        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, email, or roll number"
            label="Search users"
            className="flex-1 rounded-xl border border-gray-300 bg-surface px-3 py-2 pr-9 text-sm focus-within:ring-2 focus-within:ring-brand-500/20"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "ALL")}
            aria-label="Filter by role"
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="ALL">All roles</option>
            <option value="SUPERADMIN">Superadmin</option>
            <option value="ADMIN">Admin</option>
            <option value="STUDENT">Student</option>
          </select>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
            aria-label="Filter by status"
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">Active &amp; inactive</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-gray-500">
            {loading ? (
              "Searching…"
            ) : (
              <>
                Showing <strong className="text-gray-800">{users.length}</strong> of{" "}
                <strong className="text-gray-800">{total}</strong> matching account{total === 1 ? "" : "s"}
              </>
            )}
          </p>
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-gray-600 font-medium">{selectedUsers.length} selected</span>
              <button
                onClick={() => setPending({ kind: "reactivate", users: selectedUsers })}
                className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Reactivate
              </button>
              <button
                onClick={() => setPending({ kind: "deactivate", users: selectedUsers })}
                className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors"
              >
                Deactivate
              </button>
              <button
                onClick={clearSelection}
                className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={refresh} className="underline font-medium shrink-0">
              Retry
            </button>
          </div>
        )}

        {actionError && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-start justify-between gap-3">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="shrink-0 font-medium text-red-400 hover:text-red-700">
              Dismiss
            </button>
          </div>
        )}

        {actionResult && <ActivationResultPanel result={actionResult} onDismiss={() => setActionResult(null)} />}

        {protectedUser && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>
              <strong>{protectedUser.email}</strong> is a protected account. Deactivating it can lock the canteen out of
              its own tooling.
            </span>
            <button
              onClick={() => setPending({ kind: "force", user: protectedUser })}
              className="shrink-0 rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors"
            >
              Force deactivate anyway
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500 animate-pulse">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="bg-surface rounded-2xl p-12 text-center flat-shadow border border-gray-100">
            <p className="text-gray-500">No users match these filters.</p>
          </div>
        ) : (
          <>
            <UsersTable
              users={users}
              selectedIds={selectedIds}
              currentUserId={userId}
              onToggleOne={toggleOne}
              onToggleAll={toggleAllLoaded}
              onEdit={openEdit}
              onDeactivate={(u) => setPending({ kind: "deactivate", users: [u] })}
              onReactivate={(u) => void runActivation([u], true)}
              onDelete={(u) => setPending({ kind: "delete", user: u })}
            />

            {hasMore ? (
              <div className="flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
                >
                  {loadingMore ? "Loading…" : `Load more (${total - users.length} remaining)`}
                </button>
              </div>
            ) : (
              users.length > 0 && <p className="text-center text-xs text-gray-400">End of list — all {total} shown.</p>
            )}
          </>
        )}
      </div>

      {showForm && (
        <UserFormModal
          editing={editing}
          token={token}
          onSaved={() => {
            setShowForm(false);
            refresh();
          }}
          onClose={() => setShowForm(false)}
        />
      )}

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        title={
          pending?.kind === "delete"
            ? "Delete account"
            : pending?.kind === "force"
              ? "Force deactivate a protected account"
              : pending?.kind === "reactivate"
                ? "Reactivate accounts"
                : "Deactivate accounts"
        }
        tone={pending?.kind === "reactivate" ? "default" : "danger"}
        confirmLabel={
          pending?.kind === "delete"
            ? "Delete permanently"
            : pending?.kind === "force"
              ? "Force deactivate"
              : pending?.kind === "reactivate"
                ? `Reactivate ${pending.users.length}`
                : pending
                  ? `Deactivate ${pending.users.length}`
                  : "Confirm"
        }
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      >
        {pending?.kind === "delete" && (
          <>
            <p>
              Permanently delete <strong>{pending.user.name}</strong> ({pending.user.email})?
            </p>
            <p>
              Accounts with orders cannot be deleted — deactivate them instead so their order history survives.
            </p>
          </>
        )}
        {pending?.kind === "force" && (
          <>
            <p>
              <strong>{pending.user.email}</strong> is one of the canteen's protected accounts.
            </p>
            <p>Forcing it inactive signs it out immediately and may lock staff out of the admin tools.</p>
          </>
        )}
        {(pending?.kind === "deactivate" || pending?.kind === "reactivate") && (
          <>
            <p>
              {pending.kind === "deactivate" ? "Deactivate" : "Reactivate"}{" "}
              <strong>
                {pending.users.length} account{pending.users.length === 1 ? "" : "s"}
              </strong>
              ?
            </p>
            {pending.kind === "deactivate" && (
              <p>They will be signed out and unable to log in. Order history is preserved and this is reversible.</p>
            )}
            <ul className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              {pending.users.slice(0, 25).map((u) => (
                <li key={u.id} className="px-3 py-1.5 truncate text-gray-700">
                  {u.name} <span className="text-gray-400">— {u.rollNumber ?? u.email}</span>
                </li>
              ))}
            </ul>
            {pending.users.length > 25 && (
              <p className="text-xs text-gray-400">…and {pending.users.length - 25} more.</p>
            )}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
