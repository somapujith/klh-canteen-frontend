import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";
import { CohortPromoteDialog } from "../../components/admin/CohortPromoteDialog";
import { OrdersCsvExport } from "../../components/admin/OrdersCsvExport";
import { adminErrorMessage, errorCode, fetchCohorts, previewCohort, promoteCohort } from "../../lib/adminUsers";
import type { Cohort, CohortPreview, CohortPromoteResult } from "../../types/admin";

export function AdminCohortsPage() {
  const { token } = useAuth();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [prefix, setPrefix] = useState("");
  const [preview, setPreview] = useState<CohortPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<CohortPromoteResult | null>(null);

  const loadCohorts = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    fetchCohorts(token)
      .then(setCohorts)
      .catch((err) => setLoadError(adminErrorMessage(err, "Failed to load cohorts")))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(loadCohorts, [loadCohorts]);

  const runPreview = useCallback(
    async (value: string): Promise<CohortPreview | null> => {
      const trimmed = value.trim();
      if (!token || !trimmed) return null;
      setPreviewing(true);
      setPreviewError(null);
      setPromoted(null);
      try {
        const result = await previewCohort(trimmed, token);
        setPreview(result);
        return result;
      } catch (err) {
        setPreview(null);
        setPreviewError(adminErrorMessage(err, "Preview failed"));
        return null;
      } finally {
        setPreviewing(false);
      }
    },
    [token]
  );

  function handlePreviewSubmit(e: FormEvent) {
    e.preventDefault();
    void runPreview(prefix);
  }

  function previewFromCard(intake: string) {
    setPrefix(intake);
    void runPreview(intake);
  }

  /**
   * The real thing. `expectedCount` comes from the preview the operator read, so a
   * cohort that shifted in between is rejected server-side with COHORT_CHANGED —
   * at which point we re-preview and make them re-read the new numbers.
   */
  async function handlePromote(expectedCount: number) {
    if (!token || !preview) return;
    setPromoting(true);
    setPromoteError(null);
    try {
      const result = await promoteCohort(preview.prefix, expectedCount, token);
      setPromoted(result);
      setPreview(null);
      setDialogOpen(false);
      loadCohorts();
    } catch (err) {
      const code = errorCode(err);
      setPromoteError(adminErrorMessage(err, "Promotion failed"));
      if (code === "COHORT_CHANGED") {
        const fresh = await runPreview(preview.prefix);
        if (fresh) setPromoteError(`${adminErrorMessage(err, "Promotion failed")} The preview below has been refreshed.`);
      }
    } finally {
      setPromoting(false);
    }
  }

  // A preview is only usable while it still describes what is typed in the box.
  const previewIsStale = preview !== null && preview.prefix !== prefix.trim();

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <AdminNav />

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cohorts</h1>
          <p className="text-gray-500 mt-1">
            Roll numbers encode the intake year — <code className="text-xs bg-gray-100 rounded px-1 py-0.5">2420090001</code>{" "}
            belongs to intake <strong>24</strong>. Promoting an intake deactivates its accounts and keeps their order
            history.
          </p>
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <button onClick={loadCohorts} className="underline font-medium shrink-0">
              Retry
            </button>
          </div>
        )}

        {promoted && (
          <div className="rounded-2xl border border-gray-200 bg-surface p-4 space-y-2">
            <p className="text-sm text-gray-800">
              Intake <strong>{promoted.prefix}</strong>: deactivated <strong>{promoted.changed}</strong> account
              {promoted.changed === 1 ? "" : "s"}.
              {promoted.alreadyInactive > 0 && ` ${promoted.alreadyInactive} were already inactive.`}
              {promoted.protectedSkipped.length > 0 &&
                ` ${promoted.protectedSkipped.length} protected account${
                  promoted.protectedSkipped.length === 1 ? " was" : "s were"
                } skipped.`}
            </p>
            {promoted.protectedSkipped.length > 0 && (
              <ul className="text-xs text-gray-500 list-disc pl-5">
                {promoted.protectedSkipped.map((p) => (
                  <li key={p.email}>
                    {p.email}
                    {p.rollNumber ? ` (${p.rollNumber})` : ""}
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => setPromoted(null)} className="text-xs font-medium text-gray-400 hover:text-gray-700">
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500 animate-pulse">Loading cohorts...</div>
        ) : cohorts.length === 0 ? (
          <div className="bg-surface rounded-2xl p-12 text-center flat-shadow border border-gray-100">
            <p className="text-gray-500">No intakes found. Import a student roster first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cohorts.map((cohort) => (
              <div key={cohort.intake} className="bg-surface rounded-2xl border border-gray-100 flat-shadow p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-lg font-bold text-gray-900">Intake {cohort.intake}</h2>
                  <span className="text-sm text-gray-500">{cohort.total} accounts</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2 py-1 font-medium text-green-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {cohort.active} active
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-100 px-2 py-1 font-medium text-gray-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    {cohort.inactive} inactive
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {cohort.rollNumberMin} – {cohort.rollNumberMax}
                </p>
                <button
                  onClick={() => previewFromCard(cohort.intake)}
                  disabled={previewing}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
                >
                  Preview promotion
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-surface rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Promote an intake</h2>
            <p className="text-sm text-gray-500 mt-1">
              Always a dry run first. Nothing changes until you read the preview and type the prefix to confirm.
            </p>
          </div>

          <form onSubmit={handlePreviewSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="Roll number prefix, e.g. 24"
              aria-label="Roll number prefix"
              inputMode="numeric"
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            <button
              type="submit"
              disabled={previewing || !prefix.trim()}
              className="rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 text-sm font-semibold transition-colors"
            >
              {previewing ? "Previewing…" : "Preview (dry run)"}
            </button>
          </form>

          {previewError && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">{previewError}</div>
          )}
          {promoteError && !dialogOpen && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">{promoteError}</div>
          )}

          {preview && (
            <div className="rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-surface-muted px-4 py-3 border-b border-gray-200">
                <p className="text-sm font-semibold text-gray-900">
                  Dry run for intake {preview.prefix} — nothing has changed
                </p>
                {previewIsStale && (
                  <p className="text-xs text-amber-700 mt-1">
                    The prefix box now says “{prefix.trim()}”. Re-run the preview before promoting.
                  </p>
                )}
              </div>

              <div className="p-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Matched" value={preview.matched} />
                  <Stat label="Would deactivate" value={preview.wouldDeactivate} tone="danger" />
                  <Stat label="Already inactive" value={preview.alreadyInactive} />
                  <Stat label="Protected, skipped" value={preview.protectedSkipped.length} />
                </div>

                {preview.rollNumberRange && (
                  <p className="text-gray-500">
                    Roll numbers {preview.rollNumberRange.first} – {preview.rollNumberRange.last}
                  </p>
                )}

                {preview.protectedSkipped.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900 mb-1">
                      Protected accounts — these will not be touched
                    </p>
                    <ul className="text-xs text-amber-800 list-disc pl-5">
                      {preview.protectedSkipped.map((p) => (
                        <li key={p.email}>
                          {p.email}
                          {p.rollNumber ? ` (${p.rollNumber})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.sample.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">
                      Sample{preview.sampleTruncated && ` — first ${preview.sample.length} of ${preview.wouldDeactivate}`}
                    </p>
                    <ul className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                      {preview.sample.map((u) => (
                        <li key={u.id} className="px-3 py-1.5 flex justify-between gap-3">
                          <span className="truncate text-gray-800">{u.name}</span>
                          <span className="shrink-0 text-gray-400">{u.rollNumber}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.wouldDeactivate === 0 ? (
                  <p className="text-gray-500">Nothing to deactivate for this prefix.</p>
                ) : (
                  <button
                    onClick={() => {
                      setPromoteError(null);
                      setDialogOpen(true);
                    }}
                    disabled={previewIsStale}
                    className="rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Continue to deactivate {preview.wouldDeactivate} accounts…
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <OrdersCsvExport token={token} />
      </div>

      {dialogOpen && preview && (
        <CohortPromoteDialog
          preview={preview}
          busy={promoting}
          error={promoteError}
          onConfirm={handlePromote}
          onCancel={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "danger" ? "border-red-200 bg-red-50" : "border-gray-200 bg-surface-muted"}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${tone === "danger" ? "text-red-800" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
