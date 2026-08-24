import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, SESSION_EXPIRED_KEY } from "../context/AuthContext";
import { Logo } from "../components/Logo";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Read once on mount and clear, so the notice shows for the arrival that
  // caused it and not for every later visit to /login in the same tab.
  const [sessionExpired] = useState(() => {
    const flagged = sessionStorage.getItem(SESSION_EXPIRED_KEY) === "1";
    if (flagged) sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    return flagged;
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Route on the role the server just returned. Reading `role` from the
      // auth context here would still hold the pre-login value, which sent
      // every admin to the student route and bounced them back to /login.
      const session = await login(identifier, password);
      navigate(session.role === "STUDENT" ? "/student" : "/admin", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4 fade-in">
      <div className="w-full max-w-sm bg-surface rounded-2xl flat-shadow p-8 space-y-8">
        <div className="flex flex-col items-center gap-2 mb-2">
          <Logo className="h-20 hover-scale" />
          <h2 className="text-xl font-semibold text-gray-800 mt-2">Welcome Back</h2>
          <p className="text-sm text-gray-500 text-center">Sign in to access your canteen account</p>
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
              placeholder="e.g. student@klh.edu.in"
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
      </div>
    </div>
  );
}
