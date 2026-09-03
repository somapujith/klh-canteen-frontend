import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SearchInput } from "./SearchInput";

/**
 * jsdom has no matchMedia and SearchInput reads it to decide whether a clear
 * dissolves or just blanks, so every test declares the motion preference it
 * means. jsdom also has no rAF-driven layout, so what is asserted here is the
 * state machine — value, classes, mirrored glyphs — not the per-frame styles.
 */
function setReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: reduced,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <SearchInput value={value} onChange={setValue} placeholder="Search token #" label="Search by token number" />
  );
}

const field = () => screen.getByRole("textbox", { name: "Search by token number" }) as HTMLInputElement;
const clearButton = () => screen.getByRole("button", { name: "Clear search by token number" });
const wrapper = () => document.querySelector(".t-clear") as HTMLElement;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SearchInput", () => {
  it("mirrors each word into its own measurable span", () => {
    setReducedMotion(false);
    render(<Harness initial="asha rao" />);

    expect(Array.from(document.querySelectorAll(".t-clear-word")).map((n) => n.textContent)).toEqual([
      "asha",
      "rao",
    ]);
    expect(wrapper().className).toContain("has-value");
  });

  it("empties the field when cleared and lands back in the resting state", async () => {
    setReducedMotion(false);
    render(<Harness initial="0042" />);

    fireEvent.click(clearButton());
    expect(field().value).toBe("");

    // The dissolve keeps drawing the old glyphs, so the field is 'busy' until
    // the animation releases it. Deliberately NOT asserted as still present
    // here: that is a transient state on a real timer, and under a loaded test
    // run the animation can legitimately have finished before this line is
    // reached — which failed the suite while the component behaved correctly.
    // What matters, and what is asserted, is that it ends up released.
    await waitFor(() => expect(wrapper().className).not.toContain("is-clearing"), { timeout: 3000 });
    expect(wrapper().className).not.toContain("has-value");
    expect(document.querySelectorAll(".t-clear-word")).toHaveLength(0);
  });

  it("skips the dissolve entirely under prefers-reduced-motion", () => {
    setReducedMotion(true);
    render(<Harness initial="0042" />);

    fireEvent.click(clearButton());
    expect(field().value).toBe("");
    expect(wrapper().className).not.toContain("is-clearing");
  });

  it("lets a new query interrupt a dissolve instead of ghosting behind it", () => {
    setReducedMotion(false);
    render(<Harness initial="0042" />);

    fireEvent.click(clearButton());
    fireEvent.change(field(), { target: { value: "9" } });

    expect(field().value).toBe("9");
    expect(wrapper().className).not.toContain("is-clearing");
    expect(Array.from(document.querySelectorAll(".t-clear-word")).map((n) => n.textContent)).toEqual(["9"]);
  });

  it("clears on Escape but leaves an already-empty field alone", async () => {
    setReducedMotion(false);
    render(<Harness initial="0042" />);

    fireEvent.keyDown(field(), { key: "Escape" });
    expect(field().value).toBe("");

    // A second Escape while the first dissolve is still running must not
    // restart it — there is nothing left to clear.
    fireEvent.keyDown(field(), { key: "Escape" });
    await waitFor(() => expect(wrapper().className).not.toContain("is-clearing"), { timeout: 3000 });
    expect(wrapper().className).not.toContain("has-value");
    expect(field().value).toBe("");
  });
});
