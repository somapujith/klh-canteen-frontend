import { useState, useEffect } from "react";

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    /* z-70 and top-anchored per the overlay stacking table in src/index.css:
       the CartBar owns z-50 and the bottom-right corner from `sm` up, and used
       to cover this banner outright. Connectivity loss has to stay visible. */
    <div
      role="alert"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-70 max-w-[calc(100%-2rem)] bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center space-x-3 rise-in"
    >
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div>
        <p className="font-bold text-sm">You are offline</p>
        <p className="text-xs text-red-100">Check your internet connection.</p>
      </div>
    </div>
  );
}
