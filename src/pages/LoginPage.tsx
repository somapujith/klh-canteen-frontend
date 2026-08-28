import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, SESSION_EXPIRED_KEY } from "../context/AuthContext";
import type { School } from "../context/AuthContext";
import { Logo, BrandMark } from "../components/Logo";
import { Button } from "../components/ui";
import { landingPathFor } from "../lib/landing";

const SCHOOL_LABEL: Record<School, string> = { KLH: "KLH University", DRK: "DRK Institution" };

/* Demo quick-fill is a development affordance, not a product feature, so it is
   gated rather than shipped. It used to render for KLH only, which gave DRK
   users a visibly shorter card for no reason they could see — now the panel is
   either on for the build or off for the build, and the DRK card reserves the
   same height (see DEMO_ACCOUNTS) so the two steps measure the same.

   Only KLH accounts are listed because only KLH accounts are seeded: every
   script in Canteen-Backend/scripts (seedStudent, seedAdmin) inserts
   *@klh.edu.in users, and the DRK enum value has no fixture behind it. No
   credentials are invented here. */
const SHOW_DEMO_LOGINS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGINS === "true";

/** Matches Canteen-Backend/scripts/seedStudent.ts and seedAdmin.ts defaults. */
const DEMO_ACCOUNTS: Record<School, { label: string; identifier: string; password: string }[]> = {
  KLH: [
    { label: "Student account", identifier: "student@klh.edu.in", password: "student123" },
    { label: "Admin account", identifier: "admin@klh.edu.in", password: "changeme123" },
  ],
  DRK: [],
};

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
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ identifier?: string; password?: string }>({});
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

  if (!school) {
    return (
      <LoginShell>
        <SchoolSelect onSelect={setSchool} />
      </LoginShell>
    );
  }

  const demoAccounts = SHOW_DEMO_LOGINS ? DEMO_ACCOUNTS[school] : [];

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
              setFieldErrors({});
              setShowPassword(false);
              setCapsLock(false);
            }}
            className="text-xs text-gray-500 hover:text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:rounded"
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

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
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
                onKeyUp={readCapsLock}
                onKeyDown={readCapsLock}
                onBlur={() => setCapsLock(false)}
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
              /* DRK has no seeded accounts to offer. The panel still renders,
                 with the reason stated, so the two schools' cards stay the same
                 height instead of DRK silently getting a shorter card. Reserved
                 height = 2 x md Button (44px) + the 12px gap between them. */
              <p className="min-h-[6.25rem] flex items-center justify-center text-center text-xs text-gray-500">
                No demo accounts are seeded for {SCHOOL_LABEL[school]} yet.
              </p>
            )}
          </div>
        )}
      </div>
    </LoginShell>
  );
}
