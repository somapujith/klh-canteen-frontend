import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderTimeline } from "./OrderTimeline";
import { ORDER_TIMELINE, statusPresentation } from "../../lib/orderStatus";

/**
 * Shared by the student token page and the guest status page, so the four words
 * a customer sees must not depend on which screen they happen to be on. These
 * tests read the expected labels out of lib/orderStatus rather than restating
 * them, so a relabelling there flows through instead of being asserted twice.
 */

it("renders every happy-path step, in order", () => {
  render(<OrderTimeline status="PENDING" />);

  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(ORDER_TIMELINE.length);
  expect(items.map((li) => li.textContent)).toEqual(
    ORDER_TIMELINE.map((s) => statusPresentation(s).label),
  );
});

it("marks the current status as the current step, and only it", () => {
  render(<OrderTimeline status="PREPARING" />);

  const current = screen.getAllByRole("listitem").filter((li) => li.getAttribute("aria-current"));
  expect(current).toHaveLength(1);
  expect(current[0].textContent).toBe(statusPresentation("PREPARING").label);
});

/**
 * The progress fill is what a glancing user actually reads, so it must track
 * the step index rather than sitting at a constant. PENDING is the first of
 * four dots — the fill runs dot-centre to dot-centre, so it is 0%, not 25%.
 */
it("advances the progress fill as the status moves down the timeline", () => {
  const widthFor = (status: string) => {
    const { container, unmount } = render(<OrderTimeline status={status} />);
    const fill = container.querySelector<HTMLElement>(".bg-brand-600.rounded-full");
    const width = fill?.style.width ?? "";
    unmount();
    return width;
  };

  expect(widthFor("PENDING")).toBe("0%");
  expect(widthFor("PREPARING")).toBe(`${(1 / 3) * 100}%`);
  expect(widthFor("COOKED")).toBe(`${(2 / 3) * 100}%`);
  expect(widthFor("DELIVERED")).toBe("100%");
});

/**
 * A cancelled order drawn as a rail with nothing lit reads as "still waiting",
 * which is the opposite of the truth. It gets a terminal row instead — the
 * whole point of CANCELLED being step -1 rather than step 0.
 */
it("renders CANCELLED as a terminal state, not as a stalled timeline", () => {
  render(<OrderTimeline status="CANCELLED" />);

  expect(screen.getByText(statusPresentation("CANCELLED").label)).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  // None of the happy-path steps should be on screen.
  expect(screen.queryByText(statusPresentation("PENDING").label)).not.toBeInTheDocument();
});

/**
 * A status shipped by a newer backend must not crash the rail or be guessed at
 * a position on it. statusPresentation falls back to step -1, so it takes the
 * same off-timeline path as CANCELLED and shows the raw value honestly.
 */
it("does not place an unknown future status somewhere on the timeline", () => {
  render(<OrderTimeline status="REFUNDED" />);

  expect(screen.getByText("REFUNDED")).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});
