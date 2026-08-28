import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth, SESSION_EXPIRED_KEY } from "../context/AuthContext";
import type { School } from "../context/AuthContext";
import { Logo, BrandMark } from "../components/Logo";
import { Button } from "../components/ui";
import { landingPathFor } from "../lib/landing";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { apiClient } from "../lib/apiClient";

const SCHOOL_LABEL: Record<School, string> = { KLH: "KLH University", DRK: "DRK Institution" };

/** Both schools get a Google button, but with different backing flows: DRK
 *  auto-creates on first sign-in (no roster exists to match against), KLH
 *  routes through a username/password setup step against its existing
 *  bulk-imported roster (see KlhGoogleSetupForm below). Separate OAuth
 *  client per school — separate GCP projects/consent screens, so either can
 *  be rotated or reconfigured without touching the other. */
const GOOGLE_CLIENT_ID: Record<School, string | undefined> = {
  DRK: import.meta.env.VITE_GOOGLE_CLIENT_ID_DRK as string | undefined,
  KLH: import.meta.env.VITE_GOOGLE_CLIENT_ID_KLH as string | undefined,
};

interface KlhGoogleSetup {
  setupToken: string;
  suggestedUsername: string;
  usernameEditable: boolean;
  accountExists: boolean;
}

/**
 * Phase 2 of KLH's Google sign-in: shown after /auth/login/google/klh/start
 * returns a setup ticket. Username is locked to the roll number extracted
 * from the student's klh.edu.in address unless no digits were found there
 * (a name-based address), in which case it's a free-text field. Always
 * shown on a first-time Google sign-in — even for an already-provisioned
 * roster account — per product spec: this screen is also how that account
 * gets a password it can use outside Google from now on.
 */
function KlhGoogleSetupForm({
  setup,
  onComplete,
  onCancel,
}: {
  setup: KlhGoogleSetup;
  onComplete: (username: string, password: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [username, setUsername] = useState(setup.suggestedUsername);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string; confirmPassword?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof fieldErrors = {};
    if (!username.trim()) next.username = "Username is required";
    if (!password) next.password = "Enter a password";
    if (password && password !== confirmPassword) next.confirmPassword = "Passwords do not match";
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;

    setError(null);
    setLoading(true);
    try {
      await onComplete(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish setting up your account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold text-gray-800">
          {setup.accountExists ? "Confirm your account" : "Set up your account"}
        </h2>
        <p className="text-sm text-gray-500">
          {setup.accountExists
            ? "This roll number already has an account. Set a password to link it to Google."
            : "Choose a password to finish creating your account."}
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="klh-google-username" className="block text-sm font-medium text-gray-700">
          Username
        </label>
        <input
          id="klh-google-username"
          type="text"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (fieldErrors.username) setFieldErrors((p) => ({ ...p, username: undefined }));
          }}
          disabled={loading || !setup.usernameEditable}
          aria-invalid={fieldErrors.username ? true : undefined}
          aria-describedby={fieldErrors.username ? "klh-google-username-error" : undefined}
          className={`${FIELD_CLASS} ${fieldErrors.username ? FIELD_BAD : FIELD_OK} ${!setup.usernameEditable ? "text-gray-500" : ""}`}
        />
        {fieldErrors.username ? (
          <FieldError id="klh-google-username-error">{fieldErrors.username}</FieldError>
        ) : !setup.usernameEditable ? (
          <p className="text-xs text-gray-500">Detected from your roll number — this can't be changed.</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="klh-google-password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="klh-google-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
          }}
          disabled={loading}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? "klh-google-password-error" : undefined}
          className={`${FIELD_CLASS} ${fieldErrors.password ? FIELD_BAD : FIELD_OK}`}
          placeholder="••••••••"
        />
        {fieldErrors.password && <FieldError id="klh-google-password-error">{fieldErrors.password}</FieldError>}
      </div>

      <div className="space-y-1">
        <label htmlFor="klh-google-confirm-password" className="block text-sm font-medium text-gray-700">
          Confirm password
        </label>
        <input
          id="klh-google-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            if (fieldErrors.confirmPassword) setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
          }}
          disabled={loading}
          aria-invalid={fieldErrors.confirmPassword ? true : undefined}
          aria-describedby={fieldErrors.confirmPassword ? "klh-google-confirm-password-error" : undefined}
          className={`${FIELD_CLASS} ${fieldErrors.confirmPassword ? FIELD_BAD : FIELD_OK}`}
          placeholder="••••••••"
        />
        {fieldErrors.confirmPassword && (
          <FieldError id="klh-google-confirm-password-error">{fieldErrors.confirmPassword}</FieldError>
        )}
      </div>

      {error && (
        <div role="alert" className="bg-danger-50 text-danger-700 p-3 rounded-lg text-sm flex items-start gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <Button type="submit" size="lg" fullWidth loading={loading}>
        {loading ? "Setting up..." : "Continue"}
      </Button>
      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        className="w-full text-xs text-gray-500 hover:text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:rounded"
      >
        Cancel and go back
      </button>
    </form>
  );
}

/* Demo quick-fill is a development affordance, not a product feature, so it is
   gated rather than shipped. KLH-only now — DRK has no password login at all
   to quick-fill into (see the DRK branch of LoginPage below).

   Every credential below matches a row seedAdmin.ts actually writes. */
const SHOW_DEMO_LOGINS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGINS === "true";

/** Matches Canteen-Backend/scripts/seedStudent.ts and seedAdmin.ts defaults. */
const KLH_DEMO_ACCOUNTS: { label: string; identifier: string; password: string }[] = [
  { label: "Student account", identifier: "student@klh.edu.in", password: "student123" },
  { label: "Admin account", identifier: "admin@klh.edu.in", password: "changeme123" },
];

const FIELD_CLASS =
  "w-full rounded-xl border px-4 py-2.5 text-gray-800 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 transition-all duration-200 disabled:opacity-60";
const FIELD_OK = "border-gray-200 focus:ring-brand-500/20 focus:border-brand-500";
const FIELD_BAD = "border-danger-600 focus:ring-danger-600/20 focus:border-danger-600";

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      {open ? (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.9 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.9M6.5 8.1A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.6-.3 3.7-.8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 16" />
        </>
      )}
    </svg>
  );
}

/** Field-level message. `role="alert"` so a screen reader hears it on submit. */
function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="text-xs text-danger-600">
      {children}
    </p>
  );
}

/**
 * The username/password form, shared by KLH's default login step and DRK's
 * admin-login toggle (see the DRK branch of LoginPage). All state lives in
 * the parent so it survives the toggle without resetting mid-fill.
 */
function PasswordLoginForm({
  identifier,
  setIdentifier,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  capsLock,
  onCapsLockKey,
  onBlurPassword,
  fieldErrors,
  setFieldErrors,
  error,
  loading,
  identifierRef,
  passwordRef,
  onSubmit,
}: {
  identifier: string;
  setIdentifier: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (fn: (v: boolean) => boolean) => void;
  capsLock: boolean;
  onCapsLockKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlurPassword: () => void;
  fieldErrors: { identifier?: string; password?: string };
  setFieldErrors: (fn: (p: { identifier?: string; password?: string }) => { identifier?: string; password?: string }) => void;
  error: string | null;
  loading: boolean;
  identifierRef: RefObject<HTMLInputElement | null>;
  passwordRef: RefObject<HTMLInputElement | null>;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="space-y-1">
        <label htmlFor="identifier" className="block text-sm font-medium text-gray-700">
          Email or Roll Number
        </label>
        <input
          id="identifier"
          ref={identifierRef}
          type="text"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            if (fieldErrors.identifier) setFieldErrors((p) => ({ ...p, identifier: undefined }));
          }}
          disabled={loading}
          aria-invalid={fieldErrors.identifier ? true : undefined}
          aria-describedby={fieldErrors.identifier ? "identifier-error" : undefined}
          className={`${FIELD_CLASS} ${fieldErrors.identifier ? FIELD_BAD : FIELD_OK}`}
          placeholder="e.g. 2420090001"
        />
        {fieldErrors.identifier && <FieldError id="identifier-error">{fieldErrors.identifier}</FieldError>}
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        {/* The toggle sits inside the field's right edge, so the input keeps
            `pr-12` to stop the value running underneath it. */}
        <div className="relative">
          <input
            id="password"
            ref={passwordRef}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
            }}
            onKeyUp={onCapsLockKey}
            onKeyDown={onCapsLockKey}
            onBlur={onBlurPassword}
            disabled={loading}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? "password-error" : capsLock ? "caps-hint" : undefined}
            className={`${FIELD_CLASS} pr-12 ${fieldErrors.password ? FIELD_BAD : FIELD_OK}`}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            aria-controls="password"
            disabled={loading}
            className="absolute inset-y-0 right-0 w-11 min-h-11 flex items-center justify-center rounded-r-xl text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 transition-colors disabled:opacity-60"
          >
            <EyeIcon open={showPassword} />
          </button>
        </div>
        {fieldErrors.password ? (
          <FieldError id="password-error">{fieldErrors.password}</FieldError>
        ) : (
          // A quiet note, not an error: Caps Lock being on is a likely cause
          // of a failed login, but it is not itself a problem to fix.
          capsLock && (
            <p id="caps-hint" className="text-xs text-gray-500">
              Caps Lock is on
            </p>
          )
        )}
      </div>

      {error && (
        <div role="alert" className="bg-danger-50 text-danger-700 p-3 rounded-lg text-sm flex items-start gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Explicit type="submit" — ui/Button defaults to "button". */}
      <Button type="submit" size="lg" fullWidth loading={loading}>
        {loading ? "Logging in..." : "Log In"}
      </Button>
    </form>
  );
}

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
    <div className="min-h-screen bg-surface-muted flex flex-col items-center justify-center px-4 py-8 fade-in">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* One axis constrained only — the artwork is portrait (366x422) and
            would squash if width were pinned too. `shrink-0` stops the flex
            column from compressing it when the card is tall. Fluid height via
            clamp() instead of a single sm: breakpoint jump — that jump made
            375px and 639px phones render identically, then 640px+ jump bigger
            with nothing scaling further past it up to desktop widths. */}
        <BrandMark
          className="w-auto shrink-0 mb-4 rise-in"
          style={{ height: "clamp(7rem, 18vh, 12rem)" }}
        />
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

/** Reads the `:school` route param from /login/drk or /login/klh (see
 *  App.tsx) — lets a QR code point straight at one school's card, skipping
 *  SchoolSelect. Anything else, including a bare /login, falls through to
 *  the picker rather than guessing. */
function schoolFromParam(raw: string | undefined): School | null {
  const upper = raw?.toUpperCase();
  return upper === "KLH" || upper === "DRK" ? upper : null;
}

export function LoginPage() {
  const { login, loginWithGoogle, completeGoogleKlhLogin } = useAuth();
  const navigate = useNavigate();
  const { school: schoolParam } = useParams<{ school?: string }>();
  const [school, setSchool] = useState<School | null>(() => schoolFromParam(schoolParam));

  // Keeps `school` following the URL for navigation the initial useState
  // seed can't see — browser back/forward between /login/drk and
  // /login/klh, or a link swapped without a full remount. Deliberately NOT
  // depended on `school` itself, so the local setSchool(null) from "Change
  // school" (which also navigates to bare /login) isn't immediately
  // overwritten by a stale schoolParam from the render before that
  // navigation commits.
  useEffect(() => {
    setSchool(schoolFromParam(schoolParam));
  }, [schoolParam]);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ identifier?: string; password?: string }>({});
  /** Set once /auth/login/google/klh/start returns — swaps the KLH card to
   *  KlhGoogleSetupForm until the student finishes phase 2. */
  const [klhGoogleSetup, setKlhGoogleSetup] = useState<KlhGoogleSetup | null>(null);
  /** DRK is Google-only by default (see the tooltip); this reveals the
   *  password form underneath an explicit "Admin login" toggle instead, for
   *  the staff accounts that were never migrated to Google sign-in. */
  const [showDrkAdminLogin, setShowDrkAdminLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // A pure read. Clearing here would make the notice vanish in development,
  // where StrictMode double-invokes the initializer and commits the SECOND
  // result — by which point the first invocation has already consumed the flag.
  // login() and logout() own clearing it.
  const sessionExpired = sessionStorage.getItem(SESSION_EXPIRED_KEY) === "1";

  /* Caps Lock is read off the event's modifier state rather than tracked, so it
     is correct even when the key was toggled while the page was unfocused. */
  function readCapsLock(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!school) return;

    // Validated here rather than by the native `required` bubble: that bubble is
    // unstyled, uncontrollable, and disappears on the next keystroke, so it
    // cannot be announced or re-read.
    const next: { identifier?: string; password?: string } = {};
    if (!identifier.trim()) next.identifier = "Enter your email or roll number";
    if (!password) next.password = "Enter your password";
    setFieldErrors(next);
    if (next.identifier || next.password) {
      (next.identifier ? identifierRef : passwordRef).current?.focus();
      return;
    }

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

  async function handleGoogleCredential(idToken: string) {
    setError(null);
    setLoading(true);
    try {
      const session = await loginWithGoogle(idToken);
      navigate(landingPathFor(session.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleKlhGoogleCredential(idToken: string) {
    setError(null);
    setLoading(true);
    try {
      const setup = await apiClient.post<KlhGoogleSetup>("/auth/login/google/klh/start", { idToken });
      setKlhGoogleSetup(setup);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleKlhGoogleSetupComplete(username: string, klhPassword: string) {
    if (!klhGoogleSetup) return;
    const session = await completeGoogleKlhLogin(klhGoogleSetup.setupToken, username, klhPassword);
    navigate(landingPathFor(session.role), { replace: true });
  }

  if (!school) {
    return (
      <LoginShell>
        <SchoolSelect
          onSelect={(picked) => {
            setSchool(picked);
            // Keeps the URL in sync with the choice, same shape as the
            // QR-targetable /login/drk and /login/klh entry points — so
            // sharing or reloading the link lands back on this same card.
            navigate(`/login/${picked.toLowerCase()}`, { replace: true });
          }}
        />
      </LoginShell>
    );
  }

  const demoAccounts = SHOW_DEMO_LOGINS && school === "KLH" ? KLH_DEMO_ACCOUNTS : [];

  return (
    <LoginShell>
      <div className="w-full bg-surface rounded-2xl flat-shadow p-8 space-y-8 rise-in">
        <div className="flex flex-col items-center gap-2">
          {/* Stepped down from h-20: the Raja's mark above the card is now the
              primary brand cue, so the institution logo reads as secondary —
              and two full-size logos stacked overflowed a 667px phone. */}
          <Logo school={school} className="w-auto" style={{ height: "clamp(3rem, 8vh, 4rem)" }} />
          <h2 className="text-xl font-semibold text-gray-800">Welcome Back</h2>
          <p className="text-sm text-gray-500 text-center">Sign in to your {SCHOOL_LABEL[school]} canteen account</p>
          {/* Red at rest, not just on hover, so the way back out of the wrong
              school is visible rather than discovered. brand-600 and not
              danger-*: this is navigation, not a destructive action, and
              index.css reserves the danger ramp for the latter so the two read
              apart when adjacent. */}
          <button
            type="button"
            onClick={() => {
              setSchool(null);
              setIdentifier("");
              setPassword("");
              setError(null);
              setFieldErrors({});
              setShowPassword(false);
              setCapsLock(false);
              setKlhGoogleSetup(null);
              setShowDrkAdminLogin(false);
              // Landed via /login/drk or /login/klh — walk the URL back to the
              // bare picker too, so a refresh or share of the link doesn't
              // re-skip the choice this button just backed out of.
              if (schoolParam) navigate("/login", { replace: true });
            }}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:rounded"
          >
            Not {SCHOOL_LABEL[school]}? Change school
          </button>
        </div>

        {sessionExpired && !error && (
          <div className="bg-warning-50 text-warning-700 p-3 rounded-lg text-sm flex items-start gap-2" role="status">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Your session expired. Please log in again.</span>
          </div>
        )}

        {school === "KLH" && klhGoogleSetup ? (
          <KlhGoogleSetupForm
            setup={klhGoogleSetup}
            onComplete={handleKlhGoogleSetupComplete}
            onCancel={() => setKlhGoogleSetup(null)}
          />
        ) : school === "DRK" ? (
          // DRK is Google-only for students and by default for staff too —
          // the password form only appears once "Admin login" is clicked.
          // See googleAuthService.ts's loginWithGoogle: it auto-creates a
          // STUDENT row on first sign-in, and DRK admin/superadmin accounts
          // are provisioned directly against googleId or a password, same as
          // any other DRK account.
          <div className="space-y-5">
            <div className="bg-brand-50 text-brand-800 p-3 rounded-lg text-xs flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Students and staff use Google login only.</span>
            </div>

            {!showDrkAdminLogin && error && (
              <div role="alert" className="bg-danger-50 text-danger-700 p-3 rounded-lg text-sm flex items-start gap-2">
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <GoogleSignInButton
              key={school}
              clientId={GOOGLE_CLIENT_ID.DRK}
              onCredential={handleGoogleCredential}
              onError={setError}
            />

            {showDrkAdminLogin ? (
              <PasswordLoginForm
                identifier={identifier}
                setIdentifier={setIdentifier}
                password={password}
                setPassword={setPassword}
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                capsLock={capsLock}
                onCapsLockKey={readCapsLock}
                onBlurPassword={() => setCapsLock(false)}
                fieldErrors={fieldErrors}
                setFieldErrors={setFieldErrors}
                error={error}
                loading={loading}
                identifierRef={identifierRef}
                passwordRef={passwordRef}
                onSubmit={handleSubmit}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowDrkAdminLogin(true)}
                className="w-full text-center text-xs text-gray-500 hover:text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:rounded"
              >
                Admin login
              </button>
            )}
          </div>
        ) : (
        <>
        <div className="bg-brand-50 text-brand-800 p-3 rounded-lg text-xs flex items-start gap-2">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>First-time login? Use "Sign in with Google" below with your klh.edu.in account.</span>
        </div>

        <PasswordLoginForm
          identifier={identifier}
          setIdentifier={setIdentifier}
          password={password}
          setPassword={setPassword}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          capsLock={capsLock}
          onCapsLockKey={readCapsLock}
          onBlurPassword={() => setCapsLock(false)}
          fieldErrors={fieldErrors}
          setFieldErrors={setFieldErrors}
          error={error}
          loading={loading}
          identifierRef={identifierRef}
          passwordRef={passwordRef}
          onSubmit={handleSubmit}
        />

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 text-xs text-gray-400 uppercase font-semibold tracking-wider">
            <span className="flex-1 border-t border-border" />
            or
            <span className="flex-1 border-t border-border" />
          </div>
          <GoogleSignInButton
            key={school}
            clientId={GOOGLE_CLIENT_ID.KLH}
            onCredential={handleKlhGoogleCredential}
            onError={setError}
          />
        </div>

        {SHOW_DEMO_LOGINS && (
          <div className="pt-6 border-t border-border flex flex-col gap-3">
            <p className="text-xs text-center text-gray-400 uppercase font-semibold tracking-wider">Quick Fill (Demo)</p>
            {demoAccounts.length > 0 ? (
              demoAccounts.map((account) => (
                <Button
                  key={account.identifier}
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    setIdentifier(account.identifier);
                    setPassword(account.password);
                    setFieldErrors({});
                  }}
                >
                  {account.label}
                </Button>
              ))
            ) : (
              <p className="min-h-[6.25rem] flex items-center justify-center text-center text-xs text-gray-500">
                No demo accounts are seeded for {SCHOOL_LABEL[school]} yet.
              </p>
            )}
          </div>
        )}
        </>
        )}
      </div>
    </LoginShell>
  );
}
