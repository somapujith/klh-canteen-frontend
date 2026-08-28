import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

/**
 * Persistent admin alerts for incoming stock requests.
 *
 * Deliberately NOT ToastContext. Toasts auto-dismiss after 3s and cap at three
 * visible, dropping the oldest — both wrong here. A student asking for a
 * sold-out item is a task the admin has to act on, so an alert stays until it
 * is closed by hand, and a busy lunch hour must not silently discard the
 * earlier requests to make room for the newest.
 *
 * Newest alerts sit on top of the stack, so the most recent request is the one
 * under the admin's eye while older ones remain visible below.
 */
export interface StockAlert {
  id: number;
  menuItemId: string;
  menuItemName: string;
  /** Outstanding requests for this item at the moment the alert fired. */
  count: number;
  requestedAt: string;
}

interface StockAlertContextValue {
  alerts: StockAlert[];
  pushAlert: (alert: Omit<StockAlert, "id">) => void;
  dismissAlert: (id: number) => void;
  /** Clears an item's alert once the admin has acted on it (notified the
   *  students waiting), so a handled request does not sit there needing a
   *  second, redundant dismissal. */
  dismissAlertForItem: (menuItemId: string) => void;
  dismissAll: () => void;
}

const StockAlertContext = createContext<StockAlertContextValue | undefined>(undefined);

/** Monotonic and module-scoped, matching ToastContext — ids must never collide,
    or dismissing one alert would dismiss another. */
let nextAlertId = 0;

export function StockAlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);

  const pushAlert = useCallback((alert: Omit<StockAlert, "id">) => {
    setAlerts((prev) => {
      // One alert per item. A second student asking for the same thing updates
      // the count in place rather than stacking a near-identical card the admin
      // has to dismiss twice — the item is one task however many people want it.
      const existing = prev.find((a) => a.menuItemId === alert.menuItemId);
      if (existing) {
        return prev.map((a) =>
          a.menuItemId === alert.menuItemId
            ? { ...a, count: alert.count, requestedAt: alert.requestedAt }
            : a
        );
      }
      return [{ ...alert, id: nextAlertId++ }, ...prev];
    });
  }, []);

  const dismissAlert = useCallback((id: number) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const dismissAlertForItem = useCallback((menuItemId: string) => {
    setAlerts((prev) => prev.filter((a) => a.menuItemId !== menuItemId));
  }, []);

  const dismissAll = useCallback(() => setAlerts([]), []);

  return (
    <StockAlertContext.Provider
      value={{ alerts, pushAlert, dismissAlert, dismissAlertForItem, dismissAll }}
    >
      {children}
    </StockAlertContext.Provider>
  );
}

export function useStockAlerts() {
  const ctx = useContext(StockAlertContext);
  if (!ctx) throw new Error("useStockAlerts must be used within StockAlertProvider");
  return ctx;
}
