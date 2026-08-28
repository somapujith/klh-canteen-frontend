import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { StockAlertProvider, useStockAlerts } from "./StockAlertContext";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <StockAlertProvider>{children}</StockAlertProvider>
);

function alert(menuItemId: string, menuItemName: string, count = 1) {
  return { menuItemId, menuItemName, count, requestedAt: "2026-08-29T00:00:00.000Z" };
}

describe("StockAlertContext", () => {
  it("stacks alerts for different items with the newest on top", () => {
    const { result } = renderHook(() => useStockAlerts(), { wrapper });

    act(() => result.current.pushAlert(alert("1", "Samosa")));
    act(() => result.current.pushAlert(alert("2", "Vada Pav")));
    act(() => result.current.pushAlert(alert("3", "Tea")));

    expect(result.current.alerts.map((a) => a.menuItemName)).toEqual(["Tea", "Vada Pav", "Samosa"]);
  });

  // The behaviour that separates this from ToastContext, whose MAX_VISIBLE
  // drops the oldest: a busy lunch hour must not silently discard requests.
  it("keeps every alert however many arrive", () => {
    const { result } = renderHook(() => useStockAlerts(), { wrapper });

    act(() => {
      for (let i = 0; i < 12; i++) result.current.pushAlert(alert(String(i), `Item ${i}`));
    });

    expect(result.current.alerts).toHaveLength(12);
  });

  it("updates the count in place rather than stacking a duplicate for one item", () => {
    const { result } = renderHook(() => useStockAlerts(), { wrapper });

    act(() => result.current.pushAlert(alert("1", "Samosa", 1)));
    act(() => result.current.pushAlert(alert("1", "Samosa", 2)));

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].count).toBe(2);
  });

  it("removes only the alert that was dismissed", () => {
    const { result } = renderHook(() => useStockAlerts(), { wrapper });

    act(() => result.current.pushAlert(alert("1", "Samosa")));
    act(() => result.current.pushAlert(alert("2", "Vada Pav")));
    const target = result.current.alerts.find((a) => a.menuItemName === "Samosa")!;

    act(() => result.current.dismissAlert(target.id));

    expect(result.current.alerts.map((a) => a.menuItemName)).toEqual(["Vada Pav"]);
  });

  it("clears an item's alert once it has been acted on", () => {
    const { result } = renderHook(() => useStockAlerts(), { wrapper });

    act(() => result.current.pushAlert(alert("1", "Samosa")));
    act(() => result.current.pushAlert(alert("2", "Vada Pav")));

    act(() => result.current.dismissAlertForItem("1"));

    expect(result.current.alerts.map((a) => a.menuItemName)).toEqual(["Vada Pav"]);
  });

  it("dismisses everything at once", () => {
    const { result } = renderHook(() => useStockAlerts(), { wrapper });

    act(() => result.current.pushAlert(alert("1", "Samosa")));
    act(() => result.current.pushAlert(alert("2", "Vada Pav")));

    act(() => result.current.dismissAll());

    expect(result.current.alerts).toEqual([]);
  });
});
