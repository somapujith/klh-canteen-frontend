import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Tooltip } from "./Tooltip";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("Tooltip", () => {
  it("stays hidden until the pointer has rested, so sweeping a row flashes nothing", () => {
    render(
      <Tooltip label="Inventory">
        <button>icon</button>
      </Tooltip>
    );

    fireEvent.pointerEnter(screen.getByText("icon").parentElement!);
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();

    advance(200);
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Inventory");
  });

  it("hides again when the pointer leaves", () => {
    render(
      <Tooltip label="Inventory">
        <button>icon</button>
      </Tooltip>
    );
    const trigger = screen.getByText("icon").parentElement!;

    fireEvent.pointerEnter(trigger);
    advance(200);
    expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();

    fireEvent.pointerLeave(trigger);
    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
  });

  it("shows immediately on keyboard focus, with no delay to wait out", () => {
    render(
      <Tooltip label="Audit Log">
        <button>icon</button>
      </Tooltip>
    );

    fireEvent.focus(screen.getByText("icon"));

    // No timer advance: a keyboard user has already committed to the control.
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent("Audit Log");
  });

  it("dismisses on Escape while keeping focus where it is", () => {
    render(
      <Tooltip label="Users">
        <button>icon</button>
      </Tooltip>
    );
    fireEvent.focus(screen.getByText("icon"));
    expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("tooltip", { hidden: true })).not.toBeInTheDocument();
  });

  it("is hidden from assistive tech, because the trigger already carries the name", () => {
    render(
      <Tooltip label="Payments">
        <button aria-label="Payments">icon</button>
      </Tooltip>
    );
    fireEvent.focus(screen.getByText("icon"));

    // Present visually...
    expect(screen.getByRole("tooltip", { hidden: true })).toBeInTheDocument();
    // ...and absent from the accessibility tree, so the name is not read twice.
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("escapes the scrolling tab strip by rendering into document.body", () => {
    const { container } = render(
      <div style={{ overflowX: "auto" }}>
        <Tooltip label="Dashboard">
          <button>icon</button>
        </Tooltip>
      </div>
    );

    fireEvent.focus(screen.getByText("icon"));

    // A bubble inside the clipping container would be cut off at its edge.
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
    expect(document.body.querySelector('[role="tooltip"]')).not.toBeNull();
  });

  it("does not leave a pending timer behind when unmounted mid-hover", () => {
    const { unmount } = render(
      <Tooltip label="Logs">
        <button>icon</button>
      </Tooltip>
    );

    fireEvent.pointerEnter(screen.getByText("icon").parentElement!);
    unmount();

    expect(() => advance(500)).not.toThrow();
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
  });
});
