import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";

interface StorageComponent {
  id: string;
  name: string;
  size: number;
  color: string;
  removable: boolean;
}

interface StorageStats {
  totalSize: number;
  limit: number;
  components: StorageComponent[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function getPercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.max((value / total) * 100, 0.4);
}

const ICON_MAP: Record<string, string> = { orders: "📦", users: "👤", menu: "🍽️", system: "⚙️" };
const BAR_COLOR: Record<string, string> = {
  orders: "bg-blue-500",
  users: "bg-green-500",
  menu: "bg-orange-500",
  system: "bg-gray-400",
};

export function SuperAdminDashboardPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [retainDays, setRetainDays] = useState(7);
  const [clearResult, setClearResult] = useState<{ success: boolean; deletedCount: number } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.get<StorageStats>("/superadmin/storage", token ?? undefined);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load storage stats");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  async function handleClear() {
    setClearing(true);
    setClearResult(null);
    try {
      const result = await apiClient.post<{ success: boolean; deletedCount: number }>(
        "/superadmin/storage/clear",
        { target: "orders", retainDays },
        token ?? undefined
      );
      setClearResult(result);
      setShowConfirm(false);
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear storage");
    } finally {
      setClearing(false);
    }
  }

  const freeSpace = stats ? stats.limit - stats.totalSize : 0;
  const usagePercent = stats ? ((stats.totalSize / stats.limit) * 100).toFixed(1) : "0";

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <AdminNav />

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System &amp; Storage</h1>
          <p className="text-gray-500 mt-1">Database usage and maintenance tools.</p>
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-500 animate-pulse">Calculating storage...</div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchStats} className="underline font-medium">Retry</button>
          </div>
        )}

        {stats && (
          <>
            <div className="bg-gray-900 rounded-3xl p-7 text-white flat-shadow">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Database Storage</h2>
                  <p className="text-gray-400 text-xs mt-1">Neon PostgreSQL — Free Tier</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-extrabold tracking-tight">{formatBytes(stats.totalSize)}</p>
                  <p className="text-gray-400 text-xs mt-0.5">of {formatBytes(stats.limit)} used ({usagePercent}%)</p>
                </div>
              </div>

              <div className="w-full h-7 rounded-lg bg-white/5 flex overflow-hidden">
                {stats.components.map((comp, idx) => (
                  <div
                    key={comp.id}
                    title={`${comp.name}: ${formatBytes(comp.size)}`}
                    className={`h-full ${BAR_COLOR[comp.id] ?? BAR_COLOR.system} ${idx < stats.components.length - 1 ? "border-r border-black/30" : ""}`}
                    style={{ width: `${getPercentage(comp.size, stats.limit)}%` }}
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                {stats.components.map((comp) => (
                  <div key={comp.id} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-sm shrink-0 ${BAR_COLOR[comp.id] ?? BAR_COLOR.system}`} />
                    <div className="min-w-0">
                      <div className="text-xs text-gray-300 truncate">{comp.name}</div>
                      <div className="text-xs font-semibold text-white">{formatBytes(comp.size)}</div>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0 bg-white/10 border border-white/20" />
                  <div className="min-w-0">
                    <div className="text-xs text-gray-300 truncate">Free Space</div>
                    <div className="text-xs font-semibold text-white">{formatBytes(freeSpace)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-2xl p-6 flat-shadow border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-3">Component Breakdown</h3>
              <div className="space-y-3">
                {stats.components.map((comp) => {
                  const pct = stats.totalSize > 0 ? ((comp.size / stats.totalSize) * 100).toFixed(1) : "0";
                  return (
                    <div key={comp.id} className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${BAR_COLOR[comp.id] ?? BAR_COLOR.system}`}>
                        <span>{ICON_MAP[comp.id] ?? "⚙️"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-semibold text-gray-900">{comp.name}</span>
                          <span className="text-xs text-gray-500">{formatBytes(comp.size)} · {pct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${BAR_COLOR[comp.id] ?? BAR_COLOR.system}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-1">
                          {comp.removable ? (
                            <span className="text-[10px] font-semibold text-brand-600">🗑 Removable</span>
                          ) : (
                            <span className="text-[10px] font-semibold text-gray-400">🔒 Protected</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flat-shadow">
              <h3 className="font-bold text-red-900 mb-1">Manual Storage Cleanup</h3>
              <p className="text-red-700/80 text-sm mb-5">
                Delete delivered orders and their line items to free up space.
                User accounts, menu items, and pending orders are always protected.
              </p>

              {clearResult && (
                <div className={`rounded-xl p-3 mb-4 text-sm font-medium ${clearResult.deletedCount > 0 ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                  {clearResult.deletedCount > 0
                    ? `Successfully deleted ${clearResult.deletedCount} delivered orders.`
                    : "No matching orders found to delete."}
                </div>
              )}

              <div className="bg-white rounded-xl p-4 border border-red-100">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Keep orders from the last:</label>
                <div className="flex gap-2 flex-wrap mb-4">
                  {[0, 1, 7, 30, 90].map((days) => (
                    <button
                      key={days}
                      onClick={() => setRetainDays(days)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        retainDays === days
                          ? "bg-brand-600 text-white border-brand-600"
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {days === 0 ? "Delete All" : `${days} day${days > 1 ? "s" : ""}`}
                    </button>
                  ))}
                </div>

                <div className={`rounded-lg p-3 mb-4 text-xs ${retainDays === 0 ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-800"}`}>
                  {retainDays === 0
                    ? "This will delete ALL delivered orders permanently. This cannot be undone."
                    : `This will delete all delivered orders older than ${retainDays} day${retainDays > 1 ? "s" : ""}. Recent orders will be kept.`}
                </div>

                {!showConfirm ? (
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-colors"
                  >
                    Clean Storage
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleClear}
                      disabled={clearing}
                      className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold text-sm transition-colors"
                    >
                      {clearing ? "Deleting..." : "Confirm Delete"}
                    </button>
                    <button
                      onClick={() => setShowConfirm(false)}
                      disabled={clearing}
                      className="px-5 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
