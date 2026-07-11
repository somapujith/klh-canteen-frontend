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
    <div className="bg-white rounded-2xl p-6 flat-shadow w-full animate-pulse">
      <div className="h-4 bg-gray-200 rounded-md w-3/4 mb-4"></div>
      <div className="h-4 bg-gray-200 rounded-md w-1/2 mb-6"></div>
      <div className="h-10 bg-gray-200 rounded-xl w-full"></div>
    </div>
  );
}
