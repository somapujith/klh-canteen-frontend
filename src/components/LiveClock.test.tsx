import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { LiveClock } from "./LiveClock";

/**
 * The clock's entire job is to keep moving — a frozen one is indistinguishable
 * from the screenshot it exists to expose, and it would fail silently.
 */
describe("LiveClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T10:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function shown() {
    // The time sits in its own tabular-nums span, beside the pulsing dot.
    return screen.getByText(/\d{1,2}:\d{2}:\d{2}/).textContent ?? "";
  }

  it("renders the current time down to the second", () => {
    render(<LiveClock />);
    expect(shown()).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it("advances as time passes", () => {
    render(<LiveClock />);
    const before = shown();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(shown()).not.toBe(before);
  });

  it("keeps ticking across many seconds rather than stopping after the first", () => {
    render(<LiveClock />);

    const samples = new Set<string>();
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      samples.add(shown());
    }

    // Five distinct readings — a clock that fired once and stopped rescheduling
    // (the failure mode of a setTimeout chain that forgets to re-arm) would
    // collapse to one.
    expect(samples.size).toBe(5);
  });

  it("stops its timer on unmount", () => {
    const { unmount } = render(<LiveClock />);
    unmount();

    // Nothing should still be scheduled; a leaked timer would set state on an
    // unmounted tree.
    expect(vi.getTimerCount()).toBe(0);
  });
});
