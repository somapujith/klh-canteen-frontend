import { Link } from "react-router-dom";
import { Logo } from "./Logo";

/**
 * Header for the unauthenticated counter flow. Deliberately has no account menu —
 * a walk-up guest has no account to manage.
 */
export function GuestNav({ title, backTo }: { title: string; backTo?: string }) {
  return (
    <div className="nav-shell">
      <nav className="w-full flex items-center justify-between nav-notch shadow-sm px-4 sm:px-6 py-3">
      <div className="flex items-center gap-3 min-w-0">
        {backTo && (
          <Link
            to={backTo}
            aria-label="Back"
            className="shrink-0 -ml-1 p-1.5 rounded-full text-gray-500 hover:bg-surface-muted hover:text-gray-900 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
        <Logo className="h-8 sm:h-9 shrink-0" />
        <span className="font-semibold text-gray-800 tracking-tight truncate">{title}</span>
      </div>

      <span className="shrink-0 rounded-full bg-brand-50 text-brand-700 px-3 py-1 text-xs font-bold uppercase tracking-wide">
        Counter
        </span>
      </nav>
    </div>
  );
}
