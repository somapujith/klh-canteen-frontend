import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";

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
  return Math.max((value / total) * 100, 0.4); // min 0.4% so tiny slices are visible
}

const COLOR_MAP: Record<string, { bar: string; dot: string }> = {
  orders:  { bar: "linear-gradient(135deg, #3b82f6, #6366f1)", dot: "#3b82f6" },
  users:   { bar: "linear-gradient(135deg, #22c55e, #10b981)", dot: "#22c55e" },
  menu:    { bar: "linear-gradient(135deg, #f97316, #f59e0b)", dot: "#f97316" },
  system:  { bar: "linear-gradient(135deg, #94a3b8, #64748b)", dot: "#94a3b8" },
};

export function SuperAdminDashboardPage() {
  const { token, logout } = useAuth();
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
      fetchStats(); // refresh
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear storage");
    } finally {
      setClearing(false);
    }
  }

  const freeSpace = stats ? stats.limit - stats.totalSize : 0;
  const usagePercent = stats ? ((stats.totalSize / stats.limit) * 100).toFixed(1) : "0";

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
      {/* Header */}
      <nav style={{
        background: "rgba(15, 23, 42, 0.8)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "sticky",
        top: 0,
        zIndex: 40
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18
            }}>🛡️</div>
            <div>
              <h1 style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Superadmin</h1>
              <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>Storage Management</p>
            </div>
          </div>
          <button onClick={logout} style={{
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)",
            color: "#94a3b8",
            padding: "8px 16px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s"
          }}>
            Log out
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{
              width: 40, height: 40, border: "3px solid rgba(255,255,255,0.1)",
              borderTopColor: "#8b5cf6", borderRadius: "50%",
              animation: "spin 1s linear infinite", margin: "0 auto 16px"
            }} />
            <p style={{ color: "#94a3b8", fontSize: 14 }}>Calculating storage...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {error && (
          <div style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: 16, padding: 20, marginBottom: 24,
            color: "#fca5a5", fontSize: 14
          }}>
            {error}
            <button onClick={fetchStats} style={{
              marginLeft: 12, color: "#f87171", textDecoration: "underline",
              background: "none", border: "none", cursor: "pointer", fontSize: 14
            }}>Retry</button>
          </div>
        )}

        {stats && (
          <>
            {/* Storage Overview Card */}
            <div style={{
              background: "rgba(30, 41, 59, 0.6)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 24,
              padding: "32px 28px",
              marginBottom: 24,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <div>
                  <h2 style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                    Database Storage
                  </h2>
                  <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>Neon PostgreSQL — Free Tier</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ color: "#f1f5f9", fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.03em" }}>
                    {formatBytes(stats.totalSize)}
                  </p>
                  <p style={{ color: "#64748b", fontSize: 12, margin: "2px 0 0" }}>
                    of {formatBytes(stats.limit)} used ({usagePercent}%)
                  </p>
                </div>
              </div>

              {/* Apple-style storage bar */}
              <div style={{
                width: "100%",
                height: 32,
                borderRadius: 10,
                background: "rgba(255,255,255,0.05)",
                display: "flex",
                overflow: "hidden",
                position: "relative",
                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3)"
              }}>
                {stats.components.map((comp, idx) => {
                  const pct = getPercentage(comp.size, stats.limit);
                  const colors = COLOR_MAP[comp.id] || COLOR_MAP.system;
                  return (
                    <div
                      key={comp.id}
                      title={`${comp.name}: ${formatBytes(comp.size)}`}
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: colors.bar,
                        borderRight: idx < stats.components.length - 1 ? "1px solid rgba(0,0,0,0.3)" : "none",
                        transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {/* Shimmer animation */}
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)",
                        animation: "shimmer 3s ease-in-out infinite",
                      }} />
                    </div>
                  );
                })}
                <style>{`@keyframes shimmer { 0%,100% { opacity: 0 } 50% { opacity: 1 } }`}</style>
              </div>

              {/* Legend */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "12px 24px",
                marginTop: 20
              }}>
                {stats.components.map(comp => {
                  const colors = COLOR_MAP[comp.id] || COLOR_MAP.system;
                  return (
                    <div key={comp.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: colors.dot, flexShrink: 0 }} />
                      <span style={{ color: "#94a3b8", fontSize: 13, flexGrow: 1 }}>{comp.name}</span>
                      <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {formatBytes(comp.size)}
                      </span>
                    </div>
                  );
                })}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
                  <span style={{ color: "#94a3b8", fontSize: 13, flexGrow: 1 }}>Free Space</span>
                  <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {formatBytes(freeSpace)}
                  </span>
                </div>
              </div>
            </div>

            {/* Detailed Breakdown */}
            <div style={{
              background: "rgba(30, 41, 59, 0.6)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 24,
              padding: "28px",
              marginBottom: 24,
            }}>
              <h3 style={{ color: "#f1f5f9", fontSize: 17, fontWeight: 700, margin: "0 0 20px", letterSpacing: "-0.01em" }}>
                Component Breakdown
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {stats.components.map(comp => {
                  const pct = stats.totalSize > 0 ? ((comp.size / stats.totalSize) * 100).toFixed(1) : "0";
                  const colors = COLOR_MAP[comp.id] || COLOR_MAP.system;
                  return (
                    <div key={comp.id} style={{
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 14,
                      padding: "16px 20px",
                      border: "1px solid rgba(255,255,255,0.04)",
                      display: "flex", alignItems: "center", gap: 16
                    }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: 12,
                        background: colors.bar,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 18, flexShrink: 0,
                        boxShadow: `0 4px 12px ${colors.dot}33`
                      }}>
                        {comp.id === "orders" ? "📦" : comp.id === "users" ? "👤" : comp.id === "menu" ? "🍽️" : "⚙️"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{comp.name}</span>
                          <span style={{ color: "#94a3b8", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                            {formatBytes(comp.size)} · {pct}%
                          </span>
                        </div>
                        <div style={{ width: "100%", height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                          <div style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: colors.bar,
                            borderRadius: 3,
                            transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
                          }} />
                        </div>
                        <div style={{ marginTop: 4 }}>
                          {comp.removable ? (
                            <span style={{ color: "#6366f1", fontSize: 11, fontWeight: 500 }}>🗑 Removable</span>
                          ) : (
                            <span style={{ color: "#475569", fontSize: 11 }}>🔒 Protected</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Manual Clean Card */}
            <div style={{
              background: "rgba(30, 41, 59, 0.6)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 24,
              padding: "28px",
            }}>
              <h3 style={{ color: "#f1f5f9", fontSize: 17, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
                Manual Storage Cleanup
              </h3>
              <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 24px", lineHeight: 1.5 }}>
                Delete delivered orders and their line items to free up space.
                User accounts, menu items, and pending orders are always protected.
              </p>

              {clearResult && (
                <div style={{
                  background: clearResult.deletedCount > 0 ? "rgba(34, 197, 94, 0.1)" : "rgba(234, 179, 8, 0.1)",
                  border: `1px solid ${clearResult.deletedCount > 0 ? "rgba(34, 197, 94, 0.2)" : "rgba(234, 179, 8, 0.2)"}`,
                  borderRadius: 14, padding: "14px 18px", marginBottom: 20,
                  color: clearResult.deletedCount > 0 ? "#86efac" : "#fde68a",
                  fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8
                }}>
                  {clearResult.deletedCount > 0
                    ? `✅ Successfully deleted ${clearResult.deletedCount} delivered orders.`
                    : "ℹ️ No matching orders found to delete."}
                </div>
              )}

              <div style={{
                background: "rgba(255,255,255,0.03)",
                borderRadius: 16, padding: 20,
                border: "1px solid rgba(255,255,255,0.04)"
              }}>
                <label style={{ color: "#cbd5e1", fontSize: 13, fontWeight: 500, display: "block", marginBottom: 8 }}>
                  Keep orders from the last:
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                  {[0, 1, 7, 30, 90].map(days => (
                    <button
                      key={days}
                      onClick={() => setRetainDays(days)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 10,
                        border: retainDays === days ? "1px solid #6366f1" : "1px solid rgba(255,255,255,0.08)",
                        background: retainDays === days ? "rgba(99, 102, 241, 0.15)" : "rgba(255,255,255,0.03)",
                        color: retainDays === days ? "#a5b4fc" : "#94a3b8",
                        fontSize: 13, fontWeight: 500,
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      {days === 0 ? "Delete All" : `${days} day${days > 1 ? "s" : ""}`}
                    </button>
                  ))}
                </div>

                <div style={{
                  background: retainDays === 0 ? "rgba(239, 68, 68, 0.08)" : "rgba(234, 179, 8, 0.08)",
                  border: `1px solid ${retainDays === 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(234, 179, 8, 0.15)"}`,
                  borderRadius: 12, padding: "12px 16px", marginBottom: 20,
                  color: retainDays === 0 ? "#fca5a5" : "#fde68a",
                  fontSize: 12, lineHeight: 1.5
                }}>
                  {retainDays === 0
                    ? "⚠️ This will delete ALL delivered orders permanently. This cannot be undone."
                    : `This will delete all delivered orders older than ${retainDays} day${retainDays > 1 ? "s" : ""}. Recent orders will be kept.`}
                </div>

                {!showConfirm ? (
                  <button
                    onClick={() => setShowConfirm(true)}
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: 14,
                      border: "none",
                      background: "linear-gradient(135deg, #ef4444, #dc2626)",
                      color: "white",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      boxShadow: "0 4px 16px rgba(239, 68, 68, 0.25)"
                    }}
                  >
                    🗑️ Clean Storage
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={handleClear}
                      disabled={clearing}
                      style={{
                        flex: 1,
                        padding: "14px",
                        borderRadius: 14,
                        border: "none",
                        background: clearing ? "rgba(239, 68, 68, 0.3)" : "linear-gradient(135deg, #ef4444, #b91c1c)",
                        color: "white",
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: clearing ? "not-allowed" : "pointer",
                        opacity: clearing ? 0.7 : 1,
                        transition: "all 0.2s",
                        animation: "pulse-red 1.5s ease-in-out infinite",
                      }}
                    >
                      {clearing ? "Deleting..." : "⚠️ Confirm Delete"}
                    </button>
                    <button
                      onClick={() => setShowConfirm(false)}
                      disabled={clearing}
                      style={{
                        padding: "14px 24px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.05)",
                        color: "#94a3b8",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <style>{`@keyframes pulse-red { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4) } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0) } }`}</style>
              </div>
            </div>

            {/* Estimation Card */}
            <div style={{
              background: "rgba(30, 41, 59, 0.6)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 24,
              padding: "28px",
              marginTop: 24,
            }}>
              <h3 style={{ color: "#f1f5f9", fontSize: 17, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
                📊 Growth Estimation
              </h3>
              <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px", lineHeight: 1.5 }}>
                Based on ~2 KB per transaction (order + 3 items average)
              </p>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 12
              }}>
                {[
                  { label: "Per Day", sub: "1,000 orders", value: "~2 MB" },
                  { label: "Per Month", sub: "30 days", value: "~60 MB" },
                  { label: "Per Year", sub: "365 days", value: "~730 MB" },
                  { label: "Free Tier", sub: "500 MB limit", value: `~${Math.max(0, Math.floor((stats.limit - stats.totalSize) / (2 * 1024 * 1024)))} days left` },
                ].map(item => (
                  <div key={item.label} style={{
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 14, padding: "16px",
                    border: "1px solid rgba(255,255,255,0.04)",
                    textAlign: "center"
                  }}>
                    <p style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{item.value}</p>
                    <p style={{ color: "#94a3b8", fontSize: 12, margin: "4px 0 0", fontWeight: 600 }}>{item.label}</p>
                    <p style={{ color: "#475569", fontSize: 11, margin: "2px 0 0" }}>{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
