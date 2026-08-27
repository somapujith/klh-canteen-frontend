import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, SESSION_EXPIRED_KEY } from "../context/AuthContext";
import type { School } from "../context/AuthContext";
import { Logo, BrandMark } from "../components/Logo";
import { landingPathFor } from "../lib/landing";

const SCHOOL_LABEL: Record<School, string> = { KLH: "KLH University", DRK: "DRK Institution" };

/* Shared frame for both login steps, so the Raja's Bakery mark keeps the exact
   same size when the school picker swaps out for the form — one wrapper, one
   <BrandMark>, no re-mount.

   Top-anchored (not `m-auto`-centred): the mark is hero-sized on purpose, so
   it should sit right under the status bar rather than have the extra space
   on a short viewport split evenly above and below it. Any leftover height —
   the common case, since the KLH card + mark together are usually shorter
   than the viewport — collects at the bottom instead. On the rare taller
   content (KLH's card with its demo quick-fill panel, measured at 875px
   against a 560px phone) this still just scrolls, with the mark reachable at
   scroll-top and a `pt-*` gutter instead of being jammed against the edge. */
function LoginShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-muted flex flex-col items-center px-4 pt-6 sm:pt-10 pb-8 fade-in">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* One axis constrained only — the artwork is portrait (366x422) and
            would squash if width were pinned too. `shrink-0` stops the flex
            column from compressing it when the card is tall. */}
        <BrandMark className="h-44 sm:h-56 w-auto shrink-0 mb-2 sm:mb-6 rise-in" />
        {children}
      </div>
    </div>
  );
}

function SchoolSelect({ onSelect }: { onSelect: (school: School) => void }) {
  return (
    <div className="w-full bg-surface rounded-2xl flat-shadow p-8 space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-gray-800">Welcome</h2>
        <p className="text-sm text-gray-500">Choose your institution to sign in</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {(["KLH", "DRK"] as const).map((school) => (
          <button
            key={school}
            type="button"
            onClick={() => onSelect(school)}
            className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-surface-muted p-6 hover:border-brand-500 hover:bg-white hover-scale flat-shadow-hover transition-all"
          >
            <Logo school={school} className="h-14" />
            <span className="text-sm font-medium text-gray-700">{SCHOOL_LABEL[school]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [school, setSchool] = useState<School | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // A pure read. Clearing here would make the notice vanish in development,
  // where StrictMode double-invokes the initializer and commits the SECOND
  // result — by which point the first invocation has already consumed the flag.
  // login() and logout() own clearing it.
  const sessionExpired = sessionStorage.getItem(SESSION_EXPIRED_KEY) === "1";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!school) return;
    setError(null);
    setLoading(true);
    try {
      // Route on the role the server just returned. Reading `role` from the
      // auth context here would still hold the pre-login value, which sent
      // every admin to the student route and bounced them back to /login.
      const session = await login(identifier, password, school);
      navigate(landingPathFor(session.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  if (!school) {
    return (
      <LoginShell>
        <SchoolSelect onSelect={setSchool} />
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      <div className="w-full bg-surface rounded-2xl flat-shadow p-8 space-y-8 rise-in">
        <div className="flex flex-col items-center gap-2">
          {/* Stepped down from h-20: the Raja's mark above the card is now the
              primary brand cue, so the institution logo reads as secondary —
              and two full-size logos stacked overflowed a 667px phone. */}
          <Logo school={school} className="h-14 sm:h-16 w-auto" />
          <h2 className="text-xl font-semibold text-gray-800">Welcome Back</h2>
          <p className="text-sm text-gray-500 text-center">Sign in to your {SCHOOL_LABEL[school]} canteen account</p>
          <button
            type="button"
            onClick={() => {
              setSchool(null);
              setIdentifier("");
              setPassword("");
              setError(null);
            }}
            className="text-xs text-gray-500 hover:text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:rounded"
          >
            Not {SCHOOL_LABEL[school]}? Change school
          </button>
        </div>

        {sessionExpired && !error && (
          <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-sm flex items-start gap-2" role="status">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Your session expired. Please log in again.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <label htmlFor="identifier" className="block text-sm font-medium text-gray-700">
              Email or Roll Number
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              disabled={loading}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-800 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-200 disabled:opacity-60"
              placeholder="e.g. 2420090001"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-800 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-200 disabled:opacity-60"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2 animate-pulse">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-600 text-white py-3 font-medium hover-scale flat-shadow-hover flex items-center justify-center gap-2 disabled:opacity-70 disabled:hover:scale-100 transition-all"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Logging in...</span>
              </>
            ) : (
              "Log In"
            )}
          </button>
        </form>

        {school === "KLH" && (
          <div className="pt-6 border-t border-gray-100 flex flex-col gap-3">
            <p className="text-xs text-center text-gray-400 uppercase font-semibold tracking-wider">Quick Fill (Demo)</p>
            <button
              onClick={() => { setIdentifier("student@klh.edu.in"); setPassword("student123"); }}
              className="w-full rounded-xl bg-gray-100 text-gray-700 py-2.5 text-sm font-medium hover:bg-gray-200 transition-colors"
              type="button"
            >
              Student Account
            </button>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => { setIdentifier("snacks_admin@klh.edu.in"); setPassword("changeme123"); }}
                className="flex-1 rounded-xl bg-surface-muted border border-gray-200 text-gray-700 py-2.5 text-sm font-medium hover:bg-gray-100 hover:border-gray-300 transition-all"
                type="button"
              >
                Snacks Admin
              </button>
              <button
                onClick={() => { setIdentifier("meals_admin@klh.edu.in"); setPassword("changeme123"); }}
                className="flex-1 rounded-xl bg-brand-50 text-brand-700 py-2.5 text-sm font-medium hover:bg-brand-100 transition-colors"
                type="button"
              >
                Meals Admin
              </button>
            </div>
          </div>
        )}
      </div>
    </LoginShell>
  );
}
