import { useStockAlerts } from "../../context/StockAlertContext";

/**
 * The admin's pile of incoming stock requests.
 *
 * Every card stays until its close button is clicked — no timers. The stack
 * grows downward from the top-right with the newest on top, and scrolls
 * internally once it outgrows the viewport so a long lunch rush cannot push
 * cards off-screen where they would never be dismissed.
 */
export function StockAlertStack() {
  const { alerts, dismissAlert, dismissAll } = useStockAlerts();

  if (alerts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Stock requests"
      className="fixed top-4 right-4 z-60 w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] flex flex-col gap-2 overflow-y-auto"
    >
      {alerts.length > 1 && (
        <button
          type="button"
          onClick={dismissAll}
          className="self-end text-xs font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2 px-1"
        >
          Dismiss all ({alerts.length})
        </button>
      )}

      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="rise-in flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-lg"
        >
          <svg
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">{alert.menuItemName}</p>
            <p className="text-sm text-amber-800">
              {alert.count === 1 ? "1 student is" : `${alert.count} students are`} waiting for this
            </p>
          </div>

          <button
            type="button"
            onClick={() => dismissAlert(alert.id)}
            aria-label={`Dismiss request for ${alert.menuItemName}`}
            className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-amber-700 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
