import { useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";
import type { AuditLogEntry } from "../../types/admin";

const PAGE_SIZE = 30;

const ACTION_LABEL: Record<string, string> = {
  USER_CREATE: "Created user",
  USER_UPDATE: "Updated user",
  USER_DELETE: "Deleted user",
  CATEGORY_DELETE: "Deleted category",
  CATEGORY_BULK_UPDATE: "Bulk-updated category items",
  MENU_ITEM_DELETE: "Deleted menu item",
  STORAGE_CLEAR: "Cleared storage",
  ORDER_DELIVER_OVERRIDE: "Delivered order (cross-kitchen override)",
};

export function AdminAuditLogPage() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function fetchPage(before?: string) {
    const setter = before ? setLoadingMore : setLoading;
    setter(true);
    const query = before ? `?limit=${PAGE_SIZE}&before=${encodeURIComponent(before)}` : `?limit=${PAGE_SIZE}`;
    apiClient
      .get<AuditLogEntry[]>(`/superadmin/audit-log${query}`, token ?? undefined)
      .then((page) => {
        setEntries((prev) => (before ? [...prev, ...page] : page));
        setHasMore(page.length === PAGE_SIZE);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load audit log"))
      .finally(() => setter(false));
  }

  useEffect(() => {
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function loadMore() {
    if (entries.length === 0) return;
    fetchPage(entries[entries.length - 1].createdAt);
  }

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <AdminNav />
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-gray-500 mt-1">Record of sensitive admin actions across the system.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => fetchPage()} className="underline font-medium">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500 animate-pulse">Loading audit log...</div>
        ) : entries.length === 0 ? (
          <div className="bg-surface rounded-2xl p-12 text-center flat-shadow border border-gray-100">
            <p className="text-gray-500">No audit entries yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="bg-surface rounded-2xl p-4 flat-shadow border border-gray-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {ACTION_LABEL[entry.action] ?? entry.action}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      <span className="font-medium text-gray-700">{entry.actor.name}</span> ({entry.actor.role})
                      <span className="mx-1.5">•</span>
                      {new Date(entry.createdAt).toLocaleString()}
                      {entry.targetType && (
                        <>
                          <span className="mx-1.5">•</span>
                          {entry.targetType}
                          {entry.targetId ? ` #${entry.targetId.slice(0, 8)}` : ""}
                        </>
                      )}
                    </div>
                  </div>
                  {entry.metadata && (
                    <button
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      className="text-xs text-gray-400 hover:text-brand-600 transition-colors shrink-0"
                    >
                      {expandedId === entry.id ? "Hide" : "Details"}
                    </button>
                  )}
                </div>
                {expandedId === entry.id && entry.metadata && (
                  <pre className="mt-3 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 overflow-x-auto">
                    {JSON.stringify(entry.metadata, null, 2)}
                  </pre>
                )}
              </div>
            ))}

            {hasMore && (
              <div className="text-center pt-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
