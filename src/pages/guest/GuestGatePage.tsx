import { useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { BrandMark, Logo } from "../../components/Logo";
import { signInGuestWithGoogle, hasUsableGuestSession } from "../../lib/guestSession";
import { ApiClientError } from "../../lib/apiClient";

const GOOGLE_CLIENT_ID_GUEST = import.meta.env.VITE_GOOGLE_CLIENT_ID_GUEST as string | undefined;

/**
 * The counter gate. Every `/g` route is rendered behind this — see App.tsx —
 * so scanning the printed QR now asks for a KLH Google sign-in before the
 * menu, rather than minting an anonymous session silently in the background.
 *
 * NO USERNAME/PASSWORD FIELD ANYWHERE ON THIS SCREEN, by design. This is not
 * the student login page and does not become one: there is no form, no
 * identifier input, nothing to type. The only control is Google's own button.
 *
 * NO ACCOUNT IS CREATED. This still produces an ordinary guest session — same
 * token shape, same `/guest/*` endpoints, same zero privileges — the only
 * difference is that its session id is derived from the Google subject
 * (googleGuestSessionId, backend) instead of being random. That is what lets
 * the same person recover the same tickets after clearing their cache or
 * switching devices, without turning them into a student or admin account.
 *
 * A SEPARATE OAuth client from both student flows (VITE_GOOGLE_CLIENT_ID_GUEST
 * vs _KLH / _DRK) — the backend checks the ID token's `aud` against this
 * flow's client id specifically, so a token minted for the student button is
 * rejected here and vice versa.
 */
/**
 * Mounted as the parent route element for every `/g/*` route (see App.tsx),
 * matching the ProtectedRoute convention: render an <Outlet /> once signed
 * in, or this gate's own screen in its place otherwise.
 */
export function GuestGatePage() {
  const navigate = useNavigate();
  // Read once at mount, not derived from a ref to the sign-in call: every
  // `/g/*` route mounts its own copy of this gate (App.tsx wraps each one
  // separately), so a returning guest whose token is still valid — signed in
  // a minute ago, or an hour ago and still within the 4h session TTL — must
  // not be asked to sign in again on every navigation. A remembered identity
  // whose underlying token has expired does NOT count as signed in; letting
  // that through would only defer the failure to the first /guest/* call.
  const [signedIn, setSignedIn] = useState(hasUsableGuestSession);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCredential(idToken: string) {
    setError(null);
    setLoading(true);
    try {
      await signInGuestWithGoogle(idToken);
      setSignedIn(true);
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.code === "INVALID_DOMAIN"
          ? "Guest ordering needs a klh.edu.in Google account."
          : err instanceof Error
            ? err.message
            : "Google sign-in failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  if (signedIn) return <Outlet />;

  return (
    <div className="min-h-screen bg-surface-muted flex flex-col items-center justify-center px-4 py-8 fade-in">
      <div className="w-full max-w-sm flex flex-col items-center">
        <BrandMark className="w-auto shrink-0 mb-4 rise-in" style={{ height: "clamp(6rem, 16vh, 10rem)" }} />

        <div className="w-full bg-surface rounded-2xl flat-shadow p-8 space-y-6 rise-in">
          <div className="flex flex-col items-center gap-2 text-center">
            <Logo school="KLH" className="w-auto" style={{ height: "clamp(3rem, 8vh, 4rem)" }} />
            <h1 className="text-xl font-semibold text-gray-800">Counter Ordering</h1>
            <p className="text-sm text-gray-500">
              This sign-in is only for staff and guests ordering at the counter. Sign in with your
              KLH Google account to order and keep your ticket, even if you switch devices or clear
              your browser.
            </p>
          </div>

          {error && (
            <div className="bg-danger-50 text-danger-700 p-3 rounded-lg text-sm" role="alert">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-2" role="status" aria-label="Signing in">
              <svg className="w-6 h-6 animate-spin text-brand-600" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </div>
          ) : (
            <GoogleSignInButton
              clientId={GOOGLE_CLIENT_ID_GUEST}
              onCredential={handleCredential}
              onError={setError}
              text="continue_with"
            />
          )}

          {!GOOGLE_CLIENT_ID_GUEST && (
            <p className="text-xs text-gray-400 text-center">
              Guest sign-in is not configured for this environment.
            </p>
          )}

          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full text-center text-xs text-gray-500 hover:text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:rounded"
          >
            Not ordering at the counter? Go back
          </button>
        </div>
      </div>
    </div>
  );
}
