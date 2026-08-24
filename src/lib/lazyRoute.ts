import { lazy, type ComponentType } from "react";

/**
 * `React.lazy` that survives a deploy landing under an open tab.
 *
 * THE FAILURE THIS FIXES. Route chunks are content-hashed, so every deploy
 * publishes new filenames and retires the old ones. A browser holding the
 * previous index.html — an open tab, or a cached shell — still asks for the
 * retired filename, and that request 404s. Vercel's SPA rewrite then answers
 * the 404 with index.html, so the browser receives HTML where it expected a
 * module and reports:
 *
 *     'text/html' is not a valid JavaScript MIME type.
 *
 * which surfaced to users as the error boundary's "Something broke on this
 * screen". Nothing was actually broken; the shell was simply out of date.
 *
 * vercel.json now excludes /assets/ from that rewrite, so a retired chunk
 * returns an honest 404 instead of HTML. That alone does not help the tab that
 * is already open, though — it still cannot load a chunk that no longer
 * exists. The only cure there is to fetch the current index.html, which means
 * reloading.
 *
 * WHY THE SESSION FLAG. A reload that fails the same way would reload again,
 * forever. The flag makes the recovery strictly one-shot: if the page has
 * already tried reloading for a chunk failure, the error is rethrown and the
 * error boundary shows it, which is the honest outcome for a genuine bug.
 * sessionStorage rather than localStorage so the allowance is per tab and does
 * not leak into the next visit.
 */
const RELOAD_FLAG = "klh_chunk_reload_attempted";

/** A chunk that never arrived, as opposed to one that threw while evaluating. */
function isChunkLoadFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    // Safari and Chrome both word the MIME rejection this way.
    message.includes("is not a valid JavaScript MIME type")
  );
}

export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* private mode / storage disabled — the flag is an optimisation, not state we need */
  }
}

export function lazyRoute<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((error: unknown) => {
      if (!isChunkLoadFailure(error)) throw error;

      let alreadyTried = true;
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === "1";
        if (!alreadyTried) sessionStorage.setItem(RELOAD_FLAG, "1");
      } catch {
        // Storage unavailable: treat as already-tried rather than risk a loop.
        alreadyTried = true;
      }

      if (alreadyTried) throw error;

      window.location.reload();
      // Never settles. The page is being replaced, and resolving here would
      // let React render a half-built tree against the outgoing document.
      return new Promise<{ default: T }>(() => {});
    }),
  );
}
