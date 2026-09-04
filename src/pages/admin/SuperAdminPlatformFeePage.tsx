import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient";
import { useAuth, type School } from "../../context/AuthContext";
import { AdminNav } from "../../components/AdminNav";

/**
 * The per-school platform fee knob, and the money it has produced today.
 *
 * Both halves live on one screen deliberately: a percentage typed into a box is
 * an abstraction until you can see what it collected. The GET below returns the
 * settings and the stats together for that reason, so the page never renders a
 * fee without its effect beside it.
 */

/** Same wording as LoginPage's SchoolSelect, so a school is named identically wherever it appears. */
const SCHOOL_LABEL: Record<School, string> = { KLH: "KLH University", DRK: "DRK Institution" };

/** Fixed order, not response order. Card positions must not shuffle between loads. */
const SCHOOLS: School[] = ["KLH", "DRK"];

interface SchoolStats {
  school: School;
  totalOrdersToday: number;
  totalRevenueToday: string;
  totalPlatformFeeToday: string;
}

interface PlatformFeeResponse {
  /** One entry per school. A school with no row configured reports 0. */
  fees: { school: School; platformFeePercent: number }[];
  stats: SchoolStats[];
}

/** 0 for a school absent from the response — the same "no row means no fee" the backend reads. */
function feeFor(data: PlatformFeeResponse | null, school: School): number {
  return data?.fees.find((f) => f.school === school)?.platformFeePercent ?? 0;
}

function statsFor(data: PlatformFeeResponse | null, school: School): SchoolStats {
  return (
    data?.stats.find((s) => s.school === school) ?? {
      school,
      totalOrdersToday: 0,
      totalRevenueToday: "0.00",
      totalPlatformFeeToday: "0.00",
    }
  );
}

/**
 * One stat tile, matching AdminDashboardPage's existing stat cards.
 *
 * Smaller type than the dashboard's `text-4xl` because three of these sit
 * inside a card here rather than spanning the page — the hierarchy is
 * card-title first, numbers second, which is the opposite of the dashboard
 * where the numbers ARE the page.
 *
 * Two shapes, and both were forced by screenshots rather than chosen:
 *
 *  - `text-lg`, not the `text-2xl` this started as. Three tiles share one card,
 *    so each is ~90px wide, and a real day's revenue rendered in 2xl black
 *    overflowed its tile and collided with the next one.
 *  - Label beside the value on a phone, above it from `sm` up. Stacked in three
 *    narrow columns, "₹18420.50" truncated to "₹184…" — and a rupee figure
 *    missing its last digits is a wrong number, not a small one. One row per
 *    stat below `sm` gives the value the full card width.
 *
 * `truncate` survives as a backstop for absurd amounts; it should never be what
 * an ordinary day's takings hits.
 */
function StatTile({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="bg-surface-muted rounded-xl p-4 min-w-0 flex items-baseline justify-between gap-2 sm:block">
      <div className="text-xs text-gray-500 font-medium sm:mb-1 uppercase tracking-wide shrink-0">{label}</div>
      <div className={`text-lg font-black tabular-nums truncate ${valueClass}`} title={value}>
        {value}
      </div>
    </div>
  );
}

function SchoolFeeCard({
  school,
  data,
  loading,
  onSaved,
}: {
  school: School;
  data: PlatformFeeResponse | null;
  loading: boolean;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const currentPercent = feeFor(data, school);
  const stats = statsFor(data, school);

  // A string, not a number: an <input type="number"> that round-trips through
  // Number() cannot hold "" or a half-typed "1." while the superadmin is still
  // typing, and clobbering the field mid-keystroke is how a 5 becomes a 0.
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Seeded from the server, and re-seeded whenever the server's answer changes
  // — but never while a save is in flight, which would yank the field out from
  // under the value being submitted.
  useEffect(() => {
    if (!saving) setDraft(String(currentPercent));
  }, [currentPercent, saving]);

  const parsed = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
  const dirty = valid && parsed !== currentPercent;

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await apiClient.patch(`/superadmin/settings/platform-fee/${school}`, { percent: parsed }, token ?? undefined);
      setSaved(true);
      // Refetch rather than patching local state: the response also carries
      // today's stats, and this page's whole claim is that the two agree.
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save the fee");
    } finally {
      setSaving(false);
    }
  }

  const inputId = `platform-fee-${school}`;

  return (
    <div className="bg-surface rounded-2xl p-6 flat-shadow border border-gray-100 space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900 tracking-tight">{SCHOOL_LABEL[school]}</h2>
        {loading ? (
          <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
        ) : (
          <span className="text-sm font-semibold text-brand-600 tabular-nums">{currentPercent}% today</span>
        )}
      </div>

      <div>
        <label htmlFor={inputId} className="block text-sm font-semibold text-gray-700 mb-2">
          Platform fee
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={0.01}
              value={draft}
              disabled={loading || saving}
              onChange={(e) => {
                setDraft(e.target.value);
                setSaved(false);
                setSaveError(null);
              }}
              className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 pr-8 text-sm tabular-nums transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
              %
            </span>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || !dirty}
            className="px-5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:hover:bg-brand-600 text-white font-bold text-sm transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {/* Three mutually exclusive statuses under one field: why the button is
            refusing, that the save failed, or that it landed. */}
        {!valid && draft.trim() !== "" ? (
          <p className="mt-2 text-xs font-medium text-red-600">Enter a number between 0 and 100.</p>
        ) : saveError ? (
          <p className="mt-2 text-xs font-medium text-red-600" role="alert">
            {saveError}
          </p>
        ) : saved ? (
          <p className="mt-2 text-xs font-medium text-green-700">
            Saved. New orders at {SCHOOL_LABEL[school]} are charged this fee.
          </p>
        ) : (
          <p className="mt-2 text-xs text-gray-500">
            Added on top of the order subtotal and shown to the student as its own line. 0% removes it entirely.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Today</h3>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-surface-muted rounded-xl p-4 min-w-0 flex items-center justify-between gap-2 sm:block"
              >
                <div className="h-3 w-12 bg-gray-200 rounded animate-pulse sm:mb-2" />
                <div className="h-6 w-14 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatTile label="Orders" value={String(stats.totalOrdersToday)} valueClass="text-gray-900" />
            <StatTile label="Revenue" value={`₹${stats.totalRevenueToday}`} valueClass="text-gray-900" />
            <StatTile label="Fee" value={`₹${stats.totalPlatformFeeToday}`} valueClass="text-brand-600" />
          </div>
        )}
      </div>
    </div>
  );
}

export function SuperAdminPlatformFeePage() {
  const { token } = useAuth();
  const [data, setData] = useState<PlatformFeeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFees = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiClient.get<PlatformFeeResponse>(
        "/superadmin/settings/platform-fee",
        token ?? undefined
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load platform fee settings");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchFees();
  }, [fetchFees]);

  return (
    <div className="min-h-screen bg-surface-muted pb-12 fade-in">
      <AdminNav />

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Fee</h1>
          <p className="text-gray-500 mt-1">
            Set the fee charged on top of every order, per school. Each school is independent.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchFees} className="underline font-medium">
              Retry
            </button>
          </div>
        )}

        {/* One card per row, not two side by side.
            Two-up was the first attempt: inside a max-w-3xl page it left each
            card ~350px, and the three stat tiles within then truncated their
            rupee figures to "₹842…" even on a desktop. There are only ever two
            schools, so stacking costs one scroll at most and buys every number
            the width to be read.

            Rendered through the error state too, in their loading/zero shape: a
            failed stats fetch should not also take away the knob that fixes a
            wrong fee. Each card disables its own controls while loading. */}
        <div className="grid grid-cols-1 gap-4">
          {SCHOOLS.map((school) => (
            <SchoolFeeCard key={school} school={school} data={data} loading={loading} onSaved={fetchFees} />
          ))}
        </div>
      </div>
    </div>
  );
}
