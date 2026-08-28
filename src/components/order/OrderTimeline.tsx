import { ORDER_TIMELINE, statusPresentation } from "../../lib/orderStatus";

export interface OrderTimelineProps {
  /** Raw wire status. Anything off the timeline (CANCELLED, or a status this
   *  build has never seen) renders the terminal row instead of the rail. */
  status: string;
  className?: string;
}

/**
 * The four-step fulfilment rail: Placed -> Being made -> Ready to collect ->
 * Collected. Shared by the student token page and the guest status page so the
 * customer sees the same four words wherever they check.
 *
 * Deliberately secondary. On the token page the number is the single dominant
 * element and this sits below it, so the rail is drawn at hairline weight: 2px
 * track, 8px dots, 11px labels, one accent colour on the current step only.
 * Completed steps are grey rather than green — colouring three of four steps
 * would make the rail the loudest thing on a page whose whole point is a
 * 76px number.
 *
 * Off-timeline statuses (`step < 0` — CANCELLED, and the unknown-status
 * fallback from statusPresentation) are NOT drawn as a stalled rail sitting at
 * step 0. A rail with nothing lit reads as "still waiting", which is the
 * opposite of the truth for a cancelled order, so they get their own terminal
 * row instead.
 *
 * No JS animation: the fill is a single CSS width transition on the progress
 * track, which the SSE delta drives by simply changing `status`.
 */
export function OrderTimeline({ status, className = "" }: OrderTimelineProps) {
  const { step, label, tone } = statusPresentation(status);

  if (step < 0) {
    const terminalClass =
      tone === "cancelled"
        ? "border-danger-100 bg-danger-50 text-danger-700"
        : "border-border bg-surface-muted text-gray-600";
    return (
      <div
        className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 ${terminalClass} ${className}`}
      >
        <svg
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M9 9l6 6M15 9l-6 6" />
        </svg>
        <span className="text-sm font-semibold">{label}</span>
      </div>
    );
  }

  const lastIndex = ORDER_TIMELINE.length - 1;
  // Percentage of the rail between the first and last dot centres, so the fill
  // stops exactly under the current dot rather than overshooting the row.
  const fillPercent = (step / lastIndex) * 100;

  return (
    <div className={className}>
      <ol className="relative flex items-start justify-between" aria-label="Order progress">
        {/* Track + fill. The steps are equal-width flex children, so each dot
            sits at the centre of its own 1/n column; insetting the track by
            half a column on each side makes it run first-dot-centre to
            last-dot-centre instead of edge to edge. Derived from the timeline
            length rather than hardcoded to 4, so adding a status to
            ORDER_TIMELINE does not silently misalign the rail. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[3px]"
          style={{ paddingInline: `${50 / ORDER_TIMELINE.length}%` }}
        >
          <div className="h-0.5 w-full rounded-full bg-border">
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${fillPercent}%` }}
            />
          </div>
        </div>

        {ORDER_TIMELINE.map((timelineStatus, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <li
              key={timelineStatus}
              aria-current={current ? "step" : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
            >
              {/* Dots draw over the track rather than punching a hole in it, so
                  the component never needs to know the caller's background
                  colour — it drops onto bg-surface, bg-surface-hover or a tinted
                  card unchanged. The current step is marked with a halo in a
                  brand tint (translucent, so it works on any of them) rather
                  than a surface-coloured ring. */}
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                  done || current ? "bg-brand-600" : "bg-border"
                } ${current ? "ring-4 ring-brand-600/20" : ""}`}
              />
              <span
                className={`text-[11px] leading-tight ${
                  current ? "font-semibold text-gray-900" : "font-medium text-gray-500"
                }`}
              >
                {statusPresentation(timelineStatus).label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
