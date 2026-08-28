import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Swaps the label for a spinner and disables the button. Width is preserved. */
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-md shadow-brand-500/20 focus:ring-brand-500/50",
  secondary: "bg-surface text-gray-700 border border-gray-200 hover:bg-gray-50 focus:ring-brand-500/30",
  ghost: "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-brand-500/30",
  // Not brand-*: the brand red is the primary-action colour, so a destructive
  // button drawn in it would be indistinguishable from the main CTA next to it.
  danger: "bg-danger-600 text-white hover:bg-danger-700 shadow-md shadow-danger-600/20 focus:ring-danger-600/40",
};

/* `min-h-11` (44px) on every size, including `sm`. The chip can look small —
   it must not be small to hit. sm/md differ in padding and type scale only. */
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 py-1.5 text-xs",
  md: "min-h-11 px-5 py-2.5 text-sm",
  lg: "min-h-12 px-6 py-3 text-base",
};

/** Gap between an icon and the label, kept off SIZES so the inner span can reuse it. */
const GAPS: Record<ButtonSize, string> = {
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-2",
};

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/**
 * The app's button. Variants exist so a call site names its *intent* rather
 * than restating the brand's hex values, which is how four screens ended up
 * with four slightly different "primary" buttons.
 *
 * Loading keeps the button's width stable: the label stays in the DOM at
 * `invisible` and the spinner is absolutely positioned over it. Swapping the
 * text for a spinner instead would make a "Place order" button collapse to a
 * 40px square mid-submit, which moves everything laid out beside it.
 *
 * `disabled` is forced while loading — a submit button that still fires on a
 * second click is the classic double-order bug.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, fullWidth = false, className = "", children, disabled, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`relative inline-flex items-center justify-center rounded-xl font-semibold transition active:scale-95 focus:outline-none focus:ring-2 disabled:opacity-60 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
      {/* Still laid out, just not painted — this is what holds the width. */}
      <span className={`inline-flex items-center ${GAPS[size]} ${loading ? "invisible" : ""}`}>
        {children}
      </span>
    </button>
  );
});
