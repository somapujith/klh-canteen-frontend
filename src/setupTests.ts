import "@testing-library/jest-dom";

/**
 * A requestAnimationFrame that actually fires.
 *
 * jsdom's own implementation is tied to a page-visibility heuristic, and under
 * a full 30-file run it can starve: a component that ends an animation from
 * inside its rAF loop (SearchInput's clear dissolve) then never reaches the
 * frame where it releases its `is-clearing` state, and a test waiting for that
 * release times out. The same test passes alone, which is the signature of a
 * scheduling problem rather than a component bug.
 *
 * Backing it with setTimeout at roughly 60fps makes frames deterministic and
 * independent of how loaded the run is.
 *
 * The timestamp handed to the callback MUST come from performance.now(), the
 * same clock the browser uses. Animation loops here measure elapsed time as
 * `now - performance.now()` captured at the start (see SearchInput's `frame`),
 * so feeding them Date.now() — a different origin entirely — produces an
 * elapsed value that never lands inside the animation's window, and the loop
 * that ends on `elapsed >= total` runs forever.
 */
const FRAME_MS = 16;

// Always installed under test. `process` is deliberately not referenced: this
// file only ever loads as a vitest setupFile, and the frontend has no Node
// types, so reading process.env here is a typecheck error for no benefit.
{
  let handle = 0;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    handle += 1;
    const id = handle;
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        callback(performance.now());
      }, FRAME_MS),
    );
    return id;
  }) as typeof globalThis.requestAnimationFrame;

  globalThis.cancelAnimationFrame = ((id: number): void => {
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }) as typeof globalThis.cancelAnimationFrame;
}
