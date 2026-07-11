export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 fade-in">
      <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-brand-500 animate-spin"></div>
      <p className="text-gray-500 font-medium">Loading...</p>
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
