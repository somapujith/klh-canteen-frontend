/**
 * The Suspense fallback for every lazy route (src/App.tsx).
 *
 * It is deliberately a skeleton of the app's *shell* — sticky nav strip, page
 * heading, content block — rather than a centred spinner. A spinner here
 * repainted the whole viewport blank on every route change, so navigation read
 * as "the app restarted" instead of "the next page is arriving". The skeleton
 * keeps the nav bar and the content column roughly where the real ones land.
 *
 * Pure CSS: two `animate-pulse` boxes, no timers, no JS animation. It must stay
 * cheap, because it renders on the critical path of every first route paint.
 */
export function LoadingState() {
  return (
    <div className="min-h-screen bg-surface-muted" role="status" aria-label="Loading page">
      {/* Mirrors nav-shell/nav-notch geometry (max-w-5xl, ~1.75rem gutters) so
          the real navbar does not jump sideways when it swaps in. */}
      <div className="flex justify-center px-7">
        <div className="w-full max-w-5xl h-[58px] rounded-b-2xl bg-gray-200 animate-pulse" />
      </div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <SkeletonLine className="w-40 h-6" />
        <div className="h-64 rounded-2xl bg-gray-200 animate-pulse" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-surface rounded-2xl flat-shadow overflow-hidden flex flex-col w-full animate-pulse">
      <div className="h-32 bg-gray-200 w-full"></div>
      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
        <div className="flex justify-between mt-auto">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-3 bg-gray-200 rounded w-1/4 mt-1"></div>
        </div>
        <div className="h-9 bg-gray-200 rounded-xl w-full mt-2"></div>
      </div>
    </div>
  );
}

/**
 * One shimmering text line. `className` sets the width (and height, if the
 * default 1rem is wrong) — a skeleton whose lines are all the same length reads
 * as a loading *table*, not as loading prose, so callers are expected to vary it.
 */
export function SkeletonLine({ className = "w-full" }: { className?: string }) {
  return <div className={`h-4 bg-gray-200 rounded animate-pulse ${className}`} />;
}

/**
 * A list-row placeholder: title + subtitle on the left, a short value on the
 * right. Matches the shape of an order-history row so the real content lands
 * roughly where the skeleton was, rather than shunting the page on arrival.
 */
export function SkeletonRow() {
  return (
    <div className="bg-surface rounded-2xl flat-shadow p-4 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0 space-y-2">
        <SkeletonLine className="w-1/3" />
        <SkeletonLine className="w-2/3 h-3" />
      </div>
      <SkeletonLine className="w-16 h-6 shrink-0" />
    </div>
  );
}
