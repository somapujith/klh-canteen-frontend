import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./ToastContext";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Exposes showToast to the test as plain buttons, one per message. */
function Harness({ messages }: { messages: string[] }) {
  const { showToast } = useToast();
  return (
    <>
      {messages.map((m) => (
        <button key={m} type="button" onClick={() => showToast(m, "info")}>
          fire {m}
        </button>
      ))}
    </>
  );
}

function setup(messages: string[]) {
  render(
    <ToastProvider>
      <Harness messages={messages} />
    </ToastProvider>
  );
  return (m: string) => fireEvent.click(screen.getByRole("button", { name: `fire ${m}` }));
}

/** `act` so the state update from the timer callback is flushed. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

it("auto-dismisses a toast after its 3s life", () => {
  const fire = setup(["a"]);
  fire("a");
  expect(screen.getByText("a")).toBeInTheDocument();

  advance(2999);
  expect(screen.getByText("a")).toBeInTheDocument();

  advance(1);
  expect(screen.queryByText("a")).not.toBeInTheDocument();
});

it("dismisses on demand from the toast's own button", () => {
  const fire = setup(["a"]);
  fire("a");

  fireEvent.click(screen.getByRole("button", { name: /dismiss notification/i }));
  expect(screen.queryByText("a")).not.toBeInTheDocument();
});

it("holds the countdown while hovered and resumes with the time already served", () => {
  const fire = setup(["a"]);
  fire("a");

  advance(2000);
  const toast = screen.getByText("a").closest("div") as HTMLElement;
  fireEvent.mouseEnter(toast);

  // Paused: well past the full duration and it is still up.
  advance(10000);
  expect(screen.getByText("a")).toBeInTheDocument();

  fireEvent.mouseLeave(toast);
  // Only the 1s remainder is owed, not a fresh 3s — this is what separates a
  // real remaining-time resume from a naive restart.
  advance(999);
  expect(screen.getByText("a")).toBeInTheDocument();
  advance(1);
  expect(screen.queryByText("a")).not.toBeInTheDocument();
});

it("does not let repeated brief hovers extend a toast indefinitely", () => {
  const fire = setup(["a"]);
  fire("a");

  for (let i = 0; i < 3; i++) {
    advance(900);
    const toast = screen.getByText("a").closest("div") as HTMLElement;
    fireEvent.mouseEnter(toast);
    fireEvent.mouseLeave(toast);
  }

  // 2700ms served across the three stretches; 300ms left.
  advance(299);
  expect(screen.getByText("a")).toBeInTheDocument();
  advance(1);
  expect(screen.queryByText("a")).not.toBeInTheDocument();
});

it("pauses on focus too, so a keyboard user is not raced", () => {
  const fire = setup(["a"]);
  fire("a");

  fireEvent.focus(screen.getByRole("button", { name: /dismiss notification/i }));
  advance(10000);
  expect(screen.getByText("a")).toBeInTheDocument();
});

it("caps the stack at 3, dropping the oldest", () => {
  const fire = setup(["a", "b", "c", "d"]);
  fire("a");
  fire("b");
  fire("c");
  fire("d");

  expect(screen.queryByText("a")).not.toBeInTheDocument();
  expect(screen.getByText("b")).toBeInTheDocument();
  expect(screen.getByText("c")).toBeInTheDocument();
  expect(screen.getByText("d")).toBeInTheDocument();
});

it("gives simultaneous toasts distinct ids, so dismissing one keeps the other", () => {
  const fire = setup(["a", "b"]);
  fire("a");
  fire("b");

  const dismissers = screen.getAllByRole("button", { name: /dismiss notification/i });
  expect(dismissers).toHaveLength(2);
  fireEvent.click(dismissers[0]);

  expect(screen.queryByText("a")).not.toBeInTheDocument();
  expect(screen.getByText("b")).toBeInTheDocument();
});

it("keeps the container lifted above the CartBar's bottom edge", () => {
  const fire = setup(["a"]);
  fire("a");

  const region = screen.getByRole("status");
  expect(region.className).toContain("bottom-[calc(6.5rem+env(safe-area-inset-bottom))]");
  expect(region.className).toContain("z-60");
});
