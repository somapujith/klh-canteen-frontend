import { useState } from "react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CartBar } from "./CartBar";
import type { CartBarLine } from "./CartBar";

/**
 * jsdom ships no matchMedia, and CartBar reads it on first render to decide whether
 * the sheet covers the page. Every test therefore declares the viewport it means.
 */
function setViewport(compact: boolean) {
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: compact,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => void listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => void listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const samosa: CartBarLine = { menuItemId: "m1", name: "Samosa", price: 20, qty: 2, stockQty: 5 };
const chai: CartBarLine = { menuItemId: "m2", name: "Masala Chai", price: 15, qty: 2, stockQty: 2 };

function renderCart(overrides: Partial<ComponentProps<typeof CartBar>> = {}) {
  const props = {
    lines: [samosa, chai],
    total: 70,
    onCheckout: vi.fn(),
    onUpdateQty: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  const view = render(<CartBar {...props} />);
  return { ...view, ...props };
}

/** The toggle is the only control that survives every state, so tests anchor on it. */
function toggle() {
  return screen.getByRole("button", { name: /^Your order,/ });
}

function expand() {
  fireEvent.click(toggle());
}

/**
 * The phone scrim is decorative (aria-hidden), so it has no role or name to query.
 * It is still the only aria-hidden top-level child, and clicking it must close the
 * sheet — the tests below assert that behaviour, not its styling.
 */
function scrim(container: HTMLElement) {
  return container.querySelector(':scope > [aria-hidden="true"]');
}

beforeEach(() => setViewport(false));
afterEach(() => vi.unstubAllGlobals());

describe("empty cart", () => {
  it("renders nothing when there are no lines", () => {
    const { container } = renderCart({ lines: [], total: 0 });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("summary", () => {
  it("sums quantities across lines rather than counting lines", () => {
    renderCart();

    expect(screen.getByRole("button", { name: "Your order, 4 items, ₹70.00" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("4 items in cart, total ₹70.00");
    expect(screen.queryByRole("button", { name: /Your order, 2 items/ })).not.toBeInTheDocument();
  });

  it("switches to the singular at a single item", () => {
    renderCart({ lines: [{ ...samosa, qty: 1 }], total: 20 });

    expect(screen.getByRole("button", { name: "Your order, 1 item, ₹20.00" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 item in cart, total ₹20.00");
  });
});

describe("disclosure", () => {
  it("reveals the line list on toggle and hides it again", () => {
    renderCart();

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();

    expand();

    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Increase Samosa" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Increase Samosa" })).not.toBeInTheDocument();
  });

  /**
   * The sheet covers the menu on phones, so leaving it is a navigation move.
   * One way out, not two: the old right-aligned "Hide" link was replaced
   * rather than joined, so a second control cannot drift out of step with it.
   */
  it("offers exactly one way out of the sheet, and it returns focus to the toggle", () => {
    renderCart();
    expand();

    expect(screen.queryByRole("button", { name: "Hide" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveFocus();
  });
});

describe("increase", () => {
  it("asks for one more of that line", () => {
    const { onUpdateQty } = renderCart();
    expand();

    fireEvent.click(screen.getByRole("button", { name: "Increase Samosa" }));

    expect(onUpdateQty).toHaveBeenCalledWith("m1", 3);
  });

  it("is disabled exactly at the stock ceiling", () => {
    renderCart({
      lines: [
        { menuItemId: "m1", name: "Samosa", price: 20, qty: 4, stockQty: 5 },
        { menuItemId: "m2", name: "Masala Chai", price: 15, qty: 5, stockQty: 5 },
      ],
      total: 155,
    });
    expand();

    expect(screen.getByRole("button", { name: "Increase Samosa" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Increase Masala Chai" })).toBeDisabled();
  });
});

describe("step down", () => {
  it("decrements while more than one is in the cart", () => {
    const { onUpdateQty, onRemove } = renderCart();
    expand();

    expect(screen.queryByRole("button", { name: "Remove Samosa" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Decrease Samosa" }));

    expect(onUpdateQty).toHaveBeenCalledWith("m1", 1);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("becomes a remove at the last unit — the destructive boundary", () => {
    const { onUpdateQty, onRemove } = renderCart({
      lines: [{ ...samosa, qty: 1 }, chai],
      total: 50,
    });
    expand();

    expect(screen.queryByRole("button", { name: "Decrease Samosa" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Samosa" }));

    expect(onRemove).toHaveBeenCalledWith("m1");
    expect(onUpdateQty).not.toHaveBeenCalled();
  });
});

describe("focus", () => {
  it("returns focus to the summary toggle when Escape closes the sheet", () => {
    renderCart();
    expand();

    const insideSheet = screen.getByRole("button", { name: "Increase Samosa" });
    insideSheet.focus();
    expect(insideSheet).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("hands focus to a surviving stepper when a line is removed", () => {
    // A real owner of the lines: the removed row must actually unmount for the
    // assertion to mean anything.
    function StatefulCart() {
      const [lines, setLines] = useState<CartBarLine[]>([
        { ...samosa, qty: 1 },
        { ...chai, qty: 1 },
      ]);
      return (
        <CartBar
          lines={lines}
          total={lines.reduce((sum, line) => sum + line.price * line.qty, 0)}
          onCheckout={() => {}}
          onUpdateQty={(id, qty) =>
            setLines((current) => current.map((l) => (l.menuItemId === id ? { ...l, qty } : l)))
          }
          onRemove={(id) => setLines((current) => current.filter((l) => l.menuItemId !== id))}
        />
      );
    }
    render(<StatefulCart />);
    expand();

    fireEvent.click(screen.getByRole("button", { name: "Remove Samosa" }));

    expect(screen.queryByRole("button", { name: "Remove Samosa" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Masala Chai" })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe("onExpandedChange", () => {
  it("reports the sheet as blocking on a phone, and renders the scrim", () => {
    setViewport(true);
    const onExpandedChange = vi.fn();
    const { container } = renderCart({ onExpandedChange });

    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
    expect(scrim(container)).toBeNull();

    expand();

    expect(onExpandedChange).toHaveBeenLastCalledWith(true);
    const overlay = scrim(container);
    expect(overlay).not.toBeNull();

    fireEvent.click(overlay as Element);

    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(scrim(container)).toBeNull();
  });

  it("never reports blocking on a wide viewport, and renders no scrim", () => {
    setViewport(false);
    const onExpandedChange = vi.fn();
    const { container } = renderCart({ onExpandedChange });

    expand();

    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(onExpandedChange).not.toHaveBeenCalledWith(true);
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
    expect(scrim(container)).toBeNull();
  });
});

describe("checkout", () => {
  it("fires from the checkout button", () => {
    const { onCheckout } = renderCart();

    fireEvent.click(screen.getByRole("button", { name: "Checkout" }));

    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it("uses checkoutLabel as the button's accessible name", () => {
    const { onCheckout } = renderCart({ checkoutLabel: "Pay at counter" });

    expect(screen.queryByRole("button", { name: "Checkout" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pay at counter" }));

    expect(onCheckout).toHaveBeenCalledTimes(1);
  });
});
