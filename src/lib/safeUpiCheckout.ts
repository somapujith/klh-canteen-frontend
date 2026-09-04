/**
 * SafeUPI's Embedded JS Checkout SDK — a modal opened in-page instead of a
 * full-page redirect to the hosted payment page.
 *
 * The SDK URL is versioned and returned per-checkout by our own backend
 * (`payment.checkout.sdkUrl`), so — unlike Google Identity Services — this
 * loader takes the URL as a parameter rather than hardcoding one. It still
 * dedupes concurrent/repeated loads of the SAME url the same way
 * `loadGoogleIdentityServices` does (see src/components/GoogleSignInButton.tsx),
 * since two script tags racing would leave `window.SafeUPI` initialised
 * against whichever load happened to resolve last.
 */

declare global {
  interface Window {
    SafeUPI?: {
      open: (options: {
        token: string;
        returnUrl?: string;
        theme?: { brandColor?: string; radius?: number };
        onSuccess?: (payload: unknown) => void;
        onFailure?: (payload: unknown) => void;
        onCancel?: (payload: unknown) => void;
        onClose?: () => void;
      }) => void;
      close: () => void;
    };
  }
}

let loadPromise: Promise<void> | null = null;
let loadedSrc: string | null = null;

/** Loads SafeUPI's checkout SDK from `sdkUrl` once, resolving immediately on
 *  every call after — including a call with a different `sdkUrl` from a later
 *  checkout attempt, since SafeUPI's own script replaces its prior global. */
export function loadSafeUpiSdk(sdkUrl: string): Promise<void> {
  if (window.SafeUPI) return Promise.resolve();
  if (loadPromise && loadedSrc === sdkUrl) return loadPromise;

  loadedSrc = sdkUrl;
  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${sdkUrl}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load SafeUPI checkout")));
      return;
    }
    const script = document.createElement("script");
    script.src = sdkUrl;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load SafeUPI checkout"));
    document.head.appendChild(script);
  });
  return loadPromise;
}
