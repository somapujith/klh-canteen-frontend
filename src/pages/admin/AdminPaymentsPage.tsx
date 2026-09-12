import { useEffect, useState } from "react";
import { AdminNav } from "../../components/AdminNav";
import { useAuth } from "../../context/AuthContext";
import {
  getAdminPaymentStats,
  getAdminPaymentsList,
} from "../../lib/adminPayments";
import type {
  AdminPaymentStats,
  AdminPaymentRow,
} from "../../lib/adminPayments";

export function AdminPaymentsPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<AdminPaymentStats | null>(null);
  const [logs, setLogs] = useState<AdminPaymentRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filterToday, setFilterToday] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!token) return;

    let mounted = true;

    async function loadInitial() {
      try {
        setLoading(true);
        const [statsData, logsData] = await Promise.all([
          getAdminPaymentStats(token!),
          getAdminPaymentsList(token!, { limit: 10, isToday: filterToday }),
        ]);

        if (mounted) {
          setStats(statsData);
          setLogs(logsData.data);
          setNextCursor(logsData.nextCursor);
          setHasMore(logsData.hasMore);
        }
      } catch (err) {
        console.error("Failed to load payment dashboard", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadInitial();
    return () => {
      mounted = false;
    };
  }, [token, filterToday]);

  async function handleLoadMore() {
    if (!token || !nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const res = await getAdminPaymentsList(token, {
        cursor: nextCursor,
        limit: 10,
        isToday: filterToday,
      });
      setLogs((prev) => [...prev, ...res.data]);
      setNextCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err) {
      console.error("Failed to load more logs", err);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <AdminNav />
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments Dashboard</h1>
          <p className="text-gray-500 mt-1">Track digital transactions and commissions.</p>
        </div>

        {loading && !stats ? (
          <div className="flex justify-center p-12 text-gray-400">Loading...</div>
        ) : (
          <>
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center">
                  <div className="text-sm font-medium text-gray-500 mb-1">This Month's Payments</div>
                  <div className="text-3xl font-bold text-gray-900">₹{stats.thisMonthTotal}</div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center">
                  <div className="text-sm font-medium text-gray-500 mb-1">
                    Commission ({stats.commissionPercent}%)
                  </div>
                  <div className="text-3xl font-bold text-brand-600">₹{stats.commission}</div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Payment Logs</h3>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setFilterToday(true)}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                      filterToday ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setFilterToday(false)}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                      !filterToday ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    All Time
                  </button>
                </div>
              </div>
              {loading && logs.length === 0 ? (
                <div className="p-12 text-center text-gray-400">Loading logs...</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/50">
                          <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                          <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                          <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-4 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {logs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(log.createdAt).toLocaleString(undefined, {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                                month: 'short',
                                day: 'numeric'
                              })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {log.studentName || log.guestName || "Unknown"}
                              </div>
                              {log.guestName && (
                                <div className="text-xs text-gray-500">Guest</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  log.status === "SUCCESS"
                                    ? "bg-green-100 text-green-800"
                                    : log.status === "FAILED"
                                    ? "bg-red-100 text-red-800"
                                    : log.status === "EXPIRED"
                                    ? "bg-gray-100 text-gray-800"
                                    : "bg-yellow-100 text-yellow-800"
                                }`}
                              >
                                {log.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                              ₹{log.amount}
                            </td>
                          </tr>
                        ))}
                        {logs.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                              No payments found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {hasMore && (
                    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-center">
                      <button
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                      >
                        {loadingMore ? "Loading..." : "Load More"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
